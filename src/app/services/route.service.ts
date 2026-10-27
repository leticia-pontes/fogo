import { Injectable, inject, signal } from '@angular/core';
import { daysFromToday } from '../data/mock-data';
import { MaintenanceRoute, RouteOptions, RouteStop, gerarRotaManutencao } from '../core/maintenance-route';
import { api } from './api';
import { CityStateService } from './city-state.service';
import { SimulationService } from './simulation.service';

/** Rota de manutenção em tela (gerada por GET /api/rota-manutencao ou localmente no modo offline). */
@Injectable({ providedIn: 'root' })
export class RouteService {
  private readonly city = inject(CityStateService);
  private readonly sim = inject(SimulationService);

  readonly route = signal<MaintenanceRoute | null>(null);
  /** Paradas já concluídas nesta rota. */
  readonly done = signal<ReadonlySet<string>>(new Set());
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async generate(opts: Pick<RouteOptions, 'bairro' | 'tipo' | 'apenasCriticos' | 'limite'>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.city.mode() === 'online') {
        const q = new URLSearchParams();
        if (opts.bairro) q.set('bairro', opts.bairro);
        if (opts.tipo) q.set('tipo', opts.tipo);
        if (opts.apenasCriticos) q.set('apenasCriticos', '1');
        if (opts.limite) q.set('limite', String(opts.limite));
        this.route.set(await api<MaintenanceRoute>('GET', `/rota-manutencao?${q}`));
      } else {
        this.route.set(gerarRotaManutencao(this.city.snapshot(), opts));
      }
      this.done.set(new Set());
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  /** Equipe concluiu a parada: equipamento volta a operar (grava situação e auditoria). */
  async complete(stop: RouteStop): Promise<void> {
    const ok = await this.sim.apply({ tipo: 'ANTECIPAR_MANUTENCAO', equipamentoId: stop.equipamentoId, novaData: daysFromToday(0) }, 'rota');
    if (ok) this.done.update((set) => new Set([...set, stop.equipamentoId]));
  }

  simulateAll(): void {
    const route = this.route();
    const pending = route?.paradas.filter((p) => !this.done().has(p.equipamentoId)).map((p) => p.equipamentoId) ?? [];
    if (pending.length) void this.sim.open({ tipo: 'EXECUTAR_ROTA_MANUTENCAO', equipamentoIds: pending });
  }

  clear(): void {
    this.route.set(null);
    this.done.set(new Set());
  }
}
