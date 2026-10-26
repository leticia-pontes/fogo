import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CITY_UF,
  NEIGHBORHOODS,
  daysFromToday,
  detectedAgentTelemetry,
  detectedEquipmentTelemetry,
} from '../../data/mock-data';
import {
  AGENCIES,
  AGENT_STATUS_COLORS,
  AGENT_STATUS_LABELS,
  CUSTOM_FIELDS,
  EQUIPMENT_STATUSES,
  EQUIPMENT_TYPES,
  PRIORITY_LABELS,
  ROLE_AGENCY,
  ROLE_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  TYPE_LABELS,
  defaultCustomProperties,
} from '../../models/equipment-schema';
import {
  Agent,
  AgentRole,
  AgentStatus,
  Equipment,
  EquipmentLocation,
  EquipmentStatus,
  EquipmentType,
  MaintenancePriority,
} from '../../models/fogo.models';
import { CityStateService } from '../../services/city-state.service';
import { UiStateService } from '../../services/ui-state.service';
import { CITY_MAP, CITY_NAME } from '../../data/city-map';

type CustomValue = string | number | boolean | null;

interface EquipmentDraft {
  id: string | null;
  type: EquipmentType;
  serialNumber: string;
  brand: string;
  model: string;
  agency: string;
  status: EquipmentStatus;
  priority: MaintenancePriority;
  nextDate: string;
  location: EquipmentLocation;
  custom: Record<string, CustomValue>;
}

interface AgentDraft extends Omit<Agent, 'id'> {
  id: string | null;
}

/** Retângulo envolvente do contorno da cidade, usado para validar coordenadas. */
const CITY_BOUNDS = {
  minLat: Math.min(...CITY_MAP.outline.map(([lat]) => lat)),
  maxLat: Math.max(...CITY_MAP.outline.map(([lat]) => lat)),
  minLng: Math.min(...CITY_MAP.outline.map(([, lng]) => lng)),
  maxLng: Math.max(...CITY_MAP.outline.map(([, lng]) => lng)),
};

const INPUT_CLASS =
  'w-full py-2 px-2.5 bg-fogo-bg border border-fogo-border focus:border-fogo-ember rounded-lg text-sm text-fogo-sand outline-none';

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

