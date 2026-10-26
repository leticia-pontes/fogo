import { Component, inject, signal } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { InventoryComponent } from './components/inventory/inventory.component';
import { MissionDockComponent } from './components/mission-dock/mission-dock.component';
import { OpsCenterComponent } from './components/ops-center/ops-center.component';
import { PredictiveEngineComponent } from './components/predictive-engine/predictive-engine.component';
import { VoiceAgentComponent } from './components/voice-agent/voice-agent.component';
import { CITY_NAME } from './data/city-map';
import { CityStateService } from './services/city-state.service';
import { MissionService } from './services/mission.service';
import { PredictionService } from './services/prediction.service';
import { SCENARIOS, ScenarioId, ScenarioService } from './services/scenario.service';
import { ActiveModuleTab, UiStateService } from './services/ui-state.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    LucideDynamicIcon,
    OpsCenterComponent,
    InventoryComponent,
    PredictiveEngineComponent,
    VoiceAgentComponent,
    MissionDockComponent,
  ],
  template: `
    <div class="min-h-screen flex flex-col bg-fogo-bg text-fogo-sand">
      <header class="sticky top-0 z-[1100] bg-fogo-bg/95 backdrop-blur-md border-b border-fogo-border">
        <div class="max-w-[1800px] mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-fogo-panel border border-fogo-ember/50 flex items-center justify-center">
              <svg lucideIcon="radar" class="w-5 h-5 text-fogo-ember"></svg>
            </div>
            <div>
              <p class="font-semibold text-[18px] leading-tight">F.O.G.O. – Protocolo PROMETHEUS</p>
              <p class="text-[13px] text-fogo-muted leading-tight">Ferramenta Onisciente de Gestão e Operações · {{ cityName }}</p>
            </div>
          </div>

          <nav class="flex items-center gap-1 bg-fogo-panel p-1 rounded-lg border border-fogo-border" aria-label="Módulos">
            @for (t of tabs; track t.id) {
              <button
                type="button"
                (click)="ui.activeTab.set(t.id)"
                [attr.aria-current]="ui.activeTab() === t.id ? 'page' : null"
                [class]="ui.activeTab() === t.id ? tabActive : tabIdle"
              >
                <svg [lucideIcon]="t.icon" class="w-4 h-4"></svg>
                <span>{{ t.label }}</span>
                @if (t.id === 'ops' && city.alerts().length) {
                  <span class="font-mono">({{ city.alerts().length }})</span>
                } @else if (t.id === 'predictive' && predictions.predictions().length) {
                  <span class="font-mono">({{ predictions.predictions().length }})</span>
                }
              </button>
            }
            <button
              type="button"
              (click)="ui.inventoryOpen() ? ui.closeInventory() : ui.openInventory()"
              [attr.aria-expanded]="ui.inventoryOpen()"
              [class]="ui.inventoryOpen() ? tabActive : tabIdle"
            >
              <svg lucideIcon="database" class="w-4 h-4"></svg>
              <span>Inventário</span>
            </button>
          </nav>

          <div class="flex items-center gap-4">
            @if (mission.phase() === 'free') {
              <div class="relative">
                <button
                  type="button"
                  (click)="scenarioMenu.set(!scenarioMenu())"
                  [attr.aria-expanded]="scenarioMenu()"
                  class="px-3 py-2 rounded-lg border text-[13px] font-semibold cursor-pointer"
                  [class]="mission.justCalibrated()
                    ? 'border-fogo-ember bg-fogo-ember/15 text-fogo-ember animate-pulse'
                    : 'border-fogo-border bg-fogo-panel text-fogo-sand hover:border-fogo-ember'"
                >
                  Simular Cenários (Homologação)
                </button>
                @if (scenarioMenu()) {
                  <div class="fixed inset-0 z-[1101]" (click)="scenarioMenu.set(false)" aria-hidden="true"></div>
                  <div class="absolute right-0 top-full mt-2 z-[1102] w-[340px] max-w-[calc(100vw-2rem)] bg-fogo-panel border border-fogo-border rounded-xl shadow-2xl p-2" role="menu">
                    @for (s of scenarios; track s.id) {
                      <button type="button" role="menuitem" (click)="runScenario(s.id)" class="w-full text-left p-2.5 rounded-lg hover:bg-fogo-bg cursor-pointer">
                        <p class="text-sm font-semibold">{{ s.title }}</p>
                        <p class="text-xs text-fogo-muted">{{ s.description }}</p>
                      </button>
                    }
                    <div class="border-t border-fogo-border mt-1 pt-1 flex flex-col">
                      <button type="button" role="menuitem" (click)="restore()" class="w-full text-left p-2.5 rounded-lg hover:bg-fogo-bg text-sm cursor-pointer">
                        ↺ Restaurar Estado Inicial
                      </button>
                      <button type="button" role="menuitem" (click)="restartCalibration()" class="w-full text-left p-2.5 rounded-lg hover:bg-fogo-bg text-xs text-fogo-muted cursor-pointer">
                        Refazer Protocolo de Calibração
                      </button>
                    </div>
                  </div>
                }
              </div>
            }
            <div class="flex items-center gap-2 text-[15px]">
              <span class="w-2 h-2 rounded-full" [class]="city.telemetryOn() ? 'bg-fogo-green animate-pulse' : 'bg-fogo-unverified'"></span>
              <span class="text-fogo-muted">{{ city.telemetryOn() ? 'Telemetria ao vivo' : 'Telemetria pausada' }}</span>
            </div>
          </div>
        </div>
      </header>

      <main class="flex-1">
        @switch (ui.activeTab()) {
          @case ('ops') {
            <app-ops-center />
          }
          @case ('predictive') {
            <app-predictive-engine />
          }
        }
      </main>

      <!-- Inventário em gaveta: abre sob demanda, sem espremer o mapa -->
      @if (ui.inventoryOpen()) {
        <div class="fixed inset-0 z-[1125] bg-fogo-bg/50" (click)="ui.closeInventory()" aria-hidden="true"></div>
        <aside
          class="fixed top-0 right-0 bottom-0 z-[1130] w-full max-w-5xl bg-fogo-bg border-l border-fogo-border shadow-2xl flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-labelledby="inventory-title"
        >
          <header class="px-5 py-3 border-b border-fogo-border flex items-center justify-between">
            <h2 id="inventory-title" class="text-base font-semibold">Inventário da cidade</h2>
            <button type="button" (click)="ui.closeInventory()" class="text-fogo-muted hover:text-fogo-sand cursor-pointer" aria-label="Fechar inventário">
              ✕
            </button>
          </header>
          <div class="flex-1 overflow-y-auto">
            <app-inventory />
          </div>
        </aside>
      }

      @if (ui.toast(); as t) {
        <div
          class="fixed top-20 left-1/2 -translate-x-1/2 z-[1300] px-5 py-3 rounded-xl border shadow-2xl text-sm font-semibold"
          [class]="t.tone === 'good'
            ? 'bg-fogo-green/20 border-fogo-green text-fogo-green'
            : t.tone === 'bad'
              ? 'bg-fogo-panel border-fogo-red text-fogo-sand'
              : 'bg-fogo-panel border-fogo-border text-fogo-sand'"
          role="status"
        >
          {{ t.text }}
        </div>
      }

      <app-mission-dock />
      <app-voice-agent />
    </div>
  `,
})
export class AppComponent {
  readonly city = inject(CityStateService);
  readonly predictions = inject(PredictionService);
  readonly ui = inject(UiStateService);
  readonly mission = inject(MissionService);
  private readonly scenarioService = inject(ScenarioService);

  readonly cityName = CITY_NAME;
  readonly scenarios = SCENARIOS;
  readonly scenarioMenu = signal(false);

  readonly tabActive = 'px-4 py-2 rounded-md text-[13px] font-semibold bg-fogo-ember text-fogo-bg flex items-center gap-1.5 cursor-pointer';
  readonly tabIdle = 'px-4 py-2 rounded-md text-[13px] text-fogo-muted hover:text-fogo-sand flex items-center gap-1.5 cursor-pointer';

  readonly tabs: { id: ActiveModuleTab; label: string; icon: string }[] = [
    { id: 'ops', label: 'Central de Operações', icon: 'map' },
    { id: 'predictive', label: 'Cidade Preditiva', icon: 'brain-circuit' },
  ];

  runScenario(id: ScenarioId): void {
    this.scenarioMenu.set(false);
    this.scenarioService.run(id);
  }

  restore(): void {
    this.scenarioMenu.set(false);
    this.scenarioService.restore();
  }

  restartCalibration(): void {
    this.scenarioMenu.set(false);
    this.scenarioService.restore();
    this.mission.restart();
  }
}
