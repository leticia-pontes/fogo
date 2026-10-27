import { buildMockAgents, buildMockEquipment } from '../data/mock-data';
import { MANUAIS } from '../data/manuals-index';
import { encerrarOcorrencia, gerarRelatorio, validarEncerramento } from './closure';
import { despachar, sugerirDespacho } from './dispatch';
import { RegistroAuditoria, investigarOcorrencia } from './investigation';
import { Ocorrencia, abrirOcorrencia } from './occurrences';
import { CityState } from './state';

const t0 = new Date('2026-10-27T15:00:00Z');
const t1 = new Date('2026-10-27T15:10:00Z');
const t2 = new Date('2026-10-27T15:40:00Z');
const seed = (): CityState => ({ equipment: buildMockEquipment(), agents: buildMockAgents(), peakSurge: null });

/** Fluxo completo: abrir → investigar → despachar → encerrar (reposto). */
function fluxo() {
  const s0 = seed();
  const eq = s0.equipment.find((e) => e.status === 'stolen')!;
  let oc: Ocorrencia = abrirOcorrencia([], s0, { equipamentoId: eq.id, tipoAlerta: 'furto' }, t0).ocorrencia;
  oc = { ...oc, status: 'investigada', dossie: investigarOcorrencia(s0, oc, { eventos: [], indiceManuais: MANUAIS, agora: t0 }) };
  const [top] = sugerirDespacho(s0, oc).sugestoes;
  const d = despachar(s0, oc, top.agenteId, t1);
  oc = { ...oc, status: 'despachada', despacho: d.despacho };
  const fechado = encerrarOcorrencia(d.state, oc, { resolucao: 'reposto', observacao: 'Gabinete antifurto' }, t2);
  return { s0, eq, despachado: d.state, final: fechado.state, oc: fechado.ocorrencia, agenteId: top.agenteId };
}

describe('encerramento', () => {
  it('reposto volta o equipamento a operar e devolve o agente à origem', () => {
    const { s0, eq, final, oc, agenteId } = fluxo();
    expect(final.equipment.find((e) => e.id === eq.id)!.status).toBe('operational');
    expect(final.agents.find((a) => a.id === agenteId)).toEqual(s0.agents.find((a) => a.id === agenteId));
    expect(oc).toMatchObject({ status: 'encerrada', encerradaEm: t2.toISOString(), encerramento: { resolucao: 'reposto', agenteDevolvido: agenteId } });
    expect((oc.despacho as { retornoEm: string }).retornoEm).toBe(t2.toISOString());
  });

  it('"outro" mantém a situação; encerrar duas vezes é recusado; não muta a entrada', () => {
    const s = seed();
    const eq = s.equipment.find((e) => e.status === 'malfunction')!;
    const oc = abrirOcorrencia([], s, { equipamentoId: eq.id, tipoAlerta: 'falha' }, t0).ocorrencia;
    const frozen = JSON.stringify(s);
    const r = encerrarOcorrencia(s, oc, { resolucao: 'outro' }, t1);
    expect(JSON.stringify(s)).toBe(frozen);
    expect(r.state.equipment.find((e) => e.id === eq.id)!.status).toBe('malfunction');
    expect(() => encerrarOcorrencia(r.state, r.ocorrencia, { resolucao: 'reposto' }, t2)).toThrow(/já está encerrada/);
    expect(validarEncerramento({ resolucao: 'magia' })).toEqual(['resolucao deve ser reposto, consertado, falso_alarme, outro']);
  });
});

describe('relatório', () => {
  it('cita os números da abertura e os atuais, com a variação', () => {
    const { final, oc } = fluxo();
    const md = gerarRelatorio(oc, final, [], t2);
    const a = oc.snapshotAbertura;
    const fmt = (x: number) => x.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    expect(md).toContain(`| Saúde de ${a.bairro} | ${fmt(a.saude!.health)} |`);
    expect(md).toContain(`| Disponibilidade da cidade | ${fmt(a.indicadores.availabilityPct)}% |`);
    expect(md).toMatch(/\| Disponibilidade da cidade \| [\d,]+% \| [\d,]+% \| \+[\d,]+ p\.p\. \(melhorou\) \|/);
    expect(md).toContain('Equipamento reposto');
    expect(md).toContain('Fonte: `');
  });

  it('linha do tempo da auditoria em ordem cronológica, só com o que é da ocorrência', () => {
    const { final, oc } = fluxo();
    const aud: RegistroAuditoria[] = [
      { acao: 'ENCERRAR_OCORRENCIA', descricao: 'fim', criadoEm: t2.toISOString(), depois: { ocorrenciaId: oc.id } },
      { acao: 'ABRIR_OCORRENCIA', descricao: 'início', criadoEm: t0.toISOString(), depois: { ocorrenciaId: oc.id } },
      { acao: 'DESPACHAR_AGENTE', descricao: 'meio', criadoEm: t1.toISOString(), depois: { ocorrenciaId: oc.id } },
      { acao: 'ABRIR_OCORRENCIA', descricao: 'NAO-DEVE-APARECER', criadoEm: t1.toISOString(), depois: { ocorrenciaId: 'OC-9999' } },
    ];
    const md = gerarRelatorio(oc, final, aud, t2);
    const linhas = md.split('\n').filter((l) => /\*\*[A-Z_]+\*\*/.test(l));
    expect(linhas.map((l) => /\*\*([A-Z_]+)\*\*/.exec(l)![1])).toEqual(['ABRIR_OCORRENCIA', 'DESPACHAR_AGENTE', 'ENCERRAR_OCORRENCIA']);
    expect(md).not.toContain('NAO-DEVE-APARECER');
  });

  it('ocorrência sem investigação nem despacho gera relatório válido dizendo isso', () => {
    const s = seed();
    const eq = s.equipment.find((e) => e.status === 'malfunction')!;
    const oc = abrirOcorrencia([], s, { equipamentoId: eq.id, tipoAlerta: 'falha' }, t0).ocorrencia;
    const md = gerarRelatorio(oc, s, [], t1);
    expect(md).toContain('A investigação não foi realizada');
    expect(md).toContain('**Despacho:** não ocorreu');
    expect(md).toContain('ainda em andamento');
    expect(md).toContain('modo offline');
  });

  it('mesmo estado gera o mesmo texto', () => {
    const { final, oc } = fluxo();
    expect(gerarRelatorio(oc, final, [], t2)).toBe(gerarRelatorio(oc, final, [], t2));
  });
});
