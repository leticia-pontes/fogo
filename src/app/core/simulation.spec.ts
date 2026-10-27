import { buildMockAgents, buildMockEquipment } from '../data/mock-data';
import { HOOD_A, HOOD_B, makeAgent, makeEquipment } from '../../testing/fixtures';
import { calcularSaudePorRegiao } from './analysis';
import { calcularCobertura, coverageGrid, haversineM } from './coverage';
import { COVERAGE_RADIUS_M } from './coverage-config';
import { ganhoDe, recomendarAcoes } from './recommendations';
import { aplicarAcao, simular } from './simulation';
import { CityState } from './state';

const HOJE = '2026-03-10';
const seed = (): CityState => ({ equipment: buildMockEquipment(), agents: buildMockAgents(), peakSurge: null });

describe('simulador', () => {
  it('simular não altera o estado original', () => {
    const state = seed();
    const frozen = JSON.stringify(state);
    simular(state, { tipo: 'DESATIVAR_EQUIPAMENTO', equipamentoId: state.equipment[0].id }, HOJE);
    simular(state, { tipo: 'REALOCAR_AGENTES', agentes: [state.agents[0].id], regiaoDestino: HOOD_B }, HOJE);
    simular(state, { tipo: 'ANTECIPAR_MANUTENCAO', equipamentoId: state.equipment[1].id, novaData: HOJE }, HOJE);
    expect(JSON.stringify(state)).toBe(frozen);
  });

  it('desativar um equipamento nunca aumenta disponibilidade nem cobertura', () => {
    const state = seed();
    for (const e of state.equipment) {
      const sim = simular(state, { tipo: 'DESATIVAR_EQUIPAMENTO', equipamentoId: e.id }, HOJE);
      expect(sim.depois.indicadores.availabilityPct).toBeLessThanOrEqual(sim.antes.indicadores.availabilityPct);
      expect(sim.depois.cobertura.pct).toBeLessThanOrEqual(sim.antes.cobertura.pct);
      expect(sim.pontosCegosRecuperados).toEqual([]);
    }
  });

  it('realocar agentes reduz o efetivo da origem e aumenta o do destino', () => {
    const state = seed();
    const agent = state.agents.find((a) => a.status === 'active' && a.neighborhood !== HOOD_B)!;
    const sim = simular(state, { tipo: 'REALOCAR_AGENTES', agentes: [agent.id], regiaoDestino: HOOD_B }, HOJE);
    const onDuty = (p: typeof sim.antes, hood: string) => p.saude.find((h) => h.neighborhood === hood)!.agentsOnDuty;
    expect(onDuty(sim.depois, agent.neighborhood)).toBe(onDuty(sim.antes, agent.neighborhood) - 1);
    expect(onDuty(sim.depois, HOOD_B)).toBe(onDuty(sim.antes, HOOD_B) + 1);
  });

  it('antecipar manutenção não piora a saúde de nenhuma região', () => {
    const state = seed();
    for (const e of state.equipment) {
      for (const novaData of [HOJE, '2026-03-20']) {
        const sim = simular(state, { tipo: 'ANTECIPAR_MANUTENCAO', equipamentoId: e.id, novaData }, HOJE);
        for (const h of sim.antes.saude) {
          expect(sim.depois.saude.find((x) => x.neighborhood === h.neighborhood)!.health).toBeGreaterThanOrEqual(h.health);
        }
      }
    }
  });

  it('diferenças vêm ordenadas por impacto e explicam a ação', () => {
    const state = seed();
    const radar = state.equipment.find((e) => e.type === 'radar' && e.status === 'operational')!;
    const sim = simular(state, { tipo: 'FALHA_EQUIPAMENTO', equipamentoId: radar.id }, HOJE);
    const impacts = sim.diferencas.map((d) => d.impacto);
    expect(impacts).toEqual([...impacts].sort((a, b) => b - a));
    expect(sim.diferencas.some((d) => d.texto.startsWith(`Saúde de ${radar.location.neighborhood}`) && !d.melhora)).toBe(true);
    expect(sim.fatores.length).toBeGreaterThan(0);
  });

  it('aplicar manutenção com data futura só agenda; hoje devolve o equipamento à operação', () => {
    const state = seed();
    const broken = state.equipment.find((e) => e.status === 'malfunction')!;
    const later = aplicarAcao(state, { tipo: 'ANTECIPAR_MANUTENCAO', equipamentoId: broken.id, novaData: '2026-03-15' }, { hoje: HOJE });
    expect(later.state.equipment.find((e) => e.id === broken.id)).toMatchObject({ status: 'malfunction', maintenance: { nextDate: '2026-03-15' } });
    const now = aplicarAcao(state, { tipo: 'ANTECIPAR_MANUTENCAO', equipamentoId: broken.id, novaData: HOJE }, { hoje: HOJE });
    expect(now.state.equipment.find((e) => e.id === broken.id)!.status).toBe('operational');
  });
});

