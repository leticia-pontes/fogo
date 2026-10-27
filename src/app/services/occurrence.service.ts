import { Injectable, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Dossie, EventoSituacao, investigarOcorrencia } from '../core/investigation';
import { Ocorrencia, TIPO_ALERTA_LABELS, TipoAlerta, abrirOcorrencia } from '../core/occurrences';
import { MANUAIS } from '../data/manuals-index';
import { api } from './api';
import { CityStateService } from './city-state.service';
import { SimulationService } from './simulation.service';
import { UiStateService } from './ui-state.service';

const STORAGE_KEY = 'fogo:ocorrencias:v1';
const EVENTS_KEY = 'fogo:eventos-situacao:v1';
/** Histórico local (modo offline) limitado aos eventos mais recentes. */
const MAX_LOCAL_EVENTS = 500;

/**
 * Ocorrências abertas a partir dos alertas. Online: API (POST/GET /api/ocorrencias).
 * Offline: as mesmas funções puras de `core/occurrences`, com a lista no localStorage.
 */
@Injectable({ providedIn: 'root' })
export class OccurrenceService {
  private readonly city = inject(CityStateService);
  private readonly sim = inject(SimulationService);
  private readonly ui = inject(UiStateService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly list = signal<Ocorrencia[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly selected = computed(() => this.list().find((o) => o.id === this.selectedId()) ?? null);
  /** Itens relacionados no dossiê da ocorrência selecionada (halo no mapa). */
  readonly highlighted = computed<ReadonlySet<string>>(() => {
    const dossie = this.selected()?.dossie as Dossie | null | undefined;
    return new Set(dossie ? [dossie.oQueAconteceu.equipamentoId, ...dossie.relacionados] : []);
  });

  /** Modo offline: mudanças de situação registradas no navegador (no online, vêm de eventos_situacao). */
  private localEvents: EventoSituacao[] = [];
  private lastStatus: Map<string, string> | null = null;

  constructor() {
    // Carrega quando o modo de persistência fica definido (online ou offline).
    effect(() => {
      if (this.city.mode() === 'loading' || !this.isBrowser) return;
      untracked(() => void this.refresh());
    });

    // Offline: registra cada mudança de situação (telemetria, cenários, edições) para a investigação.
    effect(() => {
      const equipment = this.city.equipment();
      if (!this.isBrowser || this.city.mode() !== 'offline') return;
      untracked(() => this.trackStatusChanges(equipment));
    });

    // Restaurar a seed recria o banco (online) e zera as ocorrências locais (offline).
    effect(() => {
      if (!this.city.resets()) return;
      untracked(() => {
        this.selectedId.set(null);
        if (this.city.mode() === 'online') void this.refresh();
        else {
          this.saveLocal([]);
          this.localEvents = [];
          this.lastStatus = null;
          this.store(EVENTS_KEY, []);
        }
      });
    });
  }

  async refresh(): Promise<void> {
    this.error.set(null);
    if (this.city.mode() === 'online') {
      try {
        this.list.set(await api<Ocorrencia[]>('GET', '/ocorrencias'));
      } catch (err) {
        this.error.set((err as Error).message);
      }
      return;
    }
    this.list.set(this.loadLocal());
  }

  /** Abre (ou reabre a existente) e mostra a aba de ocorrências com ela selecionada. */
  async open(equipamentoId: string, tipoAlerta: TipoAlerta): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      let ocorrencia: Ocorrencia;
      let criada: boolean;
      if (this.city.mode() === 'online') {
        const before = this.hasOpen(equipamentoId, tipoAlerta);
        ocorrencia = await api<Ocorrencia>('POST', '/ocorrencias', { equipamentoId, tipoAlerta });
        criada = !before;
        await this.refresh();
      } else {
        const result = abrirOcorrencia(this.list(), this.city.snapshot(), { equipamentoId, tipoAlerta }, new Date());
        ({ ocorrencia, criada } = result);
        if (criada) this.saveLocal([ocorrencia, ...this.list()]);
      }
      this.selectedId.set(ocorrencia.id);
      this.city.selection.set(null);
      this.sim.panel.set('occurrences');
      this.ui.notify(
        criada ? `${ocorrencia.id} aberta: ${TIPO_ALERTA_LABELS[tipoAlerta].toLowerCase()}.` : `${ocorrencia.id} já estava aberta para este alerta.`,
        criada ? 'good' : 'info'
      );
    } catch (err) {
      this.error.set((err as Error).message);
      this.ui.notify(`Não foi possível abrir a ocorrência: ${(err as Error).message}`, 'bad');
    } finally {
      this.busy.set(false);
    }
  }

