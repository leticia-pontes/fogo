import { analisarLotes, emFalha } from '../core/batch';
import { Injectable, computed, inject } from '@angular/core';
import { NEIGHBORHOODS, NEIGHBORHOOD_HISTORY, daysFromToday } from '../data/mock-data';
import { STATUS_LABELS } from '../models/equipment-schema';
import { Agent, Equipment, MaintenancePriority } from '../models/fogo.models';
import { RISK_HIGH, SURGE_FLOW_FACTOR, collapseStats } from '../core/analysis';
import { CityStateService, daysUntil } from './city-state.service';

export type PredictionKind = 'traffic_collapse' | 'batch_failure' | 'staff_reinforcement' | 'security_patrol';

export type PredictionAction =
  | { kind: 'move_agents'; neighborhood: string; agentIds: string[] }
  | { kind: 'maintenance'; equipmentIds: string[]; priority: MaintenancePriority; nextDate: string };

export interface Prediction {
  id: string;
  kind: PredictionKind;
  /** 1. O que está sendo previsto */
  title: string;
  subject: string;
  /** Bairro alvo (previsões territoriais). */
  neighborhood?: string;
  horizon: string;
  riskScore: number;
  /** 2. Base de dados considerada */
  evidence: string[];
  /** 3. Recomendação de decisão */
  recommendation: string;
  actions: PredictionAction[];
}

const COLLAPSE_THRESHOLD = RISK_HIGH;
const SECURITY_ROLES: Agent['role'][] = ['municipal_guard', 'military_police'];

export function actionSignature(action: PredictionAction): string {
  return action.kind === 'move_agents'
    ? `move:${action.neighborhood}:${[...action.agentIds].sort().join(',')}`
    : `mnt:${action.priority}:${[...action.equipmentIds].sort().join(',')}`;
}

const isFailing = emFalha;

function onDuty(a: Agent): boolean {
  return a.status !== 'off_duty';
}

@Injectable({ providedIn: 'root' })
export class PredictionService {
  private readonly city = inject(CityStateService);

  readonly predictions = computed<Prediction[]>(() => {
    const equipment = this.city.equipment();
    const agents = this.city.agents();
    const surge = this.city.peakSurge();
    return [...this.neighborhoodPredictions(equipment, agents, surge), ...this.batchFailurePredictions(equipment)].sort(
      (a, b) => b.riskScore - a.riskScore
    );
  });

  isApplied(prediction: Prediction): boolean {
    const applied = this.city.appliedActions();
    return prediction.actions.length > 0 && prediction.actions.every((a) => applied.has(actionSignature(a)));
  }

  apply(prediction: Prediction): void {
    for (const action of prediction.actions) {
      if (action.kind === 'maintenance') {
        this.city.patchEquipment(action.equipmentIds, (e) => ({
          ...e,
          // Equipe técnica despachada: falha passa a "em manutenção".
          status: e.status === 'malfunction' ? 'maintenance' : e.status,
          maintenance: { priority: action.priority, nextDate: action.nextDate },
        }));
      } else {
        const hood = NEIGHBORHOODS.find((n) => n.name === action.neighborhood);
        this.city.patchAgents(action.agentIds, (a) =>
          a.neighborhood === action.neighborhood
            ? { ...a, status: 'active' }
            : {
                ...a,
                neighborhood: action.neighborhood,
                status: 'in_dispatch',
                lat: (hood?.lat ?? a.lat) + (Math.random() - 0.5) * 0.006,
                lng: (hood?.lng ?? a.lng) + (Math.random() - 0.5) * 0.006,
              }
        );
      }
    }
    this.city.markApplied(prediction.actions.map(actionSignature));
    this.city.log(`Recomendação aplicada: ${prediction.recommendation}`, 'good', 'prediction_applied');
  }

