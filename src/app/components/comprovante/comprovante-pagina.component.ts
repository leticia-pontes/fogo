import { Component, OnInit, signal } from '@angular/core';
import { Comprovante } from '../../core/comprovante';
import { lerComprovanteDoLink } from '../../core/comprovante-link';
import { ComprovanteTicketComponent } from './comprovante-ticket.component';

/**
 * Página do comprovante aberta pelo QR Code (`/comprovante#…`): lê os dados do próprio link, sem servidor,
 * mostra o cupom e oferece "Salvar PDF" (impressão do navegador) e "Baixar texto". Inicializada à parte em
 * `main.ts`, sem a Central, o mapa nem os serviços do painel.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ComprovanteTicketComponent],
  template: `
    @if (comprovante(); as c) {
      <app-comprovante-ticket class="cp-ticket" [comprovante]="c" />
      <div class="cp-acoes">
        <button type="button" class="cp-btn cp-principal" (click)="salvarPdf()">Salvar PDF</button>
        <button type="button" class="cp-btn cp-secundario" (click)="baixarTexto(c)">Baixar texto (.txt)</button>
      </div>
    } @else if (erro(); as e) {
      <p class="cp-erro" role="alert">{{ e }}. Peça um novo QR Code na Central.</p>
    } @else {
      <p class="cp-erro">Abrindo o comprovante…</p>
    }
  `,
  styles: `
    :host {
      --ticket-fundo: #090e14;
      box-sizing: border-box;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 16px;
      background: var(--ticket-fundo);
    }
    .cp-ticket { width: 100%; max-width: 380px; }
    .cp-ticket ::ng-deep .tk { width: 100%; }
    .cp-acoes { width: 100%; max-width: 380px; display: grid; gap: 12px; }
    .cp-btn { min-height: 48px; border-radius: 10px; font: 600 15px/1 system-ui, sans-serif; cursor: pointer; }
    .cp-principal { background: #ffb547; color: #1b1203; border: 0; }
    .cp-secundario { background: transparent; color: #e8e4da; border: 1px solid #3a4b5e; }
    .cp-erro { margin: 40px 0 0; max-width: 380px; text-align: center; color: #e8e4da; font: 14px/1.5 system-ui, sans-serif; }
    @media print {
      :host { --ticket-fundo: #fff; background: #fff; padding: 0; min-height: 0; }
      .cp-acoes { display: none; }
    }
  `,
})
export class ComprovantePaginaComponent implements OnInit {
  readonly comprovante = signal<Comprovante | null>(null);
  readonly erro = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    document.body.classList.add('pagina-comprovante');
    try {
      const c = await lerComprovanteDoLink(location.hash);
      this.comprovante.set(c);
      document.title = `Comprovante ${c.id} · F.O.G.O.`;
    } catch (err) {
      this.erro.set((err as Error).message);
    }
  }

  salvarPdf(): void {
    window.print();
  }

  baixarTexto(c: Comprovante): void {
    const url = URL.createObjectURL(new Blob([c.textoPlano], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `comprovante-${c.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