  /** Gera o dossiê (online: GET /api/ocorrencias/:id/dossie, que grava; offline: mesma função pura). */
  async investigate(id: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.city.mode() === 'online') {
        await api<Ocorrencia>('GET', `/ocorrencias/${encodeURIComponent(id)}/dossie`);
        await this.refresh();
      } else {
        const before = this.list().find((o) => o.id === id);
        if (!before) throw new Error(`Ocorrência ${id} não encontrada`);
        const dossie = investigarOcorrencia(this.city.snapshot(), before, {
          eventos: this.localEvents,
          indiceManuais: MANUAIS,
          agora: new Date(),
          ocorrencias: this.list(),
        });
        const after: Ocorrencia = { ...before, dossie, status: before.status === 'aberta' ? 'investigada' : before.status };
        this.saveLocal(this.list().map((o) => (o.id === id ? after : o)));
      }
      this.selectedId.set(id);
      const dossie = this.selected()?.dossie as Dossie | undefined;
      if (dossie) this.ui.notify(`${id} investigada: ${dossie.padroes.length ? dossie.padroes.map((p) => p.titulo.toLowerCase()).join(', ') : 'nenhum padrão encontrado'}.`, 'info', 4200);
    } catch (err) {
      this.error.set((err as Error).message);
      this.ui.notify(`Não foi possível investigar: ${(err as Error).message}`, 'bad');
    } finally {
      this.busy.set(false);
    }
  }

  hasOpen(equipamentoId: string, tipoAlerta: TipoAlerta): boolean {
    return this.list().some((o) => o.status !== 'encerrada' && o.equipamentoId === equipamentoId && o.tipoAlerta === tipoAlerta);
  }

  private trackStatusChanges(equipment: readonly { id: string; status: string }[]): void {
    if (!this.lastStatus) {
      this.localEvents = this.read<EventoSituacao[]>(EVENTS_KEY, []);
      this.lastStatus = new Map(equipment.map((e) => [e.id, e.status]));
      return;
    }
    const criadoEm = new Date().toISOString();
    const novos = equipment
      .filter((e) => this.lastStatus!.has(e.id) && this.lastStatus!.get(e.id) !== e.status)
      .map((e) => ({ alvoId: e.id, situacaoAnterior: this.lastStatus!.get(e.id)!, situacaoNova: e.status, origem: 'painel', criadoEm }));
    this.lastStatus = new Map(equipment.map((e) => [e.id, e.status]));
    if (!novos.length) return;
    this.localEvents = [...this.localEvents, ...novos].slice(-MAX_LOCAL_EVENTS);
    this.store(EVENTS_KEY, this.localEvents);
  }

  private loadLocal(): Ocorrencia[] {
    return this.read<Ocorrencia[]>(STORAGE_KEY, []);
  }

  private saveLocal(list: Ocorrencia[]): void {
    this.list.set(list);
    this.store(STORAGE_KEY, list);
  }

  private read<T>(key: string, fallback: T): T {
    try {
      return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
    } catch {
      return fallback;
    }
  }

  private store(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Sem localStorage (navegação privada): os dados valem só para esta sessão.
    }
  }
}