  /**
   * Colapso viário (fiscalização indisponível + fluxo histórico + efetivo) e, quando não há
   * colapso previsto, necessidade de reforço de efetivo. Bairros mais críticos recebem
   * prioridade no remanejamento dos agentes excedentes.
   */
  private neighborhoodPredictions(equipment: Equipment[], agents: Agent[], surge: string | null): Prediction[] {
    const stats = collapseStats(equipment, agents, surge).sort((a, b) => b.collapseScore - a.collapseScore);

    // Excedente de cada bairro (agentes em serviço acima do necessário no pico).
    const surplus = new Map(
      stats.map((s) => [s.n.name, Math.max(0, s.present - s.history.requiredAgentsAtPeak)])
    );
    const reserved = new Set<string>();

    const planReinforcement = (target: string, deficit: number) => {
      const ids: string[] = [];
      const parts: string[] = [];
      const offDuty = agents
        .filter((a) => a.neighborhood === target && a.status === 'off_duty' && !reserved.has(a.id))
        .slice(0, deficit);
      if (offDuty.length) {
        ids.push(...offDuty.map((a) => a.id));
        parts.push(`convocar ${offDuty.length} agente(s) de folga lotado(s) em ${target}`);
      }
      let remaining = deficit - offDuty.length;
      const donors = [...surplus.entries()].filter(([name, s]) => name !== target && s > 0).sort((a, b) => b[1] - a[1]);
      for (const [donor, available] of donors) {
        if (remaining <= 0) break;
        const picked = agents
          .filter((a) => a.neighborhood === donor && a.status === 'active' && !reserved.has(a.id))
          .slice(0, Math.min(available, remaining));
        if (!picked.length) continue;
        ids.push(...picked.map((a) => a.id));
        surplus.set(donor, available - picked.length);
        remaining -= picked.length;
        parts.push(`realocar ${picked.length} agente(s) de ${donor} para ${target}`);
      }
      ids.forEach((id) => reserved.add(id));
      return { ids, parts, remaining };
    };

    const result: Prediction[] = [];

    for (const s of stats) {
      const { n, history, down, present, deficit } = s;
      const effectiveEvidence = `${present} agente(s) em serviço no bairro para ${history.requiredAgentsAtPeak} necessários no pico`;
      const surgeEvidence = s.surging
        ? [`Véspera de pico: fluxo previsto ${Math.round((SURGE_FLOW_FACTOR - 1) * 100)}% acima da média histórica do bairro`]
        : [];

      if (s.collapseScore >= COLLAPSE_THRESHOLD && down.length > 0) {
        const plan = deficit > 0 ? planReinforcement(n.name, deficit) : null;
        const actions: PredictionAction[] = [
          { kind: 'maintenance', equipmentIds: down.map((e) => e.id), priority: 'immediate', nextDate: daysFromToday(0) },
        ];
        if (plan?.ids.length) actions.push({ kind: 'move_agents', neighborhood: n.name, agentIds: plan.ids });

        const steps = [`abrir OS imediata para ${down.map((e) => e.serialNumber).join(', ')}`, ...(plan?.parts ?? [])];
        result.push({
          id: `collapse:${n.name}`,
          kind: 'traffic_collapse',
          title: 'Índice de Risco de Colapso Viário',
          subject: `${n.name} (${n.zone})`,
          neighborhood: n.name,
          horizon: `Próximo pico: ${history.peakWindow}`,
          riskScore: Math.min(100, s.collapseScore),
          evidence: [
            `${down.length} de ${s.enforcement.length} equipamentos de fiscalização indisponíveis: ${down
              .map((e) => `${e.serialNumber} (${STATUS_LABELS[e.status].toLowerCase()})`)
              .join(', ')}`,
            s.surging
              ? `Fluxo previsto de ${history.peakFlowVehiclesPerHour.toLocaleString('pt-BR')} veículos/h ${history.peakWindow}`
              : `Fluxo histórico de ${history.peakFlowVehiclesPerHour.toLocaleString('pt-BR')} veículos/h em ${history.peakWindow}`,
            effectiveEvidence,
            `Média de ${history.incidentsPerWeek} ocorrências/semana nas últimas 12 semanas`,
            ...surgeEvidence,
          ],
          recommendation: this.capitalize(steps.join('; ')) + '.',
          actions,
        });
        continue;
      }

      if (deficit > 0) {
        const plan = planReinforcement(n.name, deficit);
        const critical = equipment.filter(
          (e) => e.location.neighborhood === n.name && (e.status === 'stolen' || e.status === 'malfunction')
        ).length;
        result.push({
          id: `staff:${n.name}`,
          kind: 'staff_reinforcement',
          title: 'Necessidade de Reforço de Efetivo',
          subject: `${n.name} (${n.zone})`,
          neighborhood: n.name,
          horizon: `Próximo pico: ${history.peakWindow}`,
          riskScore: Math.min(100, Math.round((deficit / history.requiredAgentsAtPeak) * 60 + history.incidentsPerWeek * 2)),
          evidence: [
            ...surgeEvidence,
            effectiveEvidence,
            `Média de ${history.incidentsPerWeek} ocorrências/semana, com concentração em ${NEIGHBORHOOD_HISTORY[n.name].peakWindow}`,
            `${critical} equipamento(s) com falha grave ou furto no bairro`,
            `Fluxo histórico de ${history.peakFlowVehiclesPerHour.toLocaleString('pt-BR')} veículos/h no pico`,
          ],
          recommendation: plan.parts.length
            ? this.capitalize(plan.parts.join('; ')) + '.'
            : `Solicitar ${deficit} agente(s) extra(s) à escala: não há excedente disponível em outros bairros.`,
          actions: plan.ids.length ? [{ kind: 'move_agents', neighborhood: n.name, agentIds: plan.ids }] : [],
        });
      }
    }

    // Onda de furtos: 2+ furtos no mesmo bairro pedem reforço de Guarda Municipal / PM.
    for (const { n, history } of stats) {
      const stolen = equipment.filter((e) => e.location.neighborhood === n.name && e.status === 'stolen');
      if (stolen.length < 2) continue;
      const isSecurity = (a: Agent) => SECURITY_ROLES.includes(a.role);
      const present = agents.filter((a) => a.neighborhood === n.name && onDuty(a) && isSecurity(a)).length;
      const needed = 2 + Math.floor(stolen.length / 2);
      const deficit = Math.max(0, needed - present);

      const ids: string[] = [];
      const parts: string[] = [];
      const offDuty = agents
        .filter((a) => a.neighborhood === n.name && a.status === 'off_duty' && isSecurity(a) && !reserved.has(a.id))
        .slice(0, deficit);
      if (offDuty.length) {
        ids.push(...offDuty.map((a) => a.id));
        parts.push(`convocar ${offDuty.length} agente(s) da Guarda/PM de folga em ${n.name}`);
      }
      let remaining = deficit - offDuty.length;
      for (const [donor, available] of [...surplus.entries()].filter(([name, v]) => name !== n.name && v > 0).sort((a, b) => b[1] - a[1])) {
        if (remaining <= 0) break;
        const picked = agents
          .filter((a) => a.neighborhood === donor && a.status === 'active' && isSecurity(a) && !reserved.has(a.id))
          .slice(0, Math.min(available, remaining));
        if (!picked.length) continue;
        ids.push(...picked.map((a) => a.id));
        surplus.set(donor, available - picked.length);
        remaining -= picked.length;
        parts.push(`deslocar ${picked.length} viatura(s) da Guarda/PM de ${donor} para ${n.name}`);
      }
      ids.forEach((id) => reserved.add(id));

      result.push({
        id: `security:${n.name}`,
        kind: 'security_patrol',
        title: 'Risco de Novos Furtos (Reforço de Patrulha)',
        subject: `${n.name} (${n.zone})`,
        neighborhood: n.name,
        horizon: 'Próximas 6 horas',
        riskScore: Math.min(100, 40 + stolen.length * 15 + deficit * 10),
        evidence: [
          `${stolen.length} furtos registrados no bairro: ${stolen.map((e) => e.serialNumber).join(', ')}`,
          `${present} agente(s) da Guarda Municipal/PM em serviço no bairro para ${needed} recomendados`,
          `Média de ${history.incidentsPerWeek} ocorrências/semana nas últimas 12 semanas`,
          'Padrão considerado: furtos em sequência no mesmo bairro indicam ação coordenada',
        ],
        recommendation: parts.length
          ? this.capitalize(parts.join('; ')) + ' e intensificar o patrulhamento ostensivo.'
          : deficit > 0
            ? `Solicitar ${deficit} viatura(s) extra(s) da Guarda/PM: não há efetivo excedente disponível.`
            : 'Efetivo de segurança suficiente no bairro: manter patrulhamento ostensivo e monitorar as câmeras vizinhas.',
        actions: ids.length ? [{ kind: 'move_agents', neighborhood: n.name, agentIds: ids }] : [],
      });
    }

    return result;
  }

