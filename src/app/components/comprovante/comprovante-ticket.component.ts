import { Component, input } from '@angular/core';
import { Comprovante } from '../../core/comprovante';

/** Cupom de papel do comprovante (só apresentação: os dados vêm prontos de `montarComprovante`). */
@Component({
  selector: 'app-comprovante-ticket',
  standalone: true,
  template: `
    @let c = comprovante();
    <article class="tk" [attr.aria-label]="'Comprovante da ocorrência ' + c.id">
      <header>
        <div class="tk-row">
          <span class="tk-brand">F.O.G.O.</span>
          <span class="tk-soft tk-small">Nova Prometeia</span>
        </div>
        <p class="tk-soft tk-small tk-caps">COMPROVANTE DE OCORRÊNCIA</p>
        <div class="tk-row tk-id-row">
          <span class="tk-id">{{ c.id }}</span>
          <span class="tk-seal">{{ c.selo }}</span>
        </div>
        <p class="tk-soft tk-small tk-sub">{{ c.subtitulo }}</p>
      </header>

      <div class="tk-perf" aria-hidden="true"></div>

      <dl>
        @for (l of c.campos; track l.rotulo) {
          <div class="tk-line">
            <dt class="tk-soft">{{ l.rotulo }}</dt>
            <span class="tk-dots" aria-hidden="true"></span>
            <dd>{{ l.valor }}</dd>
          </div>
        }
      </dl>

      <div class="tk-perf" aria-hidden="true"></div>

      <p class="tk-soft tk-small tk-section">CIDADE · ABERTURA → AGORA</p>
      <dl>
        @for (l of c.cidade; track l.rotulo) {
          <div class="tk-line">
            <dt class="tk-soft">{{ l.rotulo }}</dt>
            <span class="tk-dots" aria-hidden="true"></span>
            <dd>{{ l.antes }} → {{ l.agora }}</dd>
          </div>
        }
      </dl>

      <div class="tk-perf" aria-hidden="true"></div>

      <section class="tk-prometheus">
        <p class="tk-small tk-amber">PROMETHEUS</p>
        <p class="tk-quote">{{ c.prometheus }}</p>
      </section>

      <footer class="tk-soft tk-small tk-foot">
        <p>{{ c.emitidoEm }}</p>
        <p>{{ c.aviso }}</p>
      </footer>

      <div class="tk-serrated" aria-hidden="true"></div>
    </article>
  `,
  styles: `
    :host {
      --tk-paper: #f3eee2;
      --tk-ink: #1a1814;
      --tk-ink-soft: #5c574c;
      --tk-perf: #b9b2a2;
      --tk-dots: #8d877a;
      --tk-green: #1e6b47;
      --tk-amber: #8a4b00;
      display: block;
      width: 380px;
    }
    .tk {
      box-sizing: border-box;
      width: 380px;
      padding: 22px 22px 0;
      border-radius: 14px 14px 0 0;
      background: var(--tk-paper);
      color: var(--tk-ink);
      font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 13px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    p, dl, dd { margin: 0; }
    .tk-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .tk-small { font-size: 12px; }
    .tk-soft { color: var(--tk-ink-soft); }
    .tk-brand { font-size: 14px; font-weight: 500; letter-spacing: 0.18em; }
    .tk-caps { margin-top: 6px; letter-spacing: 0.12em; }
    .tk-id-row { margin-top: 18px; }
    .tk-id { font-size: 34px; font-weight: 500; line-height: 1.1; }
    .tk-seal {
      border: 2px solid var(--tk-green);
      color: var(--tk-green);
      border-radius: 6px;
      padding: 3px 10px;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.12em;
      transform: rotate(-8deg);
    }
    .tk-sub { margin-top: 8px; letter-spacing: 0.06em; }
    .tk-perf { position: relative; height: 20px; margin: 12px -22px; }
    .tk-perf::before {
      content: '';
      position: absolute;
      left: 18px;
      right: 18px;
      top: 9px;
      border-top: 2px dashed var(--tk-perf);
    }
    .tk-perf::after {
      content: '';
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 0 10px, var(--ticket-fundo, #090e14) 10px, transparent 10.5px) left / 20px 20px no-repeat,
        radial-gradient(circle at 20px 10px, var(--ticket-fundo, #090e14) 10px, transparent 10.5px) right / 20px 20px no-repeat;
    }
    .tk-line { display: flex; align-items: baseline; gap: 8px; min-height: 28px; font-size: 13px; }
    .tk-line dt { flex-shrink: 0; }
    .tk-dots { flex: 1; min-width: 12px; border-bottom: 1px dotted var(--tk-dots); transform: translateY(-3px); }
    .tk-line dd { font-weight: 500; text-align: right; }
    .tk-section { letter-spacing: 0.1em; margin-bottom: 2px; }
    .tk-amber { color: var(--tk-amber); letter-spacing: 0.14em; }
    .tk-quote { margin-top: 4px; font-size: 13px; line-height: 1.5; }
    .tk-foot { margin-top: 18px; line-height: 1.4; }
    .tk-foot p + p { margin-top: 2px; }
    .tk-serrated {
      height: 12px;
      margin: 18px -22px 0;
      background-color: var(--tk-paper);
      background-image: radial-gradient(circle at 8px 12px, var(--ticket-fundo, #090e14) 6px, transparent 6.5px);
      background-size: 16px 12px;
      background-repeat: repeat-x;
    }
  `,
})
export class ComprovanteTicketComponent {
  readonly comprovante = input.required<Comprovante>();
}
