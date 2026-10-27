import { NEIGHBORHOODS, daysFromToday } from '../data/mock-data';
import { MOBILE_TYPES, STATUS_LABELS } from '../models/equipment-schema';
import { Agent, Equipment, EquipmentType } from '../models/fogo.models';
import { CityState } from './state';

/**
 * Cenários de crise com um clique. Funções puras: recebem o estado e devolvem o novo estado
 * mais um snapshot dos itens afetados (versão anterior), usado para reverter o cenário sem
 * tocar no restante dos dados. Não há aleatoriedade: o mesmo estado gera o mesmo resultado.
 */
export type ScenarioId = 'theft_wave' | 'north_degradation' | 'south_peak' | 'power_outage';

export interface Scenario {
  id: ScenarioId;
  title: string;
  description: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'theft_wave',
    title: 'Onda de Furto e Vandalismo (Centro)',
    description: '2 câmeras e 1 totem furtados; pede viaturas da Guarda/PM.',
  },
  {
    id: 'north_degradation',
    title: 'Degradação e Manutenção Crítica (Zona Norte)',
    description: '3 radares e 1 balança em falha com manutenção imediata.',
  },
  {
    id: 'south_peak',
    title: 'Horário de Pico + Alerta Preditivo (Zona Sul)',
    description: 'Véspera de pico com efetivo reduzido; gera novas recomendações.',
  },
  {
    id: 'power_outage',
    title: 'Falha de Energia (Entroncamento)',
    description: 'Todos os equipamentos fixos do bairro caem; agentes passam a atender ocorrências.',
  },
];

/** Bairro atingido pela falha de energia: o de maior fluxo, onde o apagão mais pesa. */
export const POWER_OUTAGE_DISTRICT = 'Entroncamento';

/** Versão anterior dos itens tocados por cenários (para reverter). */
export interface ScenarioSnapshot {
  scenarios: ScenarioId[];
  equipment: Equipment[];
  agents: Agent[];
  peakSurge: string | null;
}

export interface ScenarioResult {
  state: CityState;
  label: string;
  /** Bairro para centralizar o mapa. */
  focus?: string;
  equipmentIds: string[];
  agentIds: string[];
  messages: string[];
}

export function applyScenario(state: CityState, id: ScenarioId, today = daysFromToday(0)): ScenarioResult {
  switch (id) {
    case 'theft_wave':
      return theftWave(state);
    case 'north_degradation':
      return northDegradation(state, today);
    case 'south_peak':
      return southPeak(state);
    case 'power_outage':
      return powerOutage(state, today);
  }
}

/**
 * Acumula no snapshot a versão anterior dos itens recém-afetados. Itens já presentes no
 * snapshot mantêm a versão de antes do primeiro cenário.
 */
export function recordSnapshot(
  snapshot: ScenarioSnapshot | null,
  before: CityState,
  result: ScenarioResult,
  id: ScenarioId
): ScenarioSnapshot {
  const base: ScenarioSnapshot = snapshot ?? { scenarios: [], equipment: [], agents: [], peakSurge: before.peakSurge };
  const knownEq = new Set(base.equipment.map((e) => e.id));
  const knownAg = new Set(base.agents.map((a) => a.id));
  return {
    scenarios: [...base.scenarios, id],
    peakSurge: base.peakSurge,
    equipment: [
      ...base.equipment,
      ...before.equipment.filter((e) => result.equipmentIds.includes(e.id) && !knownEq.has(e.id)),
    ],
    agents: [...base.agents, ...before.agents.filter((a) => result.agentIds.includes(a.id) && !knownAg.has(a.id))],
  };
}

/** Devolve os itens afetados à versão anterior; itens excluídos depois do cenário continuam excluídos. */
export function revertScenarios(state: CityState, snapshot: ScenarioSnapshot): CityState {
  const eq = new Map(snapshot.equipment.map((e) => [e.id, e]));
  const ag = new Map(snapshot.agents.map((a) => [a.id, a]));
  return {
    equipment: state.equipment.map((e) => eq.get(e.id) ?? e),
    agents: state.agents.map((a) => ag.get(a.id) ?? a),
    peakSurge: snapshot.peakSurge,
  };
}

function theftWave(state: CityState): ScenarioResult {
  // O bairro do Centro com menos Guarda/PM em serviço é o alvo mais vulnerável.
  const security = (name: string) =>
    state.agents.filter((a) => a.neighborhood === name && a.status !== 'off_duty' && a.role !== 'transit_agent').length;
  const districts = NEIGHBORHOODS.filter((n) => n.zone === 'Centro')
    .map((n) => n.name)
    .sort((a, b) => security(a) - security(b));
  const targets = [...pick(state, ['camera'], districts, 2), ...pick(state, ['parking_totem'], districts, 1)];
  return patchResult(state, targets, (e) => ({ ...e, status: 'stolen', maintenance: { priority: 'immediate' } }), {
    label: 'Onda de furto no Centro',
    focus: targets[0]?.location.neighborhood,
  });
}

