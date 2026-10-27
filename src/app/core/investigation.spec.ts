import { buildMockAgents, buildMockEquipment } from '../data/mock-data';
import { MANUAIS } from '../data/manuals-index';
import { analisarLotes } from './batch';
import { EventoSituacao, investigarOcorrencia } from './investigation';
import { Ocorrencia, TipoAlerta, abrirOcorrencia } from './occurrences';
import { ScenarioId, applyScenario } from './scenarios';
import { CityState } from './state';

const agora = new Date('2026-10-27T15:00:00Z');
const seed = (): CityState => ({ equipment: buildMockEquipment(), agents: buildMockAgents(), peakSurge: null });

/** Aplica o cenário e devolve os eventos que a API gravaria (todos no mesmo instante, `minutosAtras` antes de agora). */
function cenario(id: ScenarioId, minutosAtras = 5) {
  const r = applyScenario(seed(), id, '2026-10-27');
  const criadoEm = new Date(agora.getTime() - minutosAtras * 60_000).toISOString();
  const eventos: EventoSituacao[] = r.equipmentIds.map((alvoId) => ({
    alvoId,
    situacaoAnterior: 'operational',
    situacaoNova: r.state.equipment.find((e) => e.id === alvoId)!.status,
    origem: 'cenario',
    criadoEm,
  }));
  return { state: r.state, ids: r.equipmentIds, eventos };
}

function investigar(state: CityState, equipamentoId: string, tipoAlerta: TipoAlerta, eventos: EventoSituacao[] = [], ocorrencias: Ocorrencia[] = []) {
  const { ocorrencia } = abrirOcorrencia(ocorrencias, state, { equipamentoId, tipoAlerta }, agora);
  return investigarOcorrencia(state, ocorrencia, { eventos, indiceManuais: MANUAIS, agora, ocorrencias });
}
const tipos = (d: ReturnType<typeof investigar>) => d.padroes.map((p) => p.tipo);

describe('investigação: padrões', () => {
  it('VIZINHANÇA dispara na onda de furtos e a decisão é acionar GM/PM', () => {
    const { state, ids, eventos } = cenario('theft_wave');
    const d = investigar(state, ids[0], 'furto', eventos);
    expect(tipos(d)).toEqual(['VIZINHANCA']);
    expect(d.relacionados.length).toBeGreaterThan(0);
    expect(d.recomendacao.regra).toBe('FURTO_REINCIDENTE');
    expect(d.hipotese.texto).toContain('Ação coordenada de furto');
  });

  it('VIZINHANÇA não dispara sem eventos recentes (seed ou eventos com mais de 24 h)', () => {
    const { state, ids, eventos } = cenario('theft_wave', 25 * 60);
    expect(tipos(investigar(state, ids[0], 'furto', eventos))).toEqual([]);
    expect(tipos(investigar(state, ids[0], 'furto'))).toEqual([]);
    expect(investigar(state, ids[0], 'furto').recomendacao.regra).toBe('FURTO_ISOLADO');
  });

  it('LOTE dispara na degradação (outras unidades do mesmo modelo em falha), sem confundir com energia', () => {
    const { state, ids, eventos } = cenario('north_degradation');
    const radar = state.equipment.find((e) => e.id === ids[0])!;
    const d = investigar(state, radar.id, 'falha', eventos);
    expect(tipos(d)).toContain('LOTE');
    expect(tipos(d)).not.toContain('POSSIVEL_ENERGIA');
    expect(d.recomendacao.regra).toBe('FALHA_EM_LOTE');
    for (const id of d.padroes.find((p) => p.tipo === 'LOTE')!.equipamentoIds) {
      const other = state.equipment.find((e) => e.id === id)!;
      expect(`${other.brand} ${other.model}`).toBe(`${radar.brand} ${radar.model}`);
    }
  });

  it('LOTE não dispara quando o modelo não tem outras unidades em falha', () => {
    const state = seed();
    const lote = analisarLotes(state.equipment).find((l) => l.emFalha.length === 0 && l.unidades.some((e) => e.status === 'operational'))!;
    const alvo = lote.unidades.find((e) => e.status === 'operational')!;
    state.equipment = state.equipment.map((e) => (e.id === alvo.id ? { ...e, status: 'malfunction' } : e));
    const d = investigar(state, alvo.id, 'falha');
    expect(tipos(d)).toEqual([]);
    expect(d.recomendacao.regra).toBe('FALHA_ISOLADA');
    expect(d.hipotese.texto).toContain('Falha isolada');
  });

  it('POSSÍVEL_ENERGIA dispara no apagão e a decisão segue o manual de energia', () => {
    const { state, ids, eventos } = cenario('power_outage');
    const d = investigar(state, ids[0], 'falha', eventos);
    expect(tipos(d)).toContain('POSSIVEL_ENERGIA');
    expect(d.hipotese.texto).toContain('Queda de energia');
    expect(d.recomendacao.regra).toBe('QUEDA_DE_ENERGIA');
    expect(d.recomendacao.fontes.every((f) => f.fonte === 'queda-de-energia.md')).toBe(true);
  });

  it('POSSÍVEL_ENERGIA não dispara quando as quedas estão espalhadas no tempo', () => {
    const { state, ids, eventos } = cenario('power_outage');
    const espalhados = eventos.map((ev, i) => ({ ...ev, criadoEm: new Date(agora.getTime() - (i + 1) * 3_600_000).toISOString() }));
    expect(tipos(investigar(state, ids[0], 'falha', espalhados))).not.toContain('POSSIVEL_ENERGIA');
  });
});

describe('investigação: garantias', () => {
  it('não altera o estado de entrada e é determinística', () => {
    const { state, ids, eventos } = cenario('theft_wave');
    const frozen = JSON.stringify(state);
    const a = investigar(state, ids[0], 'furto', eventos);
    const b = investigar(state, ids[0], 'furto', eventos);
    expect(JSON.stringify(state)).toBe(frozen);
    expect(b).toEqual(a);
  });

  it('ocorrência sem histórico gera dossiê completo, com a limitação declarada', () => {
    const state = seed();
    const eq = state.equipment.find((e) => e.status === 'stolen')!;
    const d = investigar(state, eq.id, 'furto');
    expect(d.oQueAconteceu).toMatchObject({ equipamentoId: eq.id, detectadoEm: null, situacao: 'stolen' });
    expect(d.historico).toEqual({ eventos: [], auditoria: [], falhasAnteriores: 0, manutencoesAnteriores: 0 });
    expect(d.hipotese.limitacoes.join(' ')).toContain('Base de histórico curta');
    expect(d.recomendacao.fontes.length).toBeGreaterThan(0);
    expect(d.proximosPassos.length).toBeGreaterThan(0);
  });

  it('impacto compara o equipamento operando × fora de operação pelo simulador', () => {
    const state = seed();
    const eq = state.equipment.find((e) => e.status === 'malfunction')!;
    const { impacto } = investigar(state, eq.id, 'falha');
    expect(impacto.saudeBairro!.semEquipamento).toBeLessThanOrEqual(impacto.saudeBairro!.comEquipamento);
    expect(impacto.riscoBairro!.semEquipamento).toBeGreaterThanOrEqual(impacto.riscoBairro!.comEquipamento);
    expect(impacto.descricao).toContain('Estimativa');
  });
});
