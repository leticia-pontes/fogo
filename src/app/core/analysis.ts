import { NEIGHBORHOODS, NEIGHBORHOOD_HISTORY, daysFromToday } from '../data/mock-data';
import { isUnavailable } from '../models/equipment-schema';
import { Agent, Equipment, EquipmentType, NeighborhoodHistory, NeighborhoodInfo } from '../models/fogo.models';
import { CoverageResult, calcularCobertura } from './coverage';
import { UPCOMING_MAINTENANCE_DAYS, daysUntil } from './indicators';
import { CityState } from './state';

// -----------------------------------------------------------------------------
// Escore de colapso viário (Parte 3), compartilhado com o PredictionService
// -----------------------------------------------------------------------------

export const ENFORCEMENT_TYPES: EquipmentType[] = ['radar', 'camera', 'barrier_gate'];
const MAX_PEAK_FLOW = Math.max(...Object.values(NEIGHBORHOOD_HISTORY).map((h) => h.peakFlowVehiclesPerHour));
/** Véspera de pico (cenário de crise): fluxo 40% acima da média e mais efetivo necessário. */
export const SURGE_FLOW_FACTOR = 1.4;
const SURGE_EXTRA_AGENTS = 2;

export interface CollapseStats {
  n: NeighborhoodInfo;
  history: NeighborhoodHistory;
  surging: boolean;
  enforcement: Equipment[];
  down: Equipment[];
  present: number;
  deficit: number;
  /**
   * 0–100 = fiscalização indisponível (15 por equipamento, máx. 45)
   *       + fluxo no pico relativo ao bairro mais movimentado (máx. 30)
   *       + déficit de efetivo no pico (10 por agente, máx. 25).
   */
  collapseScore: number;
}

export function collapseStats(equipment: Equipment[], agents: Agent[], surge: string | null): CollapseStats[] {
  return NEIGHBORHOODS.map((n) => {
    const base = NEIGHBORHOOD_HISTORY[n.name];
    const surging = surge === n.name;
    const history = surging
      ? {
          peakWindow: 'nas próximas 2 horas (véspera de pico)',
          peakFlowVehiclesPerHour: Math.round(base.peakFlowVehiclesPerHour * SURGE_FLOW_FACTOR),
          incidentsPerWeek: base.incidentsPerWeek,
          requiredAgentsAtPeak: base.requiredAgentsAtPeak + SURGE_EXTRA_AGENTS,
        }
      : base;
    const enforcement = equipment.filter(
      (e) => e.location.neighborhood === n.name && ENFORCEMENT_TYPES.includes(e.type) && e.status !== 'not_installed'
    );
    const down = enforcement.filter((e) => isUnavailable(e.status));
    const present = agents.filter((a) => a.neighborhood === n.name && a.status !== 'off_duty').length;
    const deficit = Math.max(0, history.requiredAgentsAtPeak - present);
    const flowScore = Math.min(30, Math.round((history.peakFlowVehiclesPerHour / MAX_PEAK_FLOW) * 30));
    const collapseScore = Math.min(45, down.length * 15) + flowScore + Math.min(25, deficit * 10);
    return { n, history, surging, enforcement, down, present, deficit, collapseScore };
  });
}

// -----------------------------------------------------------------------------
// Saúde por região (0–100)
// -----------------------------------------------------------------------------

/**
 * Índice de saúde do bairro, 0 (colapso) a 100 (ideal):
 *
 *   saúde = 40 × disponibilidade + 20 × manutenção + 15 × alertas + 25 × efetivo
 *
 * - disponibilidade = operacionais ÷ instalados (1 se o bairro não tem equipamentos);
 * - manutenção = 1 − (vencidas + imediatas + 0,5 × próximas em até 7 dias) ÷ instalados, mín. 0;
 * - alertas = 1 − (0,2 × críticos + 0,1 × altos), mín. 0 (crítico = furto ou falha grave;
 *   alto = manutenção imediata ou vencida);
 * - efetivo = agentes em serviço ÷ necessários no pico, máx. 1.
 */
export const HEALTH_WEIGHTS = { availability: 40, maintenance: 20, alerts: 15, staffing: 25 } as const;

