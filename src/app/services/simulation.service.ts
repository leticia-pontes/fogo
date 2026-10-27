import { Injectable, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Recomendacao, recomendarAcoes } from '../core/recommendations';
import { Acao, Simulacao, aplicarAcao, simular } from '../core/simulation';
import { ServerState, api } from './api';
import { CityStateService } from './city-state.service';
import { UiStateService } from './ui-state.service';

const RECOMMENDATION_DEBOUNCE_MS = 500;

/**
 * Simulador "e se?" e próxima melhor ação. No painel conectado tudo passa pela API
 * (POST /api/simulacao, GET /api/recomendacoes, POST /api/acoes/aplicar); no modo offline,
 * as mesmas funções puras de core/ rodam no navegador.
 */
@Injectable({ providedIn: 'root' })
export class SimulationService {
  private readonly city = inject(CityStateService);
  private readonly ui = inject(UiStateService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private recTimer: ReturnType<typeof setTimeout> | null = null;

  /** Aba do painel lateral da Central: alertas ou simulador. */
  readonly panel = signal<'alerts' | 'simulator' | 'route'>('alerts');
  /** Ação em edição no formulário (pré-preenchida por "Simular falha" ou por uma recomendação). */
  readonly draft = signal<Acao | null>(null);
  readonly result = signal<Simulacao | null>(null);
  readonly recommendations = signal<Recomendacao[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  /** Itens afetados pela simulação em tela, destacados no mapa. */
  readonly highlighted = computed(() => {
    const r = this.result();
    return new Set(r ? [...r.afetados.equipamentos, ...r.afetados.agentes] : []);
  });

  constructor() {
    // Recalcula as recomendações quando o estado muda (cenário, telemetria, ação aplicada).
    effect(() => {
      this.city.equipment();
      this.city.agents();
      this.city.peakSurge();
      if (this.city.mode() === 'loading' || !this.isBrowser) return;
      untracked(() => this.scheduleRecommendations());
    });
  }

  /** Abre o simulador com uma ação pronta e já mostra o resultado. */
  async open(acao: Acao): Promise<void> {
    this.city.selection.set(null);
    this.panel.set('simulator');
    this.ui.goToMap();
    this.draft.set(acao);
    await this.simulate(acao);
  }

  async simulate(acao: Acao): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const result =
        this.city.mode() === 'online' ? await api<Simulacao>('POST', '/simulacao', { acao }) : simular(this.city.snapshot(), acao);
      this.result.set(result);
    } catch (err) {
      this.result.set(null);
      this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  /** `contexto: 'rota'` registra na auditoria como conclusão de parada da rota de manutenção. */
  async apply(acao: Acao, contexto?: 'rota'): Promise<boolean> {
    this.busy.set(true);
    this.error.set(null);
    try {
      let descricao: string;
      if (this.city.mode() === 'online') {
        const res = await this.city.serverAction<ServerState & { simulacao: Simulacao }>('/acoes/aplicar', { acao, contexto });
        descricao = res.simulacao.descricao;
      } else {
        const applied = aplicarAcao(this.city.snapshot(), acao);
        this.city.replaceState(applied.state);
        descricao = applied.descricao;
      }
      this.city.log(`Ação aplicada: ${descricao}`, 'good', 'prediction_applied');
      this.ui.notify(`Ação aplicada: ${descricao}.`, 'good');
      this.result.set(null);
      this.draft.set(null);
      await this.refreshRecommendations();
      return true;
    } catch (err) {
      this.error.set((err as Error).message);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  clear(): void {
    this.result.set(null);
    this.error.set(null);
  }

  private scheduleRecommendations(): void {
    if (this.recTimer) clearTimeout(this.recTimer);
    this.recTimer = setTimeout(() => void this.refreshRecommendations(), RECOMMENDATION_DEBOUNCE_MS);
  }

  async refreshRecommendations(): Promise<void> {
    try {
      this.recommendations.set(
        this.city.mode() === 'online'
          ? await api<Recomendacao[]>('GET', '/recomendacoes?topN=3')
          : recomendarAcoes(this.city.snapshot(), { topN: 3 })
      );
    } catch {
      // Mantém a última lista: a próxima mudança de estado tenta de novo.
    }
  }
}
