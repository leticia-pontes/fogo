import { Component, PLATFORM_ID, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { calcularRisco } from '../../core/analysis';
import { Bulletin, gerarBoletim } from '../../core/bulletin';
import { api } from '../../services/api';
import { CityStateService } from '../../services/city-state.service';
import { VoiceAgentService } from '../../services/voice-agent.service';

const REFRESH_DEBOUNCE_MS = 800;

/** Card "Boletim da PROMETHEUS": resumo em texto que acompanha cenários e ações aplicadas. */
@Component({
  selector: 'app-bulletin-card',
  standalone: true,
  template: `
    <section class="bg-fogo-panel border rounded-xl" [class]="bulletin()?.sobControle === false ? 'border-fogo-ember/50' : 'border-fogo-border'" aria-label="Boletim da PROMETHEUS">
      <header class="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-fogo-border">
        <button type="button" (click)="expanded.set(!expanded())" [attr.aria-expanded]="expanded()" class="flex items-center gap-2 font-semibold text-sm cursor-pointer">
          <span class="w-2 h-2 rounded-full" [class]="bulletin()?.sobControle ? 'bg-fogo-green' : 'bg-fogo-ember animate-pulse'"></span>
          Boletim da PROMETHEUS
          <span class="text-xs text-fogo-muted font-normal">{{ updatedAt() }} · {{ expanded() ? 'recolher ▾' : 'expandir ▸' }}</span>
        </button>
        <div class="flex gap-1.5 text-xs">
          <button type="button" class="btn" (click)="refresh()" [disabled]="busy()">Atualizar boletim</button>
          <button type="button" class="btn" (click)="copy()" [disabled]="!bulletin()">{{ copied() ? 'Copiado ✓' : 'Copiar' }}</button>
          <button type="button" class="btn" (click)="download()" [disabled]="!bulletin()">Exportar .txt</button>
          @if (voice.canSpeak) {
            <button type="button" class="btn" (click)="listen()" [disabled]="!bulletin()">{{ voice.speaking() ? 'Parar' : 'Ouvir' }}</button>
          }
        </div>
      </header>
      @if (bulletin(); as b) {
        <div class="px-4 py-3 text-sm space-y-1.5 overflow-y-auto" [class]="expanded() ? 'max-h-[420px]' : 'max-h-[86px]'">
          @for (s of b.secoes; track s.titulo) {
            <p>
              @if (s.titulo !== 'Abertura') {
                <b class="text-fogo-ember">{{ s.titulo }}:</b>
              }
              {{ s.linhas.join(' ') }}
            </p>
          }
        </div>
      } @else {
        <p class="px-4 py-3 text-sm text-fogo-muted">Gerando boletim…</p>
      }
    </section>
  `,
  styles: `
    .btn { @apply py-1 px-2.5 rounded-lg bg-fogo-bg border border-fogo-border hover:border-fogo-ember cursor-pointer disabled:opacity-40; }
  `,
})
export class BulletinCardComponent {
  private readonly city = inject(CityStateService);
  readonly voice = inject(VoiceAgentService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly bulletin = signal<Bulletin | null>(null);
  readonly expanded = signal(false);
  readonly busy = signal(false);
  readonly copied = signal(false);
  readonly updatedAt = signal('');

  constructor() {
    // Acompanha o estado: cenário de crise, ação aplicada ou telemetria refazem o boletim.
    effect(() => {
      this.city.equipment();
      this.city.agents();
      this.city.peakSurge();
      if (this.city.mode() === 'loading' || !this.isBrowser) return;
      untracked(() => {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.refresh(), REFRESH_DEBOUNCE_MS);
      });
    });
  }

  async refresh(): Promise<void> {
    this.busy.set(true);
    try {
      if (this.city.mode() === 'online') {
        this.bulletin.set(await api<Bulletin>('GET', '/boletim'));
      } else {
        const state = this.city.snapshot();
        this.bulletin.set(gerarBoletim(state, calcularRisco(state), new Date()));
      }
      this.updatedAt.set(`atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
    } catch {
      // Mantém o último boletim; o próximo evento tenta de novo.
    } finally {
      this.busy.set(false);
    }
  }

  async copy(): Promise<void> {
    const b = this.bulletin();
    if (!b) return;
    try {
      await navigator.clipboard.writeText(b.texto);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.download();
    }
  }

  download(): void {
    const b = this.bulletin();
    if (!b) return;
    const url = URL.createObjectURL(new Blob([b.texto], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `boletim-prometheus-${b.geradoEm.slice(0, 16).replace(/[:T]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  listen(): void {
    const b = this.bulletin();
    if (!b) return;
    if (this.voice.speaking()) this.voice.stopSpeaking();
    else this.voice.speak(b.texto);
  }
}
