import { Component, inject, signal } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { InventoryComponent } from './components/inventory/inventory.component';
import { OpsCenterComponent } from './components/ops-center/ops-center.component';
import { PredictiveEngineComponent } from './components/predictive-engine/predictive-engine.component';
import { CITY_NAME } from './data/city-map';
import { CityStateService } from './services/city-state.service';
import { PredictionService } from './services/prediction.service';

export type ActiveModuleTab = 'ops' | 'inventory' | 'predictive';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [LucideDynamicIcon, OpsCenterComponent, InventoryComponent, PredictiveEngineComponent],
  template: `
    <div class="min-h-screen flex flex-col bg-fogo-bg text-fogo-sand">
      <header class="sticky top-0 z-[1100] bg-fogo-bg/95 backdrop-blur-md border-b border-fogo-border">
        <div class="max-w-[1800px] mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-fogo-panel border border-fogo-ember/50 flex items-center justify-center">
              <svg lucideIcon="radar" class="w-4 h-4 text-fogo-ember"></svg>
            </div>
            <div>
              <p class="font-semibold text-sm leading-tight">F.O.G.O. – Protocolo PROMETHEUS</p>
              <p class="text-[11px] text-fogo-muted leading-tight">Ferramenta Onisciente de Gestão e Operações · {{ cityName }}</p>
            </div>
          </div>

          <nav class="flex items-center gap-1 bg-fogo-panel p-1 rounded-lg border border-fogo-border" aria-label="Módulos">
            @for (t of tabs; track t.id) {
              <button
                type="button"
                (click)="activeTab.set(t.id)"
                [attr.aria-current]="activeTab() === t.id ? 'page' : null"
                [class]="activeTab() === t.id
                  ? 'px-3 py-1.5 rounded-md text-xs font-semibold bg-fogo-ember text-fogo-bg flex items-center gap-1.5 cursor-pointer'
                  : 'px-3 py-1.5 rounded-md text-xs text-fogo-muted hover:text-fogo-sand flex items-center gap-1.5 cursor-pointer'"
              >
                <svg [lucideIcon]="t.icon" class="w-3.5 h-3.5"></svg>
                <span>{{ t.label }}</span>
                @if (t.id === 'ops' && city.alerts().length) {
                  <span class="font-mono">({{ city.alerts().length }})</span>
                } @else if (t.id === 'predictive' && predictions.predictions().length) {
                  <span class="font-mono">({{ predictions.predictions().length }})</span>
                }
              </button>
            }
          </nav>

          <div class="flex items-center gap-2 text-xs">
            <span class="w-2 h-2 rounded-full" [class]="city.telemetryOn() ? 'bg-fogo-green animate-pulse' : 'bg-fogo-unverified'"></span>
            <span class="text-fogo-muted">{{ city.telemetryOn() ? 'Telemetria ao vivo' : 'Telemetria pausada' }}</span>
          </div>
        </div>
      </header>

      <main class="flex-1">
        @switch (activeTab()) {
          @case ('ops') {
            <app-ops-center (editRequested)="activeTab.set('inventory')" />
          }
          @case ('inventory') {
            <app-inventory (navigateToMap)="activeTab.set('ops')" />
          }
          @case ('predictive') {
            <app-predictive-engine (navigateToMap)="activeTab.set('ops')" />
          }
        }
      </main>
    </div>
  `,
})
export class AppComponent {
  readonly city = inject(CityStateService);
  readonly predictions = inject(PredictionService);
  readonly cityName = CITY_NAME;
  readonly activeTab = signal<ActiveModuleTab>('ops');

  readonly tabs: { id: ActiveModuleTab; label: string; icon: string }[] = [
    { id: 'ops', label: 'Central de Operações', icon: 'map' },
    { id: 'inventory', label: 'Inventário', icon: 'database' },
    { id: 'predictive', label: 'Cidade Preditiva', icon: 'brain-circuit' },
  ];
}
