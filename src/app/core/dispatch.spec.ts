import { buildMockAgents, buildMockEquipment } from '../data/mock-data';
import { devolverAgente, despachar, perfilDespacho, sugerirDespacho } from './dispatch';
import { Ocorrencia, TipoAlerta, abrirOcorrencia } from './occurrences';
import { simular } from './simulation';
import { CityState } from './state';

const agora = new Date('2026-10-27T15:00:00Z');
const seed = (): CityState => ({ equipment: buildMockEquipment(), agents: buildMockAgents(), peakSurge: null });
const abrir = (state: CityState, tipoAlerta: TipoAlerta): Ocorrencia => {
  const eq = state.equipment.find((e) => (tipoAlerta === 'furto' ? e.status === 'stolen' : e.status === 'malfunction'))!;
  return abrirOcorrencia([], state, { equipamentoId: eq.id, tipoAlerta }, agora).ocorrencia;
};

describe('despacho', () => {
  it('perfil certo por tipo de alerta', () => {
    const s = seed();
    const furto = sugerirDespacho(s, abrir(s, 'furto'));
    expect(furto.fallback).toBe(false);
    expect(furto.sugestoes.every((x) => perfilDespacho('furto').funcoes.includes(x.funcao))).toBe(true);
    const falha = sugerirDespacho(s, abrir(s, 'falha'));
    expect(falha.sugestoes.every((x) => x.funcao === 'transit_agent')).toBe(true);
  });

  it('ordena por ETA e explica a estimativa', () => {
    const s = seed();
    const { sugestoes, observacao } = sugerirDespacho(s, abrir(s, 'falha'), { topN: 5 });
    expect(sugestoes.length).toBeGreaterThan(1);
    const etas = sugestoes.map((x) => x.etaMin);
    expect(etas).toEqual([...etas].sort((a, b) => a - b));
    expect(observacao).toContain('linha reta');
    for (const x of sugestoes) expect(x.custoColateral.texto.length).toBeGreaterThan(0);
  });

  it('agente de folga entra como convocação, com penalidade no ETA', () => {
    const s = seed();
    const oc = abrir(s, 'furto');
    const todos = sugerirDespacho(s, oc, { topN: 20, penalidadeConvocacaoMin: 0 });
    const folga = todos.sugestoes.find((x) => x.convocacao)!;
    expect(folga).toBeDefined();
    const comPenalidade = sugerirDespacho(s, oc, { topN: 20, penalidadeConvocacaoMin: 15 }).sugestoes.find((x) => x.agenteId === folga.agenteId)!;
    expect(comPenalidade.etaMin).toBe(folga.etaMin + 15);
    expect(comPenalidade.custoColateral.texto).toContain('não desfalca');
  });

  it('simular não altera o estado; despachar move o agente e guarda a origem', () => {
    const s = seed();
    const frozen = JSON.stringify(s);
    const oc = abrir(s, 'falha');
    const [top] = sugerirDespacho(s, oc).sugestoes;
    simular(s, top.acao);
    expect(JSON.stringify(s)).toBe(frozen);

    const { state, despacho } = despachar(s, oc, top.agenteId, agora);
    expect(JSON.stringify(s)).toBe(frozen);
    const eq = s.equipment.find((e) => e.id === oc.equipamentoId)!;
    const moved = state.agents.find((a) => a.id === top.agenteId)!;
    expect(moved).toMatchObject({ status: 'in_dispatch', lat: eq.location.lat, lng: eq.location.lng, neighborhood: eq.location.neighborhood });
    const original = s.agents.find((a) => a.id === top.agenteId)!;
    expect(despacho.origem).toEqual({ lat: original.lat, lng: original.lng, bairro: original.neighborhood, status: original.status });
    expect(despacho.etaMin).toBe(top.etaMin);
  });

  it('ao encerrar, o agente volta exatamente à origem', () => {
    const s = seed();
    const oc = abrir(s, 'furto');
    const [top] = sugerirDespacho(s, oc).sugestoes;
    const { state, despacho } = despachar(s, oc, top.agenteId, agora);
    expect(devolverAgente(state, despacho).agents).toEqual(s.agents);
  });

  it('quem já está em atendimento não é sugerido; sem agentes livres, lista vazia sem erro', () => {
    const s = seed();
    const oc = abrir(s, 'falha');
    const [top] = sugerirDespacho(s, oc).sugestoes;
    const { state } = despachar(s, oc, top.agenteId, agora);
    expect(sugerirDespacho(state, oc, { topN: 50 }).sugestoes.some((x) => x.agenteId === top.agenteId)).toBe(false);

    const ocupados: CityState = { ...s, agents: s.agents.map((a) => ({ ...a, status: 'in_dispatch' })) };
    expect(sugerirDespacho(ocupados, oc).sugestoes).toEqual([]);
    expect(sugerirDespacho({ ...s, agents: [] }, oc).sugestoes).toEqual([]);
  });

  it('sem ninguém do perfil, recorre a qualquer agente em serviço', () => {
    const s = seed();
    const oc = abrir(s, 'furto');
    const semSeguranca: CityState = { ...s, agents: s.agents.filter((a) => a.role === 'transit_agent') };
    const r = sugerirDespacho(semSeguranca, oc);
    expect(r.fallback).toBe(true);
    expect(r.sugestoes.length).toBeGreaterThan(0);
    expect(r.sugestoes.every((x) => !x.convocacao)).toBe(true);
  });
});
