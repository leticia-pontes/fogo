import { buildMockAgents, buildMockEquipment } from '../data/mock-data';
import { MOBILE_TYPES } from '../models/equipment-schema';
import { POWER_OUTAGE_DISTRICT, SCENARIOS, applyScenario, recordSnapshot, revertScenarios } from './scenarios';
import { CityState } from './state';

describe('cenários de crise', () => {
  const seed = (): CityState => ({ equipment: buildMockEquipment(), agents: buildMockAgents(), peakSurge: null });

  it.each(SCENARIOS.map((s) => s.id))('%s altera o estado sem mutar a entrada e é reproduzível', (id) => {
    const state = seed();
    const frozen = JSON.stringify(state);
    const a = applyScenario(state, id, '2026-01-01');
    const b = applyScenario(seed(), id, '2026-01-01');
    expect(JSON.stringify(state)).toBe(frozen);
    expect(a.state).toEqual(b.state);
    expect(a.equipmentIds.length + a.agentIds.length).toBeGreaterThan(0);
    expect(a.state).not.toEqual(state);
  });

  it('reverter devolve exatamente o estado anterior, mesmo com cenários acumulados', () => {
    const initial = seed();
    let state = initial;
    let snapshot = null;
    for (const id of ['power_outage', 'theft_wave', 'south_peak'] as const) {
      const result = applyScenario(state, id);
      snapshot = recordSnapshot(snapshot, state, result, id);
      state = result.state;
    }
    expect(revertScenarios(state, snapshot!)).toEqual(initial);
  });

  it('reverter preserva itens criados pelo usuário depois do cenário', () => {
    const initial = seed();
    const result = applyScenario(initial, 'theft_wave');
    const snapshot = recordSnapshot(null, initial, result, 'theft_wave');
    const extra = { ...initial.equipment[0], id: 'EQ-USER' };
    const reverted = revertScenarios({ ...result.state, equipment: [...result.state.equipment, extra] }, snapshot);
    expect(reverted.equipment.find((e) => e.id === 'EQ-USER')).toEqual(extra);
  });

  it('falha de energia derruba só equipamentos fixos do bairro e despacha os agentes ativos', () => {
    const { state } = applyScenario(seed(), 'power_outage');
    const hood = state.equipment.filter((e) => e.location.neighborhood === POWER_OUTAGE_DISTRICT);
    expect(hood.filter((e) => !MOBILE_TYPES.includes(e.type) && e.status === 'operational')).toEqual([]);
    expect(state.agents.filter((a) => a.neighborhood === POWER_OUTAGE_DISTRICT && a.status === 'active')).toEqual([]);
  });
});
