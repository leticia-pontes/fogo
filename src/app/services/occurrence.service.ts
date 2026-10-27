import { Injectable, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RESOLUCAO_LABELS, Resolucao, encerrarOcorrencia, gerarRelatorio } from '../core/closure';
import { Despacho, ResultadoDespacho, bloqueioDespacho, despachar, sugerirDespacho } from '../core/dispatch';
import { Comprovante, montarComprovante } from '../core/comprovante';
import { linkDoComprovante } from '../core/comprovante-link';
import { Dossie, EventoSituacao, investigarOcorrencia } from '../core/investigation';
import { Ocorrencia, TIPO_ALERTA_LABELS, TipoAlerta, abrirOcorrencia } from '../core/occurrences';
import { PredictionAction, abrirOcorrenciasDaPrevisao } from '../core/prediction-actions';
import { CityState } from '../core/state';
import { MANUAIS } from '../data/manuals-index';
import { ServerState, api } from './api';
import { CityStateService } from './city-state.service';
import { SimulationService } from './simulation.service';
import { UiStateService } from './ui-state.service';
import { VoiceAgentService } from './voice-agent.service';

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
  private readonly voice = inject(VoiceAgentService);
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

  /** Sugestões de despacho carregadas para a ocorrência selecionada. */
  readonly dispatchSuggestions = signal<{ ocorrenciaId: string; resultado: ResultadoDespacho } | null>(null);
  /** Linhas tracejadas no mapa: agente → local (sugestões, ou o despacho feito). */
  readonly dispatchLines = computed(() => {
    const o = this.selected();
    if (!o) return [];
    const eq = this.city.equipment().find((e) => e.id === o.equipamentoId);
    const despacho = o.despacho as Despacho | null;
    if (despacho) return [{ from: [despacho.origem.lat, despacho.origem.lng] as [number, number], to: [despacho.destino.lat, despacho.destino.lng] as [number, number], label: despacho.agenteNome, chosen: true }];
    const sug = this.dispatchSuggestions();
    if (!eq || sug?.ocorrenciaId !== o.id) return [];
    return sug.resultado.sugestoes.map((x, i) => {
      const a = this.city.agents().find((ag) => ag.id === x.agenteId);
      return { from: [a?.lat ?? eq.location.lat, a?.lng ?? eq.location.lng] as [number, number], to: [eq.location.lat, eq.location.lng] as [number, number], label: `${i + 1}. ${x.nome} · ~${x.etaMin} min`, chosen: false };
    });
  });

  /** Relatório em tela (Markdown) da ocorrência selecionada. */
  readonly report = signal<{ ocorrenciaId: string; markdown: string } | null>(null);

  /** Comprovante aberto no modal (null = fechado). */
  readonly receipt = signal<Comprovante | null>(null);
  /** Link da página do comprovante na rede local (QR Code para o celular); null no modo offline. */
  readonly receiptLink = signal<string | null>(null);

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

  /**
   * Depois de aplicar uma recomendação da Cidade Preditiva. Online: a API já abriu as ocorrências, só
   * recarrega a lista. Offline: abre aqui, com a mesma função pura (estado de ANTES da ação).
   */
  async aposAplicarPrevisao(antes: CityState, acoes: readonly PredictionAction[]): Promise<void> {
    if (this.city.mode() === 'online') {
      await this.refresh();
      return;
    }
    const novas = abrirOcorrenciasDaPrevisao(this.list(), antes, acoes, new Date())
      .filter((r) => r.criada)
      .map((r) => r.ocorrencia);
    if (novas.length) this.saveLocal([...novas.reverse(), ...this.list()]);
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

  /** Top 3 agentes por ETA (online: GET /api/ocorrencias/:id/despacho; offline: mesma função pura). Não grava. */
  async suggestDispatch(id: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const resultado =
        this.city.mode() === 'online'
          ? await api<ResultadoDespacho>('GET', `/ocorrencias/${encodeURIComponent(id)}/despacho`)
          : sugerirDespacho(this.city.snapshot(), this.find(id));
      this.dispatchSuggestions.set({ ocorrenciaId: id, resultado });
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  async dispatch(id: string, agenteId: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.city.mode() === 'online') {
        await this.city.serverAction<ServerState>(`/ocorrencias/${encodeURIComponent(id)}/despachar`, { agenteId });
        await this.refresh();
      } else {
        const before = this.find(id);
        const bloqueio = bloqueioDespacho(before);
        if (bloqueio) throw new Error(bloqueio);
        const { state, despacho } = despachar(this.city.snapshot(), before, agenteId, new Date());
        this.city.replaceState(state);
        this.saveLocal(this.list().map((o) => (o.id === id ? { ...o, despacho, status: 'despachada' } : o)));
      }
      this.dispatchSuggestions.set(null);
      const despacho = this.selected()?.despacho as Despacho | undefined;
      if (despacho) {
        this.city.log(`${id}: ${despacho.agenteNome} despachado(a) para ${despacho.destino.bairro} (~${despacho.etaMin} min, estimativa)`, 'info', 'system');
        this.ui.notify(`${despacho.agenteNome} a caminho · ETA estimado ~${despacho.etaMin} min.`, 'good');
      }
    } catch (err) {
      this.error.set((err as Error).message);
      this.ui.notify(`Não foi possível despachar: ${(err as Error).message}`, 'bad');
    } finally {
      this.busy.set(false);
    }
  }

  /** Encerra: equipamento conforme a resolução e agente de volta à origem (online: POST /encerrar; offline: função pura). */
  async close(id: string, resolucao: Resolucao, observacao: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.city.mode() === 'online') {
        await this.city.serverAction<ServerState>(`/ocorrencias/${encodeURIComponent(id)}/encerrar`, { resolucao, observacao });
        await this.refresh();
      } else {
        const { state, ocorrencia } = encerrarOcorrencia(this.city.snapshot(), this.find(id), { resolucao, observacao }, new Date());
        this.city.replaceState(state);
        this.saveLocal(this.list().map((o) => (o.id === id ? ocorrencia : o)));
      }
      this.dispatchSuggestions.set(null);
      this.city.log(`${id} encerrada: ${RESOLUCAO_LABELS[resolucao].toLowerCase()}`, 'good', 'system');
      this.ui.notify(`${id} encerrada. O relatório está pronto.`, 'good');
      await this.loadReport(id);
      await this.openReceipt(id);
    } catch (err) {
      this.error.set((err as Error).message);
      this.ui.notify(`Não foi possível encerrar: ${(err as Error).message}`, 'bad');
    } finally {
      this.busy.set(false);
    }
  }

  /** Emite o comprovante (online: GET /api/ocorrencias/:id/comprovante; offline: mesma função pura) e abre o modal. */
  async openReceipt(id: string): Promise<void> {
    this.error.set(null);
    try {
      const online = this.city.mode() === 'online';
      const path = `/ocorrencias/${encodeURIComponent(id)}/comprovante`;
      const comprovante = online ? await api<Comprovante>('GET', path) : montarComprovante(this.find(id), this.city.snapshot(), new Date());
      this.receiptLink.set(await this.linkParaCelular(comprovante, online, path));
      this.receipt.set(comprovante);
      this.voice.speak('Comprovante emitido.');
    } catch (err) {
      this.error.set((err as Error).message);
      this.ui.notify(`Não foi possível emitir o comprovante: ${(err as Error).message}`, 'bad');
    }
  }

  /**
   * Link do QR Code. Painel aberto num endereço que o celular alcança (deploy publicado, IP da rede): o
   * comprovante vai dentro do link, sem servidor. Em localhost: a página servida pela API no IP da rede
   * local, se houver servidor; sem servidor, não há QR.
   */
  private async linkParaCelular(c: Comprovante, online: boolean, path: string): Promise<string | null> {
    const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname);
    if (!local) return linkDoComprovante(c, location.origin).catch(() => null);
    if (!online) return null;
    return (await api<{ url: string }>('GET', `${path}/link`).catch(() => null))?.url ?? null;
  }

  closeReceipt(): void {
    this.receipt.set(null);
    this.receiptLink.set(null);
  }

  async loadReport(id: string): Promise<void> {
    this.error.set(null);
    try {
      const markdown =
        this.city.mode() === 'online'
          ? (await api<{ markdown: string }>('GET', `/ocorrencias/${encodeURIComponent(id)}/relatorio`)).markdown
          : gerarRelatorio(this.find(id), this.city.snapshot(), [], new Date());
      this.report.set({ ocorrenciaId: id, markdown });
    } catch (err) {
      this.error.set((err as Error).message);
    }
  }

  private find(id: string): Ocorrencia {
    const o = this.list().find((x) => x.id === id);
    if (!o) throw new Error(`Ocorrência ${id} não encontrada`);
    return o;
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
