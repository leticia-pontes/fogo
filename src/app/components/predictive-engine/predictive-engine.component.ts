import { Component, computed, inject } from '@angular/core';
import { RISK_HIGH, RISK_MEDIUM } from '../../core/analysis';
import { EMPTY_FILTERS, CityStateService } from '../../services/city-state.service';
import { Prediction, PredictionKind, PredictionService } from '../../services/prediction.service';
import { UiStateService } from '../../services/ui-state.service';

const KIND_LABELS: Record<PredictionKind, string> = {
  traffic_collapse: 'Risco viário',
  enforcement_gap: 'Fiscalização',
  batch_failure: 'Manutenção preditiva',
  staff_reinforcement: 'Efetivo',
  security_patrol: 'Segurança',
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
        @for (p of ordered(); track p.id) {
          @let applied = predictions.isApplied(p);
          <article
            class="bg-fogo-panel border rounded-xl p-4 flex flex-col gap-3"
            [class]="applied ? 'border-fogo-green/50' : p.riskScore >= riskHigh ? 'border-fogo-red/60' : 'border-fogo-border'"
          >
            <header class="flex items-start justify-between gap-3">
              <div>
                <span class="text-[12px] uppercase tracking-wide text-fogo-muted">{{ kindLabels[p.kind] }}</span>
                <p class="text-sm font-semibold">{{ p.subject }}</p>
                <p class="text-xs text-fogo-muted">{{ p.horizon }}</p>
              </div>
              <div class="text-right shrink-0">
                <span class="text-[12px] text-fogo-muted block">Risco</span>
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

            @if (applied) {
              <p class="text-xs text-fogo-muted">{{ pendencia(p) }}</p>
            }

            <footer class="mt-auto flex gap-2">
              @if (applied) {
                <span class="flex-1 py-2 rounded-lg bg-fogo-green/15 border border-fogo-green/40 text-fogo-green text-sm text-center font-medium">
                  ✓ {{ appliedLabel(p) }}
                </span>
                @if (staffRequest(p); as req) {
                  <button
                    type="button"
                    (click)="registerAgent(p, req.neighborhood)"
                    title="O reforço chegou? Cadastre o agente no bairro e a previsão se recalcula."
                    class="px-3 py-2 rounded-lg bg-fogo-bg border border-fogo-border text-sm hover:border-fogo-ember cursor-pointer"
                  >
                    Cadastrar agente
                  </button>
                }
              } @else if (!p.actions.length) {
                <span class="flex-1 py-2 rounded-lg bg-fogo-bg border border-fogo-border text-fogo-muted text-sm text-center">
                  {{ noActionText(p) }}
                </span>
              } @else {
                <button
                  type="button"
                  (click)="predictions.apply(p)"
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
            <strong class="text-fogo-sand">Fiscalização comprometida</strong>: bairro com radar, câmera ou cancela fora de
            operação, mas abaixo do limiar de colapso. O risco é o próprio escore de colapso, e a evidência mostra quantos
            pontos faltam para o alerta de colapso.
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
            <strong class="text-fogo-sand">Risco de novos furtos</strong>: 2 ou mais furtos no mesmo bairro. Efetivo recomendado
            de Guarda/PM = 2 + 1 a cada 2 furtos. Risco = 40 + 15 por furto + 10 por agente em falta.
          </li>
          <li>
            <strong class="text-fogo-sand">Véspera de pico</strong> (cenário de homologação): o bairro é avaliado com fluxo 40%
            acima da média histórica e 2 agentes a mais necessários.
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
    .block-title { @apply text-[12px] font-semibold uppercase tracking-wide text-fogo-muted; }
  `,
})
export class PredictiveEngineComponent {
  readonly city = inject(CityStateService);
  private readonly ui = inject(UiStateService);
  readonly predictions = inject(PredictionService);
  readonly kindLabels = KIND_LABELS;
  readonly riskHigh = RISK_HIGH;

  /** Pendentes primeiro (por risco); as já aplicadas vão para o fim, enquanto o efeito não chega. */
  readonly ordered = computed(() => {
    const list = this.predictions.predictions();
    return [...list].sort((a, b) => Number(this.predictions.isApplied(a)) - Number(this.predictions.isApplied(b)));
  });

  /**
   * O que ainda falta numa previsão já aplicada. Acionar a equipe técnica não conserta na hora: o equipamento fica
   * "em manutenção" (indisponível) até a equipe concluir, e só então a previsão baixa ou some.
   */
  pendencia(p: Prediction): string {
    const req = this.staffRequest(p);
    const reqText = req
      ? `Reforço de ${req.count} agente(s) solicitado à escala hoje. Quando chegar, use "Cadastrar agente" para lotá-lo em ${req.neighborhood}: a previsão se recalcula na hora.`
      : '';
    const rest = this.pendenciaEquipamentos(p);
    return [reqText, rest].filter(Boolean).join(' ');
  }

  private pendenciaEquipamentos(p: Prediction): string {
    const ids = new Set(p.actions.flatMap((a) => (a.kind === 'maintenance' ? a.equipmentIds : [])));
    const fora = this.city.equipment().filter((e) => ids.has(e.id) && e.status !== 'operational' && e.maintenance.priority === 'immediate');
    if (fora.length) {
      return `Equipe técnica acionada: ${fora.length} equipamento(s) ainda fora de operação (${fora
        .map((e) => e.serialNumber)
        .join(', ')}). O risco baixa quando o reparo for concluído: Central → Rota de manutenção (a fila da equipe técnica) → Concluir, ou mudando a situação para Operacional.`;
    }
    if (this.staffRequest(p)) return '';
    return 'Ações executadas. O risco que resta vem de fatores fora do alcance desta recomendação (fluxo no pico, efetivo do bairro).';
  }

  /** Pedido de reforço à escala da recomendação, se houver. */
  staffRequest(p: Prediction): { neighborhood: string; count: number } | null {
    const req = p.actions.find((a) => a.kind === 'request_staff');
    return req ? { neighborhood: req.neighborhood, count: req.count } : null;
  }

  appliedLabel(p: Prediction): string {
    return p.actions.every((a) => a.kind === 'request_staff') ? 'Reforço solicitado à escala' : 'Recomendação aplicada';
  }

  /** Abre o cadastro de agente já lotado no bairro (Guarda Municipal quando o reforço é de segurança). */
  registerAgent(p: Prediction, neighborhood: string): void {
    this.ui.openInventory({ mode: 'create', kind: 'agent', neighborhood, role: p.kind === 'security_patrol' ? 'municipal_guard' : undefined });
  }

  /** Por que o card não tem botão, e o que o operador faz no lugar. */
  noActionText(p: Prediction): string {
    return p.kind === 'batch_failure' ? 'Sem ação aqui: os reparos estão nos cards dos bairros' : 'Sem ação automática';
  }

  riskClass(score: number): string {
    return score >= RISK_HIGH ? 'text-fogo-red' : score >= RISK_MEDIUM ? 'text-fogo-amber' : 'text-fogo-green';
  }

  riskBarClass(score: number): string {
    return score >= RISK_HIGH ? 'bg-fogo-red' : score >= RISK_MEDIUM ? 'bg-fogo-amber' : 'bg-fogo-green';
  }

  /**
   * Leva ao mapa já focado no alvo. O foco é um pedido explícito (substitui qualquer outro pendente),
   * porque a Central é recriada ao voltar e reaplica filtros e seleção antes de o mapa ficar pronto.
   */
  showOnMap(p: Prediction): void {
    if (p.neighborhood) {
      this.city.selection.set(null);
      this.city.filters.set({ ...EMPTY_FILTERS, neighborhood: p.neighborhood });
      this.ui.focusDistrict(p.neighborhood);
    } else {
      // O lote mostra uma unidade com problema (a primeira ação pode ser a preventiva de uma que ainda opera).
      const firstId = p.focusEquipmentIds?.[0] ?? p.actions.find((a) => a.kind === 'maintenance')?.equipmentIds[0];
      const eq = this.city.equipment().find((e) => e.id === firstId);
      this.city.filters.set(EMPTY_FILTERS);
      if (eq) {
        this.city.selection.set({ kind: 'equipment', id: eq.id });
        this.ui.focusPoint(eq.location.lat, eq.location.lng);
      }
    }
    this.ui.goToMap();
  }
}
