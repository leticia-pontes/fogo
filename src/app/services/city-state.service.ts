import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  NEIGHBORHOODS,
  NEIGHBORHOOD_HISTORY,
  buildMockAgents,
  buildMockEquipment,
  daysFromToday,
} from '../data/mock-data';
import { MOBILE_TYPES, STATUS_LABELS, isUnavailable } from '../models/equipment-schema';
import {
  Agent,
  AlertSeverity,
  CityEvent,
  Equipment,
  EquipmentStatus,
  OpsAlert,
  OpsFilters,
  RegionHealth,
  RegionSummary,
} from '../models/fogo.models';

const STORAGE_KEY = 'fogo:state:v3';
const TELEMETRY_INTERVAL_MS = 3000;
const UPCOMING_MAINTENANCE_DAYS = 7;

export const EMPTY_FILTERS: OpsFilters = { type: 'all', status: 'all', neighborhood: 'all', agency: 'all' };

interface PersistedState {
  equipment: Equipment[];
  agents: Agent[];
}

export type Selection = { kind: 'equipment' | 'agent'; id: string } | null;

/** Dias entre hoje e uma data ISO (negativo = vencido). */
export function daysUntil(isoDate: string): number {
  return Math.round((Date.parse(isoDate) - Date.parse(daysFromToday(0))) / 86_400_000);
}

