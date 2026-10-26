import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import type * as Leaflet from 'leaflet';
import { CITY_MAP } from '../../data/city-map';
import { NEIGHBORHOODS } from '../../data/mock-data';
import {
  AGENCIES,
  AGENT_STATUS_COLORS,
  AGENT_STATUS_LABELS,
  EQUIPMENT_STATUSES,
  EQUIPMENT_TYPES,
  HEALTH_COLORS,
  HEALTH_LABELS,
  PRIORITY_LABELS,
  ROLE_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  TYPE_LABELS,
  describeCustomProperties,
} from '../../models/equipment-schema';
import {
  Agent,
  AgentStatus,
  Equipment,
  EquipmentStatus,
  EquipmentType,
  OpsFilters,
  RegionSummary,
} from '../../models/fogo.models';
import { CityStateService, EMPTY_FILTERS, daysUntil } from '../../services/city-state.service';
import { UiStateService } from '../../services/ui-state.service';

const SELECT_CLASS =
  'w-full py-2 px-2.5 bg-fogo-bg border border-fogo-border focus:border-fogo-ember rounded-lg text-sm text-fogo-sand outline-none';

@Component({
  selector: 'app-ops-center',
  standalone: true,
  template: `
    <div class="p-4 lg:p-5 space-y-4 max-w-[1800px] mx-auto">
      <!-- Filtros reativos -->
      <section class="bg-fogo-panel border border-fogo-border rounded-xl p-3 grid grid-cols-2 md:grid-cols-6 gap-3 items-end" aria-label="Filtros">
        <label class="text-[13px] text-fogo-muted space-y-1">
          <span>Tipo de equipamento</span>
          <select #typeSel [class]="filterSelectClass" (change)="setFilter('type', typeSel.value)">
            <option value="all">Todos os tipos</option>
            @for (t of types; track t) {
              <option [value]="t" [selected]="city.filters().type === t">{{ typeLabels[t] }}</option>
            }
          </select>
        </label>
        <label class="text-[13px] text-fogo-muted space-y-1">
          <span>Situação</span>
          <select #statusSel [class]="filterSelectClass" (change)="setFilter('status', statusSel.value)">
            <option value="all">Todas</option>
            @for (s of statuses; track s) {
              <option [value]="s" [selected]="city.filters().status === s">{{ statusLabels[s] }}</option>
            }
          </select>
        </label>
        <label class="text-[13px] text-fogo-muted space-y-1">
          <span>Bairro / região</span>
          <select #hoodSel [class]="filterSelectClass" (change)="setFilter('neighborhood', hoodSel.value)">
            <option value="all">Todos os bairros</option>
            @for (n of neighborhoods; track n.name) {
              <option [value]="n.name" [selected]="city.filters().neighborhood === n.name">{{ n.name }}</option>
            }
          </select>
        </label>
        <label class="text-[13px] text-fogo-muted space-y-1">
          <span>Órgão responsável</span>
          <select #agencySel [class]="filterSelectClass" (change)="setFilter('agency', agencySel.value)">
            <option value="all">Todos os órgãos</option>
            @for (a of agencies; track a) {
              <option [value]="a" [selected]="city.filters().agency === a">{{ a }}</option>
            }
          </select>
        </label>
        <button
          type="button"
          (click)="city.filters.set(emptyFilters)"
          class="py-2 px-3 rounded-lg bg-fogo-bg border border-fogo-border text-[15px] text-fogo-muted hover:text-fogo-sand cursor-pointer"
        >
          Limpar filtros
        </button>
        <button
          type="button"
          (click)="city.toggleTelemetry()"
          [attr.aria-pressed]="city.telemetryOn()"
          class="py-2 px-3 rounded-lg text-[15px] font-semibold leading-tight text-center flex items-center justify-center gap-2 cursor-pointer border"
          [class]="city.telemetryOn()
            ? 'bg-fogo-green/20 border-fogo-green text-fogo-green'
            : 'bg-fogo-ember border-fogo-ember text-fogo-bg hover:brightness-110'"
        >
          <span class="w-2 h-2 shrink-0 rounded-full" [class]="city.telemetryOn() ? 'bg-fogo-green animate-pulse' : 'bg-fogo-bg'"></span>
          <span>{{ city.telemetryOn() ? 'Telemetria ao vivo (parar)' : 'Simular telemetria em tempo real' }}</span>
        </button>
      </section>

      <!-- KPIs da visão filtrada -->
      <section class="grid grid-cols-2 md:grid-cols-5 gap-3" aria-label="Indicadores">
        <div class="kpi">
          <span class="kpi-label">Equipamentos</span>
          <strong class="kpi-value">{{ city.kpis().total }}</strong>
          <span class="kpi-sub">{{ city.kpis().notInstalled }} ainda não instalado(s)</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Operacionais</span>
          <strong class="kpi-value text-fogo-green">{{ city.kpis().operational }}</strong>
          <span class="kpi-sub">em funcionamento agora</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Indisponíveis</span>
          <strong class="kpi-value text-fogo-red">{{ city.kpis().unavailable }}</strong>
          <span class="kpi-sub">falha, manutenção, furto ou desativado</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Disponibilidade</span>
          <strong
            class="kpi-value"
            [class]="city.kpis().availabilityPct >= 85 ? 'text-fogo-green' : city.kpis().availabilityPct >= 70 ? 'text-fogo-amber' : 'text-fogo-red'"
          >
            {{ city.kpis().availabilityPct.toLocaleString('pt-BR') }}%
          </strong>
          <span class="kpi-sub">operacionais ÷ instalados</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Agentes ativos</span>
          <strong class="kpi-value text-fogo-blue">{{ city.kpis().activeAgents }}</strong>
          <span class="kpi-sub">{{ city.kpis().inDispatch }} em despacho · {{ city.kpis().totalAgents }} no total</span>
        </div>
      </section>

      <!-- Mapa + painel lateral -->
      <div class="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div class="xl:col-span-8 relative rounded-xl border border-fogo-border overflow-hidden h-[460px] xl:h-[580px]">
          <div #mapEl class="absolute inset-0 z-0"></div>
          <div class="absolute bottom-3 left-3 z-[400] max-w-[calc(100%-1.5rem)] bg-fogo-panel/95 border border-fogo-border rounded-lg text-[12px] text-fogo-sand">
            <button
              type="button"
              (click)="legendOpen.set(!legendOpen())"
              [attr.aria-expanded]="legendOpen()"
              class="w-full flex items-center justify-between gap-3 px-3 py-1.5 font-semibold cursor-pointer"
            >
              <span>Legenda</span>
              <span class="text-fogo-muted">{{ legendOpen() ? '▾' : '▸' }}</span>
            </button>
            @if (legendOpen()) {
              <div class="px-3 pb-2 space-y-2 max-h-[300px] overflow-y-auto">
                <div>
                  <p class="text-fogo-muted mb-1">Situação do equipamento (clique para filtrar)</p>
                  <div class="grid grid-cols-2 gap-x-3 gap-y-1">
                    @for (s of statuses; track s) {
                      <button
                        type="button"
                        (click)="toggleFilter('status', s)"
                        class="flex items-center gap-1.5 text-left cursor-pointer hover:text-fogo-ember"
                        [class.text-fogo-ember]="city.filters().status === s"
                      >
                        <i class="legend-ring" [style.border-color]="statusColors[s]" [style.border-style]="statusBorder(s)"></i>{{ statusLabels[s] }}
                      </button>
                    }
                  </div>
                </div>
                <div>
                  <p class="text-fogo-muted mb-1">Tipo (clique para filtrar)</p>
                  <div class="grid grid-cols-2 gap-x-3 gap-y-1">
                    @for (t of types; track t) {
                      <button
                        type="button"
                        (click)="toggleFilter('type', t)"
                        class="flex items-center gap-1.5 text-left cursor-pointer hover:text-fogo-ember"
                        [class.text-fogo-ember]="city.filters().type === t"
                      >
                        <span class="shrink-0 flex" [innerHTML]="typeGlyphs[t]"></span>{{ typeLabels[t] }}
                      </button>
                    }
                  </div>
                </div>
                <div>
                  <p class="text-fogo-muted mb-1">Agentes (AT = trânsito · GM = guarda · PM = polícia)</p>
                  <div class="flex flex-wrap gap-x-3 gap-y-1">
                    @for (s of agentStatuses; track s) {
                      <span class="flex items-center gap-1.5"><i class="legend-square" [style.background]="agentStatusColors[s]"></i>{{ agentStatusLabels[s] }}</span>
                    }
                  </div>
                </div>
                <p class="text-fogo-muted">Cor do bairro = saúde operacional (verde, âmbar, vermelho)</p>
              </div>
            }
          </div>
        </div>

        <aside class="xl:col-span-4 h-[460px] xl:h-[580px] bg-fogo-panel border border-fogo-border rounded-xl flex flex-col overflow-hidden">
          @if (city.selectedEquipment(); as eq) {
            <div class="p-4 border-b border-fogo-border flex items-start justify-between gap-2">
              <div>
                <p class="text-xs text-fogo-muted">{{ typeLabels[eq.type] }} · {{ eq.agency }}</p>
                <h2 class="text-base font-semibold">{{ eq.serialNumber }}</h2>
                <p class="text-sm text-fogo-muted">{{ eq.brand }} · {{ eq.model }}</p>
              </div>
              <button type="button" (click)="city.selection.set(null)" class="text-xs text-fogo-muted hover:text-fogo-sand cursor-pointer" aria-label="Fechar detalhes">
                ✕ Fechar
              </button>
            </div>
            <div class="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
              <div class="space-y-1.5">
                <span class="text-xs text-fogo-muted">Situação</span>
                <div class="flex items-center gap-2">
                  <i class="dot" [style.background]="statusColors[eq.status]"></i>
                  <select #eqStatus [class]="selectClass" (change)="setEquipmentStatus(eq.id, eqStatus.value)">
                    @for (s of statuses; track s) {
                      <option [value]="s" [selected]="eq.status === s">{{ statusLabels[s] }}</option>
                    }
                  </select>
                </div>
              </div>
              <dl class="detail-grid">
                <dt>Manutenção</dt>
                <dd>{{ priorityLabels[eq.maintenance.priority] }}</dd>
                <dt>Próxima data</dt>
                <dd>{{ eq.maintenance.nextDate ? formatDate(eq.maintenance.nextDate) : '–' }}</dd>
              </dl>
              <div class="p-3 rounded-lg bg-fogo-bg border border-fogo-border space-y-0.5">
                <p class="font-medium">{{ eq.location.street }}</p>
                <p class="text-xs text-fogo-muted">Referência: {{ eq.location.reference }}</p>
                <p class="text-xs text-fogo-muted">{{ eq.location.neighborhood }} · {{ eq.location.cityUf }} · CEP {{ eq.location.cep }}</p>
                <p class="text-[12px] font-mono text-fogo-muted">{{ eq.location.lat.toFixed(5) }}, {{ eq.location.lng.toFixed(5) }}</p>
              </div>
              <div>
                <span class="text-xs text-fogo-muted">Propriedades específicas</span>
                <dl class="detail-grid mt-1">
                  @for (p of describe(eq); track p.label) {
                    <dt>{{ p.label }}</dt>
                    <dd>{{ p.value }}</dd>
                  }
                </dl>
              </div>
            </div>
            <div class="p-3 border-t border-fogo-border">
              <button type="button" (click)="requestEdit('equipment', eq.id)" class="btn-secondary w-full">Editar no inventário</button>
            </div>
          } @else if (city.selectedAgent(); as ag) {
            <div class="p-4 border-b border-fogo-border flex items-start justify-between gap-2">
              <div>
                <p class="text-xs text-fogo-muted">{{ roleLabels[ag.role] }} · {{ ag.agency }}</p>
                <h2 class="text-base font-semibold">{{ ag.name }}</h2>
                <p class="text-sm text-fogo-muted">Matrícula {{ ag.badgeNumber }}</p>
              </div>
              <button type="button" (click)="city.selection.set(null)" class="text-xs text-fogo-muted hover:text-fogo-sand cursor-pointer" aria-label="Fechar detalhes">
                ✕ Fechar
              </button>
            </div>
            <div class="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
              <div class="space-y-1.5">
                <span class="text-xs text-fogo-muted">Status</span>
                <select #agStatus [class]="selectClass" (change)="setAgentStatus(ag, agStatus.value)">
                  @for (s of agentStatuses; track s) {
                    <option [value]="s" [selected]="ag.status === s">{{ agentStatusLabels[s] }}</option>
                  }
                </select>
              </div>
              <dl class="detail-grid">
                <dt>Bairro</dt>
                <dd>{{ ag.neighborhood }}</dd>
                <dt>Posição</dt>
                <dd class="font-mono text-xs">{{ ag.lat.toFixed(5) }}, {{ ag.lng.toFixed(5) }}</dd>
              </dl>
            </div>
            <div class="p-3 border-t border-fogo-border">
              <button type="button" (click)="requestEdit('agent', ag.id)" class="btn-secondary w-full">Editar no inventário</button>
            </div>
          } @else {
            <div class="p-4 border-b border-fogo-border flex items-center justify-between">
              <h2 class="text-sm font-semibold">Alertas e manutenção</h2>
              <span class="text-xs px-2 py-0.5 rounded bg-fogo-red/20 text-fogo-red border border-fogo-red/40">
                {{ city.alerts().length }} ativos
              </span>
            </div>
            <div class="flex-1 overflow-y-auto p-3 space-y-2">
              @for (alert of city.alerts(); track alert.id) {
                <button
                  type="button"
                  (click)="city.selection.set(alert.target)"
                  class="w-full text-left rounded-lg border p-3 bg-fogo-bg hover:border-fogo-ember cursor-pointer"
                  [class]="alert.severity === 'critical' ? 'border-fogo-red/60' : alert.severity === 'high' ? 'border-fogo-amber/60' : 'border-fogo-border'"
                >
                  <span
                    class="text-[12px] font-semibold uppercase tracking-wide"
                    [class]="alert.severity === 'critical' ? 'text-fogo-red' : alert.severity === 'high' ? 'text-fogo-amber' : 'text-fogo-muted'"
                  >
                    {{ alert.severity === 'critical' ? 'Crítico' : alert.severity === 'high' ? 'Alta' : 'Preventiva' }}{{ alert.target.kind === 'agent' ? ' · Agente' : '' }}
                  </span>
                  <p class="text-sm font-medium mt-0.5">{{ alert.title }}</p>
                  <p class="text-xs text-fogo-muted mt-0.5">{{ alert.detail }}</p>
                </button>
              } @empty {
                <p class="text-center text-sm text-fogo-muted py-10">Nenhum alerta na visão atual.</p>
              }
            </div>
            <p class="px-4 py-2 border-t border-fogo-border text-[12px] text-fogo-muted">
              Clique em um alerta ou marcador para ver os detalhes.
            </p>
          }
        </aside>
      </div>

      <!-- Visão consolidada por região + eventos ao vivo -->
      <div class="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <section class="xl:col-span-8 space-y-2">
          <h2 class="text-sm font-semibold">Visão consolidada por região</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            @for (r of city.regions(); track r.neighborhood) {
              <button
                type="button"
                (click)="focusRegion(r)"
                class="text-left bg-fogo-panel border rounded-xl p-3.5 space-y-2 hover:bg-[#222b2f] cursor-pointer"
                [style.border-color]="healthColors[r.health] + '80'"
              >
                <div class="flex items-center justify-between gap-2">
                  <div>
                    <p class="text-sm font-semibold">{{ r.neighborhood }}</p>
                    <p class="text-[12px] text-fogo-muted">{{ r.zone }}</p>
                  </div>
                  <span
                    class="text-xs font-semibold px-2 py-0.5 rounded border"
                    [style.color]="healthColors[r.health]"
                    [style.border-color]="healthColors[r.health]"
                  >
                    {{ healthLabels[r.health] }}
                  </span>
                </div>
                <div class="h-1.5 rounded-full bg-fogo-bg overflow-hidden">
                  <div class="h-full" [style.width.%]="r.unavailableRatio * 100" [style.background]="healthColors[r.health]"></div>
                </div>
                <div class="flex justify-between text-xs text-fogo-muted">
                  <span>{{ r.unavailable }}/{{ r.total }} indisponíveis ({{ (r.unavailableRatio * 100).toFixed(0) }}%)</span>
                  <span>{{ r.activeAgents }} agente(s)</span>
                </div>
              </button>
            }
          </div>
          <p class="text-[12px] text-fogo-muted">
            Critério: indisponíveis ÷ instalados – Normal &lt; 15%, Atenção 15–30%, Crítico ≥ 30%.
          </p>
        </section>

        <section class="xl:col-span-4 bg-fogo-panel border border-fogo-border rounded-xl flex flex-col max-h-[300px]">
          <h2 class="text-sm font-semibold px-4 py-3 border-b border-fogo-border">Eventos recentes</h2>
          <ul class="flex-1 overflow-y-auto p-3 space-y-1.5 text-xs">
            @for (ev of city.events(); track ev.id) {
              <li class="flex gap-2">
                <span class="font-mono text-fogo-muted shrink-0">{{ ev.time }}</span>
                <span [class]="ev.tone === 'bad' ? 'text-fogo-red' : ev.tone === 'good' ? 'text-fogo-green' : 'text-fogo-sand'">{{ ev.message }}</span>
              </li>
            } @empty {
              <li class="text-fogo-muted">Ative a telemetria ou altere um item para ver os eventos aqui.</li>
            }
          </ul>
        </section>
      </div>
    </div>
  `,
  styles: `
    .kpi { @apply bg-fogo-panel border border-fogo-border rounded-xl p-3.5 flex flex-col; }
    .kpi-label { @apply text-xs text-fogo-muted; }
    .kpi-value { @apply text-2xl font-semibold font-mono mt-0.5; }
    .kpi-sub { @apply text-[12px] text-fogo-muted mt-0.5; }
    .dot { @apply inline-block w-2.5 h-2.5 rounded-full shrink-0; }
    .legend-ring { @apply inline-block w-3 h-3 rounded-full shrink-0 border-2; }
    .legend-square { @apply inline-block w-3 h-3 rounded-[3px] shrink-0; }
    .detail-grid { @apply grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm; }
    .detail-grid dt { @apply text-fogo-muted; }
    .btn-secondary { @apply py-2 px-3 rounded-lg bg-fogo-bg border border-fogo-border text-sm hover:border-fogo-ember cursor-pointer; }
  `,
})
export class OpsCenterComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  readonly city = inject(CityStateService);
  private readonly ui = inject(UiStateService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly selectClass = SELECT_CLASS;
  readonly filterSelectClass = SELECT_CLASS.replace('text-sm', 'text-[15px]');
  readonly emptyFilters = EMPTY_FILTERS;
  readonly types = EQUIPMENT_TYPES;
  readonly statuses = EQUIPMENT_STATUSES;
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
  readonly legendOpen = signal(true);
  /** SVGs estáticos gerados localmente por glyph(), seguros para innerHTML. */
  readonly typeGlyphs = Object.fromEntries(
    EQUIPMENT_TYPES.map((t) => [t, inject(DomSanitizer).bypassSecurityTrustHtml(glyph(t, '#e9e4d8'))])
  ) as Record<EquipmentType, SafeHtml>;
  readonly healthLabels = HEALTH_LABELS;
  readonly healthColors = HEALTH_COLORS;

  private L: typeof Leaflet | null = null;
  private map: Leaflet.Map | null = null;
  private layer: Leaflet.LayerGroup | null = null;
  private districtLayer: Leaflet.LayerGroup | null = null;
  private cityBounds: Leaflet.LatLngBounds | null = null;
  private readonly mapReady = signal(false);

  constructor() {
    effect(() => {
      const equipment = this.city.filteredEquipment();
      const agents = this.city.filteredAgents();
      const regions = this.city.regions();
      const selectedId = this.city.selection()?.id ?? null;
      if (this.mapReady()) this.render(equipment, agents, regions, selectedId);
    });

    // Centraliza o mapa apenas quando a seleção muda (não a cada tick de telemetria).
    effect(() => {
      const selection = this.city.selection();
      if (!this.mapReady() || !selection || !this.map) return;
      const point = untracked(() =>
        selection.kind === 'equipment'
          ? this.city.equipment().find((e) => e.id === selection.id)?.location
          : this.city.agents().find((a) => a.id === selection.id)
      );
      if (point) this.map.flyTo([point.lat, point.lng], Math.max(this.map.getZoom(), 15), { duration: 0.8 });
    });

    effect(() => {
      const name = this.city.filters().neighborhood;
      if (!this.mapReady() || !this.map) return;
      const hood = NEIGHBORHOODS.find((n) => n.name === name);
      if (hood) this.map.flyToBounds(hood.polygon, { padding: [24, 24], duration: 0.8 });
      else if (!untracked(() => this.city.selection()) && this.cityBounds) {
        this.map.flyToBounds(this.cityBounds, { padding: [16, 16], duration: 0.8 });
      }
    });

    // Pedidos de foco vindos da missão de calibração, dos cenários e da voz.
    effect(() => {
      const focus = this.ui.mapFocus();
      if (!this.mapReady() || !this.map || !focus) return;
      if (focus.kind === 'point') {
        this.map.flyTo([focus.lat, focus.lng], 16, { duration: 0.8 });
      } else {
        const district = NEIGHBORHOODS.find((n) => n.name === focus.name);
        if (district) this.map.flyToBounds(district.polygon, { padding: [24, 24], duration: 0.8 });
      }
    });
  }

  async ngAfterViewInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const module = await import('leaflet');
    this.L = (module.default ?? module) as typeof Leaflet;

    const L = this.L;
    this.cityBounds = L.latLngBounds(CITY_MAP.outline);
    this.map = L.map(this.mapEl.nativeElement, {
      zoomSnap: 0.25,
      maxZoom: 18,
      maxBounds: this.cityBounds.pad(0.3),
      maxBoundsViscosity: 0.8,
      attributionControl: false,
    });
    this.map.fitBounds(this.cityBounds, { padding: [16, 16] });
    this.map.setMinZoom(this.map.getZoom() - 0.5);
    this.drawBaseMap(L, this.map);

    this.districtLayer = L.layerGroup().addTo(this.map);
    this.layer = L.layerGroup().addTo(this.map);
    this.mapReady.set(true);
  }

  ngOnDestroy(): void {
    this.map?.remove();
    this.map = null;
  }

  setFilter(key: keyof OpsFilters, value: string): void {
    this.city.filters.update((f) => ({ ...f, [key]: value }));
  }

  /** Clique na legenda: aplica o filtro ou, se já ativo, volta para "todos". */
  toggleFilter(key: 'type' | 'status', value: string): void {
    this.setFilter(key, this.city.filters()[key] === value ? 'all' : value);
  }

  statusBorder(status: EquipmentStatus): string {
    return statusBorder(status);
  }

  setEquipmentStatus(id: string, value: string): void {
    this.city.setEquipmentStatus(id, value as EquipmentStatus);
  }

  setAgentStatus(agent: Agent, value: string): void {
    this.city.upsertAgent({ ...agent, status: value as AgentStatus });
  }

  requestEdit(kind: 'equipment' | 'agent', id: string): void {
    this.ui.openInventory({ mode: 'edit', kind, id });
  }

  focusRegion(region: RegionSummary): void {
    const district = NEIGHBORHOODS.find((n) => n.name === region.neighborhood);
    if (district) this.map?.flyToBounds(district.polygon, { padding: [24, 24], duration: 0.8 });
  }

  describe(eq: Equipment) {
    return describeCustomProperties(eq);
  }

  formatDate(iso: string): string {
    const days = daysUntil(iso);
    const label = days < 0 ? `vencida há ${-days} dia(s)` : days === 0 ? 'hoje' : `em ${days} dia(s)`;
    return `${iso.split('-').reverse().join('/')} (${label})`;
  }

  /** Desenha a cidade fictícia: terreno, bairros, rio, parques, vias e nomes. */
  private drawBaseMap(L: typeof Leaflet, map: Leaflet.Map): void {
    const panes: [string, number][] = [['land', 200], ['districts', 250], ['features', 300], ['names', 350]];
    for (const [name, z] of panes) {
      map.createPane(name).style.zIndex = String(z);
    }
    map.getPane('names')!.style.pointerEvents = 'none';

    L.polygon(CITY_MAP.outline, { pane: 'land', stroke: false, fillColor: '#182124', fillOpacity: 1, interactive: false }).addTo(map);
    for (const d of NEIGHBORHOODS) {
      L.polygon(d.polygon, { pane: 'land', color: '#2f3b40', weight: 1, dashArray: '4 4', fill: false, interactive: false }).addTo(map);
    }
    for (const park of CITY_MAP.parks) {
      L.polygon(park.polygon, { pane: 'features', stroke: false, fillColor: '#1d2e24', fillOpacity: 1 })
        .bindTooltip(park.name, { sticky: true })
        .addTo(map);
    }

    // Linhas com espessura em "metros": acompanham o zoom como numa cidade de verdade.
    const scaled: { line: Leaflet.Polyline; base: number }[] = [];
    const addLine = (path: [number, number][], color: string, base: number, name: string) => {
      const line = L.polyline(path, { pane: 'features', color, weight: base, lineCap: 'round', lineJoin: 'round' })
        .bindTooltip(name, { sticky: true })
        .addTo(map);
      scaled.push({ line, base });
    };
    addLine(CITY_MAP.river.path, '#1c3442', 10, CITY_MAP.river.name);
    L.polygon(CITY_MAP.lake.polygon, { pane: 'features', stroke: false, fillColor: '#1c3442', fillOpacity: 1 })
      .bindTooltip(CITY_MAP.lake.name, { sticky: true })
      .addTo(map);
    const roadStyle = { highway: ['#4d575b', 5], avenue: ['#3b474c', 3.5], street: ['#2e393d', 1.8] } as const;
    for (const kind of ['street', 'avenue', 'highway'] as const) {
      for (const road of CITY_MAP.roads.filter((r) => r.kind === kind)) addLine(road.path, roadStyle[kind][0], roadStyle[kind][1], road.name);
    }
    const rescale = () => {
      const factor = Math.min(4, Math.max(0.5, 2 ** (map.getZoom() - 14)));
      for (const { line, base } of scaled) line.setStyle({ weight: base * factor });
    };
    map.on('zoomend', rescale);
    rescale();

    for (const d of NEIGHBORHOODS) {
      L.marker([d.lat, d.lng], {
        pane: 'names',
        interactive: false,
        icon: L.divIcon({ className: 'district-name', html: d.name, iconSize: [160, 16], iconAnchor: [80, 8] }),
      }).addTo(map);
    }
  }

  private render(equipment: Equipment[], agents: Agent[], regions: RegionSummary[], selectedId: string | null): void {
    const L = this.L;
    if (!L || !this.layer) return;
    this.layer.clearLayers();

    // Coroplético: cada bairro pintado conforme a saúde operacional.
    this.districtLayer?.clearLayers();
    for (const r of regions) {
      const district = NEIGHBORHOODS.find((n) => n.name === r.neighborhood);
      if (!district) continue;
      L.polygon(district.polygon, {
        pane: 'districts',
        color: HEALTH_COLORS[r.health],
        weight: 1.5,
        opacity: 0.55,
        fillColor: HEALTH_COLORS[r.health],
        fillOpacity: 0.1,
        interactive: false,
      }).addTo(this.districtLayer!);
    }

    for (const e of equipment) {
      const color = STATUS_COLORS[e.status];
      const selected = e.id === selectedId;
      const size = selected ? 40 : 30;
      L.marker([e.location.lat, e.location.lng], {
        zIndexOffset: selected ? 1000 : 0,
        icon: L.divIcon({
          className: '',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:#101517;border:${selected ? 4 : 2.5}px solid ${color};display:flex;align-items:center;justify-content:center;border-style:${statusBorder(e.status)};${selected ? 'box-shadow:0 0 0 4px rgba(255,122,61,.45);' : ''}">${glyph(e.type, color)}</div>`,
        }),
      })
        .bindTooltip(`${TYPE_LABELS[e.type]} · ${STATUS_LABELS[e.status]}`, { direction: 'top' })
        .on('click', () => this.city.selection.set({ kind: 'equipment', id: e.id }))
        .addTo(this.layer);
    }

    for (const a of agents) {
      const color = AGENT_STATUS_COLORS[a.status];
      const selected = a.id === selectedId;
      const abbr = a.role === 'military_police' ? 'PM' : a.role === 'municipal_guard' ? 'GM' : 'AT';
      L.marker([a.lat, a.lng], {
        zIndexOffset: selected ? 1000 : 500,
        icon: L.divIcon({
          className: '',
          iconSize: [26, 26],
          iconAnchor: [13, 13],
          html: `<div style="width:26px;height:26px;border-radius:5px;background:${color};border:2px solid ${selected ? '#ff7a3d' : '#101517'};color:#101517;font:700 10px/22px sans-serif;text-align:center;">${abbr}</div>`,
        }),
      })
        .bindTooltip(`${escapeHtml(a.name)} · ${AGENT_STATUS_LABELS[a.status]}`, { direction: 'top' })
        .on('click', () => this.city.selection.set({ kind: 'agent', id: a.id }))
        .addTo(this.layer);
    }
  }
}

