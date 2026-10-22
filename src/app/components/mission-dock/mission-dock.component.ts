import { Component, inject } from '@angular/core';
import { MissionService, MissionStep } from '../../services/mission.service';

@Component({
  selector: 'app-mission-dock',
  standalone: true,
  template: `
    @if (mission.phase() === 'calibration') {
      @if (mission.minimized()) {
        <button
          type="button"
          (click)="mission.minimized.set(false)"
          class="fixed bottom-4 left-4 z-[1140] px-4 py-2 rounded-full bg-fogo-panel border border-fogo-ember/60 shadow-xl text-sm font-semibold text-fogo-ember cursor-pointer hover:bg-[#222b2f]"
          aria-label="Abrir protocolo de calibração"
        >
          Calibração {{ mission.step() }}/3
        </button>
      } @else {
        <section
          class="fixed bottom-4 left-4 z-[1140] w-[360px] max-w-[calc(100vw-2rem)] bg-fogo-panel/95 backdrop-blur-md border border-fogo-ember/50 rounded-xl shadow-2xl p-4 space-y-3"
          aria-labelledby="mission-title"
          aria-live="polite"
        >
          <header class="flex items-start justify-between gap-2">
            <div>
              <p class="text-[11px] uppercase tracking-wider text-fogo-ember font-semibold">
                Protocolo de Calibração · Passo {{ mission.step() }}/3
              </p>
              <h2 id="mission-title" class="text-base font-semibold">{{ mission.current().title }}</h2>
              <p class="text-xs text-fogo-muted">{{ mission.current().module }}</p>
            </div>
            <button
              type="button"
              (click)="mission.minimized.set(true)"
              class="text-fogo-muted hover:text-fogo-sand cursor-pointer px-1"
              aria-label="Minimizar calibração"
            >
              –
            </button>
          </header>

          <div class="flex gap-1.5" aria-hidden="true">
            @for (s of steps; track s) {
              <span
                class="h-1 flex-1 rounded-full"
                [class]="s < mission.step() ? 'bg-fogo-green' : s === mission.step() ? 'bg-fogo-ember' : 'bg-fogo-border'"
              ></span>
            }
          </div>

          <p class="text-sm leading-relaxed">{{ mission.current().text }}</p>

          <div class="flex items-center gap-2">
            <button
              type="button"
              (click)="mission.runStepAction()"
              class="flex-1 py-2 px-3 rounded-lg bg-fogo-ember hover:brightness-110 text-fogo-bg text-sm font-semibold cursor-pointer"
            >
              {{ mission.current().action }}
            </button>
            @if (mission.step() < 3) {
              <button
                type="button"
                (click)="mission.advance()"
                class="py-2 px-3 rounded-lg bg-fogo-bg border border-fogo-border text-sm text-fogo-muted hover:text-fogo-sand cursor-pointer"
              >
                Avançar ›
              </button>
            }
          </div>

          <button
            type="button"
            (click)="mission.skip()"
            class="w-full text-center text-xs text-fogo-muted hover:text-fogo-sand cursor-pointer"
          >
            Pular Calibração / Modo Livre
          </button>
        </section>
      }
    }
  `,
})
export class MissionDockComponent {
  readonly mission = inject(MissionService);
  readonly steps: MissionStep[] = [1, 2, 3];
}
