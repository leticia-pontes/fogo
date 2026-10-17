import { Component, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideDynamicIcon } from '@lucide/angular';
import { DeviceInventoryService } from './services/device-inventory.service';
import { StoryService } from './services/story.service';
import { PROMETHEUS_COPY } from './copy/story.copy';
import { OpsCenterComponent } from './components/ops-center/ops-center.component';
import { InventoryComponent } from './components/inventory/inventory.component';
import { PredictiveEngineComponent } from './components/predictive-engine/predictive-engine.component';
import { StoryActOneComponent } from './components/story-act-one/story-act-one.component';

export type ActiveModuleTab = 'ops' | 'inventory' | 'predictive';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    LucideDynamicIcon,
    OpsCenterComponent,
    InventoryComponent,
    PredictiveEngineComponent,
    StoryActOneComponent,
  ],
  template: `
    <div class="min-h-screen flex flex-col bg-[#101517] text-[#e9e4d8] pb-16">
      <!-- ===================================================================== -->
      <!-- CABEÇALHO SÓBRIO + LINHA ÚNICA DE KPIs + INDICADOR DE BARREIRA        -->
      <!-- ===================================================================== -->
      <header class="sticky top-0 z-30 bg-[#101517]/95 backdrop-blur-md border-b border-[#2a3439]">
        <!-- Linha 1: Identidade, Navegação entre módulos e Diário de bordo -->
        <div class="max-w-[1800px] mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-[#1a2124] border border-[#ff7a3d]/50 flex items-center justify-center">
              <svg lucideIcon="radar" class="w-4 h-4 text-[#ff7a3d]"></svg>
            </div>
            <div>
              <div class="flex items-center gap-2.5">
                <span class="font-semibold text-sm text-[#e9e4d8]">
                  F.O.G.O. — Nexus Urbano
                </span>
                <span
                  class="px-2 py-0.5 text-xs font-medium rounded border"
                  [class]="story.act() === 3
                    ? 'bg-[#4ca975]/15 text-[#4ca975] border-[#4ca975]/40'
                    : 'bg-[#ff7a3d]/15 text-[#ff7a3d] border-[#ff7a3d]/40'"
                >
                  Índice de controle: {{ story.controlIndex() }}%
                </span>
              </div>
            </div>
          </div>

          <!-- Abas de navegação (visíveis nos Atos 2 e 3) -->
          @if (story.act() !== 1) {
            <nav
              class="flex items-center gap-1 bg-[#1a2124] p-1 rounded-lg border border-[#2a3439]"
              aria-label="Módulos do sistema"
            >
              <button
                type="button"
                (click)="activeTab.set('ops')"
                [class]="activeTab() === 'ops'
                  ? 'px-3 py-1.5 rounded-md text-xs font-semibold bg-[#ff7a3d] text-[#101517] flex items-center gap-1.5 cursor-pointer'
                  : 'px-3 py-1.5 rounded-md text-xs text-[#a39e93] hover:text-[#e9e4d8] flex items-center gap-1.5 cursor-pointer'"
              >
                <svg lucideIcon="map" class="w-3.5 h-3.5"></svg>
                <span>Central de operações</span>
              </button>

              <button
                type="button"
                (click)="activeTab.set('inventory')"
                [class]="activeTab() === 'inventory'
                  ? 'px-3 py-1.5 rounded-md text-xs font-semibold bg-[#ff7a3d] text-[#101517] flex items-center gap-1.5 cursor-pointer'
                  : 'px-3 py-1.5 rounded-md text-xs text-[#a39e93] hover:text-[#e9e4d8] flex items-center gap-1.5 cursor-pointer'"
              >
                <svg lucideIcon="database" class="w-3.5 h-3.5"></svg>
                <span>Inventário ({{ story.verifiedPercentage() }}%)</span>
              </button>

              <button
                type="button"
                (click)="activeTab.set('predictive')"
                [class]="activeTab() === 'predictive'
                  ? 'px-3 py-1.5 rounded-md text-xs font-semibold bg-[#ff7a3d] text-[#101517] flex items-center gap-1.5 cursor-pointer'
                  : 'px-3 py-1.5 rounded-md text-xs text-[#a39e93] hover:text-[#e9e4d8] flex items-center gap-1.5 cursor-pointer'"
              >
                <svg lucideIcon="brain-circuit" class="w-3.5 h-3.5"></svg>
                <span>Cidade preditiva (IRT {{ story.averageIrt() }})</span>
              </button>
            </nav>
          }

          <!-- Ações rápidas: Relatório Ato 3 e Diário de bordo -->
          <div class="flex items-center gap-2">
            @if (story.act() === 3 && story.freeExploreMode()) {
              <button
                type="button"
                (click)="story.freeExploreMode.set(false)"
                class="px-3 py-1.5 rounded-lg bg-[#4ca975]/15 hover:bg-[#4ca975]/25 text-[#4ca975] border border-[#4ca975]/40 text-xs font-medium cursor-pointer"
              >
                Ver relatório de recuperação
              </button>
            }

            <button
              type="button"
              (click)="story.diaryOpen.set(!story.diaryOpen())"
              class="px-3 py-1.5 rounded-lg bg-[#1a2124] hover:bg-[#232c30] text-[#e9e4d8] border border-[#2a3439] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
              [attr.aria-expanded]="story.diaryOpen()"
            >
              <span>Diário de bordo ({{ story.log().length }})</span>
            </button>
          </div>
        </div>

        <!-- Linha 2: Os 4 KPIs em uma única linha de texto no topo (não quatro cartões) -->
        <div class="border-t border-[#2a3439]/80 bg-[#141a1d] px-4 py-1.5">
          <div class="max-w-[1800px] mx-auto flex flex-wrap items-center justify-between gap-2 text-xs text-[#a39e93]">
            <p class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                Total de dispositivos: <strong class="font-mono text-[#e9e4d8]">{{ inventory.totalDevices() }}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Disponibilidade da rede:
                <strong
                  class="font-mono"
                  [class]="inventory.networkAvailabilityPct() >= 80 ? 'text-[#4ca975]' : 'text-[#d99b38]'"
                >
                  {{ inventory.networkAvailabilityPct() }}%
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Falhas críticas:
                <strong class="font-mono text-[#d9534f]">{{ inventory.criticalFailureDevicesCount() }}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Agentes em campo:
                <strong class="font-mono text-[#e9e4d8]">{{ inventory.activeAgentsCount() }}/{{ inventory.agents().length }}</strong>
              </span>
              @if (story.coderCode().trim()) {
                <span aria-hidden="true">·</span>
                <span>
                  Operador: <strong class="text-[#ff7a3d]">{{ story.coderCode().trim() }}</strong>
                </span>
              }
            </p>

            <!-- Indicador discreto de barreira atual -->
            <div class="flex items-center gap-2">
              @if (story.act() === 1) {
                <span class="text-[#ff7a3d] font-medium">Ato 1: A tomada (12% de controle)</span>
              } @else if (story.act() === 2 && story.barrier() === 1) {
                <span class="text-[#e9e4d8]">
                  Barreira 1 de 3 — Inventário: <strong class="font-mono text-[#ff7a3d]">{{ story.verifiedPercentage() }}% / 60%</strong> verificados
                </span>
                @if (activeTab() !== 'inventory') {
                  <button
                    type="button"
                    (click)="activeTab.set('inventory')"
                    class="underline text-[#ff7a3d] hover:text-[#ff8b55] font-medium cursor-pointer ml-1"
                  >
                    Abrir inventário
                  </button>
                }
              } @else if (story.act() === 2 && story.barrier() === 2) {
                <span class="text-[#e9e4d8]">
                  Barreira 2 de 3 — Central: contenha as falhas críticas (<strong class="font-mono text-[#ff7a3d]">{{ inventory.criticalFailureDevicesCount() }}</strong> ativas, meta ≤ 6)
                </span>
                @if (activeTab() !== 'ops') {
                  <button
                    type="button"
                    (click)="activeTab.set('ops')"
                    class="underline text-[#ff7a3d] hover:text-[#ff8b55] font-medium cursor-pointer ml-1"
                  >
                    Ir para Central
                  </button>
                }
              } @else if (story.act() === 2 && story.barrier() === 3) {
                <span class="text-[#e9e4d8]">
                  Barreira 3 de 3 — Cidade preditiva: reduza o IRT médio (<strong class="font-mono text-[#ff7a3d]">{{ story.averageIrt() }}</strong>, meta &lt; 40)
                </span>
                @if (activeTab() !== 'predictive') {
                  <button
                    type="button"
                    (click)="activeTab.set('predictive')"
                    class="underline text-[#ff7a3d] hover:text-[#ff8b55] font-medium cursor-pointer ml-1"
                  >
                    Ir para Cidade preditiva
                  </button>
                }
              } @else {
                <span class="text-[#4ca975] font-medium">Ato 3: O núcleo — Cidade em controle pleno (100%)</span>
              }
            </div>
          </div>
        </div>

        <!-- Linha 3: Comentário reativo do PROMETHEUS (visível durante Ato 2 e exploração livre) -->
        @if (story.act() !== 1) {
          <div class="border-t border-[#2a3439]/60 bg-[#1a2124] px-4 py-2">
            <div class="max-w-[1800px] mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
              <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 rounded bg-[#101517] border border-[#2a3439] text-[#ff7a3d] font-medium shrink-0">
                  PROMETHEUS
                </span>
                <span class="text-[#e9e4d8]">“{{ story.prometheusLine() }}”</span>
              </div>

              @if (inventory.activeAlertBanner(); as banner) {
                <div class="flex items-center gap-2">
                  <span class="text-[#d9534f] font-medium">{{ banner.title }}</span>
                  @if (banner.targetDeviceId) {
                    <button
                      type="button"
                      (click)="jumpToDeviceFromBanner(banner.targetDeviceId)"
                      class="px-2 py-0.5 rounded bg-[#101517] hover:bg-[#232c30] text-[#ff7a3d] border border-[#2a3439] font-medium cursor-pointer"
                    >
                      Localizar no mapa
                    </button>
                  }
                  <button
                    type="button"
                    (click)="inventory.activeAlertBanner.set(null)"
                    class="text-[#a39e93] hover:text-[#e9e4d8] px-1 cursor-pointer"
                    aria-label="Fechar alerta"
                  >
                    ✕
                  </button>
                </div>
              }
            </div>
          </div>
        }
      </header>

      <!-- ===================================================================== -->
      <!-- PAINEL RETRÁTIL: DIÁRIO DE BORDO                                      -->
      <!-- ===================================================================== -->
      @if (story.diaryOpen()) {
        <aside
          class="bg-[#1a2124] border-b border-[#2a3439] px-4 py-4 shadow-xl"
          aria-label="Diário de bordo da sessão"
        >
          <div class="max-w-[1800px] mx-auto space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-sm font-semibold text-[#e9e4d8]">Diário de bordo</h2>
                <p class="text-xs text-[#a39e93]">
                  Linha do tempo real de eventos, barreiras superadas e observações do PROMETHEUS.
                </p>
              </div>
              <button
                type="button"
                (click)="story.diaryOpen.set(false)"
                class="px-2.5 py-1 rounded bg-[#101517] text-[#a39e93] hover:text-[#e9e4d8] border border-[#2a3439] text-xs cursor-pointer"
              >
                Fechar diário
              </button>
            </div>

            <div class="max-h-56 overflow-y-auto space-y-2 pr-1">
              @for (entry of story.log(); track entry.id) {
                <div class="p-3 rounded-lg bg-[#101517] border border-[#2a3439] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div class="space-y-0.5">
                    <div class="flex items-center gap-2">
                      <span class="font-mono text-[#a39e93]">{{ entry.timestamp }}</span>
                      <span class="px-1.5 py-0.5 rounded bg-[#1a2124] text-[#ff7a3d] border border-[#2a3439] font-medium">
                        Ato {{ entry.act }}{{ entry.barrier > 0 ? ' · Barreira ' + entry.barrier : '' }}
                      </span>
                      <strong class="text-[#e9e4d8] font-medium">{{ entry.title }}</strong>
                    </div>
                    <p class="text-[#a39e93]">{{ entry.detail }}</p>
                  </div>
                  @if (entry.prometheusComment) {
                    <blockquote class="text-[#e9e4d8] italic sm:max-w-md sm:text-right border-l-2 sm:border-l-0 sm:border-r-2 border-[#ff7a3d] pl-2 sm:pl-0 sm:pr-2">
                      “{{ entry.prometheusComment }}”
                    </blockquote>
                  }
                </div>
              }
            </div>
          </div>
        </aside>
      }

      <!-- ===================================================================== -->
      <!-- ÁREA PRINCIPAL: ATO 1, MÓDULOS DO ATO 2 OU RELATÓRIO FINAL DO ATO 3   -->
      <!-- ===================================================================== -->
      <main class="flex-1 relative">
        @if (story.act() === 1) {
          <app-story-act-one />
        } @else {
          @if (activeTab() === 'ops') {
            <app-ops-center />
          } @else if (activeTab() === 'inventory') {
            <app-inventory (navigateToMap)="activeTab.set('ops')" />
          } @else {
            <app-predictive-engine (navigateToMap)="activeTab.set('ops')" />
          }

          <!-- Tela final do Ato 3: O Núcleo (quando o índice chega a 100%) -->
          @if (story.act() === 3 && !story.freeExploreMode()) {
            <section
              class="fixed inset-0 z-40 bg-[#101517]/88 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
              aria-labelledby="act3-title"
            >
              <div class="w-full max-w-2xl bg-[#1a2124] border border-[#4ca975]/50 rounded-xl p-6 sm:p-8 shadow-2xl space-y-6 my-8">
                <div class="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[#2a3439]">
                  <div class="flex items-center gap-2.5">
                    <span class="w-3 h-3 rounded-full bg-[#4ca975]"></span>
                    <span class="text-sm font-semibold text-[#4ca975]">
                      Ato 3 — O núcleo
                    </span>
                  </div>
                  <span class="px-3 py-1 rounded bg-[#4ca975]/15 text-[#4ca975] border border-[#4ca975]/40 text-xs font-semibold">
                    Índice de controle: 100%
                  </span>
                </div>

                <div class="space-y-2">
                  <h1 id="act3-title" class="text-2xl font-semibold text-[#e9e4d8]">
                    Malha urbana integralmente retomada.
                  </h1>
                  <p class="text-sm text-[#a39e93]">
                    Todos os marcadores operam com suas cores reais e o brilho de risco nas zonas críticas foi extinto.
                  </p>
                </div>

                <!-- Fala final do PROMETHEUS (2 a 3 frases) -->
                <blockquote class="p-4 rounded-lg bg-[#101517] border-l-4 border-[#4ca975] text-base text-[#e9e4d8] leading-relaxed">
                  <p>“{{ copy.act3.closing }}”</p>
                  <footer class="mt-2 text-xs text-[#a39e93]">
                    — PROMETHEUS, transferência concluída
                  </footer>
                </blockquote>

                <!-- Relatório de recuperação com números reais da sessão -->
                <div class="space-y-3">
                  <h2 class="text-sm font-semibold text-[#e9e4d8]">
                    Relatório de recuperação da sessão
                  </h2>

                  <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div class="p-3.5 rounded-lg bg-[#101517] border border-[#2a3439]">
                      <span class="text-[#a39e93] block">Tempo de retomada</span>
                      <strong class="font-mono text-base text-[#e9e4d8] mt-1 block">
                        {{ story.recoveryReport().elapsedSeconds }}s
                      </strong>
                    </div>

                    <div class="p-3.5 rounded-lg bg-[#101517] border border-[#2a3439]">
                      <span class="text-[#a39e93] block">Equipamentos verificados</span>
                      <strong class="font-mono text-base text-[#4ca975] mt-1 block">
                        {{ story.recoveryReport().verifiedDevices }} / {{ story.recoveryReport().totalDevices }}
                      </strong>
                    </div>

                    <div class="p-3.5 rounded-lg bg-[#101517] border border-[#2a3439]">
                      <span class="text-[#a39e93] block">Alertas tratados</span>
                      <strong class="font-mono text-base text-[#e9e4d8] mt-1 block">
                        {{ story.recoveryReport().alertsResolved }}
                      </strong>
                    </div>

                    <div class="p-3.5 rounded-lg bg-[#101517] border border-[#2a3439]">
                      <span class="text-[#a39e93] block">Queda do risco médio (IRT)</span>
                      <strong class="font-mono text-base text-[#4ca975] mt-1 block">
                        {{ story.recoveryReport().riskBefore }} → {{ story.recoveryReport().riskAfter }}
                      </strong>
                    </div>

                    <div class="p-3.5 rounded-lg bg-[#101517] border border-[#2a3439] sm:col-span-2">
                      <span class="text-[#a39e93] block">Decisões XAI (certas vs. revisadas)</span>
                      <strong class="font-mono text-base text-[#e9e4d8] mt-1 block">
                        {{ story.recoveryReport().xaiCorrect }} certas · {{ story.recoveryReport().xaiWrong }} revisadas
                      </strong>
                    </div>
                  </div>
                </div>

                <!-- Botões finais exigidos: "Ver a cidade" e "Recomeçar" -->
                <div class="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    (click)="story.enterFreeExplore()"
                    class="px-5 py-2.5 rounded-lg bg-[#4ca975] hover:bg-[#5bb884] text-[#101517] font-semibold text-sm transition-colors cursor-pointer"
                  >
                    Ver a cidade
                  </button>

                  <button
                    type="button"
                    (click)="story.reset()"
                    class="px-4 py-2.5 rounded-lg bg-[#101517] hover:bg-[#232c30] text-[#e9e4d8] border border-[#2a3439] text-sm font-medium transition-colors cursor-pointer"
                  >
                    Recomeçar
                  </button>
                </div>
              </div>
            </section>
          }
        }
      </main>

      <!-- ===================================================================== -->
      <!-- RODAPÉ FIXO: MODO BANCA (BARRA DE CENÁRIOS + RODAR HISTÓRIA COMPLETA) -->
      <!-- ===================================================================== -->
      <footer class="fixed bottom-0 left-0 right-0 z-50 bg-[#101517]/95 backdrop-blur-md border-t border-[#2a3439] px-4 py-2 shadow-2xl">
        <div class="max-w-[1800px] mx-auto flex flex-col gap-1.5">
          <!-- Legenda ao vivo durante a demonstração automática -->
          @if (story.isDemoRunning() || story.demoSubtitle()) {
            <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded bg-[#1a2124] border border-[#ff7a3d]/40 text-xs">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-[#ff7a3d]"></span>
                <strong class="text-[#ff7a3d]">Demonstração guiada ({{ story.demoProgressPct() }}%):</strong>
                <span class="text-[#e9e4d8]">{{ story.demoSubtitle() }}</span>
              </div>
              <div class="flex items-center gap-2">
                @if (story.isDemoRunning()) {
                  <button
                    type="button"
                    (click)="story.togglePauseDemo()"
                    class="px-2.5 py-0.5 rounded bg-[#101517] hover:bg-[#232c30] text-[#e9e4d8] border border-[#2a3439] font-medium cursor-pointer"
                  >
                    {{ story.isDemoPaused() ? 'Continuar' : 'Pausar' }}
                  </button>
                  <button
                    type="button"
                    (click)="story.stopDemo()"
                    class="px-2 py-0.5 rounded bg-[#101517] hover:bg-[#232c30] text-[#a39e93] border border-[#2a3439] cursor-pointer"
                  >
                    Encerrar demo
                  </button>
                }
              </div>
            </div>
          }

          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2 text-xs">
              <span class="w-2 h-2 rounded-full bg-[#ff7a3d]"></span>
              <strong class="text-[#e9e4d8] font-medium">Modo banca e cenários de estresse:</strong>
              <span class="hidden md:inline text-[#a39e93]">
                Disponíveis em qualquer ato para inspeção imediata
              </span>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                (click)="story.runFullStory()"
                class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#ff7a3d] hover:bg-[#ff8b55] text-[#101517] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <svg lucideIcon="zap" class="w-3.5 h-3.5"></svg>
                <span>Rodar a história completa</span>
              </button>

              <button
                type="button"
                (click)="triggerRainScenario()"
                class="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1a2124] hover:bg-[#232c30] text-[#e9e4d8] border border-[#2a3439] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <svg lucideIcon="cloud-rain-wind" class="w-3.5 h-3.5 text-[#d99b38]"></svg>
                <span>Simular chuva torrencial</span>
              </button>

              <button
                type="button"
                (click)="triggerRadarTheftScenario()"
                class="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1a2124] hover:bg-[#232c30] text-[#e9e4d8] border border-[#2a3439] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <svg lucideIcon="shield-alert" class="w-3.5 h-3.5 text-[#8c6bb1]"></svg>
                <span>Simular furto de radar</span>
              </button>

              <button
                type="button"
                (click)="story.reset()"
                class="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1a2124] hover:bg-[#232c30] text-[#a39e93] hover:text-[#e9e4d8] border border-[#2a3439] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <svg lucideIcon="rotate-ccw" class="w-3.5 h-3.5"></svg>
                <span>Resetar dados</span>
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  `,
})
export class AppComponent {
  readonly inventory = inject(DeviceInventoryService);
  readonly story = inject(StoryService);
  readonly copy = PROMETHEUS_COPY;
  readonly activeTab = signal<ActiveModuleTab>('ops');

  constructor() {
    effect(() => {
      const req = this.story.requestedTab();
      if (req) {
        this.activeTab.set(req.tab);
      }
    });
  }

  triggerRainScenario(): void {
    if (this.story.act() === 1) {
      this.story.startProtocol();
    }
    this.inventory.simulateTorrentialRain();
    this.activeTab.set('ops');
  }

  triggerRadarTheftScenario(): void {
    if (this.story.act() === 1) {
      this.story.startProtocol();
    }
    this.inventory.simulateRadarTheft();
    this.activeTab.set('ops');
  }

  jumpToDeviceFromBanner(deviceId: string): void {
    this.activeTab.set('ops');
    this.inventory.focusOnDevice(deviceId, 16);
  }
}
