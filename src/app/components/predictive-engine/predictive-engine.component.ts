import { Component, EventEmitter, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideDynamicIcon } from '@lucide/angular';
import { DeviceInventoryService } from '../../services/device-inventory.service';
import { StoryService } from '../../services/story.service';
import { PredictiveIncident } from '../../models/fogo.models';

interface XaiFeedbackState {
  selectedFactor: string;
  correct: boolean;
  dominantFactor: string;
  explanation: string;
}

@Component({
  selector: 'app-predictive-engine',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  template: `
    <div class="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto text-[#e9e4d8]">
      <!-- Barra de contexto da Barreira 3 -->
      <section
        class="bg-[#1a2124] border border-[#2a3439] rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
        aria-label="Progresso da Barreira 3"
      >
        <div class="space-y-1">
          <div class="flex items-center gap-2.5">
            <span
              class="inline-block w-2.5 h-2.5 rounded-full"
              [class]="story.barrierThreeCleared() ? 'bg-[#4ca975]' : 'bg-[#ff7a3d]'"
            ></span>
            <h1 class="text-base sm:text-lg font-semibold text-[#e9e4d8]">
              Barreira 3 — Cidade preditiva: provar que entende
            </h1>
          </div>
          <p class="text-sm text-[#a39e93]">
            Antes de aplicar cada mitigação, avalie o impacto previsto e identifique qual fator tem maior peso na previsão. A barreira cai quando o IRT médio ficar abaixo de 40.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-4 shrink-0">
          <div class="px-3.5 py-2 rounded-lg bg-[#101517] border border-[#2a3439] text-sm">
            <span class="text-[#a39e93]">IRT médio atual: </span>
            <strong
              class="font-semibold"
              [class]="averageIrt() < 40 ? 'text-[#4ca975]' : averageIrt() >= 70 ? 'text-[#d9534f]' : 'text-[#d99b38]'"
            >
              {{ averageIrt() }}/100
            </strong>
            <span class="text-xs text-[#a39e93] ml-1.5">(meta: &lt; 40)</span>
          </div>

          <span
            class="px-3 py-1.5 rounded-lg text-xs font-medium border"
            [class]="story.barrierThreeCleared()
              ? 'bg-[#4ca975]/15 text-[#4ca975] border-[#4ca975]/40'
              : 'bg-[#ff7a3d]/15 text-[#ff7a3d] border-[#ff7a3d]/40'"
          >
            {{ story.barrierThreeCleared() ? 'Barreira 3 superada' : 'Validação XAI pendente' }}
          </span>
        </div>
      </section>

      <!-- Painel superior: IRT por região e Parecer do núcleo -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <!-- 7 colunas: Índice de risco territorial por zona -->
        <div class="lg:col-span-7 bg-[#1a2124] border border-[#2a3439] rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between gap-2 mb-1">
              <h2 class="text-base font-semibold text-[#e9e4d8]">
                Índice de risco territorial (IRT) por zona
              </h2>
              <span class="text-xs text-[#a39e93]">
                Média metropolitana:
                <strong [class]="averageIrt() < 40 ? 'text-[#4ca975]' : 'text-[#ff7a3d]'">
                  {{ averageIrt() }}/100
                </strong>
              </span>
            </div>
            <p class="text-xs text-[#a39e93]">
              Calculado em tempo real pela combinação de telemetria, meteorologia, histórico viário e cobertura de agentes.
            </p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            @for (region of inventory.regionSummaries(); track region.region) {
              <div
                class="p-3.5 rounded-lg bg-[#101517] border transition-colors"
                [class]="region.irtScore >= 75
                  ? 'border-[#d9534f]/60'
                  : region.irtScore >= 40
                    ? 'border-[#d99b38]/50'
                    : 'border-[#4ca975]/40'"
              >
                <div class="flex items-center justify-between gap-2 mb-2">
                  <span class="text-sm font-medium text-[#e9e4d8] truncate">
                    {{ region.region }}
                  </span>
                  <span
                    class="px-2 py-0.5 text-xs font-semibold rounded border"
                    [class]="region.irtScore >= 75
                      ? 'bg-[#d9534f]/15 text-[#d9534f] border-[#d9534f]/40'
                      : region.irtScore >= 40
                        ? 'bg-[#d99b38]/15 text-[#d99b38] border-[#d99b38]/40'
                        : 'bg-[#4ca975]/15 text-[#4ca975] border-[#4ca975]/40'"
                  >
                    IRT {{ region.irtScore }}
                  </span>
                </div>

                <div class="w-full h-2 bg-[#1a2124] rounded-full overflow-hidden mb-2.5">
                  <div
                    class="h-full transition-all duration-500"
                    [style.width.%]="region.irtScore"
                    [class]="region.irtScore >= 75
                      ? 'bg-[#d9534f]'
                      : region.irtScore >= 40
                        ? 'bg-[#d99b38]'
                        : 'bg-[#4ca975]'"
                  ></div>
                </div>

                <div class="flex items-center justify-between text-xs text-[#a39e93]">
                  <span>Saúde: <strong class="text-[#e9e4d8]">{{ region.healthScore }}%</strong></span>
                  <span>Falhas: <strong class="text-[#d9534f]">{{ region.criticalCount }}</strong></span>
                  <span>Agentes: <strong class="text-[#e9e4d8]">{{ region.activeAgents }}</strong></span>
                </div>
              </div>
            }
          </div>
        </div>

        <!-- 5 colunas: Parecer analítico Gemini (/api/prometheus-triage) -->
        <div class="lg:col-span-5 bg-[#1a2124] border border-[#2a3439] rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between gap-2 mb-3">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-[#ff7a3d]"></span>
                <h2 class="text-sm font-semibold text-[#e9e4d8]">
                  Síntese preditiva do núcleo ({{ inventory.aiTriageReport().model }})
                </h2>
              </div>
              <span
                class="px-2 py-0.5 text-xs font-medium rounded border"
                [class]="inventory.aiTriageReport().priorityLevel === 'CRITICAL'
                  ? 'bg-[#d9534f]/15 text-[#d9534f] border-[#d9534f]/40'
                  : 'bg-[#ff7a3d]/15 text-[#ff7a3d] border-[#ff7a3d]/40'"
              >
                Prioridade {{ inventory.aiTriageReport().priorityLevel }}
              </span>
            </div>

            <div class="p-3.5 rounded-lg bg-[#101517] border border-[#2a3439] text-sm text-[#e9e4d8] leading-relaxed mb-3">
              {{ inventory.aiTriageReport().tacticalBriefing }}
            </div>

            <div class="space-y-1.5 mb-4">
              <div class="text-xs font-medium text-[#a39e93]">
                Recomendações operacionais:
              </div>
              @for (directive of inventory.aiTriageReport().recommendedDirectives; track directive) {
                <div class="flex items-start gap-2 text-xs text-[#e9e4d8] bg-[#101517] px-3 py-2 rounded border border-[#2a3439]">
                  <span class="text-[#ff7a3d]">•</span>
                  <span>{{ directive }}</span>
                </div>
              }
            </div>
          </div>

          <div class="pt-3 border-t border-[#2a3439] flex items-center justify-between gap-3">
            <span class="text-xs text-[#a39e93]">
              Rota: <code class="text-[#e9e4d8] font-mono">/api/prometheus-triage</code>
            </span>
            <button
              type="button"
              (click)="triggerFreshAiAnalysis()"
              [disabled]="inventory.isLoadingAiTriage()"
              class="px-3.5 py-2 rounded-lg bg-[#101517] hover:bg-[#232c30] text-[#e9e4d8] border border-[#2a3439] text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              <svg lucideIcon="cpu" class="w-3.5 h-3.5 text-[#ff7a3d]"></svg>
              {{ inventory.isLoadingAiTriage() ? 'Consultando modelo...' : 'Atualizar parecer da IA' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Cartões de Previsão e Desafio de Explicabilidade (XAI) -->
      <div class="space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 class="text-base font-semibold text-[#e9e4d8] flex items-center gap-2">
              <svg lucideIcon="brain-circuit" class="w-4 h-4 text-[#ff7a3d]"></svg>
              Cenários preditivos e verificação de fatores (XAI)
            </h2>
            <p class="text-xs text-[#a39e93]">
              Responda qual fator mais influencia cada cenário para liberar e aplicar a mitigação.
            </p>
          </div>
          <span class="text-xs font-medium text-[#4ca975]">
            {{ inventory.mitigatedIncidentIds().length }} de {{ inventory.incidents().length }} cenários mitigados
          </span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          @for (incident of inventory.incidents(); track incident.id) {
            <article
              class="bg-[#1a2124] border rounded-xl p-5 flex flex-col justify-between transition-colors shadow-lg"
              [class]="isMitigated(incident.id)
                ? 'border-[#4ca975]/50'
                : incident.riskScore >= 80
                  ? 'border-[#d9534f]/60'
                  : 'border-[#2a3439]'"
            >
              <div class="space-y-4">
                <!-- Cabeçalho do cartão -->
                <div class="flex items-start justify-between gap-3 border-b border-[#2a3439] pb-3">
                  <div class="space-y-1">
                    <span class="text-sm font-semibold text-[#e9e4d8] block">
                      {{ incident.targetRegion }}
                    </span>
                    <div class="flex flex-wrap items-center gap-2 text-xs text-[#a39e93]">
                      <span class="px-2 py-0.5 rounded bg-[#101517] border border-[#2a3439]">
                        Janela: {{ incident.timeHorizon }}
                      </span>
                      <span class="px-2 py-0.5 rounded bg-[#101517] border border-[#2a3439]">
                        Confiança: {{ incident.confidence }}%
                      </span>
                    </div>
                  </div>

                  <!-- Comparativo Risco hoje vs. Risco depois -->
                  <div class="p-2.5 rounded-lg bg-[#101517] border border-[#2a3439] text-right shrink-0">
                    <span class="text-[11px] text-[#a39e93] block">Efeito previsto no risco</span>
                    @if (!isMitigated(incident.id)) {
                      <div class="flex items-center justify-end gap-1.5 mt-0.5 text-sm font-semibold">
                        <span class="text-[#d9534f]">Hoje {{ incident.riskScore }}</span>
                        <span class="text-[#a39e93]">→</span>
                        <span class="text-[#4ca975]">Depois {{ getProjectedRiskAfter(incident) }}</span>
                      </div>
                    } @else {
                      <div class="flex items-center justify-end gap-1.5 mt-0.5 text-sm font-semibold text-[#4ca975]">
                        <span>Risco mitigado: {{ incident.riskScore }}/100</span>
                      </div>
                    }
                  </div>
                </div>

                <!-- 1. O que foi previsto -->
                <div class="p-3.5 rounded-lg bg-[#101517] border border-[#2a3439]">
                  <div class="text-xs font-medium text-[#a39e93] mb-1">
                    1. O que foi previsto
                  </div>
                  <p class="text-sm font-medium text-[#e9e4d8] leading-snug">
                    {{ incident.predictedIssue }}
                  </p>
                </div>

                <!-- 2. Pergunta XAI ou Gráfico de Pesos -->
                <div class="p-4 rounded-lg bg-[#101517] border border-[#2a3439] space-y-3">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-semibold text-[#ff7a3d]">
                      2. Qual fator pesa mais nesta previsão?
                    </span>
                    <span class="text-xs text-[#a39e93]">
                      {{ isMitigated(incident.id) ? 'Fator validado' : 'Escolha 1 entre as 3 opções' }}
                    </span>
                  </div>

                  <!-- 3 Opções reais de xaiFactors -->
                  @if (!isMitigated(incident.id)) {
                    <div class="space-y-2" role="radiogroup" [attr.aria-label]="'Fatores da previsão para ' + incident.targetRegion">
                      @for (xai of incident.xaiFactors; track xai.factor) {
                        <button
                          type="button"
                          (click)="selectAndVerifyFactor(incident, xai.factor)"
                          class="w-full text-left px-3.5 py-2.5 rounded-lg border text-xs sm:text-sm transition-colors flex items-center justify-between gap-3 cursor-pointer"
                          [class]="getFeedback(incident.id)?.selectedFactor === xai.factor
                            ? getFeedback(incident.id)?.correct
                              ? 'bg-[#4ca975]/15 border-[#4ca975] text-[#e9e4d8]'
                              : 'bg-[#d9534f]/15 border-[#d9534f] text-[#e9e4d8]'
                            : 'bg-[#1a2124] hover:bg-[#232c30] border-[#2a3439] text-[#e9e4d8]'"
                        >
                          <span>{{ xai.factor }}</span>
                          <span class="text-xs font-medium text-[#ff7a3d] shrink-0">
                            Selecionar
                          </span>
                        </button>
                      }
                    </div>
                  }

                  <!-- Feedback de erro ou acerto + Gráfico de pesos XAI -->
                  @if (getFeedback(incident.id); as fb) {
                    <div
                      class="p-3 rounded-lg border text-xs leading-relaxed"
                      [class]="fb.correct
                        ? 'bg-[#4ca975]/12 border-[#4ca975]/40 text-[#e9e4d8]'
                        : 'bg-[#d99b38]/12 border-[#d99b38]/40 text-[#e9e4d8]'"
                      role="status"
                    >
                      <strong
                        class="block mb-0.5 font-semibold"
                        [class]="fb.correct ? 'text-[#4ca975]' : 'text-[#d99b38]'"
                      >
                        {{ fb.correct ? 'Fator dominante confirmado' : 'Revise os pesos da previsão (tente de novo sem punição)' }}
                      </strong>
                      {{ fb.explanation }}
                    </div>
                  }

                  @if (shouldShowWeights(incident.id)) {
                    <div class="space-y-2 pt-2 border-t border-[#2a3439]">
                      <div class="flex items-center justify-between text-xs text-[#a39e93]">
                        <span>Gráfico de pesos reais do modelo</span>
                        <span>Soma: 100%</span>
                      </div>
                      @for (xai of incident.xaiFactors; track xai.factor) {
                        <div>
                          <div class="flex items-center justify-between text-xs mb-1">
                            <span class="text-[#e9e4d8]">{{ xai.factor }}</span>
                            <strong class="font-mono text-[#ff7a3d]">{{ xai.weight }}%</strong>
                          </div>
                          <div class="w-full h-2 bg-[#1a2124] rounded-full overflow-hidden">
                            <div
                              class="h-full rounded-full transition-all duration-500"
                              [class]="isTopFactor(incident, xai.factor) ? 'bg-[#ff7a3d]' : 'bg-[#6c767a]'"
                              [style.width.%]="xai.weight"
                            ></div>
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>

                <!-- 3. Ação recomendada -->
                <div class="p-3.5 rounded-lg bg-[#101517] border border-[#2a3439]">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-medium text-[#a39e93]">
                      3. Ação de mitigação recomendada
                    </span>
                    @if (incident.actionPayload) {
                      <span class="text-[11px] font-mono px-2 py-0.5 rounded bg-[#1a2124] text-[#a39e93] border border-[#2a3439]">
                        {{ incident.actionPayload.actionType }}
                      </span>
                    }
                  </div>
                  <p class="text-xs text-[#e9e4d8] leading-relaxed">
                    {{ incident.recommendedAction }}
                  </p>
                </div>
              </div>

              <!-- Rodapé de ação -->
              <div class="mt-4 pt-3.5 border-t border-[#2a3439] flex flex-wrap items-center justify-between gap-2">
                @if (isMitigated(incident.id)) {
                  <div class="flex-1 py-2 px-3 rounded-lg bg-[#4ca975]/15 border border-[#4ca975]/40 text-[#4ca975] font-medium text-xs flex items-center justify-center gap-2">
                    <svg lucideIcon="check-circle-2" class="w-4 h-4"></svg>
                    <span>Mitigação aplicada • Risco reduzido para {{ incident.riskScore }}/100</span>
                  </div>
                } @else {
                  <div class="flex-1 py-2 px-3 rounded-lg bg-[#101517] border border-[#2a3439] text-[#a39e93] text-xs flex items-center justify-center gap-2">
                    <span>Selecione acima o fator de maior peso para aplicar a mitigação</span>
                  </div>
                }

                <button
                  type="button"
                  (click)="viewInterventionOnMap(incident)"
                  class="py-2 px-3.5 rounded-lg bg-[#101517] hover:bg-[#232c30] text-[#e9e4d8] border border-[#2a3439] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <svg lucideIcon="map" class="w-4 h-4 text-[#ff7a3d]"></svg>
                  <span>Ver no mapa</span>
                </button>
              </div>
            </article>
          }
        </div>
      </div>
    </div>
  `,
})
export class PredictiveEngineComponent {
  @Output() navigateToMap = new EventEmitter<void>();

