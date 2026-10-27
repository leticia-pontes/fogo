import { NEIGHBORHOODS, NEIGHBORHOOD_HISTORY, daysFromToday } from '../data/mock-data';
import { isUnavailable } from '../models/equipment-schema';
import { Agent, AlertSeverity, Equipment, OpsAlert, RegionHealth, RegionSummary } from '../models/fogo.models';

export const UPCOMING_MAINTENANCE_DAYS = 7;

/** Dias entre `today` e uma data ISO (negativo = vencido). */
export function daysUntil(isoDate: string, today = daysFromToday(0)): number {
  return Math.round((Date.parse(isoDate) - Date.parse(today)) / 86_400_000);
}

export interface Indicators {
  total: number;
  operational: number;
  unavailable: number;
  notInstalled: number;
  /** Operacionais ÷ instalados, em % com uma casa decimal. */
  availabilityPct: number;
  activeAgents: number;
  inDispatch: number;
  totalAgents: number;
}

/** KPIs gerais: "ainda não instalado" não entra na disponibilidade. */
export function calcularIndicadores(equipment: Equipment[], agents: Agent[]): Indicators {
  const installed = equipment.filter((e) => e.status !== 'not_installed');
  const operational = installed.filter((e) => e.status === 'operational').length;
  return {
    total: equipment.length,
    operational,
    unavailable: installed.length - operational,
    notInstalled: equipment.length - installed.length,
    availabilityPct: installed.length ? Math.round((operational / installed.length) * 1000) / 10 : 0,
    activeAgents: agents.filter((a) => a.status !== 'off_duty').length,
    inDispatch: agents.filter((a) => a.status === 'in_dispatch').length,
    totalAgents: agents.length,
  };
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 0, high: 1, warning: 2 };

/**
 * Alertas da Central. `equipment`/`agents` são a visão filtrada; `allAgents` é o efetivo
 * completo, usado para medir o déficit de cada bairro.
 */
export function calcularAlertas(
  equipment: Equipment[],
  agents: Agent[],
  allAgents: Agent[] = agents,
  today = daysFromToday(0)
): OpsAlert[] {
  const alerts: OpsAlert[] = [];

  for (const e of equipment) {
    const reasons: { severity: AlertSeverity; text: string }[] = [];
    if (e.status === 'stolen') reasons.push({ severity: 'critical', text: 'Furto detectado' });
    if (e.status === 'malfunction') reasons.push({ severity: 'critical', text: 'Falha grave em operação' });
    if (e.maintenance.priority === 'immediate' && e.status !== 'stolen') {
      reasons.push({ severity: 'high', text: 'Manutenção imediata necessária' });
    }
    if (e.maintenance.nextDate && e.status !== 'stolen' && e.status !== 'deactivated') {
      const days = daysUntil(e.maintenance.nextDate, today);
      if (days < 0) reasons.push({ severity: 'high', text: `Manutenção vencida há ${-days} dia(s)` });
      else if (days <= UPCOMING_MAINTENANCE_DAYS) {
        reasons.push({ severity: 'warning', text: days === 0 ? 'Manutenção prevista para hoje' : `Manutenção em ${days} dia(s)` });
      }
    }
    if (reasons.length === 0) continue;

    reasons.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
    alerts.push({
      id: `AL-${e.id}`,
      target: { kind: 'equipment', id: e.id },
      severity: reasons[0].severity,
      title: `${reasons[0].text} · ${e.serialNumber}`,
      detail: [...reasons.slice(1).map((r) => r.text), `${e.location.street} (${e.location.reference}), ${e.location.neighborhood}`].join(' · '),
    });
  }

  // Agente fora de turno em bairro cujo efetivo em serviço não cobre o necessário no pico.
  const onDuty = new Map<string, number>();
  for (const a of allAgents) {
    if (a.status !== 'off_duty') onDuty.set(a.neighborhood, (onDuty.get(a.neighborhood) ?? 0) + 1);
  }
  for (const a of agents) {
    const required = NEIGHBORHOOD_HISTORY[a.neighborhood]?.requiredAgentsAtPeak ?? 0;
    const present = onDuty.get(a.neighborhood) ?? 0;
    if (a.status !== 'off_duty' || present >= required) continue;
    alerts.push({
      id: `AL-${a.id}`,
      target: { kind: 'agent', id: a.id },
      severity: 'warning',
      title: `Agente sem atividade em bairro com déficit · ${a.name}`,
      detail: `${a.badgeNumber} · ${a.neighborhood}: ${present} em serviço para ${required} necessários no pico`,
    });
  }

  return alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

/** Visão por região: Normal < 15%, Atenção 15–30%, Crítico ≥ 30% de indisponíveis entre os instalados. */
export function calcularRegioes(equipment: Equipment[], agents: Agent[], onlyNeighborhood = 'all'): RegionSummary[] {
  return NEIGHBORHOODS.filter((n) => onlyNeighborhood === 'all' || n.name === onlyNeighborhood).map((n) => {
    const installed = equipment.filter((e) => e.location.neighborhood === n.name && e.status !== 'not_installed');
    const unavailable = installed.filter((e) => isUnavailable(e.status)).length;
    const ratio = installed.length ? unavailable / installed.length : 0;
    const health: RegionHealth = ratio >= 0.3 ? 'critical' : ratio >= 0.15 ? 'attention' : 'normal';
    return {
      neighborhood: n.name,
      zone: n.zone,
      lat: n.lat,
      lng: n.lng,
      total: installed.length,
      operational: installed.length - unavailable,
      unavailable,
      unavailableRatio: ratio,
      health,
      activeAgents: agents.filter((a) => a.neighborhood === n.name && a.status !== 'off_duty').length,
    };
  });
}
