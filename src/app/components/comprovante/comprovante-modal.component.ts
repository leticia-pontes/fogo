import { AfterViewInit, Component, ElementRef, OnDestroy, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { Comprovante } from '../../core/comprovante';
import { gerarQrCode, qrCodeSvgPath } from '../../core/qrcode';
import { ComprovanteTicketComponent } from './comprovante-ticket.component';

const FOCAVEIS = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Modal do comprovante (sem biblioteca de diálogo): quem renderiza controla a abertura por signal.
 * Foco inicial no botão principal, foco preso no modal, ESC fecha e o foco volta para quem abriu.
 */
@Component({
  selector: 'app-comprovante-modal',
  standalone: true,
  imports: [ComprovanteTicketComponent],
  template: `
    <div class="cm-overlay" (click)="onOverlay($event)">
      <div
        #dialog
        class="cm-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cm-title"
        (keydown)="onKeydown($event)"
      >
        <header class="cm-head">
          <h2 id="cm-title">Comprovante de ocorrência</h2>
          <button type="button" class="cm-close" aria-label="Fechar comprovante" (click)="fechar.emit()">✕</button>
        </header>
        <div class="cm-body">
          <app-comprovante-ticket class="cm-ticket" [comprovante]="comprovante()" />
        </div>
        <footer class="cm-foot">
          <div class="cm-qr">
            @if (qr(); as q) {
              <a [href]="linkCelular()" target="_blank" rel="noopener" class="cm-qr-code" aria-label="QR Code: abrir o comprovante no celular">
                <svg [attr.viewBox]="'0 0 ' + q.tamanho + ' ' + q.tamanho" width="112" height="112" shape-rendering="crispEdges" aria-hidden="true">
                  <rect [attr.width]="q.tamanho" [attr.height]="q.tamanho" fill="#fff" />
                  <path [attr.d]="q.d" fill="#000" />
                </svg>
              </a>
              <p class="cm-qr-text">Aponte a câmera do celular para baixar o comprovante. O celular precisa estar na mesma rede Wi-Fi.</p>
            } @else {
              <p class="cm-qr-text">QR Code para o celular disponível com o servidor conectado.</p>
            }
          </div>
          <div class="cm-actions">
            <button #primary type="button" class="cm-btn cm-primary" (click)="imprimir()">Imprimir ou salvar PDF</button>
            <button type="button" class="cm-btn cm-secondary" (click)="copiar()" aria-live="polite">{{ copiado() ? 'Copiado!' : 'Copiar texto' }}</button>
          </div>
        </footer>
      </div>
    </div>
  `,
  styles: `
    :host { --ticket-fundo: #090e14; }
    .cm-overlay {
      position: fixed;
      inset: 0;
      z-index: 2000;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(5, 8, 12, 0.82);
    }
    .cm-box {
      width: 520px;
      max-width: calc(100vw - 32px);
      background: var(--ticket-fundo);
      border: 1px solid #223244;
      border-radius: 16px;
      color: #e8e4da;
      display: flex;
      flex-direction: column;
    }
    .cm-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 8px 8px 20px; }
    .cm-head h2 { margin: 0; font-size: 15px; font-weight: 600; }
    .cm-close {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: transparent;
      border: 0;
      color: inherit;
      font-size: 18px;
      cursor: pointer;
    }
    .cm-close:hover, .cm-close:focus-visible { background: #15202c; }
    .cm-body { overflow-y: auto; max-height: calc(90vh - 230px); padding: 8px 0 16px; display: flex; justify-content: center; }
    .cm-ticket { animation: cm-print 700ms ease-out both; }
    .cm-foot { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: center; padding: 14px 20px 18px; border-top: 1px solid #223244; }
    .cm-qr { display: flex; align-items: center; gap: 12px; }
    .cm-qr-code { flex-shrink: 0; display: block; line-height: 0; border-radius: 6px; overflow: hidden; }
    .cm-qr-code:focus-visible { outline: 2px solid #ffb547; outline-offset: 2px; }
    .cm-qr-text { margin: 0; font-size: 12px; line-height: 1.4; color: #9aa7b5; }
    .cm-actions { display: grid; gap: 10px; }
    .cm-btn { min-height: 48px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; }
    .cm-primary { background: #ffb547; color: #1b1203; border: 0; }
    .cm-primary:hover { background: #ffc46b; }
    .cm-secondary { background: transparent; color: #e8e4da; border: 1px solid #3a4b5e; }
    .cm-secondary:hover { border-color: #ffb547; }
    .cm-btn:focus-visible, .cm-close:focus-visible { outline: 2px solid #ffb547; outline-offset: 2px; }
    @keyframes cm-print {
      from { clip-path: inset(0 0 100% 0); transform: translateY(-12px); }
      to { clip-path: inset(0); transform: translateY(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .cm-ticket { animation: none; }
    }
  `,
})
export class ComprovanteModalComponent implements AfterViewInit, OnDestroy {
  readonly comprovante = input.required<Comprovante>();
  /** Link da página do comprovante na rede local; sem ele (modo offline), não há QR Code. */
  readonly linkCelular = input<string | null>(null);
  readonly fechar = output<void>();

  readonly qr = computed(() => {
    const link = this.linkCelular();
    try {
      return link ? qrCodeSvgPath(gerarQrCode(link)) : null;
    } catch {
      return null; // link longo demais para o QR (ex.: FOGO_URL_PUBLICA extensa): fica só a impressão
    }
  });

  readonly copiado = signal(false);
  private readonly dialog = viewChild.required<ElementRef<HTMLElement>>('dialog');
  private readonly primary = viewChild.required<ElementRef<HTMLButtonElement>>('primary');
  private readonly abridor = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
  private copiadoTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  ngAfterViewInit(): void {
    this.primary().nativeElement.focus();
  }

  ngOnDestroy(): void {
    clearTimeout(this.copiadoTimer);
    if (this.abridor?.isConnected) this.abridor.focus();
  }

  onKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      this.fechar.emit();
      return;
    }
    if (ev.key !== 'Tab') return;
    const itens = Array.from(this.dialog().nativeElement.querySelectorAll<HTMLElement>(FOCAVEIS));
    if (!itens.length) return;
    const primeiro = itens[0];
    const ultimo = itens[itens.length - 1];
    if (ev.shiftKey && document.activeElement === primeiro) {
      ev.preventDefault();
      ultimo.focus();
    } else if (!ev.shiftKey && document.activeElement === ultimo) {
      ev.preventDefault();
      primeiro.focus();
    }
  }

  onOverlay(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) this.fechar.emit();
  }

  imprimir(): void {
    this.prepararImpressao();
    window.print();
  }

  /**
   * Copia o cupom para um contêiner filho direto do body: na impressão todo o resto vira display:none
   * (uma página só, sem disputar especificidade com o layout do painel). Desfeito no afterprint.
   */
  prepararImpressao(): void {
    document.querySelector('.comprovante-print-root')?.remove();
    const ticket = this.host.nativeElement.querySelector('app-comprovante-ticket');
    if (!ticket) return;
    const root = document.createElement('div');
    root.className = 'comprovante-print-root';
    root.appendChild(ticket.cloneNode(true));
    document.body.appendChild(root);
    document.body.classList.add('imprimindo-comprovante');
    const limpar = () => {
      root.remove();
      document.body.classList.remove('imprimindo-comprovante');
      window.removeEventListener('afterprint', limpar);
    };
    window.addEventListener('afterprint', limpar);
  }

  async copiar(): Promise<void> {
    try {
      if (!navigator.clipboard?.writeText) return;
      await navigator.clipboard.writeText(this.comprovante().textoPlano);
      this.copiado.set(true);
      clearTimeout(this.copiadoTimer);
      this.copiadoTimer = setTimeout(() => this.copiado.set(false), 2000);
    } catch {
      // Sem permissão de área de transferência: falha silenciosa.
    }
  }
}