  readonly inventory = inject(DeviceInventoryService);
  readonly story = inject(StoryService);

  private readonly feedbackByIncident = signal<Record<string, XaiFeedbackState>>({});

  readonly averageIrt = computed(() => {
    const list = this.inventory.regionSummaries();
    if (list.length === 0) return 0;
    const sum = list.reduce((acc, r) => acc + r.irtScore, 0);
    return Math.round(sum / list.length);
  });

  isMitigated(incidentId: string): boolean {
    return this.inventory.mitigatedIncidentIds().includes(incidentId);
  }

  getProjectedRiskAfter(incident: PredictiveIncident): number {
    return Math.max(18, incident.riskScore - 46);
  }

  getFeedback(incidentId: string): XaiFeedbackState | undefined {
    return this.feedbackByIncident()[incidentId];
  }

  shouldShowWeights(incidentId: string): boolean {
    return this.isMitigated(incidentId) || Boolean(this.feedbackByIncident()[incidentId]);
  }

  isTopFactor(incident: PredictiveIncident, factorName: string): boolean {
    if (incident.xaiFactors.length === 0) return false;
    const sorted = [...incident.xaiFactors].sort((a, b) => b.weight - a.weight);
    return sorted[0].factor === factorName;
  }

  selectAndVerifyFactor(incident: PredictiveIncident, selectedFactor: string): void {
    const result = this.story.recordXaiAttempt(incident.id, selectedFactor);
    this.feedbackByIncident.update((curr) => ({
      ...curr,
      [incident.id]: {
        selectedFactor,
        correct: result.correct,
        dominantFactor: result.dominantFactor,
        explanation: result.explanation,
      },
    }));
  }

  viewInterventionOnMap(incident: PredictiveIncident): void {
    const summary = this.inventory
      .regionSummaries()
      .find(
        (r) =>
          r.region === incident.targetRegion ||
          incident.targetRegion.includes(r.region.split(' - ')[0])
      );
    if (summary) {
      this.inventory.focusOnCoordinates(summary.centerLat, summary.centerLng, 14);
    }
    this.navigateToMap.emit();
  }

  triggerFreshAiAnalysis(): void {
    void this.inventory.requestPrometheusAiTriage(
      'ANALISE_PREDITIVA_SOB_DEMANDA',
      'Região Metropolitana do Recife',
      `IRT médio em ${this.averageIrt()}/100 com ${this.inventory.criticalFailureDevicesCount()} anomalias ativas.`
    );
  }
}
