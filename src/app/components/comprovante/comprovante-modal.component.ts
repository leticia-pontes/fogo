import { AfterViewInit, Component, ElementRef, OnDestroy, input, output, signal, viewChild } from '@angular/core';
import { Comprovante } from '../../core/comprovante';
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
          <app-comprovante-ticket class="cm-ticket comprovante-print" [comprovante]="comprovante()" />
        </div>
        <footer class="cm-foot">
          <button #primary type="button" class="cm-btn cm-primary" (click)="imprimir()">Imprimir ou salvar PDF</button>
          <button type="button" class="cm-btn cm-secondary" (click)="copiar()" aria-live="polite">{{ copiado() ? 'Copiado!' : 'Copiar texto' }}</button>
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
    .cm-body { overflow-y: auto; max-height: calc(90vh - 130px); padding: 8px 0 16px; display: flex; justify-content: center; }
    .cm-ticket { animation: cm-print 700ms ease-out both; }
    .cm-foot { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 12px 20px 20px; border-top: 1px solid #223244; }
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
  readonly fechar = output<void>();

  readonly copiado = signal(false);
  private readonly dialog = viewChild.required<ElementRef<HTMLElement>>('dialog');
  private readonly primary = viewChild.required<ElementRef<HTMLButtonElement>>('primary');
  private readonly abridor = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
  private copiadoTimer: ReturnType<typeof setTimeout> | undefined;

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
    window.print();
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
