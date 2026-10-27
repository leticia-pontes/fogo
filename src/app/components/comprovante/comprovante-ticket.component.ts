import { Component, input } from '@angular/core';
import { Comprovante } from '../../core/comprovante';
import { TICKET_CSS } from '../../core/comprovante-html';

/** Cupom de papel do comprovante (só apresentação: os dados vêm prontos de `montarComprovante`; o estilo é o mesmo da página do celular). */
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
  styles: [':host { display: block; width: 380px; }', TICKET_CSS],
})
export class ComprovanteTicketComponent {
  readonly comprovante = input.required<Comprovante>();
}