function jitter(): number {
  return (Math.random() - 0.5) * 0.008;
}

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="p-4 lg:p-5 space-y-4 max-w-[1600px] mx-auto">
      <section class="bg-fogo-panel border border-fogo-border rounded-xl p-4 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="inline-flex rounded-lg bg-fogo-bg p-1 border border-fogo-border" role="tablist">
            <button type="button" role="tab" [attr.aria-selected]="tab() === 'equipment'" (click)="tab.set('equipment')" [class]="tabClass(tab() === 'equipment')">
              Equipamentos ({{ city.equipment().length }})
            </button>
            <button type="button" role="tab" [attr.aria-selected]="tab() === 'agents'" (click)="tab.set('agents')" [class]="tabClass(tab() === 'agents')">
              Agentes ({{ city.agents().length }})
            </button>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" (click)="resetData()" class="btn-ghost">Restaurar dados de exemplo</button>
            @if (tab() === 'equipment') {
              <button type="button" (click)="openEquipment(null)" class="btn-primary">+ Novo equipamento</button>
            } @else {
              <button type="button" (click)="openAgent(null)" class="btn-primary">+ Novo agente</button>
            }
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            type="search"
            [class]="inputClass + ' md:col-span-2'"
            placeholder="Buscar por série, marca, modelo, rua, referência, bairro, nome ou matrícula…"
            aria-label="Buscar"
            [ngModel]="search()"
            (ngModelChange)="search.set($event)"
          />
          @if (tab() === 'equipment') {
            <select #typeSel [class]="inputClass" aria-label="Filtrar por tipo" (change)="typeFilter.set($any(typeSel.value))">
              <option value="all">Todos os tipos</option>
              @for (t of types; track t) {
                <option [value]="t">{{ typeLabels[t] }}</option>
              }
            </select>
            <select #statusSel [class]="inputClass" aria-label="Filtrar por situação" (change)="statusFilter.set($any(statusSel.value))">
              <option value="all">Todas as situações</option>
              @for (s of statuses; track s) {
                <option [value]="s">{{ statusLabels[s] }}</option>
              }
            </select>
          }
        </div>
      </section>

      @if (tab() === 'equipment') {
        <div class="bg-fogo-panel border border-fogo-border rounded-xl overflow-x-auto">
          <table class="w-full text-sm min-w-[620px]">
            <thead class="text-xs text-fogo-muted text-left border-b border-fogo-border">
              <tr>
                <th class="th">Equipamento</th>
                <th class="th">Bairro</th>
                <th class="th">Situação</th>
                <th class="th text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              @for (e of filteredEquipment(); track e.id) {
                <tr class="border-b border-fogo-border/60 hover:bg-fogo-bg/50">
                  <td class="td">
                    <p class="font-medium">{{ e.serialNumber }}</p>
                    <p class="text-xs text-fogo-muted">{{ typeLabels[e.type] }}</p>
                  </td>
                  <td class="td text-xs">{{ e.location.neighborhood }}</td>
                  <td class="td">
                    <div class="flex items-center gap-2">
                      <i class="w-2.5 h-2.5 rounded-full shrink-0" [style.background]="statusColors[e.status]"></i>
                      <select
                        #rowStatus
                        class="bg-fogo-bg border border-fogo-border rounded px-1.5 py-1 text-xs"
                        [attr.aria-label]="'Situação de ' + e.serialNumber"
                        (change)="city.setEquipmentStatus(e.id, $any(rowStatus.value))"
                      >
                        @for (s of statuses; track s) {
                          <option [value]="s" [selected]="e.status === s">{{ statusLabels[s] }}</option>
                        }
                      </select>
                    </div>
                  </td>
                  <td class="td">
                    <div class="flex justify-end gap-1.5">
                      <button type="button" class="btn-row" (click)="showOnMap('equipment', e.id)">Mapa</button>
                      <button type="button" class="btn-row" (click)="openEquipment(e)">Detalhes</button>
                      <button type="button" class="btn-row hover:!border-fogo-red" (click)="removeEquipment(e)">Excluir</button>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="td text-center text-fogo-muted py-10">Nenhum equipamento encontrado.</td></tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="bg-fogo-panel border border-fogo-border rounded-xl overflow-x-auto">
          <table class="w-full text-sm min-w-[560px]">
            <thead class="text-xs text-fogo-muted text-left border-b border-fogo-border">
              <tr>
                <th class="th">Agente</th>
                <th class="th">Bairro</th>
                <th class="th">Status</th>
                <th class="th text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              @for (a of filteredAgents(); track a.id) {
                <tr class="border-b border-fogo-border/60 hover:bg-fogo-bg/50">
                  <td class="td">
                    <p class="font-medium">{{ a.name }}</p>
                    <p class="text-xs text-fogo-muted">{{ roleLabels[a.role] }}</p>
                  </td>
                  <td class="td text-xs">{{ a.neighborhood }}</td>
                  <td class="td">
                    <div class="flex items-center gap-2">
                      <i class="w-2.5 h-2.5 rounded-sm shrink-0" [style.background]="agentStatusColors[a.status]"></i>
                      <select
                        #agStatus
                        class="bg-fogo-bg border border-fogo-border rounded px-1.5 py-1 text-xs"
                        [attr.aria-label]="'Status de ' + a.name"
                        (change)="city.upsertAgent({ ...a, status: $any(agStatus.value) })"
                      >
                        @for (s of agentStatuses; track s) {
                          <option [value]="s" [selected]="a.status === s">{{ agentStatusLabels[s] }}</option>
                        }
                      </select>
                    </div>
                  </td>
                  <td class="td">
                    <div class="flex justify-end gap-1.5">
                      <button type="button" class="btn-row" (click)="showOnMap('agent', a.id)">Mapa</button>
                      <button type="button" class="btn-row" (click)="openAgent(a)">Detalhes</button>
                      <button type="button" class="btn-row hover:!border-fogo-red" (click)="removeAgent(a)">Excluir</button>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="td text-center text-fogo-muted py-10">Nenhum agente encontrado.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <!-- Drawer de cadastro / edição -->
    @if (equipmentDraft || agentDraft) {
      <div class="fixed inset-0 z-[1200] flex justify-end">
        <div class="absolute inset-0 bg-fogo-bg/70 backdrop-blur-sm" (click)="closeDrawer()" aria-hidden="true"></div>
        <aside
          class="relative w-full max-w-xl h-full bg-fogo-panel border-l border-fogo-border shadow-2xl flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-labelledby="drawer-title"
        >
          @if (equipmentDraft; as d) {
            <form #f="ngForm" (ngSubmit)="saveEquipment()" class="flex flex-col h-full">
              <header class="p-4 border-b border-fogo-border flex items-center justify-between">
                <h2 id="drawer-title" class="text-base font-semibold">{{ d.id ? 'Detalhes do equipamento' : 'Novo equipamento' }}</h2>
                <button type="button" (click)="closeDrawer()" class="text-fogo-muted hover:text-fogo-sand cursor-pointer" aria-label="Fechar">✕</button>
              </header>

              <div class="flex-1 overflow-y-auto p-4 space-y-4">
                @if (!d.id) {
                  <button
                    type="button"
                    (click)="autofillEquipment()"
                    class="w-full py-2.5 px-3 rounded-lg border text-sm font-semibold cursor-pointer transition-colors"
                    [class]="autofillHint()
                      ? 'border-fogo-ember bg-fogo-ember/15 text-fogo-ember animate-pulse'
                      : 'border-fogo-border bg-fogo-bg text-fogo-sand hover:border-fogo-ember'"
                  >
                    ⚡ Preencher com Telemetria Detectada
                  </button>
                }
                <fieldset class="grid grid-cols-2 gap-3">
                  <label class="field col-span-2">
                    <span>Tipo de equipamento</span>
                    <select name="type" [class]="inputClass" [ngModel]="d.type" (ngModelChange)="changeType($event)">
                      @for (t of types; track t) {
                        <option [ngValue]="t">{{ typeLabels[t] }}</option>
                      }
                    </select>
                  </label>
                  <label class="field">
                    <span>Número de série *</span>
                    <input name="serialNumber" [class]="inputClass" [(ngModel)]="d.serialNumber" required />
                    @if (serialConflict()) {
                      <small class="text-fogo-red">Já existe um equipamento com esta série.</small>
                    }
                  </label>
                  <label class="field">
                    <span>Órgão responsável</span>
                    <select name="agency" [class]="inputClass" [(ngModel)]="d.agency">
                      @for (a of agencies; track a) {
                        <option [ngValue]="a">{{ a }}</option>
                      }
                    </select>
                  </label>
                  <label class="field">
                    <span>Marca *</span>
                    <input name="brand" [class]="inputClass" [(ngModel)]="d.brand" required />
                  </label>
                  <label class="field">
                    <span>Modelo *</span>
                    <input name="model" [class]="inputClass" [(ngModel)]="d.model" required />
                  </label>
                </fieldset>

                <fieldset class="p-3 rounded-lg border border-fogo-ember/40 bg-fogo-bg/40 grid grid-cols-2 gap-3">
                  <legend class="px-1 text-xs font-semibold text-fogo-ember">Propriedades de {{ typeLabels[d.type] }}</legend>
                  @for (field of customFields(d.type); track field.key) {
                    @if (field.kind === 'boolean') {
                      <label class="flex items-center gap-2 text-sm pt-5">
                        <input type="checkbox" [name]="'cp_' + field.key" [(ngModel)]="d.custom[field.key]" class="w-4 h-4 accent-fogo-ember" />
                        {{ field.label }}
                      </label>
                    } @else if (field.kind === 'select') {
                      <label class="field">
                        <span>{{ field.label }}</span>
                        <select [name]="'cp_' + field.key" [class]="inputClass" [(ngModel)]="d.custom[field.key]" required>
                          @for (o of field.options; track o.value) {
                            <option [ngValue]="o.value">{{ o.label }}</option>
                          }
                        </select>
                      </label>
                    } @else if (field.kind === 'number') {
                      <label class="field">
                        <span>{{ field.label }}{{ field.optional ? '' : ' *' }}</span>
                        <input type="number" [name]="'cp_' + field.key" [class]="inputClass" [(ngModel)]="d.custom[field.key]" [required]="!field.optional" />
                      </label>
                    } @else {
                      <label class="field">
                        <span>{{ field.label }} *</span>
                        <input [name]="'cp_' + field.key" [class]="inputClass" [(ngModel)]="d.custom[field.key]" required />
                      </label>
                    }
                  }
                </fieldset>

                <fieldset class="grid grid-cols-2 gap-3">
                  <legend class="text-xs font-semibold text-fogo-muted mb-1">Localização</legend>
                  <label class="field col-span-2">
                    <span>Logradouro / rua *</span>
                    <input name="street" [class]="inputClass" [(ngModel)]="d.location.street" required />
                  </label>
                  <label class="field col-span-2">
                    <span>Ponto de referência *</span>
                    <input name="reference" [class]="inputClass" [(ngModel)]="d.location.reference" placeholder="Ex.: Oposto ao nº 181, KM 203" required />
                  </label>
                  <label class="field">
                    <span>Bairro</span>
                    <select name="neighborhood" [class]="inputClass" [ngModel]="d.location.neighborhood" (ngModelChange)="changeEquipmentNeighborhood($event)">
                      @for (n of neighborhoods; track n.name) {
                        <option [ngValue]="n.name">{{ n.name }}</option>
                      }
                    </select>
                  </label>
                  <label class="field">
                    <span>CEP *</span>
                    <input name="cep" [class]="inputClass" [(ngModel)]="d.location.cep" required pattern="\\d{5}-?\\d{3}" placeholder="00000-000" />
                  </label>
                  <label class="field col-span-2">
                    <span>Cidade / UF</span>
                    <input name="cityUf" [class]="inputClass" [(ngModel)]="d.location.cityUf" required />
                  </label>
                  <label class="field">
                    <span>Latitude *</span>
                    <input type="number" step="0.0001" min="-90" max="90" name="lat" [class]="inputClass" [(ngModel)]="d.location.lat" required />
                  </label>
                  <label class="field">
                    <span>Longitude *</span>
                    <input type="number" step="0.0001" min="-180" max="180" name="lng" [class]="inputClass" [(ngModel)]="d.location.lng" required />
                  </label>
                  @if (coordError(d.location.lat, d.location.lng); as err) {
                    <small class="col-span-2 text-fogo-red">{{ err }}</small>
                  }
                </fieldset>

                <fieldset class="grid grid-cols-2 gap-3">
                  <legend class="text-xs font-semibold text-fogo-muted mb-1">Situação e manutenção</legend>
                  <label class="field col-span-2">
                    <span>Situação</span>
                    <select name="status" [class]="inputClass" [(ngModel)]="d.status">
                      @for (s of statuses; track s) {
                        <option [ngValue]="s">{{ statusLabels[s] }}</option>
                      }
                    </select>
                  </label>
                  <label class="field">
                    <span>Necessidade de manutenção</span>
                    <select name="priority" [class]="inputClass" [(ngModel)]="d.priority">
                      @for (p of priorities; track p) {
                        <option [ngValue]="p">{{ priorityLabels[p] }}</option>
                      }
                    </select>
                  </label>
                  <label class="field">
                    <span>Próxima manutenção</span>
                    <input type="date" name="nextDate" [class]="inputClass" [(ngModel)]="d.nextDate" />
                  </label>
                </fieldset>
              </div>

              <footer class="p-4 border-t border-fogo-border flex justify-end gap-2">
                <button type="button" (click)="closeDrawer()" class="btn-ghost">Cancelar</button>
                <button type="submit" class="btn-primary disabled:opacity-40 disabled:cursor-not-allowed" [disabled]="f.invalid || serialConflict() || !!coordError(d.location.lat, d.location.lng)">Salvar</button>
              </footer>
            </form>
          } @else if (agentDraft; as a) {
            <form #g="ngForm" (ngSubmit)="saveAgent()" class="flex flex-col h-full">
              <header class="p-4 border-b border-fogo-border flex items-center justify-between">
                <h2 id="drawer-title" class="text-base font-semibold">{{ a.id ? 'Detalhes do agente' : 'Novo agente' }}</h2>
                <button type="button" (click)="closeDrawer()" class="text-fogo-muted hover:text-fogo-sand cursor-pointer" aria-label="Fechar">✕</button>
              </header>
              <div class="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-3 content-start">
                <div class="col-span-2">
                @if (!a.id) {
                  <button
                    type="button"
                    (click)="autofillAgent()"
                    class="w-full py-2.5 px-3 rounded-lg border text-sm font-semibold cursor-pointer transition-colors"
                    [class]="autofillHint()
                      ? 'border-fogo-ember bg-fogo-ember/15 text-fogo-ember animate-pulse'
                      : 'border-fogo-border bg-fogo-bg text-fogo-sand hover:border-fogo-ember'"
                  >
                    ⚡ Preencher com Telemetria Detectada
                  </button>
                }
                </div>
                <label class="field col-span-2">
                  <span>Nome *</span>
                  <input name="name" [class]="inputClass" [(ngModel)]="a.name" required />
                </label>
                <label class="field">
                  <span>Matrícula *</span>
                  <input name="badgeNumber" [class]="inputClass" [(ngModel)]="a.badgeNumber" required />
                  @if (badgeConflict()) {
                    <small class="text-fogo-red">Já existe um agente com esta matrícula.</small>
                  }
                </label>
                <label class="field">
                  <span>Função</span>
                  <select name="role" [class]="inputClass" [ngModel]="a.role" (ngModelChange)="changeRole($event)">
                    @for (r of roles; track r) {
                      <option [ngValue]="r">{{ roleLabels[r] }}</option>
                    }
                  </select>
                </label>
                <label class="field">
                  <span>Órgão</span>
                  <select name="agentAgency" [class]="inputClass" [(ngModel)]="a.agency">
                    @for (ag of agencies; track ag) {
                      <option [ngValue]="ag">{{ ag }}</option>
                    }
                  </select>
                </label>
                <label class="field">
                  <span>Status</span>
                  <select name="agentStatus" [class]="inputClass" [(ngModel)]="a.status">
                    @for (s of agentStatuses; track s) {
                      <option [ngValue]="s">{{ agentStatusLabels[s] }}</option>
                    }
                  </select>
                </label>
                <label class="field col-span-2">
                  <span>Bairro de atuação</span>
                  <select name="agentNeighborhood" [class]="inputClass" [ngModel]="a.neighborhood" (ngModelChange)="changeAgentNeighborhood($event)">
                    @for (n of neighborhoods; track n.name) {
                      <option [ngValue]="n.name">{{ n.name }}</option>
                    }
                  </select>
                </label>
                <label class="field">
                  <span>Latitude *</span>
                  <input type="number" step="0.0001" min="-90" max="90" name="agentLat" [class]="inputClass" [(ngModel)]="a.lat" required />
                </label>
                <label class="field">
                  <span>Longitude *</span>
                  <input type="number" step="0.0001" min="-180" max="180" name="agentLng" [class]="inputClass" [(ngModel)]="a.lng" required />
                </label>
                @if (coordError(a.lat, a.lng); as err) {
                  <small class="col-span-2 text-fogo-red">{{ err }}</small>
                }
              </div>
              <footer class="p-4 border-t border-fogo-border flex justify-end gap-2">
                <button type="button" (click)="closeDrawer()" class="btn-ghost">Cancelar</button>
                <button type="submit" class="btn-primary disabled:opacity-40 disabled:cursor-not-allowed" [disabled]="g.invalid || badgeConflict() || !!coordError(a.lat, a.lng)">Salvar</button>
              </footer>
            </form>
          }
        </aside>
      </div>
    }
  `,
  styles: `
    .th { @apply px-3 py-2.5 font-medium; }
    .td { @apply px-3 py-2.5 align-top; }
    .field { @apply flex flex-col gap-1 text-xs text-fogo-muted; }
    .btn-primary { @apply px-4 py-2 rounded-lg bg-fogo-ember hover:brightness-110 text-fogo-bg font-semibold text-sm cursor-pointer; }
    .btn-ghost { @apply px-3 py-2 rounded-lg bg-fogo-bg border border-fogo-border text-sm text-fogo-muted hover:text-fogo-sand cursor-pointer; }
    .btn-row { @apply px-2 py-1 rounded border border-fogo-border bg-fogo-bg text-xs hover:border-fogo-ember cursor-pointer; }
  `,
})
export class InventoryComponent implements OnInit {
  readonly city = inject(CityStateService);
  private readonly ui = inject(UiStateService);
  /** Destaca o botão de auto-preenchimento (cadastro rápido aberto pela calibração). */
  readonly autofillHint = signal(false);

  readonly inputClass = INPUT_CLASS;
  readonly types = EQUIPMENT_TYPES;
  readonly statuses = EQUIPMENT_STATUSES;
  readonly priorities: MaintenancePriority[] = ['none', 'scheduled', 'immediate'];
  readonly roles: AgentRole[] = ['transit_agent', 'municipal_guard', 'military_police'];
  readonly agentStatuses: AgentStatus[] = ['active', 'in_dispatch', 'off_duty'];
  readonly neighborhoods = NEIGHBORHOODS;
  readonly agencies = AGENCIES;
  readonly typeLabels = TYPE_LABELS;
  readonly statusLabels = STATUS_LABELS;
  readonly statusColors = STATUS_COLORS;
  readonly priorityLabels = PRIORITY_LABELS;
  readonly roleLabels = ROLE_LABELS;
  readonly agentStatusLabels = AGENT_STATUS_LABELS;
  readonly agentStatusColors = AGENT_STATUS_COLORS;

  readonly tab = signal<'equipment' | 'agents'>('equipment');
  readonly search = signal('');
  readonly typeFilter = signal<EquipmentType | 'all'>('all');
  readonly statusFilter = signal<EquipmentStatus | 'all'>('all');

  equipmentDraft: EquipmentDraft | null = null;
  agentDraft: AgentDraft | null = null;

  readonly filteredEquipment = computed(() => {
    const q = this.search().trim().toLowerCase();
    const type = this.typeFilter();
    const status = this.statusFilter();
    return this.city.equipment().filter(
      (e) =>
        (type === 'all' || e.type === type) &&
        (status === 'all' || e.status === status) &&
        (!q ||
          [e.serialNumber, e.brand, e.model, e.location.street, e.location.reference, e.location.neighborhood, e.agency]
            .join(' ')
            .toLowerCase()
            .includes(q))
    );
  });

  readonly filteredAgents = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.city
      .agents()
      .filter((a) => !q || [a.name, a.badgeNumber, a.agency, a.neighborhood].join(' ').toLowerCase().includes(q));
  });

  ngOnInit(): void {
    const request = this.ui.inventoryRequest();
    if (!request) return;
    this.ui.inventoryRequest.set(null);
    if (request.kind === 'agent') this.tab.set('agents');

    if (request.mode === 'create') {
      this.autofillHint.set(!!request.hintAutofill);
      if (request.kind === 'equipment') this.openEquipment(null);
      else this.openAgent(null);
      return;
    }
    if (request.kind === 'equipment') {
      const item = this.city.equipment().find((e) => e.id === request.id);
      if (item) this.openEquipment(item);
    } else {
      const agent = this.city.agents().find((a) => a.id === request.id);
      if (agent) this.openAgent(agent);
    }
  }

  @HostListener('document:keydown.escape')
  closeDrawer(): void {
    // Esc fecha primeiro o formulário; sem formulário aberto, fecha o inventário.
    if (!this.equipmentDraft && !this.agentDraft) {
      this.ui.closeInventory();
      return;
    }
    this.equipmentDraft = null;
    this.agentDraft = null;
    this.autofillHint.set(false);
  }

  tabClass(active: boolean): string {
    return active
      ? 'px-3.5 py-1.5 text-sm font-medium rounded-md bg-fogo-panel text-fogo-sand border border-fogo-border cursor-pointer'
      : 'px-3.5 py-1.5 text-sm text-fogo-muted hover:text-fogo-sand cursor-pointer';
  }

  customFields(type: EquipmentType) {
    return CUSTOM_FIELDS[type];
  }

  // ---------------------------------------------------------------------------
  // Equipamentos
  // ---------------------------------------------------------------------------

  openEquipment(item: Equipment | null): void {
    if (item) {
      this.equipmentDraft = {
        id: item.id,
        type: item.type,
        serialNumber: item.serialNumber,
        brand: item.brand,
        model: item.model,
        agency: item.agency,
        status: item.status,
        priority: item.maintenance.priority,
        nextDate: item.maintenance.nextDate ?? '',
        location: { ...item.location },
        custom: { ...(item.customProperties as Record<string, CustomValue>) },
      };
      return;
    }
    const hood = NEIGHBORHOODS[0];
    this.equipmentDraft = {
      id: null,
      type: 'radar',
      serialNumber: '',
      brand: '',
      model: '',
      agency: 'SEMOB',
      status: 'not_installed',
      priority: 'scheduled',
      nextDate: daysFromToday(7),
      location: {
        cep: `${hood.cepPrefix}-000`,
        neighborhood: hood.name,
        cityUf: CITY_UF,
        street: '',
        reference: '',
        lat: Number((hood.lat + jitter()).toFixed(6)),
        lng: Number((hood.lng + jitter()).toFixed(6)),
      },
      custom: { ...(defaultCustomProperties('radar') as Record<string, CustomValue>) },
    };
  }

  autofillEquipment(): void {
    const d = this.equipmentDraft;
    if (!d) return;
    const taken = new Set(this.city.equipment().map((e) => e.serialNumber.toLowerCase()));
    const detected = detectedEquipmentTelemetry(d.type, d.location.neighborhood, taken);
    Object.assign(d, {
      serialNumber: detected.serialNumber,
      brand: detected.brand,
      model: detected.model,
      agency: detected.agency,
      status: detected.status,
      priority: detected.maintenance.priority,
      nextDate: detected.maintenance.nextDate ?? '',
      location: { ...detected.location },
      custom: { ...(detected.customProperties as Record<string, CustomValue>) },
    });
    this.autofillHint.set(false);
  }

  autofillAgent(): void {
    const a = this.agentDraft;
    if (!a) return;
    Object.assign(a, detectedAgentTelemetry(a.neighborhood));
    this.autofillHint.set(false);
  }

  changeType(type: EquipmentType): void {
    if (!this.equipmentDraft) return;
    this.equipmentDraft.type = type;
    this.equipmentDraft.custom = { ...(defaultCustomProperties(type) as Record<string, CustomValue>) };
  }

  changeEquipmentNeighborhood(name: string): void {
    const d = this.equipmentDraft;
    const hood = NEIGHBORHOODS.find((n) => n.name === name);
    if (!d || !hood) return;
    d.location = {
      ...d.location,
      neighborhood: name,
      cep: `${hood.cepPrefix}-000`,
      lat: Number((hood.lat + jitter()).toFixed(6)),
      lng: Number((hood.lng + jitter()).toFixed(6)),
    };
  }

  serialConflict(): boolean {
    const d = this.equipmentDraft;
    if (!d) return false;
    const serial = d.serialNumber.trim().toLowerCase();
    return !!serial && this.city.equipment().some((e) => e.id !== d.id && e.serialNumber.toLowerCase() === serial);
  }

  /** Coordenadas precisam ser válidas e cair dentro do contorno da cidade. */
  coordError(lat: unknown, lng: unknown): string | null {
    if (lat === null || lat === '' || lng === null || lng === '') return null; // `required` já cobre
    const la = Number(lat);
    const ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) {
      return 'Coordenadas inválidas: latitude entre -90 e 90, longitude entre -180 e 180.';
    }
    const b = CITY_BOUNDS;
    if (la < b.minLat || la > b.maxLat || ln < b.minLng || ln > b.maxLng) {
      return `Coordenadas fora de ${CITY_NAME}: lat ${b.minLat.toFixed(4)} a ${b.maxLat.toFixed(4)}, lng ${b.minLng.toFixed(4)} a ${b.maxLng.toFixed(4)}.`;
    }
    return null;
  }

  badgeConflict(): boolean {
    const a = this.agentDraft;
    if (!a) return false;
    const badge = a.badgeNumber.trim().toLowerCase();
    return !!badge && this.city.agents().some((x) => x.id !== a.id && x.badgeNumber.toLowerCase() === badge);
  }

  saveEquipment(): void {
    const d = this.equipmentDraft;
    if (!d || this.serialConflict() || this.coordError(d.location.lat, d.location.lng)) return;

    const customProperties: Record<string, string | number | boolean> = {};
    for (const field of CUSTOM_FIELDS[d.type]) {
      const value = d.custom[field.key];
      if (value === null || value === undefined || value === '') continue;
      customProperties[field.key] = field.kind === 'number' ? Number(value) : value;
    }

    // O schema garante que as chaves correspondem ao `type` selecionado.
    const item = {
      id: d.id ?? newId('EQ'),
      serialNumber: d.serialNumber.trim(),
      brand: d.brand.trim(),
      model: d.model.trim(),
      agency: d.agency,
      type: d.type,
      customProperties,
      location: { ...d.location, lat: Number(d.location.lat), lng: Number(d.location.lng) },
      status: d.status,
      maintenance: { priority: d.priority, nextDate: d.nextDate || undefined },
    } as Equipment;

    this.city.upsertEquipment(item);
    this.closeDrawer();
  }

  removeEquipment(item: Equipment): void {
    if (confirm(`Excluir o equipamento ${item.serialNumber}?`)) this.city.deleteEquipment(item.id);
  }

  // ---------------------------------------------------------------------------
  // Agentes
  // ---------------------------------------------------------------------------

  openAgent(agent: Agent | null): void {
    if (agent) {
      this.agentDraft = { ...agent };
      return;
    }
    const hood = NEIGHBORHOODS[0];
    this.agentDraft = {
      id: null,
      name: '',
      badgeNumber: '',
      role: 'transit_agent',
      agency: ROLE_AGENCY.transit_agent,
      status: 'active',
      neighborhood: hood.name,
      lat: Number((hood.lat + jitter()).toFixed(6)),
      lng: Number((hood.lng + jitter()).toFixed(6)),
    };
  }

  changeRole(role: AgentRole): void {
    if (!this.agentDraft) return;
    this.agentDraft.role = role;
    this.agentDraft.agency = ROLE_AGENCY[role];
  }

  changeAgentNeighborhood(name: string): void {
    const a = this.agentDraft;
    const hood = NEIGHBORHOODS.find((n) => n.name === name);
    if (!a || !hood) return;
    a.neighborhood = name;
    a.lat = Number((hood.lat + jitter()).toFixed(6));
    a.lng = Number((hood.lng + jitter()).toFixed(6));
  }

  saveAgent(): void {
    const a = this.agentDraft;
    if (!a || this.badgeConflict() || this.coordError(a.lat, a.lng)) return;
    this.city.upsertAgent({
      ...a,
      id: a.id ?? newId('AG'),
      name: a.name.trim(),
      badgeNumber: a.badgeNumber.trim(),
      lat: Number(a.lat),
      lng: Number(a.lng),
    });
    this.closeDrawer();
  }

  removeAgent(agent: Agent): void {
    if (confirm(`Excluir o agente ${agent.name}?`)) this.city.deleteAgent(agent.id);
  }

  // ---------------------------------------------------------------------------

  showOnMap(kind: 'equipment' | 'agent', id: string): void {
    this.city.selection.set({ kind, id });
    this.ui.goToMap();
  }

  resetData(): void {
    if (confirm('Restaurar os dados de exemplo? As alterações feitas serão perdidas.')) this.city.resetToMock();
  }
}
