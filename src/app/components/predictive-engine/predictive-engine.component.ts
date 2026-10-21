import { Component, EventEmitter, Output, inject } from '@angular/core';
import { EMPTY_FILTERS, CityStateService } from '../../services/city-state.service';
import { Prediction, PredictionKind, PredictionService } from '../../services/prediction.service';

const KIND_LABELS: Record<PredictionKind, string> = {
  traffic_collapse: 'Risco viário',
  batch_failure: 'Manutenção preditiva',
  staff_reinforcement: 'Efetivo',
};

@Component({
  selector: 'app-predictive-engine',
  standalone: true,
  template: `
    <div class="p-4 lg:p-5 space-y-4 max-w-[1600px] mx-auto">
      <section class="bg-fogo-panel border border-fogo-border rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 class="text-lg font-semibold">Cidade Preditiva</h1>
          <p class="text-sm text-fogo-muted max-w-3xl">
            O PROMETHEUS cruza o estado atual dos equipamentos e agentes com o histórico simulado de cada bairro
            (fluxo no pico, ocorrências por semana e efetivo necessário). Cada previsão mostra o que foi previsto,
            quais dados geraram o alerta e a decisão recomendada. As previsões são recalculadas a cada mudança.
          </p>
        </div>
        <div class="flex gap-3 shrink-0 text-sm">
          <div class="px-3 py-2 rounded-lg bg-fogo-bg border border-fogo-border">
            <span class="text-fogo-muted">Previsões ativas: </span>
            <strong class="font-mono">{{ predictions.predictions().length }}</strong>
          </div>
          <div class="px-3 py-2 rounded-lg bg-fogo-bg border border-fogo-border">
            <span class="text-fogo-muted">Telemetria: </span>
            <strong [class]="city.telemetryOn() ? 'text-fogo-green' : 'text-fogo-muted'">{{ city.telemetryOn() ? 'ao vivo' : 'pausada' }}</strong>
          </div>
        </div>
      </section>

      <div class="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
        @for (p of predictions.predictions(); track p.id) {
          @let applied = predictions.isApplied(p);
          <article
            class="bg-fogo-panel border rounded-xl p-4 flex flex-col gap-3"
            [class]="applied ? 'border-fogo-green/50' : p.riskScore >= 75 ? 'border-fogo-red/60' : 'border-fogo-border'"
          >
            <header class="flex items-start justify-between gap-3">
              <div>
                <span class="text-[11px] uppercase tracking-wide text-fogo-muted">{{ kindLabels[p.kind] }}</span>
                <p class="text-sm font-semibold">{{ p.subject }}</p>
                <p class="text-xs text-fogo-muted">{{ p.horizon }}</p>
              </div>
              <div class="text-right shrink-0">
                <span class="text-[11px] text-fogo-muted block">Risco</span>
                <strong class="font-mono text-xl" [class]="riskClass(p.riskScore)">{{ p.riskScore }}</strong>
                <span class="text-xs text-fogo-muted">/100</span>
              </div>
            </header>

            <div class="h-1.5 rounded-full bg-fogo-bg overflow-hidden" aria-hidden="true">
              <div class="h-full" [style.width.%]="p.riskScore" [class]="riskBarClass(p.riskScore)"></div>
            </div>

            <section class="block-box">
              <h3 class="block-title">1 · O que está sendo previsto</h3>
              <p class="text-sm font-medium">{{ p.title }}</p>
            </section>

            <section class="block-box">
              <h3 class="block-title">2 · Base de dados considerada</h3>
              <ul class="space-y-1 text-xs list-disc pl-4">
                @for (item of p.evidence; track item) {
                  <li>{{ item }}</li>
                }
              </ul>
            </section>

            <section class="block-box border-fogo-ember/40">
              <h3 class="block-title text-fogo-ember">3 · Recomendação de decisão</h3>
              <p class="text-sm">{{ p.recommendation }}</p>
            </section>

            <footer class="mt-auto flex gap-2">
              @if (applied) {
                <span class="flex-1 py-2 rounded-lg bg-fogo-green/15 border border-fogo-green/40 text-fogo-green text-sm text-center font-medium">
                  ✓ Recomendação aplicada
                </span>
              } @else {
                <button
                  type="button"
                  (click)="predictions.apply(p)"
                  [disabled]="p.actions.length === 0"
                  class="flex-1 py-2 rounded-lg bg-fogo-ember hover:brightness-110 text-fogo-bg text-sm font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Aplicar recomendação
                </button>
              }
              <button
                type="button"
                (click)="showOnMap(p)"
                class="px-3 py-2 rounded-lg bg-fogo-bg border border-fogo-border text-sm hover:border-fogo-ember cursor-pointer"
              >
                Ver no mapa
              </button>
            </footer>
          </article>
        } @empty {
          <p class="col-span-full text-center text-sm text-fogo-muted py-16 bg-fogo-panel border border-fogo-border rounded-xl">
            Nenhum risco relevante previsto com o estado atual da cidade.
          </p>
        }
      </div>

      <details class="bg-fogo-panel border border-fogo-border rounded-xl p-4 text-xs text-fogo-muted">
        <summary class="text-sm text-fogo-sand cursor-pointer">Como as previsões são calculadas</summary>
        <ul class="mt-3 space-y-2 list-disc pl-4">
          <li>
            <strong class="text-fogo-sand">Colapso viário</strong> (alerta a partir de 55): até 45 pts por radares, câmeras e cancelas
            indisponíveis (15 cada) + até 30 pts pelo fluxo histórico no pico (relativo ao bairro de maior fluxo) + até 25 pts
            pelo déficit de agentes em relação ao necessário no pico (10 por agente).
          </li>
          <li>
            <strong class="text-fogo-sand">Falha em lote</strong>: mesmo fabricante e modelo com 2 ou mais unidades em falha,
            manutenção ou prioridade imediata e taxa de falha a partir de 30%. Risco = taxa de falha + 5 pts por unidade afetada.
          </li>
          <li>
            <strong class="text-fogo-sand">Reforço de efetivo</strong>: bairros abaixo do efetivo necessário no pico que não têm
            alerta de colapso. Risco = 60 × déficit relativo + 2 × ocorrências por semana.
          </li>
          <li>
            Os remanejamentos priorizam agentes de folga do próprio bairro e, depois, agentes excedentes dos bairros com maior
            folga, sem retirar ninguém de um bairro que ficaria abaixo do necessário.
          </li>
        </ul>
      </details>
    </div>
  `,
  styles: `
    .block-box { @apply p-3 rounded-lg bg-fogo-bg border border-fogo-border space-y-1.5; }
    .block-title { @apply text-[11px] font-semibold uppercase tracking-wide text-fogo-muted; }
  `,
})
export class PredictiveEngineComponent {
  @Output() navigateToMap = new EventEmitter<void>();

  readonly city = inject(CityStateService);
  readonly predictions = inject(PredictionService);
  readonly kindLabels = KIND_LABELS;

  riskClass(score: number): string {
    return score >= 75 ? 'text-fogo-red' : score >= 50 ? 'text-fogo-amber' : 'text-fogo-green';
  }

  riskBarClass(score: number): string {
    return score >= 75 ? 'bg-fogo-red' : score >= 50 ? 'bg-fogo-amber' : 'bg-fogo-green';
  }

  showOnMap(p: Prediction): void {
    if (p.neighborhood) {
      this.city.selection.set(null);
      this.city.filters.set({ ...EMPTY_FILTERS, neighborhood: p.neighborhood });
    } else {
      const firstId = p.actions.find((a) => a.kind === 'maintenance')?.equipmentIds[0];
      this.city.filters.set(EMPTY_FILTERS);
      if (firstId) this.city.selection.set({ kind: 'equipment', id: firstId });
    }
    this.navigateToMap.emit();
  }
}
