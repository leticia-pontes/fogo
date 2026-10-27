import { Injectable, PLATFORM_ID, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Ocorrencia, TIPO_ALERTA_LABELS, TipoAlerta, abrirOcorrencia } from '../core/occurrences';
import { api } from './api';
import { CityStateService } from './city-state.service';
import { SimulationService } from './simulation.service';
import { UiStateService } from './ui-state.service';

const STORAGE_KEY = 'fogo:ocorrencias:v1';

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

  constructor() {
    // Carrega quando o modo de persistência fica definido (online ou offline).
    effect(() => {
      if (this.city.mode() === 'loading' || !this.isBrowser) return;
      untracked(() => void this.refresh());
    });

    // Restaurar a seed recria o banco (online) e zera as ocorrências locais (offline).
    effect(() => {
      if (!this.city.resets()) return;
      untracked(() => {
        this.selectedId.set(null);
        if (this.city.mode() === 'online') void this.refresh();
        else this.saveLocal([]);
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

  hasOpen(equipamentoId: string, tipoAlerta: TipoAlerta): boolean {
    return this.list().some((o) => o.status !== 'encerrada' && o.equipamentoId === equipamentoId && o.tipoAlerta === tipoAlerta);
  }

  private loadLocal(): Ocorrencia[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Ocorrencia[];
    } catch {
      return [];
    }
  }

  private saveLocal(list: Ocorrencia[]): void {
    this.list.set(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      // Sem localStorage (navegação privada): a lista vale só para esta sessão.
    }
  }
}