export interface RegionHealthIndex {
  neighborhood: string;
  health: number;
  availability: number;
  maintenance: number;
  alerts: number;
  staffing: number;
  installed: number;
  operational: number;
  overdue: number;
  upcoming: number;
  critical: number;
  agentsOnDuty: number;
  agentsRequired: number;
}

export function calcularSaudePorRegiao(state: CityState, today = daysFromToday(0)): RegionHealthIndex[] {
  return NEIGHBORHOODS.map((n) => {
    const history = NEIGHBORHOOD_HISTORY[n.name];
    const required = history.requiredAgentsAtPeak + (state.peakSurge === n.name ? SURGE_EXTRA_AGENTS : 0);
    const installed = state.equipment.filter((e) => e.location.neighborhood === n.name && e.status !== 'not_installed');
    const operational = installed.filter((e) => e.status === 'operational').length;
    let overdue = 0;
    let immediate = 0;
    let upcoming = 0;
    let critical = 0;
    let high = 0;
    for (const e of installed) {
      const days = e.maintenance.nextDate && e.status !== 'stolen' && e.status !== 'deactivated' ? daysUntil(e.maintenance.nextDate, today) : null;
      const isImmediate = e.maintenance.priority === 'immediate' && e.status !== 'stolen';
      if (days !== null && days < 0) overdue++;
      else if (days !== null && days <= UPCOMING_MAINTENANCE_DAYS) upcoming++;
      if (isImmediate) immediate++;
      if (e.status === 'stolen' || e.status === 'malfunction') critical++;
      else if (isImmediate || (days !== null && days < 0)) high++;
    }
    const onDuty = state.agents.filter((a) => a.neighborhood === n.name && a.status !== 'off_duty').length;

    const availability = installed.length ? operational / installed.length : 1;
    const maintenance = installed.length ? Math.max(0, 1 - (overdue + immediate + 0.5 * upcoming) / installed.length) : 1;
    const alerts = Math.max(0, 1 - (0.2 * critical + 0.1 * high));
    const staffing = required ? Math.min(1, onDuty / required) : 1;
    const w = HEALTH_WEIGHTS;
    return {
      neighborhood: n.name,
      health: Math.round(w.availability * availability + w.maintenance * maintenance + w.alerts * alerts + w.staffing * staffing),
      availability,
      maintenance,
      alerts,
      staffing,
      installed: installed.length,
      operational,
      overdue,
      upcoming,
      critical,
      agentsOnDuty: onDuty,
      agentsRequired: required,
    };
  });
}

// -----------------------------------------------------------------------------
// Risco por região
// -----------------------------------------------------------------------------

export type RiskLevel = 'BAIXO' | 'MEDIO' | 'ALTO';

/**
 * Risco do bairro no próximo pico, 0–100:
 *
 *   risco = escore de colapso viário da Parte 3 (fiscalização, fluxo, efetivo)
 *         + 20 × fração do bairro em ponto cego
 *
 * Nível: ALTO ≥ 55 (o mesmo limiar que dispara a previsão de colapso), MÉDIO ≥ 35, BAIXO abaixo.
 */
export const RISK_BLIND_WEIGHT = 20;
export const RISK_HIGH = 55;
export const RISK_MEDIUM = 35;

export interface RegionRisk {
  neighborhood: string;
  risk: number;
  level: RiskLevel;
  collapseScore: number;
  blindPct: number;
  enforcementDown: number;
  agentDeficit: number;
}

export function riskLevel(risk: number): RiskLevel {
  return risk >= RISK_HIGH ? 'ALTO' : risk >= RISK_MEDIUM ? 'MEDIO' : 'BAIXO';
}

export function calcularRisco(state: CityState, contexto: { coverage?: CoverageResult } = {}): RegionRisk[] {
  const coverage = contexto.coverage ?? calcularCobertura(state);
  return collapseStats(state.equipment, state.agents, state.peakSurge).map((s) => {
    const cov = coverage.byNeighborhood[s.n.name];
    const blindPct = cov && cov.cells ? 100 - cov.pct : 0;
    const risk = Math.min(100, s.collapseScore + Math.round((RISK_BLIND_WEIGHT * blindPct) / 100));
    return {
      neighborhood: s.n.name,
      risk,
      level: riskLevel(risk),
      collapseScore: s.collapseScore,
      blindPct,
      enforcementDown: s.down.length,
      agentDeficit: s.deficit,
    };
  });
}
