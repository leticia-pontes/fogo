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
  // Elemento em bloco: assim o espaçamento vertical da página (space-y-4) vale para o card.
  host: { class: 'block' },
  template: `
    <section
      class="bg-fogo-panel border rounded-xl overflow-hidden"
      [class]="bulletin()?.sobControle === false ? 'border-fogo-ember/50' : 'border-fogo-border'"
      aria-label="Boletim da PROMETHEUS"
    >
      <header class="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5" [class.border-b]="open()" [class.border-fogo-border]="open()">
        <div class="flex flex-wrap items-center gap-2.5 min-w-0">
          <button
            type="button"
            (click)="open.set(!open())"
            [attr.aria-expanded]="open()"
            aria-controls="bulletin-body"
            class="flex items-center gap-2 cursor-pointer hover:text-fogo-ember"
            [title]="open() ? 'Recolher boletim' : 'Expandir boletim'"
          >
            <span class="text-fogo-muted w-3">{{ open() ? '▾' : '▸' }}</span>
            <span class="w-2 h-2 rounded-full shrink-0" [class]="bulletin()?.sobControle ? 'bg-fogo-green' : 'bg-fogo-ember animate-pulse'"></span>
            <h2 class="font-semibold text-sm">Boletim da PROMETHEUS</h2>
          </button>
          @if (bulletin(); as b) {
            <span
              class="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border"
              [class]="b.sobControle ? 'text-fogo-green border-fogo-green/50' : 'text-fogo-ember border-fogo-ember/50'"
            >
              {{ b.sobControle ? 'Sob controle' : 'Atenção necessária' }}
            </span>
          }
          @if (!open() && bulletin(); as b) {
            <span class="text-xs text-fogo-muted">
              Disponibilidade <b class="text-fogo-sand font-mono">{{ fmt(b.numeros.disponibilidadePct) }}%</b> ·
              <b class="font-mono" [class]="b.numeros.alertasCriticos ? 'text-fogo-red' : 'text-fogo-green'">{{ b.numeros.alertasCriticos }}</b> alerta(s) crítico(s) ·
              <b class="text-fogo-sand font-mono">{{ b.regioes.length }}</b> região(ões) em atenção
            </span>
          }
          <span class="text-xs text-fogo-muted">{{ updatedAt() }}</span>
        </div>
        <div class="flex flex-wrap gap-1.5 text-xs">
          <button type="button" class="btn" (click)="open.set(!open())" [attr.aria-expanded]="open()" aria-controls="bulletin-body">
            {{ open() ? '▴ Recolher' : '▾ Expandir' }}
          </button>
          <button type="button" class="btn" (click)="refresh()" [disabled]="busy()">↻ Atualizar</button>
          <button type="button" class="btn" (click)="copy()" [disabled]="!bulletin()">{{ copied() ? 'Copiado ✓' : 'Copiar' }}</button>
          <button type="button" class="btn" (click)="download()" [disabled]="!bulletin()">Exportar .txt</button>
          @if (voice.canSpeak) {
            <button type="button" class="btn" (click)="listen()" [disabled]="!bulletin()">{{ voice.speaking() ? '■ Parar' : '▶ Ouvir' }}</button>
          }
        </div>
      </header>

      @if (!open()) {
        <!-- Recolhido: só o cabeçalho com o resumo. -->
      } @else if (bulletin(); as b) {
        <div id="bulletin-body" class="p-4 space-y-3">
          <!-- Abertura + números-chave -->
          <p class="text-sm italic text-fogo-sand/90">“{{ section(b, 'Abertura') }} {{ remark(b) }}”</p>
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <div class="metric">
              <span class="metric-label">Disponibilidade</span>
              <strong class="metric-value" [class]="b.numeros.disponibilidadePct >= 85 ? 'text-fogo-green' : b.numeros.disponibilidadePct >= 70 ? 'text-fogo-amber' : 'text-fogo-red'">
                {{ fmt(b.numeros.disponibilidadePct) }}%
              </strong>
              <span class="metric-sub">{{ b.numeros.operacionais }} de {{ b.numeros.instalados }} instalados · {{ b.numeros.agentesAtivos }} agentes</span>
            </div>
            <div class="metric">
              <span class="metric-label">Alertas críticos</span>
              <strong class="metric-value" [class]="b.numeros.alertasCriticos ? 'text-fogo-red' : 'text-fogo-green'">{{ b.numeros.alertasCriticos }}</strong>
              <span class="metric-sub">furto ou falha grave</span>
            </div>
            <div class="metric">
              <span class="metric-label">Preventivas em 48 h</span>
              <strong class="metric-value" [class]="b.numeros.manutencoes48h ? 'text-fogo-amber' : 'text-fogo-green'">{{ b.numeros.manutencoes48h }}</strong>
              <span class="metric-sub">vencem até depois de amanhã</span>
            </div>
            <div class="metric">
              <span class="metric-label">Cobertura</span>
              <strong class="metric-value text-fogo-blue">{{ fmt(b.numeros.coberturaPct) }}%</strong>
              <span class="metric-sub">{{ b.numeros.pontosCegos }} pontos cegos de 250 m</span>
            </div>
          </div>

          <!-- Destaques: regiões e próxima ação -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div class="block-card">
              <p class="block-title">Regiões que exigem atenção</p>
              @for (r of b.regioes; track r.bairro) {
                <div class="flex items-start gap-2 text-xs py-1 border-t border-fogo-border/50 first-of-type:border-t-0">
                  <span class="risk-pill" [class]="r.nivel === 'ALTO' ? 'text-fogo-red border-fogo-red/50' : r.nivel === 'MEDIO' ? 'text-fogo-amber border-fogo-amber/50' : 'text-fogo-green border-fogo-green/50'">
                    {{ r.risco }}
                  </span>
                  <div class="min-w-0">
                    <p class="font-semibold text-sm">{{ r.bairro }} <span class="font-normal text-fogo-muted text-xs">· saúde {{ r.saude }} · risco {{ levelLabel[r.nivel] }}</span></p>
                    <p class="text-fogo-muted">{{ r.motivo }}</p>
                  </div>
                </div>
              } @empty {
                <p class="text-xs text-fogo-green">Nenhum bairro com risco alto ou saúde baixa.</p>
              }
            </div>
            <div class="block-card border-fogo-ember/40">
              <p class="block-title text-fogo-ember">Próxima melhor ação</p>
              <p class="text-sm">{{ section(b, 'Próxima melhor ação') }}</p>
              <p class="block-title mt-3">Previsão para o próximo período</p>
              <p class="text-sm">{{ section(b, 'Previsão para o próximo período') }}</p>
            </div>
          </div>

          <!-- Detalhes -->
          <button type="button" (click)="expanded.set(!expanded())" [attr.aria-expanded]="expanded()" class="text-xs text-fogo-muted hover:text-fogo-sand cursor-pointer">
            {{ expanded() ? '▾ Ocultar detalhes' : '▸ Ver detalhes (alertas, manutenções, pontos cegos)' }}
          </button>
          @if (expanded()) {
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              @for (title of detailSections; track title) {
                @if (section(b, title); as text) {
                  <div class="block-card">
                    <p class="block-title">{{ title }}</p>
                    <p class="text-xs leading-relaxed">{{ text }}</p>
                  </div>
                }
              }
            </div>
          }
        </div>
      } @else {
        <p class="px-4 py-3 text-sm text-fogo-muted">Gerando boletim…</p>
      }
    </section>
  `,
  styles: `
    .btn { @apply py-1 px-2.5 rounded-lg bg-fogo-bg border border-fogo-border hover:border-fogo-ember cursor-pointer disabled:opacity-40; }
    .metric { @apply bg-fogo-bg border border-fogo-border rounded-lg px-3 py-2 flex flex-col; }
    .metric-label { @apply text-[11px] uppercase tracking-wide text-fogo-muted; }
    .metric-value { @apply text-xl font-semibold font-mono leading-tight; }
    .metric-sub { @apply text-[11px] text-fogo-muted; }
    .block-card { @apply bg-fogo-bg border border-fogo-border rounded-lg p-3; }
    .block-title { @apply text-[11px] uppercase tracking-wide font-semibold text-fogo-muted mb-1.5; }
    .risk-pill { @apply shrink-0 w-9 text-center font-mono font-bold text-xs py-0.5 rounded border mt-0.5; }
  `,
})
export class BulletinCardComponent {
  private readonly city = inject(CityStateService);
  readonly voice = inject(VoiceAgentService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly bulletin = signal<Bulletin | null>(null);
  /** Card recolhido por padrão: só o cabeçalho com o resumo. */
  readonly open = signal(false);
  /** Detalhes extras (alertas, manutenções, pontos cegos) dentro do card aberto. */
  readonly expanded = signal(false);
  readonly busy = signal(false);
  readonly copied = signal(false);
  readonly updatedAt = signal('');

  readonly detailSections = ['Alertas críticos', 'Manutenções nas próximas 48 h', 'Pontos cegos'];
  readonly levelLabel = { BAIXO: 'baixo', MEDIO: 'médio', ALTO: 'ALTO' } as const;

  section(b: Bulletin, title: string): string {
    return b.secoes.find((s) => s.titulo === title)?.linhas.join(' ') ?? '';
  }

  /** Comentário da PROMETHEUS sobre a disponibilidade (última frase da seção) ou "tudo sob controle". */
  remark(b: Bulletin): string {
    if (b.sobControle) return this.section(b, 'Situação');
    const text = this.section(b, 'Disponibilidade');
    return text.slice(text.indexOf('. ') + 2);
  }

  fmt(n: number): string {
    return n.toLocaleString('pt-BR');
  }

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
