import { Component, inject, signal } from '@angular/core';
import { UiStateService } from '../../services/ui-state.service';
import { VoiceAgentService } from '../../services/voice-agent.service';

@Component({
  selector: 'app-voice-agent',
  standalone: true,
  template: `
    <!-- Oculto com o inventário aberto para não cobrir os botões do formulário -->
    <div class="fixed bottom-4 right-4 z-[1150] flex flex-col items-end gap-2" [class.hidden]="ui.inventoryOpen()">
      @if (open()) {
        <section
          class="w-[340px] max-w-[calc(100vw-2rem)] bg-fogo-panel border border-fogo-border rounded-xl shadow-2xl flex flex-col max-h-[70vh]"
          aria-label="Agente de voz PROMETHEUS"
        >
          <header class="px-4 py-3 border-b border-fogo-border flex items-center justify-between gap-2">
            <div>
              <h2 class="text-sm font-semibold">PROMETHEUS · Voz</h2>
              <p class="text-xs text-fogo-muted">
                {{ voice.listening() ? 'Ouvindo…' : voice.speaking() ? 'Falando…' : 'Pronto para ouvir' }}
              </p>
            </div>
            <label class="flex items-center gap-1.5 text-xs text-fogo-muted cursor-pointer">
              <input
                type="checkbox"
                class="accent-fogo-ember"
                [checked]="voice.announcements()"
                (change)="voice.announcements.set(!voice.announcements())"
              />
              Anunciar falhas
            </label>
          </header>

          <div class="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
            @if (voice.interim()) {
              <p class="text-fogo-muted italic">“{{ voice.interim() }}”</p>
            }
            @for (ex of voice.history(); track $index) {
              <div class="space-y-1">
                <p class="text-xs text-fogo-muted">Você: {{ ex.question }}</p>
                <p class="p-2.5 rounded-lg bg-fogo-bg border border-fogo-border">{{ ex.answer }}</p>
              </div>
            } @empty {
              <div class="space-y-2">
                <p class="text-xs text-fogo-muted">Toque no microfone e pergunte, ou experimente:</p>
                <div class="flex flex-wrap gap-1.5">
                  @for (s of suggestions; track s) {
                    <button type="button" (click)="voice.ask(s)" class="px-2.5 py-1 rounded-full bg-fogo-bg border border-fogo-border text-xs hover:border-fogo-ember cursor-pointer">
                      {{ s }}
                    </button>
                  }
                </div>
              </div>
            }
            @if (voice.error(); as err) {
              <p class="text-xs text-fogo-red">{{ err }}</p>
            }
          </div>

          <form class="p-3 border-t border-fogo-border flex items-center gap-2" (submit)="submit($event, input)">
            <button
              type="button"
              (click)="voice.toggleListening()"
              [attr.aria-pressed]="voice.listening()"
              [attr.aria-label]="voice.listening() ? 'Parar de ouvir' : 'Falar com o PROMETHEUS'"
              [disabled]="!voice.canListen"
              class="shrink-0 w-10 h-10 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              [class]="voice.listening() ? 'bg-fogo-red text-fogo-sand animate-pulse' : 'bg-fogo-ember text-fogo-bg hover:brightness-110'"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </button>
            <input
              #input
              type="text"
              placeholder="Ou digite uma pergunta…"
              aria-label="Pergunta para o PROMETHEUS"
              class="flex-1 min-w-0 py-2 px-2.5 bg-fogo-bg border border-fogo-border focus:border-fogo-ember rounded-lg text-sm outline-none"
            />
          </form>
        </section>
      }

      <button
        type="button"
        (click)="open.set(!open())"
        [attr.aria-expanded]="open()"
        aria-label="Agente de voz"
        class="w-12 h-12 rounded-full bg-fogo-panel border-2 shadow-xl flex items-center justify-center cursor-pointer hover:border-fogo-ember"
        [class]="voice.speaking() || voice.listening() ? 'border-fogo-ember' : 'border-fogo-border'"
      >
        @if (open()) {
          <span class="text-fogo-muted text-lg">✕</span>
        } @else {
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff7a3d" stroke-width="2.2" stroke-linecap="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        }
      </button>
    </div>
  `,
})
export class VoiceAgentComponent {
  readonly voice = inject(VoiceAgentService);
  readonly ui = inject(UiStateService);
  readonly open = signal(false);
  readonly suggestions = [
    'Resumo da cidade',
    'Quais os alertas?',
    'Previsão mais crítica',
    'Como está o Entroncamento?',
    'Aplicar recomendação',
    'Iniciar telemetria',
  ];

  submit(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    this.voice.ask(input.value.trim());
    input.value = '';
  }
}