  /** Tendência de falha em lote: mesmo fabricante/modelo com taxa de falha acima do restante da frota. */
  private batchFailurePredictions(equipment: Equipment[]): Prediction[] {
    const result: Prediction[] = [];
    for (const { lote: lot, unidades: units, emFalha: failing, taxa: rate, taxaFrota: fleetRate } of analisarLotes(equipment)) {
      if (failing.length < 2 || rate < 0.3) continue;

      const healthy = units.filter((e) => e.status === 'operational' && !isFailing(e));
      const overdue = units.filter((e) => e.maintenance.nextDate && daysUntil(e.maintenance.nextDate) < 0).length;
      const hoods = [...new Set(failing.map((e) => e.location.neighborhood))];

      const actions: PredictionAction[] = [
        { kind: 'maintenance', equipmentIds: failing.map((e) => e.id), priority: 'immediate', nextDate: daysFromToday(0) },
      ];
      if (healthy.length) {
        actions.push({ kind: 'maintenance', equipmentIds: healthy.map((e) => e.id), priority: 'scheduled', nextDate: daysFromToday(1) });
      }

      result.push({
        id: `batch:${lot}`,
        kind: 'batch_failure',
        title: 'Tendência de Falha em Lote de Equipamentos',
        subject: `${lot} (${units.length} unidades)`,
        horizon: 'Próximos 15 dias',
        riskScore: Math.min(100, Math.round(rate * 100 + failing.length * 5)),
        evidence: [
          `${failing.length} de ${units.length} unidades do modelo com falha ou manutenção pendente`,
          `Taxa de falha do lote de ${Math.round(rate * 100)}% contra ${Math.round(fleetRate * 100)}% no restante da frota`,
          `Falhas distribuídas em ${hoods.length} bairro(s): ${hoods.join(', ')}`,
          ...(overdue ? [`${overdue} unidade(s) com manutenção preventiva vencida`] : []),
        ],
        recommendation:
          `Abrir OS imediata para ${failing.map((e) => e.serialNumber).join(', ')}` +
          (healthy.length ? ` e antecipar a preventiva das ${healthy.length} unidades operacionais do lote para amanhã.` : '.'),
        actions,
      });
    }
    return result;
  }

  private capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
}
