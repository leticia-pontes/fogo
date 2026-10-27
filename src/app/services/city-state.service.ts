import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  NEIGHBORHOODS,
  buildMockAgents,
  buildMockEquipment,
  buildStressEquipment,
  daysFromToday,
} from '../data/mock-data';
import { stepAlongRoad } from '../data/city-map';
import { calcularAlertas, calcularIndicadores, calcularRegioes, daysUntil } from '../core/indicators';
import { ScenarioSnapshot } from '../core/scenarios';
import { CityState } from '../core/state';
import { API_BASE, ApiError, NETWORK_ERROR, ServerState, api, connection } from './api';
import { MOBILE_TYPES, STATUS_LABELS } from '../models/equipment-schema';
import {
  Agent,
  CityEvent,
  Equipment,
  EquipmentStatus,
  OpsAlert,
  OpsFilters,
  RegionSummary,
} from '../models/fogo.models';

const STORAGE_KEY = 'fogo:state:v4';
/** Espera entre a última alteração e o envio do lote ao servidor. */
const SYNC_DEBOUNCE_MS = 250;
const RECONNECT_INTERVAL_MS = 3000;
const TELEMETRY_INTERVAL_MS = 3000;

export const EMPTY_FILTERS: OpsFilters = { type: 'all', status: 'all', neighborhood: 'all', agency: 'all' };

interface PersistedState {
  equipment: Equipment[];
  agents: Agent[];
  peakSurge?: string | null;
  scenarioSnapshot?: ScenarioSnapshot | null;
}

export type Selection = { kind: 'equipment' | 'agent'; id: string } | null;

/**
 * online: estado lido do servidor (SQLite) e alterações enviadas em lote para /api/sync.
 * offline: sem servidor (ex.: deploy estático); o estado fica no localStorage como antes.
 */
export type PersistenceMode = 'loading' | 'online' | 'offline';

export { daysUntil };