@Injectable({ providedIn: 'root' })
export class CityStateService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private telemetryTimer: ReturnType<typeof setInterval> | null = null;

  readonly equipment = signal<Equipment[]>([]);
  readonly agents = signal<Agent[]>([]);
  readonly events = signal<CityEvent[]>([]);
  readonly filters = signal<OpsFilters>(EMPTY_FILTERS);
  readonly selection = signal<Selection>(null);
  /** Bairro em véspera de horário de pico (cenário de homologação): a previsão usa fluxo e efetivo ampliados. */
  readonly peakSurge = signal<string | null>(null);
  readonly telemetryOn = signal(false);
  /** Assinaturas das ações preditivas já aplicadas (ver PredictionService). */
  readonly appliedActions = signal<ReadonlySet<string>>(new Set());

  readonly selectedEquipment = computed(() => {
    const sel = this.selection();
    return sel?.kind === 'equipment' ? this.equipment().find((e) => e.id === sel.id) ?? null : null;
  });

  readonly selectedAgent = computed(() => {
    const sel = this.selection();
    return sel?.kind === 'agent' ? this.agents().find((a) => a.id === sel.id) ?? null : null;
  });

  readonly filteredEquipment = computed(() => {
    const f = this.filters();
    return this.equipment().filter(
      (e) =>
        (f.type === 'all' || e.type === f.type) &&
        (f.status === 'all' || e.status === f.status) &&
        (f.neighborhood === 'all' || e.location.neighborhood === f.neighborhood) &&
        (f.agency === 'all' || e.agency === f.agency)
    );
  });

  /** Tipo e situação são atributos de equipamento; agentes respeitam bairro e órgão. */
  readonly filteredAgents = computed(() => {
    const f = this.filters();
    return this.agents().filter(
      (a) =>
        (f.neighborhood === 'all' || a.neighborhood === f.neighborhood) &&
        (f.agency === 'all' || a.agency === f.agency)
    );
  });

  readonly kpis = computed(() => {
    const list = this.filteredEquipment();
    const installed = list.filter((e) => e.status !== 'not_installed');
    const operational = installed.filter((e) => e.status === 'operational').length;
    const agents = this.filteredAgents();
    return {
      total: list.length,
      operational,
      unavailable: installed.length - operational,
      notInstalled: list.length - installed.length,
      availabilityPct: installed.length ? Math.round((operational / installed.length) * 1000) / 10 : 0,
      activeAgents: agents.filter((a) => a.status !== 'off_duty').length,
      inDispatch: agents.filter((a) => a.status === 'in_dispatch').length,
      totalAgents: agents.length,
    };
  });

  readonly alerts = computed<OpsAlert[]>(() => {
    const rank: Record<AlertSeverity, number> = { critical: 0, high: 1, warning: 2 };
    const alerts: OpsAlert[] = [];

    for (const e of this.filteredEquipment()) {
      const reasons: { severity: AlertSeverity; text: string }[] = [];
      if (e.status === 'stolen') reasons.push({ severity: 'critical', text: 'Furto detectado' });
      if (e.status === 'malfunction') reasons.push({ severity: 'critical', text: 'Falha grave em operação' });
      if (e.maintenance.priority === 'immediate' && e.status !== 'stolen') {
        reasons.push({ severity: 'high', text: 'Manutenção imediata necessária' });
      }
      if (e.maintenance.nextDate && e.status !== 'stolen' && e.status !== 'deactivated') {
        const days = daysUntil(e.maintenance.nextDate);
        if (days < 0) reasons.push({ severity: 'high', text: `Manutenção vencida há ${-days} dia(s)` });
        else if (days <= UPCOMING_MAINTENANCE_DAYS) {
          reasons.push({ severity: 'warning', text: days === 0 ? 'Manutenção prevista para hoje' : `Manutenção em ${days} dia(s)` });
        }
      }
      if (reasons.length === 0) continue;

      reasons.sort((a, b) => rank[a.severity] - rank[b.severity]);
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
    for (const a of this.agents()) {
      if (a.status !== 'off_duty') onDuty.set(a.neighborhood, (onDuty.get(a.neighborhood) ?? 0) + 1);
    }
    for (const a of this.filteredAgents()) {
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

    return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
  });

  readonly regions = computed<RegionSummary[]>(() => {
    const f = this.filters();
    const equipment = this.filteredEquipment();
    const agents = this.filteredAgents();

    return NEIGHBORHOODS.filter((n) => f.neighborhood === 'all' || n.name === f.neighborhood).map((n) => {
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
  });

  constructor() {
    const saved = this.load();
    this.equipment.set(saved?.equipment ?? buildMockEquipment());
    this.agents.set(saved?.agents ?? buildMockAgents());

    effect(() => {
      const state: PersistedState = { equipment: this.equipment(), agents: this.agents() };
      if (!this.isBrowser) return;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Armazenamento indisponível (modo privado): segue apenas em memória.
      }
    });
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  upsertEquipment(item: Equipment): void {
    const exists = this.equipment().some((e) => e.id === item.id);
    this.equipment.update((list) => (exists ? list.map((e) => (e.id === item.id ? item : e)) : [item, ...list]));
    this.log(
      `${exists ? 'Equipamento atualizado' : 'Novo equipamento cadastrado'}: ${item.serialNumber} (${item.location.neighborhood})`,
      'info',
      exists ? 'system' : 'equipment_created'
    );
  }

  deleteEquipment(id: string): void {
    const item = this.equipment().find((e) => e.id === id);
    this.equipment.update((list) => list.filter((e) => e.id !== id));
    if (this.selection()?.id === id) this.selection.set(null);
    if (item) this.log(`Equipamento removido: ${item.serialNumber}`, 'info', 'system');
  }

  setEquipmentStatus(id: string, status: EquipmentStatus): void {
    this.patchEquipment([id], (e) => ({
      ...e,
      status,
      maintenance: {
        ...e.maintenance,
        priority:
          status === 'malfunction' || status === 'stolen'
            ? 'immediate'
            : status === 'operational' && e.maintenance.priority === 'immediate'
              ? 'none'
              : e.maintenance.priority,
      },
    }));
    const item = this.equipment().find((e) => e.id === id);
    if (item) this.log(`${item.serialNumber} → ${STATUS_LABELS[status]}`, status === 'operational' ? 'good' : 'bad', 'status_changed');
  }

  patchEquipment(ids: string[], fn: (e: Equipment) => Equipment): void {
    const set = new Set(ids);
    this.equipment.update((list) => list.map((e) => (set.has(e.id) ? fn(e) : e)));
  }

  upsertAgent(agent: Agent): void {
    const exists = this.agents().some((a) => a.id === agent.id);
    this.agents.update((list) => (exists ? list.map((a) => (a.id === agent.id ? agent : a)) : [agent, ...list]));
    this.log(
      `${exists ? 'Agente atualizado' : 'Novo agente cadastrado'}: ${agent.name} (${agent.neighborhood})`,
      'info',
      exists ? 'system' : 'agent_created'
    );
  }

  deleteAgent(id: string): void {
    const agent = this.agents().find((a) => a.id === id);
    this.agents.update((list) => list.filter((a) => a.id !== id));
    if (this.selection()?.id === id) this.selection.set(null);
    if (agent) this.log(`Agente removido: ${agent.name}`, 'info', 'system');
  }

  patchAgents(ids: string[], fn: (a: Agent) => Agent): void {
    const set = new Set(ids);
    this.agents.update((list) => list.map((a) => (set.has(a.id) ? fn(a) : a)));
  }

  markApplied(signatures: string[]): void {
    this.appliedActions.update((set) => new Set([...set, ...signatures]));
  }

  resetToMock(): void {
    this.stopTelemetry();
    this.equipment.set(buildMockEquipment());
    this.agents.set(buildMockAgents());
    this.selection.set(null);
    this.filters.set(EMPTY_FILTERS);
    this.events.set([]);
    this.appliedActions.set(new Set());
    this.peakSurge.set(null);
    this.log('Dados de exemplo restaurados', 'info', 'system');
  }

  log(message: string, tone: CityEvent['tone'], kind: CityEvent['kind'] = 'system'): void {
    const event: CityEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time: new Date().toLocaleTimeString('pt-BR'),
      message,
      tone,
      kind,
    };
    this.events.update((list) => [event, ...list].slice(0, 40));
  }

  // ---------------------------------------------------------------------------
  // Telemetria simulada
  // ---------------------------------------------------------------------------

  toggleTelemetry(): void {
    if (this.telemetryOn()) this.stopTelemetry();
    else this.startTelemetry();
  }

  private startTelemetry(): void {
    if (!this.isBrowser || this.telemetryTimer) return;
    this.telemetryOn.set(true);
    this.log('Telemetria em tempo real iniciada', 'info', 'system');
    this.telemetryTimer = setInterval(() => this.telemetryTick(), TELEMETRY_INTERVAL_MS);
  }

  private stopTelemetry(): void {
    if (this.telemetryTimer) clearInterval(this.telemetryTimer);
    this.telemetryTimer = null;
    if (this.telemetryOn()) this.log('Telemetria em tempo real pausada', 'info', 'system');
    this.telemetryOn.set(false);
  }

  private telemetryTick(): void {
    // Metade dos ciclos degrada um equipamento saudável, a outra metade recupera um com problema,
    // mantendo a cidade "viva" sem colapsar nem zerar os alertas.
    const pool = this.equipment().filter((e) => e.status !== 'not_installed' && e.status !== 'deactivated');
    const degrade = Math.random() < 0.5;
    const candidates = pool.filter((e) => (degrade ? e.status === 'operational' : e.status !== 'operational'));
    const target = candidates[Math.floor(Math.random() * candidates.length)];

    if (target) {
      const next: EquipmentStatus = degrade
        ? Math.random() < 0.6 ? 'malfunction' : 'maintenance'
        : target.status === 'malfunction' || target.status === 'stolen' ? 'maintenance' : 'operational';
      this.patchEquipment([target.id], (e) => ({
        ...e,
        status: next,
        maintenance:
          next === 'malfunction'
            ? { priority: 'immediate', nextDate: daysFromToday(0) }
            : next === 'maintenance'
              ? { priority: 'scheduled', nextDate: daysFromToday(1) }
              : { priority: 'none', nextDate: daysFromToday(30) },
      }));
      this.log(
        `[Telemetria] ${target.serialNumber} (${target.location.neighborhood}) → ${STATUS_LABELS[next]}`,
        next === 'operational' ? 'good' : 'bad',
        'telemetry'
      );
    }

    // Deslocamento de veículos e agentes, com leve atração ao centro do bairro.
    const centers = new Map(NEIGHBORHOODS.map((n) => [n.name, n]));
    const drift = (value: number, center: number) => value + (Math.random() - 0.5) * 0.0016 + (center - value) * 0.08;

    this.equipment.update((list) =>
      list.map((e) => {
        const c = centers.get(e.location.neighborhood);
        if (!c || e.status !== 'operational' || !MOBILE_TYPES.includes(e.type)) return e;
        return { ...e, location: { ...e.location, lat: drift(e.location.lat, c.lat), lng: drift(e.location.lng, c.lng) } };
      })
    );
    this.agents.update((list) =>
      list.map((a) => {
        const c = centers.get(a.neighborhood);
        if (!c || a.status === 'off_duty') return a;
        return { ...a, lat: drift(a.lat, c.lat), lng: drift(a.lng, c.lng) };
      })
    );
  }

  private load(): PersistedState | null {
    if (!this.isBrowser) return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      return Array.isArray(parsed.equipment) && Array.isArray(parsed.agents)
        ? { equipment: parsed.equipment, agents: parsed.agents }
        : null;
    } catch {
      return null;
    }
  }
}