describe('próxima melhor ação', () => {
  it('vem ordenada por ganho e a primeira realmente melhora os indicadores', () => {
    const state = seed();
    const recs = recomendarAcoes(state, { topN: 3, hoje: HOJE });
    expect(recs).toHaveLength(3);
    const gains = recs.map((r) => r.ganho);
    expect(gains).toEqual([...gains].sort((a, b) => b - a));

    const sim = simular(state, recs[0].acao, HOJE);
    expect(ganhoDe(sim)).toBe(recs[0].ganho);
    expect(recs[0].impacto.riscoDepois).toBeLessThan(recs[0].impacto.riscoAntes);
    const total = (list: { health: number }[]) => list.reduce((s, h) => s + h.health, 0);
    expect(total(sim.depois.saude)).toBeGreaterThan(total(sim.antes.saude));
  });

  it('é determinística e não sugere nada que piore a cidade', () => {
    const state = seed();
    expect(recomendarAcoes(state, { hoje: HOJE })).toEqual(recomendarAcoes(state, { hoje: HOJE }));
    for (const r of recomendarAcoes(state, { topN: 10, hoje: HOJE })) expect(r.ganho).toBeGreaterThan(0);
  });

  it('cidade sem problemas não gera recomendações', () => {
    const state: CityState = {
      equipment: [makeEquipment({ type: 'camera', nextInDays: 60 })],
      agents: calcularSaudePorRegiao(seed()).flatMap((h) => Array.from({ length: h.agentsRequired }, () => makeAgent({ neighborhood: h.neighborhood }))),
      peakSurge: null,
    };
    expect(recomendarAcoes(state, { hoje: HOJE })).toEqual([]);
  });
});

describe('cobertura', () => {
  const grid = coverageGrid();
  const cell = grid[Math.floor(grid.length / 2)];
  const at = (overrides: Parameters<typeof makeEquipment>[0] = {}) => {
    const e = makeEquipment({ type: 'camera', neighborhood: HOOD_A, ...overrides });
    return { ...e, location: { ...e.location, lat: cell.lat, lng: cell.lng } };
  };

  it('um equipamento isolado cobre as células dentro do raio e nenhuma fora', () => {
    const cam = at();
    const result = calcularCobertura({ equipment: [cam], agents: [] });
    const blind = new Set(result.blindSpots.map((c) => c.id));
    for (const c of grid) {
      const inside = haversineM(cam.location.lat, cam.location.lng, c.lat, c.lng) <= COVERAGE_RADIUS_M.camera;
      expect(blind.has(c.id)).toBe(!inside);
    }
    expect(result.coveredCells).toBeGreaterThan(0);
  });

  it('desativar o equipamento reduz a cobertura', () => {
    const before = calcularCobertura({ equipment: [at()], agents: [] });
    const after = calcularCobertura({ equipment: [at({ status: 'deactivated' })], agents: [] });
    expect(after.coveredCells).toBeLessThan(before.coveredCells);
    expect(after.coveredCells).toBe(0);
  });

  it('dois equipamentos sobrepostos não perdem cobertura quando um cai', () => {
    const both = calcularCobertura({ equipment: [at(), at()], agents: [] });
    const one = calcularCobertura({ equipment: [at(), at({ status: 'malfunction' })], agents: [] });
    expect(one.coveredCells).toBe(both.coveredCells);
  });

  it('agente fora de turno não cobre; em serviço cobre', () => {
    const agent = makeAgent({ lat: cell.lat, lng: cell.lng });
    expect(calcularCobertura({ equipment: [], agents: [{ ...agent, status: 'off_duty' }] }).coveredCells).toBe(0);
    expect(calcularCobertura({ equipment: [], agents: [agent] }).coveredCells).toBeGreaterThan(0);
  });
});
