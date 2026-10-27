import { TYPE_LABELS } from '../models/equipment-schema';
import { buildMockAgents, buildMockEquipment } from '../data/mock-data';
import { Resolucao, encerrarOcorrencia } from './closure';
import { LARGURA_TEXTO, OcorrenciaNaoEncerradaError, formatarDuracao, montarComprovante, quebrar } from './comprovante';
import { despachar, sugerirDespacho } from './dispatch';
import { Dossie } from './investigation';
import { Ocorrencia, abrirOcorrencia, montarSnapshot } from './occurrences';
import { CityState } from './state';

const t0 = new Date('2026-10-27T17:32:00Z'); // 14:32 em São Paulo
const t1 = new Date('2026-10-27T17:40:00Z');
const t2 = new Date('2026-10-27T18:19:00Z'); // 15:19 em São Paulo
const seed = (): CityState => ({ equipment: buildMockEquipment(), agents: buildMockAgents(), peakSurge: null });

/** Abre um furto, despacha o mais próximo e encerra com a resolução pedida. */
function encerrada(resolucao: Resolucao = 'reposto', id?: string) {
  const s0 = seed();
  const eq = s0.equipment.find((e) => e.status === 'stolen')!;
  let oc: Ocorrencia = abrirOcorrencia([], s0, { equipamentoId: eq.id, tipoAlerta: 'furto' }, t0).ocorrencia;
  if (id) oc = { ...oc, id };
  const [top] = sugerirDespacho(s0, oc).sugestoes;
  const d = despachar(s0, oc, top.agenteId, t1);
  oc = { ...oc, status: 'despachada', despacho: d.despacho };
  const r = encerrarOcorrencia(d.state, oc, { resolucao }, t2);
  return { eq, estado: r.state, oc: r.ocorrencia, agente: top.nome };
}

const valor = (c: ReturnType<typeof montarComprovante>, rotulo: string) => c.campos.find((l) => l.rotulo === rotulo)?.valor;