/** Furtado = tracejado, não instalado = pontilhado: reforça a cor para quem não distingue tons. */
function statusBorder(status: EquipmentStatus): string {
  return status === 'stolen' ? 'dashed' : status === 'not_installed' ? 'dotted' : 'solid';
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function glyph(type: EquipmentType, stroke: string): string {
  const paths: Record<EquipmentType, string> = {
    radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
    truck_scale: '<rect x="2" y="7" width="20" height="10" rx="2"/><path d="M6 12h12"/>',
    autonomous_vehicle: '<rect x="4" y="8" width="16" height="10" rx="3"/><path d="M12 4v4"/>',
    barrier_gate: '<path d="M4 18V6h4v12zM8 9h13l-2 4H8"/>',
    transport_vehicle: '<rect x="4" y="3" width="16" height="15" rx="2"/><path d="M4 11h16M7 21v-3M17 21v-3"/>',
    parking_totem: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 7h3a2 2 0 0 1 0 4h-3V7v9"/>',
    scooter: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l5-8h4l3 8"/>',
    agent_moto: '<circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="M5 17h6l3-6h3l2 6M12 7h3"/>',
    patrol_car: '<path d="M12 2l7 4v6c0 5-3.5 9-7 10-3.5-1-7-5-7-10V6z"/>',
    other: '<path d="M12 2l8.5 5v10L12 22l-8.5-5V7z"/><circle cx="12" cy="12" r="1.5"/>',
  };
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2">${paths[type]}</svg>`;
}