@Injectable({ providedIn: 'root' })
export class CityStateService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private telemetryTimer: ReturnType<typeof setInterval> | null = null;
  /** Sentido de deslocamento de cada veículo/agente sobre a via (não persistido). */
  private readonly headings = new Map<string, 1 | -1>();
  /** Teste de carga (?stress=N): frota extra só em memória, para não sobrescrever o estado salvo. */
  readonly stressCount = this.isBrowser ? Math.max(0, Math.floor(Number(new URLSearchParams(location.search).get('stress')) || 0)) : 0;

  readonly equipment = signal<Equipment[]>([]);
  readonly agents = signal<Agent[]>([]);
  readonly events = signal<CityEvent[]>([]);
  readonly filters = signal<OpsFilters>(EMPTY_FILTERS);
  readonly selection = signal<Selection>(null);
  /** Bairro em véspera de horário de pico (cenário de homologação): a previsão usa fluxo e efetivo ampliados. */
  readonly peakSurge = signal<string | null>(null);
  /** Versão anterior dos itens tocados pelos cenários de crise ativos (null = nenhum cenário). */
  readonly scenarioSnapshot = signal<ScenarioSnapshot | null>(null);
  readonly telemetryOn = signal(false);
  /** Assinaturas das ações preditivas já aplicadas (ver PredictionService). */
  readonly appliedActions = signal<ReadonlySet<string>>(new Set());
  readonly mode = signal<PersistenceMode>('loading');
  /** No modo online: false enquanto a API não responde (o painel tenta reconectar). */
  readonly connected = signal(true);
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;

  /** Última versão de cada item confirmada pelo servidor (JSON), para enviar só o que mudou. */
  private synced = { equipment: new Map<string, string>(), agents: new Map<string, string>(), peakSurge: null as string | null };
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  /** Itens alterados pela telemetria simulada desde o último envio (origem = 'telemetria'). */
  private readonly telemetryTouched = new Set<string>();

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

  readonly kpis = computed(() => calcularIndicadores(this.filteredEquipment(), this.filteredAgents()));

  readonly alerts = computed<OpsAlert[]>(() => calcularAlertas(this.filteredEquipment(), this.filteredAgents(), this.agents()));

  readonly regions = computed<RegionSummary[]>(() =>
    calcularRegioes(this.filteredEquipment(), this.filteredAgents(), this.filters().neighborhood)
  );

  constructor() {
    const saved = this.load();
    this.equipment.set(saved?.equipment ?? buildMockEquipment());
    this.agents.set(saved?.agents ?? buildMockAgents());
    this.peakSurge.set(saved?.peakSurge ?? null);
    this.scenarioSnapshot.set(saved?.scenarioSnapshot ?? null);
    if (this.stressCount) {
      const extra = buildStressEquipment(this.stressCount);
      this.equipment.update((list) => [...list, ...extra]);
      this.log(`Teste de carga: +${extra.length} equipamentos sintéticos (não são salvos)`, 'info', 'system');
    }

    effect(() => {
      const state: PersistedState = {
        equipment: this.equipment(),
        agents: this.agents(),
        peakSurge: this.peakSurge(),
        scenarioSnapshot: this.scenarioSnapshot(),
      };
      if (!this.isBrowser || this.stressCount) return;
      if (this.mode() === 'online') {
        this.scheduleSync();
        return;
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Armazenamento indisponível (modo privado): segue apenas em memória.
      }
    });

    void this.connect();
  }

  // ---------------------------------------------------------------------------
  // Servidor (SQLite via API)
  // ---------------------------------------------------------------------------

  /** Carrega o estado do servidor; sem servidor, segue no modo offline (localStorage). */
  async connect(): Promise<void> {
    if (!this.isBrowser || this.stressCount) {
      this.mode.set('offline');
      return;
    }
    connection.onLost = () => this.handleConnectionLost();
    try {
      this.applyServerState(await api<ServerState>('GET', '/estado'));
      this.mode.set('online');
    } catch {
      // Sem servidor: o cabeçalho mostra "modo offline" e o estado segue no localStorage.
      this.mode.set('offline');
    }
  }

  /**
   * A API parou de responder: mantém o estado na tela, guarda as alterações pendentes e testa
   * o servidor a cada RECONNECT_INTERVAL_MS. Ao voltar, envia o pendente e recarrega o estado.
   */
  private handleConnectionLost(): void {
    if (this.mode() !== 'online' || this.reconnectTimer) return;
    this.connected.set(false);
    this.log('Conexão com o servidor perdida: tentando reconectar', 'bad', 'system');
    this.reconnectTimer = setInterval(() => void this.tryReconnect(), RECONNECT_INTERVAL_MS);
  }

  private async tryReconnect(): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/saude`);
      if (!res.ok || !(await res.json().catch(() => null))?.ok) return;
    } catch {
      return;
    }
    if (this.reconnectTimer) clearInterval(this.reconnectTimer);
    this.reconnectTimer = null;
    this.connected.set(true);
    try {
      await this.flushSync();
      this.applyServerState(await api<ServerState>('GET', '/estado'));
      this.log('Conexão com o servidor restabelecida', 'good', 'system');
    } catch {
      // Caiu de novo: o próprio api() religa a reconexão.
    }
  }

  /** Substitui o estado pelo que o servidor devolveu (após leituras, cenários e ações). */
  applyServerState(state: ServerState): void {
    this.equipment.set(state.equipment);
    this.agents.set(state.agents);
    this.peakSurge.set(state.peakSurge);
    this.scenarioSnapshot.set(state.scenarioSnapshot);
    this.synced = {
      equipment: new Map(state.equipment.map((e) => [e.id, JSON.stringify(e)])),
      agents: new Map(state.agents.map((a) => [a.id, JSON.stringify(a)])),
      peakSurge: state.peakSurge,
    };
    if (this.selection() && !this.selectedEquipment() && !this.selectedAgent()) this.selection.set(null);
  }

  /**
   * Executa uma ação no servidor (cenário, simulação aplicada, reset) e adota o estado devolvido.
   * Antes, envia as alterações locais pendentes para não perdê-las.
   */
  async serverAction<T extends ServerState>(path: string, body?: unknown): Promise<T> {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    await this.flushSync();
    const result = await api<T>('POST', path, body);
    this.applyServerState(result);
    return result;
  }

  private scheduleSync(): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => void this.flushSync(), SYNC_DEBOUNCE_MS);
  }

  /** Envia ao servidor só o que mudou desde a última confirmação. */
  async flushSync(): Promise<void> {
    this.syncTimer = null;
    const equipment = this.equipment().filter((e) => this.synced.equipment.get(e.id) !== JSON.stringify(e));
    const agents = this.agents().filter((a) => this.synced.agents.get(a.id) !== JSON.stringify(a));
    const eqIds = new Set(this.equipment().map((e) => e.id));
    const agIds = new Set(this.agents().map((a) => a.id));
    const removed = {
      equipment: [...this.synced.equipment.keys()].filter((id) => !eqIds.has(id)),
      agents: [...this.synced.agents.keys()].filter((id) => !agIds.has(id)),
    };
    const peakChanged = this.peakSurge() !== this.synced.peakSurge;
    if (!equipment.length && !agents.length && !removed.equipment.length && !removed.agents.length && !peakChanged) return;

    const fromTelemetry = (id: string) => this.telemetryTouched.has(id);
    const batches = [
      { origem: 'telemetria', equipment: equipment.filter((e) => fromTelemetry(e.id)), agents: agents.filter((a) => fromTelemetry(a.id)) },
      {
        origem: 'usuario',
        equipment: equipment.filter((e) => !fromTelemetry(e.id)),
        agents: agents.filter((a) => !fromTelemetry(a.id)),
        removed,
        ...(peakChanged ? { peakSurge: this.peakSurge() } : {}),
      },
    ];
    this.telemetryTouched.clear();
    try {
      for (const batch of batches) {
        if (!batch.equipment.length && !batch.agents.length && !('removed' in batch && (removed.equipment.length || removed.agents.length || peakChanged))) continue;
        await api('POST', '/sync', batch);
        for (const e of batch.equipment) this.synced.equipment.set(e.id, JSON.stringify(e));
        for (const a of batch.agents) this.synced.agents.set(a.id, JSON.stringify(a));
      }
      for (const id of removed.equipment) this.synced.equipment.delete(id);
      for (const id of removed.agents) this.synced.agents.delete(id);
      if (peakChanged) this.synced.peakSurge = this.peakSurge();
    } catch (err) {
      // Sem conexão: o pendente fica guardado e vai junto quando o servidor voltar.
      if (err instanceof ApiError && err.status === NETWORK_ERROR) return;
      const detail = err instanceof ApiError && Array.isArray(err.details) ? `: ${err.details.slice(0, 2).join('; ')}` : '';
      this.log(`Falha ao salvar no servidor (${(err as Error).message}${detail})`, 'bad', 'system');
    }
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

  /** Estado atual para as funções puras de core/. */
  snapshot(): CityState {
    return { equipment: this.equipment(), agents: this.agents(), peakSurge: this.peakSurge() };
  }

  replaceState(state: CityState): void {
    this.equipment.set(state.equipment);
    this.agents.set(state.agents);
    this.peakSurge.set(state.peakSurge);
  }

  markApplied(signatures: string[]): void {
    this.appliedActions.update((set) => new Set([...set, ...signatures]));
  }

  /** Incrementa a cada restauração da seed (outros serviços limpam o que dependia do estado anterior). */
  readonly resets = signal(0);

  /** Volta à seed de exemplo: no modo online recria o banco (POST /api/reset). */
  async resetToMock(): Promise<void> {
    this.stopTelemetry();
    if (this.mode() === 'online') {
      try {
        await this.serverAction('/reset');
      } catch (err) {
        this.log(`Falha ao restaurar no servidor: ${(err as Error).message}`, 'bad', 'system');
        return;
      }
    } else {
      this.equipment.set(buildMockEquipment());
      this.agents.set(buildMockAgents());
    }
    this.selection.set(null);
    this.filters.set(EMPTY_FILTERS);
    this.events.set([]);
    this.appliedActions.set(new Set());
    this.peakSurge.set(null);
    this.scenarioSnapshot.set(null);
    this.resets.update((n) => n + 1);
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
      this.telemetryTouched.add(target.id);
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

    // Veículos e agentes seguem pelas vias do próprio bairro (~35 m por amostra).
    this.equipment.update((list) =>
      list.map((e) => {
        if (e.status !== 'operational' || !MOBILE_TYPES.includes(e.type)) return e;
        this.telemetryTouched.add(e.id);
        const moved = this.moveOnRoad(e.id, e.location.neighborhood, e.location.lat, e.location.lng);
        return moved ? { ...e, location: { ...e.location, lat: moved.lat, lng: moved.lng, street: moved.street } } : e;
      })
    );
    this.agents.update((list) =>
      list.map((a) => {
        if (a.status === 'off_duty') return a;
        this.telemetryTouched.add(a.id);
        const moved = this.moveOnRoad(a.id, a.neighborhood, a.lat, a.lng);
        return moved ? { ...a, lat: moved.lat, lng: moved.lng } : a;
      })
    );
  }

  private moveOnRoad(id: string, neighborhood: string, lat: number, lng: number) {
    const district = NEIGHBORHOODS.findIndex((n) => n.name === neighborhood);
    if (district < 0) return null;
    const heading = this.headings.get(id) ?? (id.length % 2 ? 1 : -1);
    const moved = stepAlongRoad(district, lat, lng, heading, 1 + Math.floor(Math.random() * 3));
    if (moved) this.headings.set(id, moved.heading);
    return moved;
  }

  private load(): PersistedState | null {
    if (!this.isBrowser) return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      return Array.isArray(parsed.equipment) && Array.isArray(parsed.agents)
        ? { equipment: parsed.equipment, agents: parsed.agents, peakSurge: parsed.peakSurge, scenarioSnapshot: parsed.scenarioSnapshot }
        : null;
    } catch {
      return null;
    }
  }
}
