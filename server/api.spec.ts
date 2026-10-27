import { mkdtempSync, rmSync } from 'node:fs';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { buildMockAgents, buildMockEquipment } from '../src/app/data/mock-data';
import type { Agent, Equipment } from '../src/app/models/fogo.models';
import { createApp, listarRotas, urlNaRede } from './app';
import { OPENAPI } from './openapi';

describe('API + SQLite', () => {
  let dir: string;
  let dbFile: string;
  let server: Server;
  let base: string;

  const start = async () => {
    server = createApp(dbFile).server;
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  };
  const stop = () => new Promise<void>((r) => server.close(() => r()));
  const restart = async () => {
    await stop();
    await start();
  };
  const call = async <T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> => {
    const res = await fetch(base + path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, data: (await res.json()) as T };
  };

  const newEquipment = (): Equipment => ({
    ...buildMockEquipment()[0],
    id: 'EQ-NOVO',
    serialNumber: 'RAD-TESTE-0001',
  });
  const newAgent = (): Agent => ({ ...buildMockAgents()[0], id: 'AG-NOVO', badgeNumber: 'AT-TESTE', name: 'Agente Teste' });

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'fogo-test-'));
    dbFile = join(dir, 'fogo.db');
    await start();
  });

  afterEach(async () => {
    await stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it('cria e popula o banco na primeira execução, sem repopular depois', async () => {
    const first = await call('GET', '/estado');
    expect(first.data.equipment).toHaveLength(buildMockEquipment().length);
    expect(first.data.agents).toHaveLength(buildMockAgents().length);

    await call('DELETE', '/equipamentos/EQ-001');
    await restart();
    const again = await call('GET', '/estado');
    expect(again.data.equipment).toHaveLength(buildMockEquipment().length - 1);
  });

  it('cria, consulta, edita e desativa equipamento; tudo persiste entre reinícios', async () => {
    expect((await call('POST', '/equipamentos', newEquipment())).status).toBe(201);
    expect((await call('POST', '/equipamentos', newEquipment())).status).toBe(409);
    await call('PUT', '/equipamentos/EQ-NOVO', { ...newEquipment(), brand: 'Marca Editada' });
    await call('PATCH', '/equipamentos/EQ-NOVO/situacao', { situacao: 'deactivated' });

    await restart();
    const { data } = await call<Equipment>('GET', '/equipamentos/EQ-NOVO');
    expect(data.brand).toBe('Marca Editada');
    expect(data.status).toBe('deactivated');
    expect(data.customProperties).toEqual(newEquipment().customProperties);

    const filtered = await call<Equipment[]>('GET', '/equipamentos?situacao=deactivated');
    expect(filtered.data.map((e) => e.id)).toContain('EQ-NOVO');

    const audit = await call<{ acao: string }[]>('GET', '/auditoria');
    expect(audit.data.map((a) => a.acao)).toEqual(expect.arrayContaining(['CRIAR_EQUIPAMENTO', 'EDITAR_EQUIPAMENTO']));
    const events = await call<{ alvoId: string; situacaoNova: string }[]>('GET', '/eventos');
    expect(events.data[0]).toMatchObject({ alvoId: 'EQ-NOVO', situacaoNova: 'deactivated' });
  });

  it('cria, edita e desativa agente; persiste entre reinícios', async () => {
    expect((await call('POST', '/agentes', newAgent())).status).toBe(201);
    await call('PUT', '/agentes/AG-NOVO', { ...newAgent(), neighborhood: 'Centro Histórico' });
    await call('PATCH', '/agentes/AG-NOVO/situacao', { situacao: 'off_duty' });

    await restart();
    const { data } = await call<Agent>('GET', '/agentes/AG-NOVO');
    expect(data).toMatchObject({ neighborhood: 'Centro Histórico', status: 'off_duty' });
  });

  it('rejeita dados inválidos, inclusive propriedades específicas do tipo', async () => {
    const bad = { ...newEquipment(), customProperties: { radarSubtype: 'laser' } };
    const res = await call<{ detalhes: string[] }>('POST', '/equipamentos', bad);
    expect(res.status).toBe(400);
    expect(res.data.detalhes.join()).toContain('radarSubtype');
  });

  it('sync grava em lote, registra histórico e auditoria das mudanças do usuário', async () => {
    const eq = { ...buildMockEquipment()[2], status: 'stolen' } as Equipment;
    await call('POST', '/sync', { origem: 'usuario', equipment: [eq], removed: { agents: ['AG-01'] } });
    await restart();
    const state = await call('GET', '/estado');
    expect(state.data.equipment.find((e: Equipment) => e.id === eq.id).status).toBe('stolen');
    expect(state.data.agents.some((a: Agent) => a.id === 'AG-01')).toBe(false);
    const alerts = await call<{ id: string }[]>('GET', '/alertas');
    expect(alerts.data.map((a) => a.id)).toContain(`AL-${eq.id}`);
  });

  it('cenário de crise é persistido e pode ser revertido', async () => {
    const before = (await call('GET', '/estado')).data;
    await call('POST', '/cenarios/power_outage');
    await restart();
    const during = (await call('GET', '/estado')).data;
    expect(during.scenarioSnapshot.scenarios).toEqual(['power_outage']);
    const after = (await call('POST', '/cenarios/reverter')).data;
    expect(after.equipment).toEqual(before.equipment);
    expect(after.agents).toEqual(before.agents);
    expect(after.scenarioSnapshot).toBeNull();
  });

  it('reset restaura o estado inicial', async () => {
    const initial = (await call('GET', '/estado')).data;
    await call('DELETE', '/equipamentos/EQ-001');
    await call('POST', '/equipamentos', newEquipment());
    await call('POST', '/cenarios/theft_wave');
    const reset = (await call('POST', '/reset')).data;
    expect(reset.equipment).toEqual(initial.equipment);
    expect(reset.agents).toEqual(initial.agents);
    expect(reset.scenarioSnapshot).toBeNull();
  });

  it('simulação não grava; aplicar grava, audita e devolve o novo estado', async () => {
    const before = (await call('GET', '/estado')).data;
    const acao = { tipo: 'DESATIVAR_EQUIPAMENTO', equipamentoId: 'EQ-003' };
    const sim = await call('POST', '/simulacao', { acao });
    expect(sim.status).toBe(200);
    expect(sim.data.diferencas.length).toBeGreaterThan(0);
    expect((await call('GET', '/estado')).data).toEqual(before);

    const applied = await call('POST', '/acoes/aplicar', { acao });
    expect(applied.data.equipment.find((e: Equipment) => e.id === 'EQ-003').status).toBe('deactivated');
    expect(applied.data.simulacao.descricao).toContain('Desativar');
    const [audit] = (await call('GET', '/auditoria?limite=1')).data;
    expect(audit).toMatchObject({ acao: 'DESATIVAR_EQUIPAMENTO', autor: 'gestor' });
    expect(audit.antes.equipamentos[0].status).not.toBe('deactivated');
    expect(audit.depois.equipamentos[0].status).toBe('deactivated');
  });

  it('recomendações vêm ordenadas e a ação inválida é rejeitada', async () => {
    const recs = (await call<{ ganho: number }[]>('GET', '/recomendacoes?topN=3')).data;
    expect(recs).toHaveLength(3);
    expect(recs[0].ganho).toBeGreaterThanOrEqual(recs[2].ganho);
    expect((await call('POST', '/simulacao', { acao: { tipo: 'X' } })).status).toBe(400);
    expect((await call('POST', '/simulacao', { acao: { tipo: 'FALHA_EQUIPAMENTO', equipamentoId: 'nada' } })).status).toBe(400);
  });

  it('documenta todas as rotas no OpenAPI e serve o Swagger UI', async () => {
    const documentadas = Object.entries(OPENAPI.paths).flatMap(([path, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${path}`));
    expect(documentadas.sort()).toEqual(listarRotas().filter((r) => r !== 'GET /api/openapi.json').sort());
    expect((await call('GET', '/openapi.json')).data.openapi).toBe('3.0.3');
    const docs = await fetch(base + '/docs');
    expect(docs.headers.get('content-type')).toContain('text/html');
    expect(await docs.text()).toContain('swagger-ui');
  });

  describe('ocorrências', () => {
    const stolenId = async () => {
      const { data } = await call<Equipment[]>('GET', '/equipamentos?situacao=stolen');
      return data[0].id;
    };

    it('abrir é idempotente e grava o snapshot da abertura', async () => {
      const equipamentoId = await stolenId();
      const first = await call('POST', '/ocorrencias', { equipamentoId, tipoAlerta: 'furto' });
      expect(first.status).toBe(201);
      expect(first.data).toMatchObject({ id: 'OC-0001', equipamentoId, tipoAlerta: 'furto', status: 'aberta', encerradaEm: null });
      expect(first.data.snapshotAbertura.indicadores.availabilityPct).toBe((await call('GET', '/analise')).data.indicadores.availabilityPct);
      expect(first.data.snapshotAbertura.saude.neighborhood).toBe(first.data.snapshotAbertura.bairro);
      expect(first.data.snapshotAbertura.risco.neighborhood).toBe(first.data.snapshotAbertura.bairro);
      expect(typeof first.data.snapshotAbertura.cobertura.cidadePct).toBe('number');

      const again = await call('POST', '/ocorrencias', { equipamentoId, tipoAlerta: 'furto' });
      expect(again.status).toBe(200);
      expect(again.data.id).toBe('OC-0001');
      // Outro tipo para o mesmo equipamento é outra ocorrência.
      expect((await call('POST', '/ocorrencias', { equipamentoId, tipoAlerta: 'falha' })).data.id).toBe('OC-0002');
      expect((await call('GET', '/ocorrencias')).data).toHaveLength(2);

      const audit = (await call('GET', '/auditoria?limite=5')).data.filter((a: { acao: string }) => a.acao === 'ABRIR_OCORRENCIA');
      expect(audit).toHaveLength(2);
    });

    it('persiste entre reinícios e filtra por status', async () => {
      const equipamentoId = await stolenId();
      await call('POST', '/ocorrencias', { equipamentoId, tipoAlerta: 'furto' });
      await restart();
      const { data } = await call('GET', '/ocorrencias/OC-0001');
      expect(data).toMatchObject({ id: 'OC-0001', equipamentoId, status: 'aberta' });
      expect((await call('GET', '/ocorrencias?status=aberta')).data).toHaveLength(1);
      expect((await call('GET', '/ocorrencias?status=encerrada')).data).toHaveLength(0);
      expect((await call('GET', '/ocorrencias?status=xyz')).status).toBe(400);
    });

    it('investigar grava o dossiê, passa para investigada e audita (onda de furtos → vizinhança)', async () => {
      const cenario = await call('POST', '/cenarios/theft_wave');
      const furtado = (cenario.data.equipment as Equipment[]).find((e) => e.status === 'stolen' && e.type === 'camera' && e.maintenance.priority === 'immediate')!;
      const { data: oc } = await call('POST', '/ocorrencias', { equipamentoId: furtado.id, tipoAlerta: 'furto' });

      const { status, data } = await call('GET', `/ocorrencias/${oc.id}/dossie`);
      expect(status).toBe(200);
      expect(data.status).toBe('investigada');
      expect(data.dossie.padroes.map((p: { tipo: string }) => p.tipo)).toContain('VIZINHANCA');
      expect(data.dossie.oQueAconteceu.detectadoEm).not.toBeNull();
      expect(data.dossie.recomendacao.regra).toBe('FURTO_REINCIDENTE');
      expect(data.dossie.recomendacao.fontes.length).toBeGreaterThan(0);

      await restart();
      expect((await call('GET', `/ocorrencias/${oc.id}`)).data.dossie.ocorrenciaId).toBe(oc.id);
      const audit = (await call('GET', '/auditoria?limite=3')).data;
      expect(audit[0]).toMatchObject({ acao: 'INVESTIGAR_OCORRENCIA', depois: { status: 'investigada' } });
      expect((await call('GET', '/ocorrencias/OC-9999/dossie')).status).toBe(404);
    });

    it('sugere, despacha (move o agente, grava a origem e audita) e bloqueia o segundo despacho', async () => {
      const equipamentoId = (await call<Equipment[]>('GET', '/equipamentos?situacao=malfunction')).data[0].id;
      const { data: oc } = await call('POST', '/ocorrencias', { equipamentoId, tipoAlerta: 'falha' });
      const sim = await call('GET', `/ocorrencias/${oc.id}/despacho`);
      expect(sim.status).toBe(200);
      const [top] = sim.data.sugestoes;
      expect(top.funcao).toBe('transit_agent');
      expect((await call('GET', `/ocorrencias/${oc.id}`)).data.status).toBe('aberta');

      const simulado = await call('POST', '/simulacao', { acao: top.acao });
      expect(simulado.status).toBe(200);
      expect((await call('POST', '/acoes/aplicar', { acao: top.acao })).status).toBe(400);

      const res = await call('POST', `/ocorrencias/${oc.id}/despachar`, { agenteId: top.agenteId });
      expect(res.status).toBe(200);
      expect(res.data.ocorrencia).toMatchObject({ status: 'despachada', despacho: { agenteId: top.agenteId, retornoEm: null } });
      const agente = (res.data.agents as Agent[]).find((a) => a.id === top.agenteId)!;
      expect(agente.status).toBe('in_dispatch');

      await restart();
      expect((await call('GET', `/ocorrencias/${oc.id}`)).data.despacho.origem.bairro).toBe(top.bairro);
      expect((await call('GET', '/auditoria?limite=1')).data[0].acao).toBe('DESPACHAR_AGENTE');
      expect((await call('POST', `/ocorrencias/${oc.id}/despachar`, { agenteId: top.agenteId })).status).toBe(409);
      expect((await call('POST', `/ocorrencias/${oc.id}/despachar`, {})).status).toBe(400);
    });

    it('encerra (equipamento volta, agente retorna), recusa o segundo encerramento e gera o relatório', async () => {
      const equipamentoId = await stolenId();
      const { data: oc } = await call('POST', '/ocorrencias', { equipamentoId, tipoAlerta: 'furto' });
      await call('GET', `/ocorrencias/${oc.id}/dossie`);
      const [top] = (await call('GET', `/ocorrencias/${oc.id}/despacho`)).data.sugestoes;
      const before = (await call<Agent>('GET', `/agentes/${top.agenteId}`)).data;
      await call('POST', `/ocorrencias/${oc.id}/despachar`, { agenteId: top.agenteId });

      expect((await call('POST', `/ocorrencias/${oc.id}/encerrar`, { resolucao: 'quebrou' })).status).toBe(400);
      const fechado = await call('POST', `/ocorrencias/${oc.id}/encerrar`, { resolucao: 'reposto', observacao: 'Reposta' });
      expect(fechado.status).toBe(200);
      expect(fechado.data.ocorrencia).toMatchObject({ status: 'encerrada', encerramento: { resolucao: 'reposto', agenteDevolvido: top.agenteId } });
      expect((await call<Equipment>('GET', `/equipamentos/${equipamentoId}`)).data.status).toBe('operational');
      expect((await call<Agent>('GET', `/agentes/${top.agenteId}`)).data).toEqual(before);
      expect((await call('POST', `/ocorrencias/${oc.id}/encerrar`, { resolucao: 'reposto' })).status).toBe(409);

      const rel = await fetch(`${base}/ocorrencias/${oc.id}/relatorio?formato=md`);
      expect(rel.headers.get('content-type')).toContain('text/markdown');
      const md = await rel.text();
      expect(md).toContain(`# Relatório da ocorrência ${oc.id}`);
      const ordem = ['ABRIR_OCORRENCIA', 'INVESTIGAR_OCORRENCIA', 'DESPACHAR_AGENTE', 'ENCERRAR_OCORRENCIA'].map((a) => md.indexOf(`**${a}**`));
      expect(ordem.every((i) => i > 0)).toBe(true);
      expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
      expect((await call('GET', `/ocorrencias/${oc.id}/relatorio`)).data.markdown.split('\n')[0]).toBe(md.split('\n')[0]);
    });

    it('comprovante: 409 antes de encerrar, 200 depois, 404 se não existe', async () => {
      const equipamentoId = await stolenId();
      const { data: oc } = await call('POST', '/ocorrencias', { equipamentoId, tipoAlerta: 'furto' });
      expect((await call('GET', `/ocorrencias/${oc.id}/comprovante`)).status).toBe(409);
      await call('POST', `/ocorrencias/${oc.id}/encerrar`, { resolucao: 'consertado' });
      const { status, data } = await call('GET', `/ocorrencias/${oc.id}/comprovante`);
      expect(status).toBe(200);
      expect(data).toMatchObject({ id: oc.id, selo: 'ENCERRADA' });
      expect(data.campos.find((l: { rotulo: string }) => l.rotulo === 'Resolução').valor).toBe('Equipamento consertado');
      expect(data.textoPlano).toContain(data.prometheus.split(' ')[0]);
      expect((await call('GET', '/ocorrencias/OC-9999/comprovante')).status).toBe(404);
    });

    it('comprovante no celular: link na rede local, página HTML e texto para baixar', async () => {
      const equipamentoId = await stolenId();
      const { data: oc } = await call('POST', '/ocorrencias', { equipamentoId, tipoAlerta: 'furto' });
      expect((await call('GET', `/ocorrencias/${oc.id}/comprovante/link`)).status).toBe(409);
      expect((await fetch(`${base}/comprovantes/${oc.id}`)).status).toBe(409);
      await call('POST', `/ocorrencias/${oc.id}/encerrar`, { resolucao: 'reposto' });

      const { data: link } = await call('GET', `/ocorrencias/${oc.id}/comprovante/link`);
      expect(link.url).toMatch(new RegExp(`^http://[^/]+:\\d+/api/comprovantes/${oc.id}$`));
      const pagina = await fetch(`${base}/comprovantes/${oc.id}`);
      expect(pagina.headers.get('content-type')).toContain('text/html');
      const html = await pagina.text();
      expect(html).toContain(`<span class="tk-id">${oc.id}</span>`);
      expect(html).toContain('Salvar PDF');
      const txt = await fetch(`${base}/comprovantes/${oc.id}?formato=txt`);
      expect(txt.headers.get('content-disposition')).toContain(`comprovante-${oc.id}.txt`);
      expect(await txt.text()).toContain('COMPROVANTE DE OCORRÊNCIA');
      expect((await fetch(`${base}/comprovantes/OC-9999`)).status).toBe(404);
    });

    it('urlNaRede prefere o IP 192.168 e aceita FOGO_URL_PUBLICA', () => {
      const nic = (address: string, internal = false) => ({ address, family: 'IPv4', internal }) as never;
      expect(urlNaRede(3000, { lo: [nic('127.0.0.1', true)], wsl: [nic('172.20.0.1')], wifi: [nic('192.168.0.42')] })).toBe('http://192.168.0.42:3000');
      expect(urlNaRede(3000, {})).toBe('http://localhost:3000');
      process.env['FOGO_URL_PUBLICA'] = 'https://fogo.exemplo/';
      try {
        expect(urlNaRede(3000, {})).toBe('https://fogo.exemplo');
      } finally {
        delete process.env['FOGO_URL_PUBLICA'];
      }
    });

    it('aplicar recomendação da Cidade Preditiva grava, abre ocorrências, audita e persiste a marca de aplicada', async () => {
      const { data: estado } = await call('GET', '/estado');
      const furtado = estado.equipment.find((e: Equipment) => e.status === 'stolen');
      const emFalha = estado.equipment.find((e: Equipment) => e.status === 'malfunction');
      const acoes = [{ kind: 'maintenance', equipmentIds: [furtado.id, emFalha.id], priority: 'immediate', nextDate: '2026-10-27' }];
      const assinaturas = [furtado.id, emFalha.id].map((id) => `mnt:immediate:${id}`);

      const res = await call('POST', '/previsoes/aplicar', { previsaoId: 'collapse:teste', recomendacao: 'Abrir ocorrência e acionar a equipe técnica', acoes });
      expect(res.status).toBe(200);
      expect(res.data.ocorrencias.map((o: { tipoAlerta: string }) => o.tipoAlerta).sort()).toEqual(['falha', 'furto']);
      expect(res.data.equipment.find((e: Equipment) => e.id === emFalha.id).status).toBe('maintenance');

      // Persistido: estado, ocorrências, auditoria e a marca de aplicada (sobrevive a recarregar o painel).
      const depois = (await call('GET', '/estado')).data;
      expect(depois.acoesAplicadas).toEqual(expect.arrayContaining(assinaturas));
      expect(depois.equipment.find((e: Equipment) => e.id === emFalha.id).maintenance.priority).toBe('immediate');
      expect((await call('GET', '/ocorrencias')).data).toHaveLength(2);
      const acoesAuditadas = (await call('GET', '/auditoria')).data.map((a: { acao: string }) => a.acao);
      expect(acoesAuditadas).toContain('APLICAR_PREVISAO');
      expect(acoesAuditadas.filter((a: string) => a === 'ABRIR_OCORRENCIA')).toHaveLength(2);

      // Idempotente para as ocorrências; entrada inválida dá 400.
      const de_novo = await call('POST', '/previsoes/aplicar', { previsaoId: 'collapse:teste', acoes });
      expect(de_novo.data.ocorrencias.every((o: { criada: boolean }) => !o.criada)).toBe(true);
      expect((await call('GET', '/ocorrencias')).data).toHaveLength(2);
      const ruim = await call('POST', '/previsoes/aplicar', { previsaoId: 'x', acoes: [{ kind: 'maintenance', equipmentIds: ['NAO-EXISTE'], priority: 'immediate', nextDate: 'ontem' }] });
      expect(ruim.status).toBe(400);
      expect(ruim.data.detalhes).toEqual(['acoes[0]: equipamento NAO-EXISTE não encontrado', 'acoes[0]: nextDate deve ser AAAA-MM-DD']);
    });

    it('pedido de reforço à escala só registra (auditoria e marca de aplicada), sem mexer no estado', async () => {
      const antes = (await call('GET', '/estado')).data;
      const acoes = [{ kind: 'request_staff', neighborhood: antes.agents[0].neighborhood, count: 2, date: '2026-10-27' }];
      const res = await call('POST', '/previsoes/aplicar', { previsaoId: 'staff:teste', recomendacao: 'Solicitar 2 agente(s) extra(s) à escala', acoes });
      expect(res.status).toBe(200);
      expect(res.data.ocorrencias).toEqual([]);
      expect(res.data.agents).toEqual(antes.agents);
      expect(res.data.acoesAplicadas).toContain(`req:${acoes[0].neighborhood}:2:2026-10-27`);

      const ruim = await call('POST', '/previsoes/aplicar', { previsaoId: 'x', acoes: [{ kind: 'request_staff', neighborhood: 'Atlântida', count: 0, date: 'hoje' }] });
      expect(ruim.status).toBe(400);
      expect(ruim.data.detalhes).toHaveLength(3);
    });

    it('busca nos manuais pela API', async () => {
      const { status, data } = await call('GET', '/manuais/busca?q=falha%20lote%20troca&tipo=camera&fabricante=Hikvision');
      expect(status).toBe(200);
      expect(data[0]).toMatchObject({ id: 'camera#lote-darkfighter-com-degradacao', fonte: 'camera.md' });
      expect((await call('GET', '/manuais/busca?q=xilofone')).data).toEqual([]);
      expect((await call('GET', '/manuais/busca')).status).toBe(400);
    });

    it('entrada inválida devolve 400 e equipamento inexistente devolve 404', async () => {
      const bad = await call('POST', '/ocorrencias', { equipamentoId: '', tipoAlerta: 'incendio' });
      expect(bad.status).toBe(400);
      expect(bad.data.detalhes).toEqual(['equipamentoId é obrigatório', 'tipoAlerta deve ser furto, falha, manutencao']);
      expect((await call('POST', '/ocorrencias', { equipamentoId: 'NAO-EXISTE', tipoAlerta: 'falha' })).status).toBe(404);
      expect((await call('GET', '/ocorrencias/OC-9999')).status).toBe(404);
    });
  });
});
