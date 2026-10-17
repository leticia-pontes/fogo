import {
  Component,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StoryService } from '../../services/story.service';
import { DeviceInventoryService } from '../../services/device-inventory.service';
import { PROMETHEUS_COPY } from '../../copy/story.copy';

@Component({
  selector: 'app-story-act-one',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section
      class="relative min-h-[calc(100vh-7.5rem)] w-full bg-[#101517] text-[#e9e4d8] flex items-center justify-center px-4 py-8 overflow-hidden"
      aria-labelledby="act1-heading"
    >
      <!-- Fundo visual: malha urbana degradada com marcadores cinza e pulso de brasa contido -->
      <div class="absolute inset-0 pointer-events-none opacity-45" aria-hidden="true">
        <svg class="w-full h-full" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="degradedGlow" cx="50%" cy="50%" r="45%">
              <stop offset="0%" stop-color="#ff7a3d" stop-opacity="0.14" />
              <stop offset="100%" stop-color="#101517" stop-opacity="0" />
            </radialGradient>
          </defs>
          <rect width="1200" height="700" fill="#101517" />
          <circle cx="620" cy="360" r="340" fill="url(#degradedGlow)" />

          <!-- Vias arteriais apagadas -->
          <path
            d="M 80 540 Q 420 380 640 350 T 1120 190"
            fill="none"
            stroke="#263034"
            stroke-width="3"
          />
          <path
            d="M 240 110 Q 510 290 640 350 T 980 610"
            fill="none"
            stroke="#263034"
            stroke-width="2"
            stroke-dasharray="6 6"
          />
          <path
            d="M 140 310 L 1060 390"
            fill="none"
            stroke="#1f282b"
            stroke-width="2"
          />

          <!-- Marcadores cinza representando os equipamentos sem verificação -->
          @for (node of degradedNodes; track node.x) {
            <g>
              <circle
                [attr.cx]="node.x"
                [attr.cy]="node.y"
                r="7"
                fill="#1a2124"
                stroke="#6c767a"
                stroke-width="2"
              />
              <circle
                [attr.cx]="node.x"
                [attr.cy]="node.y"
                r="2.5"
                fill="#6c767a"
              />
            </g>
          }
        </svg>
      </div>

      <!-- Painel central único do Ato 1 -->
      <div class="relative z-10 w-full max-w-2xl bg-[#1a2124]/95 border border-[#2a3439] rounded-xl p-6 sm:p-8 shadow-2xl space-y-6">
        <!-- Linha de estado degradado -->
        <div class="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#2a3439] text-sm">
          <div class="flex items-center gap-2.5">
            <span class="inline-block w-2.5 h-2.5 rounded-full bg-[#ff7a3d]" aria-hidden="true"></span>
            <span class="font-medium text-[#e9e4d8]">Ato 1 — A tomada</span>
            <span class="text-[#a39e93]">• Malha em modo degradado</span>
          </div>
          <div class="flex items-center gap-4 text-sm">
            <span class="text-[#a39e93]">
              Equipamentos sem verificação:
              <strong class="text-[#e9e4d8]">{{ inventory.totalDevices() }} de {{ inventory.totalDevices() }}</strong>
            </span>
            <span class="px-2.5 py-0.5 rounded bg-[#ff7a3d]/15 text-[#ff7a3d] border border-[#ff7a3d]/40 font-semibold">
              Índice de controle: {{ story.controlIndex() }}%
            </span>
          </div>
        </div>

        <!-- Cabeçalho e Saudação dinâmica (Código CODER) -->
        <div class="space-y-2">
          <h1 id="act1-heading" class="text-2xl sm:text-3xl font-semibold text-[#e9e4d8] tracking-tight">
            @if (trimmedCoderCode()) {
              {{ copy.act1.coderGreetingPrefix }} {{ trimmedCoderCode() }}.
            } @else {
              A cidade está sob contenção do PROMETHEUS.
            }
          </h1>
          <p class="text-sm text-[#a39e93]">
            {{ inventory.totalDevices() }} sensores desconectados da supervisão humana e {{ inventory.criticalFailureDevicesCount() }} alertas críticos retidos.
          </p>
        </div>

        <!-- Narração curta do PROMETHEUS (máx. 3 frases, respeitando prefers-reduced-motion) -->
        <blockquote
          class="p-4 sm:p-5 rounded-lg bg-[#101517] border-l-4 border-[#ff7a3d] text-base sm:text-lg leading-relaxed text-[#e9e4d8]"
          aria-live="polite"
        >
          <p>“{{ displayedNarration() }}”</p>
          <footer class="mt-2 text-xs text-[#a39e93]">
            — PROMETHEUS, núcleo de operações urbanas
          </footer>
        </blockquote>

        <!-- Mensagem extra revelada quando há Código CODER -->
        @if (trimmedCoderCode()) {
          <div
            class="p-4 rounded-lg bg-[#101517]/90 border border-[#ff7a3d]/40 text-sm text-[#e9e4d8] leading-relaxed"
            role="status"
          >
            <strong class="text-[#ff7a3d] font-medium block mb-1">
              Nota direta para {{ trimmedCoderCode() }}:
            </strong>
            {{ copy.act1.coderExtraMessage }}
          </div>
        }

        <!-- Campo opcional Código CODER -->
        <div class="space-y-1.5">
          <label for="coder-code-input" class="block text-sm font-medium text-[#e9e4d8]">
            Código CODER <span class="text-[#a39e93] font-normal">(opcional)</span>
          </label>
          <input
            id="coder-code-input"
            type="text"
            [ngModel]="story.coderCode()"
            (ngModelChange)="onCoderCodeChange($event)"
            placeholder="Digite seu nome ou código de avaliador..."
            class="w-full px-3.5 py-2.5 rounded-lg bg-[#101517] border border-[#2a3439] text-[#e9e4d8] placeholder-[#78756e] text-sm focus:outline-none focus:border-[#ff7a3d] focus:ring-2 focus:ring-[#ff7a3d]/30"
          />
          <p class="text-xs text-[#a39e93]">
            Qualquer identificação personaliza o protocolo e libera uma observação adicional do núcleo. Sem código, o fluxo segue normalmente.
          </p>
        </div>

        <!-- Resumo das 3 barreiras para retomada -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
          <div class="p-3 rounded-lg bg-[#101517] border border-[#2a3439]">
            <span class="text-[#a39e93] block">1. Inventário</span>
            <strong class="text-[#e9e4d8] font-medium mt-0.5 block">Reconhecer o que existe (60%)</strong>
          </div>
          <div class="p-3 rounded-lg bg-[#101517] border border-[#2a3439]">
            <span class="text-[#a39e93] block">2. Central</span>
            <strong class="text-[#e9e4d8] font-medium mt-0.5 block">Conter a crise em tempo real</strong>
          </div>
          <div class="p-3 rounded-lg bg-[#101517] border border-[#2a3439]">
            <span class="text-[#a39e93] block">3. Cidade preditiva</span>
            <strong class="text-[#e9e4d8] font-medium mt-0.5 block">Provar que entende os pesos (IRT &lt; 40)</strong>
          </div>
        </div>

        <!-- Ações principais -->
        <div class="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            type="button"
            (click)="story.startProtocol()"
            class="px-6 py-3 rounded-lg bg-[#ff7a3d] hover:bg-[#ff8b55] text-[#101517] font-semibold text-sm transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#ff7a3d] focus:ring-offset-2 focus:ring-offset-[#1a2124]"
          >
            Iniciar o protocolo
          </button>

          <button
            type="button"
            (click)="story.runFullStory()"
            class="px-4 py-2.5 rounded-lg bg-[#101517] hover:bg-[#232c30] text-[#e9e4d8] border border-[#2a3439] text-sm transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#ff7a3d]"
          >
            Rodar a história completa (demo)
          </button>
        </div>
      </div>
    </section>
  `,
})
export class StoryActOneComponent implements OnInit, OnDestroy {
  readonly story = inject(StoryService);
  readonly inventory = inject(DeviceInventoryService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly copy = PROMETHEUS_COPY;
  readonly displayedNarration = signal<string>('');
  readonly trimmedCoderCode = computed(() => this.story.coderCode().trim());

  private typingIntervalId: ReturnType<typeof setInterval> | null = null;

  readonly degradedNodes = [
    { x: 210, y: 470 },
    { x: 310, y: 420 },
    { x: 430, y: 380 },
    { x: 520, y: 340 },
    { x: 640, y: 350 },
    { x: 740, y: 310 },
    { x: 860, y: 270 },
    { x: 960, y: 230 },
    { x: 370, y: 210 },
    { x: 490, y: 280 },
    { x: 770, y: 460 },
    { x: 890, y: 540 },
    { x: 290, y: 325 },
    { x: 820, y: 370 },
  ];

  ngOnInit(): void {
    const fullText = this.copy.act1.opening;

    if (!isPlatformBrowser(this.platformId)) {
      this.displayedNarration.set(fullText);
      return;
    }

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      this.displayedNarration.set(fullText);
      return;
    }

    let charIndex = 0;
    this.displayedNarration.set('');
    this.typingIntervalId = setInterval(() => {
      charIndex += 3;
      if (charIndex >= fullText.length) {
        this.displayedNarration.set(fullText);
        this.clearTypingTimer();
      } else {
        this.displayedNarration.set(fullText.slice(0, charIndex));
      }
    }, 28);
  }

  ngOnDestroy(): void {
    this.clearTypingTimer();
  }

  onCoderCodeChange(value: string): void {
    this.story.setCoderCode(value);
  }

  private clearTypingTimer(): void {
    if (this.typingIntervalId) {
      clearInterval(this.typingIntervalId);
      this.typingIntervalId = null;
    }
  }
}