describe('comprovante', () => {
  it('cita os números do snapshot (antes) e do estado atual (agora)', () => {
    const { eq, estado, oc, agente } = encerrada();
    const c = montarComprovante(oc, estado, t2);
    const a = oc.snapshotAbertura;
    const atual = montarSnapshot(estado, a.bairro);
    const fmt = (x: number) => `${x.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

    expect(c).toMatchObject({ id: oc.id, selo: 'ENCERRADA', subtitulo: `FURTO · ${TYPE_LABELS[eq.type].toLocaleUpperCase('pt-BR')}` });
    expect(c.campos.map((l) => l.rotulo)).toEqual(['Equipamento', 'Local', 'Bairro', 'Detectado', 'Encerrado', 'Duração', 'Atendido por', 'Resolução']);
    expect(valor(c, 'Equipamento')).toBe(`${eq.serialNumber} · ${eq.brand}`);
    expect(valor(c, 'Bairro')).toBe(a.bairro);
    expect(valor(c, 'Detectado')).toBe('27/10/2026 14:32');
    expect(valor(c, 'Encerrado')).toBe('27/10/2026 15:19');
    expect(valor(c, 'Duração')).toBe('47 min');
    expect(valor(c, 'Atendido por')).toBe(agente);
    expect(valor(c, 'Resolução')).toBe('Unidade reposta');
    expect(c.cidade).toEqual([
      { rotulo: 'Disponibilidade', antes: fmt(a.indicadores.availabilityPct), agora: fmt(atual.indicadores.availabilityPct) },
      { rotulo: 'Saúde do bairro', antes: String(a.saude!.health), agora: String(atual.saude!.health) },
      { rotulo: 'Risco do bairro', antes: a.risco!.level.replace('MEDIO', 'MÉDIO'), agora: atual.risco!.level.replace('MEDIO', 'MÉDIO') },
    ]);
    expect(c.emitidoEm).toBe('Emitido em 27/10/2026 às 15:19');
    expect(c.aviso).toBe('Documento interno de demonstração. Valores estimados por regras.');
    expect(JSON.stringify(c)).not.toMatch(/undefined|NaN|""/);
  });

  it('é determinístico e não muta a entrada', () => {
    const { estado, oc } = encerrada();
    const antes = JSON.stringify([oc, estado]);
    expect(montarComprovante(oc, estado, t2)).toEqual(montarComprovante(oc, estado, t2));
    expect(JSON.stringify([oc, estado])).toBe(antes);
  });

  it('"Detectado" usa o evento de detecção do dossiê quando existe', () => {
    const { estado, oc } = encerrada();
    const dossie = { oQueAconteceu: { detectadoEm: '2026-10-27T16:19:00Z', tipo: 'camera', numeroSerie: 'X', marca: 'Y', endereco: 'Z' } } as unknown as Dossie;
    const c = montarComprovante({ ...oc, dossie }, estado, t2);
    expect(valor(c, 'Detectado')).toBe('27/10/2026 13:19');
    expect(valor(c, 'Duração')).toBe('2 h 00 min');
  });

  it('formata a duração', () => {
    expect(formatarDuracao(0.2)).toBe('menos de 1 min');
    expect(formatarDuracao(47)).toBe('47 min');
    expect(formatarDuracao(72)).toBe('1 h 12 min');
    expect(formatarDuracao(65)).toBe('1 h 05 min');
    expect(formatarDuracao(2 * 1440 + 3 * 60 + 10)).toBe('2 d 3 h');
    expect(formatarDuracao(1440)).toBe('1 d');
  });

  it('a frase da PROMETHEUS muda por resolução e inclui a duração', () => {
    const frases = (['reposto', 'consertado', 'falso_alarme', 'outro'] as Resolucao[]).map((r) => {
      const { estado, oc } = encerrada(r);
      return montarComprovante(oc, estado, t2).prometheus;
    });
    expect(new Set(frases).size).toBe(4);
    for (const f of frases) expect(f).toContain('47 minutos');
    // Variação escolhida pelo id: ids diferentes podem trocar o template, mas sempre com a duração.
    const { estado, oc } = encerrada('falso_alarme', 'OC-0042');
    expect(montarComprovante(oc, estado, t2).prometheus).toBe('Falso alarme encerrado em 47 minutos. Fingirei que não me assustei.');
  });

  it('ocorrência não encerrada lança o erro tipado', () => {
    const s = seed();
    const eq = s.equipment.find((e) => e.status === 'stolen')!;
    const oc = abrirOcorrencia([], s, { equipamentoId: eq.id, tipoAlerta: 'furto' }, t0).ocorrencia;
    expect(() => montarComprovante(oc, s, t1)).toThrow(OcorrenciaNaoEncerradaError);
  });

  it('textoPlano contém todos os campos, a seção da cidade e o rodapé, em até 42 colunas', () => {
    const { estado, oc } = encerrada();
    const c = montarComprovante(oc, estado, t2);
    const plano = c.textoPlano.replace(/\n {2}/g, ' ');
    for (const l of c.campos) expect(plano).toContain(`${l.rotulo}: ${l.valor}`);
    for (const l of c.cidade) expect(plano).toContain(`${l.rotulo}: ${l.antes} → ${l.agora}`);
    expect(plano).toContain('CIDADE · ABERTURA → AGORA');
    expect(plano).toContain(c.prometheus);
    expect(plano).toContain(c.emitidoEm);
    expect(plano).toContain(c.aviso);
    expect(Math.max(...c.textoPlano.split('\n').map((l) => l.length))).toBeLessThanOrEqual(LARGURA_TEXTO);
  });

  it('quebra palavras longas sem passar da largura', () => {
    expect(quebrar('a'.repeat(50), 20).every((l) => l.length <= 20)).toBe(true);
    expect(quebrar('curta', 20)).toEqual(['curta']);
  });
});
