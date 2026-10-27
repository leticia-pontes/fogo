import { Component, inject, signal } from '@angular/core';
import { NEIGHBORHOODS } from '../../data/mock-data';
import { RouteStop } from '../../core/maintenance-route';
import { EQUIPMENT_TYPES, STATUS_COLORS, STATUS_LABELS, TYPE_LABELS } from '../../models/equipment-schema';
import { EquipmentType } from '../../models/fogo.models';
import { RouteService } from '../../services/route.service';

const FIELD =
  'w-full py-1.5 px-2 bg-fogo-bg border border-fogo-border focus:border-fogo-ember rounded-lg text-sm text-fogo-sand outline-none';

const CRITICALITY_LABELS: Record<RouteStop['criticidade'], string> = { imediata: 'Imediata', vencida: 'Vencida', proxima: 'Próxima' };

/** Gera a rota de manutenção, lista as paradas e permite concluir cada uma. */
@Component({
  selector: 'app-route-panel',
  standalone: true,
  template: `
    <div class="p-3 space-y-3 text-sm">
      <section class="grid grid-cols-2 gap-2" aria-label="Filtros da rota">
        <label class="space-y-1">
          <span class="text-xs text-fogo-muted">Região</span>
          <select #hoodSel [class]="field" (change)="hood.set(hoodSel.value)">
            <option value="">Todas</option>
            @for (n of neighborhoods; track n.name) {
              <option [value]="n.name" [selected]="hood() === n.name">{{ n.name }}</option>
            }
          </select>
        </label>
        <label class="space-y-1">
          <span class="text-xs text-fogo-muted">Tipo</span>
          <select #typeSel [class]="field" (change)="type.set($any(typeSel.value))">
            <option value="">Todos</option>
            @for (t of types; track t) {
              <option [value]="t" [selected]="type() === t">{{ typeLabels[t] }}</option>
            }
          </select>
        </label>
        <label class="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" [checked]="onlyCritical()" (change)="onlyCritical.set(!onlyCritical())" />
          Só críticos (imediata/vencida)
        </label>
        <label class="flex items-center gap-2 text-xs">
          Máx. paradas
          <input #limitIn type="number" min="1" max="30" [value]="limit()" (change)="limit.set(+limitIn.value || 10)" class="w-16 py-1 px-2 bg-fogo-bg border border-fogo-border rounded text-sm" />
        </label>
        <button type="button" class="btn-primary col-span-2" [disabled]="routes.busy()" (click)="generate()">Gerar rota de manutenção</button>
      </section>
      @if (routes.error(); as err) {
        <p class="text-xs text-fogo-red">{{ err }}</p>
      }

      @if (routes.route(); as r) {
        <section class="rounded-lg border border-fogo-border bg-fogo-bg p-3 space-y-1" aria-label="Resumo da rota">
          <p class="font-semibold">
            {{ r.paradas.length }} parada(s) · {{ r.distanciaTotalKm.toLocaleString('pt-BR') }} km · ~{{ formatMinutes(r.tempoEstimadoMin) }}
          </p>
          <p class="text-xs text-fogo-muted">Saída: {{ r.origem.nome }} · {{ routes.done().size }} concluída(s)</p>
          <p class="text-[11px] text-fogo-muted">{{ r.observacao }}</p>
          @if (r.paradas.length) {
            <button type="button" class="btn w-full mt-1" (click)="routes.simulateAll()">Simular o efeito da rota (paradas pendentes)</button>
          }
        </section>

        <ol class="space-y-2" aria-label="Paradas">
          @for (p of r.paradas; track p.equipamentoId) {
            @let isDone = routes.done().has(p.equipamentoId);
            <li class="rounded-lg border p-2.5 bg-fogo-bg flex gap-2.5" [class]="isDone ? 'border-fogo-green/50 opacity-70' : 'border-fogo-border'">
              <span class="stop-num" [style.background]="isDone ? statusColors.operational : criticalityColor(p.criticidade)">{{ isDone ? '✓' : p.ordem }}</span>
              <div class="flex-1 min-w-0 space-y-0.5">
                <p class="font-medium" [class.line-through]="isDone">
                  {{ p.numeroSerie }} <span class="text-xs text-fogo-muted">· {{ typeLabels[p.tipo] }} · {{ p.bairro }}</span>
                </p>
                <p class="text-xs">
                  <b [style.color]="criticalityColor(p.criticidade)">{{ criticalityLabels[p.criticidade] }}</b>
                  · <span [style.color]="statusColors[p.situacao]">{{ statusLabels[p.situacao] }}</span> · {{ p.motivo }}
                </p>
                <p class="text-[11px] text-fogo-muted">{{ p.prioridade }}</p>
                <p class="text-[11px] text-fogo-muted font-mono">+{{ p.trechoKm.toLocaleString('pt-BR') }} km · acumulado {{ p.acumuladoKm.toLocaleString('pt-BR') }} km</p>
              </div>
              @if (!isDone) {
                <button type="button" class="btn self-center text-xs" [disabled]="routes.busy()" (click)="complete(p)">Concluir</button>
              }
            </li>
          } @empty {
            <li class="text-xs text-fogo-muted">Nenhum equipamento precisa de manutenção com esses filtros.</li>
          }
        </ol>

        @if (r.foraDaRota.length) {
          <details class="text-xs">
            <summary class="cursor-pointer text-fogo-muted">Fora da rota ({{ r.foraDaRota.length }})</summary>
            <ul class="mt-1 space-y-0.5">
              @for (f of r.foraDaRota; track f.numeroSerie) {
                <li>{{ f.numeroSerie }}: {{ f.motivo }}</li>
              }
            </ul>
          </details>
        }
      } @else {
        <p class="text-xs text-fogo-muted">
          Prioridade: imediatas primeiro (falha ou manutenção imediata), depois vencidas e próximas, pelo vizinho mais próximo ponderado pela criticidade.
        </p>
      }
    </div>
  `,
  styles: `
    .btn { @apply py-1.5 px-3 rounded-lg bg-fogo-panel border border-fogo-border text-sm hover:border-fogo-ember cursor-pointer disabled:opacity-40; }
    .btn-primary { @apply py-1.5 px-3 rounded-lg bg-fogo-ember border border-fogo-ember text-fogo-bg text-sm font-semibold hover:brightness-110 cursor-pointer disabled:opacity-40; }
    .stop-num { @apply shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-fogo-bg; }
  `,
})
export class RoutePanelComponent {
  readonly routes = inject(RouteService);

  readonly field = FIELD;
  readonly neighborhoods = NEIGHBORHOODS;
  readonly types = EQUIPMENT_TYPES;
  readonly typeLabels = TYPE_LABELS;
  readonly statusLabels = STATUS_LABELS;
  readonly statusColors = STATUS_COLORS;
  readonly criticalityLabels = CRITICALITY_LABELS;

  readonly hood = signal('');
  readonly type = signal<EquipmentType | ''>('');
  readonly onlyCritical = signal(false);
  readonly limit = signal(10);

  generate(): void {
    void this.routes.generate({
      bairro: this.hood() || undefined,
      tipo: this.type() || undefined,
      apenasCriticos: this.onlyCritical(),
      limite: this.limit(),
    });
  }

  complete(stop: RouteStop): void {
    if (confirm(`Marcar ${stop.numeroSerie} como concluído? O equipamento volta a "Operacional" e a ação vai para a auditoria.`)) {
      void this.routes.complete(stop);
    }
  }

  criticalityColor(c: RouteStop['criticidade']): string {
    return c === 'imediata' ? STATUS_COLORS.malfunction : c === 'vencida' ? STATUS_COLORS.maintenance : '#4a90c2';
  }

  formatMinutes(min: number): string {
    return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
  }
}
