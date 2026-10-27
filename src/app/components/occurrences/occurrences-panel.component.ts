import { Component, computed, inject, signal } from '@angular/core';
import { Ocorrencia, STATUS_OCORRENCIA, STATUS_OCORRENCIA_LABELS, StatusOcorrencia, TIPO_ALERTA_LABELS } from '../../core/occurrences';
import { STATUS_COLORS, STATUS_LABELS } from '../../models/equipment-schema';
import { CityStateService } from '../../services/city-state.service';
import { OccurrenceService } from '../../services/occurrence.service';
import { UiStateService } from '../../services/ui-state.service';

const FIELD =
  'w-full py-1.5 px-2 bg-fogo-bg border border-fogo-border focus:border-fogo-ember rounded-lg text-sm text-fogo-sand outline-none';

const STATUS_STYLES: Record<StatusOcorrencia, string> = {
  aberta: 'bg-fogo-red/20 text-fogo-red border-fogo-red/40',
  investigada: 'bg-fogo-amber/20 text-fogo-amber border-fogo-amber/40',
  despachada: 'bg-fogo-ember/20 text-fogo-ember border-fogo-ember/40',
  encerrada: 'bg-fogo-bg text-fogo-muted border-fogo-border',
};

/** Lista de ocorrências com filtro por status; clicar numa ocorrência mostra o equipamento no mapa. */
@Component({
  selector: 'app-occurrences-panel',
  standalone: true,
  template: `
    <div class="p-3 space-y-3 text-sm">
      <div class="flex items-end gap-2">
        <label class="flex-1 space-y-1">
          <span class="text-xs text-fogo-muted">Status</span>
          <select #statusSel [class]="field" (change)="status.set($any(statusSel.value))">
            <option value="">Todos ({{ occ.list().length }})</option>
            @for (s of statuses; track s) {
              <option [value]="s" [selected]="status() === s">{{ statusLabels[s] }} ({{ count(s) }})</option>
            }
          </select>
        </label>
        <button type="button" class="btn-secondary text-xs" (click)="occ.refresh()" aria-label="Atualizar lista de ocorrências">Atualizar</button>
      </div>
      @if (occ.error(); as err) {
        <p class="text-xs text-fogo-red">{{ err }}</p>
      }

      <ul class="space-y-2" aria-label="Ocorrências">
        @for (o of visible(); track o.id) {
          @let eq = equipment(o);
          <li>
            <button
              type="button"
              (click)="select(o)"
              [attr.aria-current]="occ.selectedId() === o.id ? 'true' : null"
              class="w-full text-left rounded-lg border p-3 bg-fogo-bg hover:border-fogo-ember cursor-pointer space-y-1"
              [class]="occ.selectedId() === o.id ? 'border-fogo-ember' : 'border-fogo-border'"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="font-mono text-xs text-fogo-muted">{{ o.id }}</span>
                <span class="text-[11px] px-2 py-0.5 rounded border" [class]="statusStyles[o.status]">{{ statusLabels[o.status] }}</span>
              </div>
              <p class="font-medium">{{ alertLabels[o.tipoAlerta] }} · {{ eq?.serialNumber ?? o.equipamentoId }}</p>
              <p class="text-xs text-fogo-muted">
                {{ o.snapshotAbertura.bairro }} · aberta {{ formatDateTime(o.abertaEm) }}
                @if (eq) {
                  · agora: <i class="dot" [style.background]="statusColors[eq.status]"></i> {{ equipmentStatusLabels[eq.status] }}
                } @else {
                  · equipamento excluído
                }
              </p>
              <p class="text-[11px] text-fogo-muted">
                Na abertura: disponibilidade {{ o.snapshotAbertura.indicadores.availabilityPct.toLocaleString('pt-BR') }}%
                @if (o.snapshotAbertura.saude; as s) { · saúde do bairro {{ s.health }} }
                @if (o.snapshotAbertura.risco; as r) { · risco {{ r.risk }} ({{ r.level }}) }
              </p>
            </button>
          </li>
        } @empty {
          <li class="text-center text-fogo-muted py-10">
            {{ status() ? 'Nenhuma ocorrência com este status.' : 'Nenhuma ocorrência ainda. Abra uma pelo botão "Abrir ocorrência" num alerta de furto ou falha.' }}
          </li>
        }
      </ul>
    </div>
  `,
})
export class OccurrencesPanelComponent {
  readonly occ = inject(OccurrenceService);
  private readonly city = inject(CityStateService);
  private readonly ui = inject(UiStateService);

  readonly status = signal<StatusOcorrencia | ''>('');
  readonly visible = computed(() => this.occ.list().filter((o) => !this.status() || o.status === this.status()));

  readonly field = FIELD;
  readonly statuses = STATUS_OCORRENCIA;
  readonly statusLabels = STATUS_OCORRENCIA_LABELS;
  readonly statusStyles = STATUS_STYLES;
  readonly alertLabels = TIPO_ALERTA_LABELS;
  readonly statusColors = STATUS_COLORS;
  readonly equipmentStatusLabels = STATUS_LABELS;

  count(s: StatusOcorrencia): number {
    return this.occ.list().filter((o) => o.status === s).length;
  }

  equipment(o: Ocorrencia) {
    return this.city.equipment().find((e) => e.id === o.equipamentoId);
  }

  /** Seleciona a ocorrência e centraliza o equipamento no mapa (sem sair da aba). */
  select(o: Ocorrencia): void {
    this.occ.selectedId.set(o.id);
    const eq = this.equipment(o);
    if (eq) this.ui.focusPoint(eq.location.lat, eq.location.lng);
  }

  formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
}