function northDegradation(state: CityState, today: string): ScenarioResult {
  const north = NEIGHBORHOODS.find((n) => n.zone === 'Zona Norte')!;
  // Bairros ordenados pela distância à Zona Norte: se faltarem radares lá, usa o entorno.
  const byDistance = [...NEIGHBORHOODS]
    .sort((a, b) => Math.hypot(a.lat - north.lat, a.lng - north.lng) - Math.hypot(b.lat - north.lat, b.lng - north.lng))
    .map((n) => n.name);
  const targets = [...pick(state, ['radar'], byDistance, 3), ...pick(state, ['truck_scale'], byDistance, 1)];
  return patchResult(
    state,
    targets,
    (e) => ({ ...e, status: 'malfunction', maintenance: { priority: 'immediate', nextDate: today } }),
    { label: 'Degradação crítica na Zona Norte', focus: north.name }
  );
}

function southPeak(state: CityState): ScenarioResult {
  const south = NEIGHBORHOODS.find((n) => n.zone === 'Zona Sul')!;
  // Fim de turno às vésperas do pico: dois agentes ativos do bairro saem de serviço.
  const leaving = state.agents
    .filter((a) => a.neighborhood === south.name && a.status === 'active')
    .slice(0, 2)
    .map((a) => a.id);
  const ids = new Set(leaving);
  return {
    state: {
      equipment: state.equipment,
      agents: state.agents.map((a) => (ids.has(a.id) ? { ...a, status: 'off_duty' } : a)),
      peakSurge: south.name,
    },
    label: `Véspera de pico em ${south.name}`,
    focus: south.name,
    equipmentIds: [],
    agentIds: leaving,
    messages: [`[Cenário] Véspera de pico em ${south.name}: fluxo previsto +40% e ${leaving.length} agente(s) encerrando turno`],
  };
}

function powerOutage(state: CityState, today: string): ScenarioResult {
  const hood = POWER_OUTAGE_DISTRICT;
  // Equipamentos fixos dependem da rede elétrica; veículos e patinetes seguem com bateria.
  const targets = state.equipment.filter(
    (e) => e.location.neighborhood === hood && e.status === 'operational' && !MOBILE_TYPES.includes(e.type)
  );
  const dispatched = state.agents.filter((a) => a.neighborhood === hood && a.status === 'active').map((a) => a.id);
  const result = patchResult(
    state,
    targets,
    (e) => ({ ...e, status: 'malfunction', maintenance: { priority: 'immediate', nextDate: today } }),
    { label: `Falha de energia em ${hood}`, focus: hood }
  );
  const ids = new Set(dispatched);
  return {
    ...result,
    state: { ...result.state, agents: state.agents.map((a) => (ids.has(a.id) ? { ...a, status: 'in_dispatch' } : a)) },
    agentIds: dispatched,
    messages: [
      `[Cenário] Falha de energia em ${hood}: ${targets.length} equipamento(s) fixo(s) sem alimentação`,
      ...result.messages,
      ...(dispatched.length ? [`[Cenário] ${dispatched.length} agente(s) de ${hood} deslocado(s) para ocorrências`] : []),
    ],
  };
}

/** Equipamentos operacionais dos tipos pedidos, na ordem de preferência dos bairros. */
function pick(state: CityState, types: EquipmentType[], districts: string[], count: number): Equipment[] {
  const pool = state.equipment.filter((e) => types.includes(e.type) && e.status === 'operational');
  return districts.flatMap((d) => pool.filter((e) => e.location.neighborhood === d)).slice(0, count);
}

function patchResult(
  state: CityState,
  targets: Equipment[],
  fn: (e: Equipment) => Equipment,
  meta: { label: string; focus?: string }
): ScenarioResult {
  const ids = new Set(targets.map((e) => e.id));
  const equipment = state.equipment.map((e) => (ids.has(e.id) ? fn(e) : e));
  const changed = equipment.filter((e) => ids.has(e.id));
  return {
    state: { ...state, equipment },
    ...meta,
    equipmentIds: [...ids],
    agentIds: [],
    messages: changed.map((e) => `[Cenário] ${e.serialNumber} (${e.location.neighborhood}) → ${STATUS_LABELS[e.status]}`),
  };
}
