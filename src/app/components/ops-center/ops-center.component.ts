import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { LucideDynamicIcon } from '@lucide/angular';
import type * as LeafletNamespace from 'leaflet';
import {
  AnomalyAlert,
  DeviceInventoryService,
  RegionClusterSummary,
} from '../../services/device-inventory.service';
import { StoryService } from '../../services/story.service';
import { CityDevice, DeviceCategory, DeviceStatus, FieldAgent } from '../../models/fogo.models';

@Component({
  selector: 'app-ops-center',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  template: `
    <div class="relative w-full h-[calc(100vh-8.2rem)] min-h-[600px] bg-[#101517] text-[#e9e4d8] overflow-hidden select-none">
      <!-- Mapa Leaflet em tela cheia -->
      <div #mapContainer class="absolute inset-0 z-0 w-full h-full"></div>

      <!-- Controles Superiores do Mapa e Legenda Sóbria -->
      <div class="absolute top-4 left-4 right-4 lg:right-[396px] z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div class="flex flex-wrap items-center gap-1.5 bg-[#1a2124]/95 border border-[#2a3439] rounded-lg p-1.5 pointer-events-auto shadow-xl">
          <button
            type="button"
            (click)="setLayerFilter('all')"
            [class]="layerFilter() === 'all'
              ? 'px-3 py-1 text-xs font-semibold rounded bg-[#ff7a3d] text-[#101517]'
              : 'px-3 py-1 text-xs text-[#a39e93] hover:text-[#e9e4d8] rounded'"
          >
            Todos ({{ inventory.totalDevices() }})
          </button>
          <button
            type="button"
            (click)="setLayerFilter('anomalies')"
            [class]="layerFilter() === 'anomalies'
              ? 'px-3 py-1 text-xs font-semibold rounded bg-[#d9534f] text-[#e9e4d8]'
              : 'px-3 py-1 text-xs text-[#a39e93] hover:text-[#e9e4d8] rounded'"
          >
            Falhas e furtos ({{ inventory.criticalFailureDevicesCount() }})
          </button>
          <button
            type="button"
            (click)="setLayerFilter('radar_camera')"
            [class]="layerFilter() === 'radar_camera'
              ? 'px-3 py-1 text-xs font-semibold rounded bg-[#2a3439] text-[#e9e4d8]'
              : 'px-3 py-1 text-xs text-[#a39e93] hover:text-[#e9e4d8] rounded'"
          >
            Radares e câmeras
          </button>
          <button
            type="button"
            (click)="toggleClusters()"
            [class]="showRegionClusters()
              ? 'px-3 py-1 text-xs font-semibold rounded bg-[#2a3439] text-[#e9e4d8]'
              : 'px-3 py-1 text-xs text-[#a39e93] hover:text-[#e9e4d8] rounded'"
          >
            Saúde por bairro: {{ showRegionClusters() ? 'Visível' : 'Oculta' }}
          </button>
          <button
            type="button"
            (click)="toggleAgentsLayer()"
            [class]="showAgents()
              ? 'px-3 py-1 text-xs font-semibold rounded bg-[#2a3439] text-[#e9e4d8]'
              : 'px-3 py-1 text-xs text-[#a39e93] hover:text-[#e9e4d8] rounded'"
          >
            Agentes ({{ inventory.activeAgentsCount() }})
          </button>
          <button
            type="button"
            (click)="resetMapView()"
            class="px-2.5 py-1 text-xs text-[#e9e4d8] hover:text-[#ff7a3d] bg-[#101517] border border-[#2a3439] rounded flex items-center gap-1"
          >
            <svg lucideIcon="compass" class="w-3.5 h-3.5"></svg>
            Centralizar mapa
          </button>
        </div>

        <!-- Legenda acessível (cor + símbolo) -->
        <div class="hidden xl:flex items-center gap-3 bg-[#1a2124]/95 border border-[#2a3439] rounded-lg px-3.5 py-1.5 text-xs pointer-events-auto shadow-xl">
          <span class="flex items-center gap-1.5 text-[#e9e4d8]">
            <span class="w-2.5 h-2.5 rounded-full bg-[#4ca975]"></span>
            ● Operacional
          </span>
          <span class="flex items-center gap-1.5 text-[#e9e4d8]">
            <span class="w-2.5 h-2.5 rounded-full bg-[#d9534f]"></span>
            ▲ Falha
          </span>
          <span class="flex items-center gap-1.5 text-[#e9e4d8]">
            <span class="w-2.5 h-2.5 rounded-full bg-[#d99b38]"></span>
            ◆ Manutenção
          </span>
          <span class="flex items-center gap-1.5 text-[#e9e4d8]">
            <span class="w-2.5 h-2.5 rounded-full bg-[#8c6bb1]"></span>
            ✖ Furtado
          </span>
          <span class="flex items-center gap-1.5 text-[#a39e93]">
            <span class="w-2.5 h-2.5 rounded-full bg-[#6c767a]"></span>
            ◌ Sem verificação
          </span>
        </div>
      </div>

      <!-- Faixa Inferior: Saúde e Risco Territorial por Bairro -->
      <div class="absolute bottom-4 left-4 right-4 lg:right-[396px] z-10 pointer-events-none">
        <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 pointer-events-auto">
          @for (region of inventory.regionSummaries(); track region.region) {
            <button
              type="button"
              (click)="flyToRegion(region)"
              class="text-left bg-[#1a2124]/95 hover:bg-[#222b2f] border border-[#2a3439] rounded-lg p-2.5 transition-colors shadow-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#ff7a3d]"
            >
              <div class="flex items-center justify-between gap-1 mb-1">
                <span class="text-xs font-medium text-[#e9e4d8] truncate">
                  {{ region.region.replace('Zona ', 'Z. ') }}
                </span>
                <span
                  class="text-[11px] font-semibold"
                  [class]="region.irtScore >= 75 ? 'text-[#ff7a3d]' : 'text-[#a39e93]'"
                >
                  IRT {{ region.irtScore }}
                </span>
              </div>
              <div class="w-full h-1.5 bg-[#101517] rounded-full overflow-hidden mb-1">
                <div
                  class="h-full transition-all duration-300"
                  [style.width.%]="region.healthScore"
                  [class]="region.healthScore >= 80
                    ? 'bg-[#4ca975]'
                    : region.healthScore >= 60
                      ? 'bg-[#d99b38]'
                      : 'bg-[#d9534f]'"
                ></div>
              </div>
              <div class="flex items-center justify-between text-[11px] text-[#a39e93]">
                <span>Saúde {{ region.healthScore }}%</span>
                <span>{{ region.operationalCount }}/{{ region.totalDevices }} ativos</span>
              </div>
            </button>
          }
        </div>
      </div>

      <!-- Painel Lateral: Feed de Alertas e Contenção da Barreira 2 -->
      <aside class="absolute top-4 bottom-4 right-4 w-[368px] max-w-[calc(100vw-2rem)] z-10 flex flex-col bg-[#1a2124]/95 border border-[#2a3439] rounded-xl shadow-2xl overflow-hidden">
        <div class="p-4 border-b border-[#2a3439] bg-[#101517]/80 space-y-1">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold text-[#e9e4d8]">
              Feed de alertas ativos
            </h2>
            <span class="px-2 py-0.5 text-xs font-semibold rounded bg-[#d9534f]/20 text-[#f28b88] border border-[#d9534f]/40">
              {{ inventory.activeAnomalies().length }} pendentes
            </span>
          </div>
          <p class="text-xs text-[#a39e93]">
            @if (story.barrier() === 2 && !story.barrierTwoCleared()) {
              Barreira 2: trate os alertas abaixo até reduzir as falhas críticas para 6 ou menos (atual: {{ inventory.criticalFailureDevicesCount() }}).
            } @else {
              Clique num alerta para focar o equipamento no mapa e despachar suporte.
            }
          </p>
        </div>

        @if (inventory.weatherState() === 'torrential_rain') {
          <div class="px-4 py-2.5 bg-[#ff7a3d]/15 border-b border-[#ff7a3d]/40 flex items-center justify-between text-xs">
            <div class="flex items-center gap-2 text-[#ff7a3d] font-medium">
              <svg lucideIcon="cloud-rain-wind" class="w-4 h-4 shrink-0"></svg>
              <span>Chuva torrencial na Zona Sul (IRT 92)</span>
            </div>
            <span class="text-[11px] bg-[#ff7a3d] text-[#101517] px-1.5 py-0.5 rounded font-semibold">
              4 alagamentos
            </span>
          </div>
        }

        <div class="flex-1 overflow-y-auto p-3 space-y-2.5">
          @for (alert of inventory.activeAnomalies(); track alert.id) {
            <div
              (click)="selectAnomalyAlert(alert)"
              class="cursor-pointer rounded-lg border p-3.5 transition-colors"
              [class]="selectedDeviceId() === alert.deviceId
                ? 'bg-[#232c30] border-[#ff7a3d]'
                : alert.severity === 'critical'
                  ? 'bg-[#101517] border-[#d9534f]/60 hover:border-[#ff7a3d]'
                  : 'bg-[#101517]/80 border-[#2a3439] hover:border-[#a39e93]'"
            >
              <div class="flex items-start justify-between gap-2 mb-1">
                <span
                  class="px-2 py-0.5 text-[11px] font-semibold rounded"
                  [class]="alert.severity === 'critical'
                    ? 'bg-[#8c6bb1]/25 text-[#cdb5e8] border border-[#8c6bb1]/50'
                    : alert.severity === 'high'
                      ? 'bg-[#d9534f]/20 text-[#f28b88] border border-[#d9534f]/40'
                      : 'bg-[#d99b38]/20 text-[#f0c271] border border-[#d99b38]/40'"
                >
                  {{ alert.severity === 'critical' ? (alert.isFloodAlert ? '▲ Alagamento crítico' : '✖ Furto / Corte') : alert.severity === 'high' ? '▲ Falha crítica' : '◆ Urgente' }}
                </span>
                <span class="text-xs text-[#a39e93]">
                  {{ getCategoryLabel(alert.category) }}
                </span>
              </div>

              <h3 class="text-sm font-semibold text-[#e9e4d8] mt-1">
                {{ alert.serialNumber }} — {{ alert.street }}
              </h3>

              <p class="text-xs text-[#a39e93] mt-1 leading-relaxed">
                {{ alert.description }}
              </p>

              <div class="mt-3 pt-2.5 border-t border-[#2a3439] flex items-center justify-between gap-2 text-xs">
                <span class="text-[#a39e93] truncate">
                  {{ alert.neighborhood }}
                </span>
                <div class="flex items-center gap-1.5 shrink-0">
                  @if (alert.suggestedAgent) {
                    <button
                      type="button"
                      (click)="dispatchToAnomaly($event, alert)"
                      class="px-2.5 py-1 rounded bg-[#ff7a3d] hover:bg-[#ff8b55] text-[#101517] font-semibold text-xs transition-colors cursor-pointer"
                    >
                      Despachar {{ alert.suggestedAgent.badgeNumber }}
                    </button>
                  }
                  <button
                    type="button"
                    (click)="stabilizeAnomaly($event, alert)"
                    class="px-2.5 py-1 rounded bg-[#1a2124] hover:bg-[#2a3439] text-[#e9e4d8] border border-[#2a3439] text-xs cursor-pointer"
                  >
                    Estabilizar
                  </button>
                </div>
              </div>
            </div>
          } @empty {
            <div class="text-center py-12 px-4 text-[#a39e93] text-sm">
              Nenhuma anomalia ativa no momento.
            </div>
          }
        </div>

        <div class="p-3 border-t border-[#2a3439] bg-[#101517] text-xs text-[#a39e93]">
          <div class="flex items-center justify-between">
            <span>Rotas táticas ativas:</span>
            <strong class="text-[#4ca975]">{{ inventory.tacticalCorridors().length }} corredor(es)</strong>
          </div>
        </div>
      </aside>
    </div>
  `,
})
export class OpsCenterComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  readonly inventory = inject(DeviceInventoryService);
  readonly story = inject(StoryService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly layerFilter = signal<'all' | 'anomalies' | 'radar_camera'>('all');
  readonly showRegionClusters = signal<boolean>(true);
  readonly showAgents = signal<boolean>(true);
  readonly selectedDeviceId = signal<string | null>(null);

  private L: typeof LeafletNamespace | null = null;
  private map: LeafletNamespace.Map | null = null;
  private deviceMarkersLayer: LeafletNamespace.LayerGroup | null = null;
  private agentMarkersLayer: LeafletNamespace.LayerGroup | null = null;
  private clusterMarkersLayer: LeafletNamespace.LayerGroup | null = null;
  private corridorsLayer: LeafletNamespace.LayerGroup | null = null;
  private markerByDeviceId = new Map<string, LeafletNamespace.Marker>();

  readonly filteredDevices = computed(() => {
    const mode = this.layerFilter();
    const list = this.inventory.devices();
    if (mode === 'anomalies') {
      return list.filter(
        (d) =>
          d.status === 'stolen' ||
          d.status === 'malfunction' ||
          d.maintenance.urgency === 'immediate'
      );
    }
    if (mode === 'radar_camera') {
      return list.filter((d) => d.category === 'radar' || d.category === 'camera');
    }
    return list;
  });

  constructor() {
    effect(() => {
      const devices = this.filteredDevices();
      const agents = this.inventory.agents();
      const summaries = this.inventory.regionSummaries();
      const corridors = this.inventory.tacticalCorridors();
      const showClusters = this.showRegionClusters();
      const showAgentsFlag = this.showAgents();
      // Re-render when verification or act changes so markers light up and ember glow updates
      const verifiedCount = this.story.verifiedDeviceIds().length;
      const currentAct = this.story.act();

      if (this.map && this.L && verifiedCount >= 0 && currentAct >= 1) {
        this.renderMapLayers(
          devices,
          agents,
          summaries,
          corridors,
          showClusters,
          showAgentsFlag
        );
      }
    });

    effect(() => {
      const target = this.inventory.selectedMapTarget();
      if (target && this.map) {
        this.map.flyTo([target.lat, target.lng], target.zoom, {
          animate: true,
          duration: 1.0,
        });

        if (target.deviceId) {
          this.selectedDeviceId.set(target.deviceId);
          setTimeout(() => {
            const marker = this.markerByDeviceId.get(target.deviceId!);
            if (marker) {
              marker.openPopup();
            }
          }, 600);
        }
      }
    });
  }

  async ngAfterViewInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const leafletModule = await import('leaflet');
    this.L = (leafletModule.default ?? leafletModule) as typeof LeafletNamespace;

    this.initMap();
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  setLayerFilter(filter: 'all' | 'anomalies' | 'radar_camera'): void {
    this.layerFilter.set(filter);
  }

  toggleClusters(): void {
    this.showRegionClusters.update((v) => !v);
  }

  toggleAgentsLayer(): void {
    this.showAgents.update((v) => !v);
  }

  resetMapView(): void {
    if (!this.map) return;
    this.map.flyTo([-8.0725, -34.9055], 12, { animate: true, duration: 0.9 });
  }

  flyToRegion(region: RegionClusterSummary): void {
    if (!this.map) return;
    this.map.flyTo([region.centerLat, region.centerLng], 14, {
      animate: true,
      duration: 0.9,
    });
  }

  selectAnomalyAlert(alert: AnomalyAlert): void {
    this.selectedDeviceId.set(alert.deviceId);
    this.story.verifyDeviceCluster(alert.deviceId);
    this.inventory.focusOnDevice(alert.deviceId, 16);
  }

  dispatchToAnomaly(event: MouseEvent, alert: AnomalyAlert): void {
    event.stopPropagation();
    this.story.verifyDeviceCluster(alert.deviceId);
    this.inventory.dispatchAgentToDevice(alert.deviceId);
    // Despachar equipe estabiliza a anomalia crítica em campo
    this.inventory.updateDeviceStatus(
      alert.deviceId,
      'operational',
      'scheduled',
      'Contido por equipe despachada pela Central.'
    );
    this.story.recordAlertAction('dispatch', alert.serialNumber);
  }

  stabilizeAnomaly(event: MouseEvent, alert: AnomalyAlert): void {
    event.stopPropagation();
    this.story.verifyDeviceCluster(alert.deviceId);
    this.inventory.updateDeviceStatus(
      alert.deviceId,
      'operational',
      'none',
      'Sensor estabilizado remotamente pela Central.'
    );
    this.story.recordAlertAction('normalize', alert.serialNumber);
  }

  getCategoryLabel(category: DeviceCategory): string {
    const labels: Record<DeviceCategory, string> = {
      radar: 'Radar',
      camera: 'Câmera',
      truck_scale: 'Balança',
      autonomous_patrol: 'Patrulha autônoma',
      automated_barrier: 'Cancela',
      transit_vehicle: 'Transporte urbano',
      parking_totem: 'Totem rotativo',
      shared_micromobility: 'Micromobilidade',
      police_vehicle: 'Viatura',
    };
    return labels[category];
  }

  private initMap(): void {
    if (!this.L || !this.mapContainer?.nativeElement) return;

    this.map = this.L.map(this.mapContainer.nativeElement, {
      center: [-8.0725, -34.9055],
      zoom: 12,
      zoomControl: true,
      attributionControl: false,
    });

    this.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      subdomains: 'abc',
      maxZoom: 19,
      className: 'dark-matter-tiles',
    }).addTo(this.map);

    this.corridorsLayer = this.L.layerGroup().addTo(this.map);
    this.clusterMarkersLayer = this.L.layerGroup().addTo(this.map);
    this.deviceMarkersLayer = this.L.layerGroup().addTo(this.map);
    this.agentMarkersLayer = this.L.layerGroup().addTo(this.map);

    this.renderMapLayers(
      this.filteredDevices(),
      this.inventory.agents(),
      this.inventory.regionSummaries(),
      this.inventory.tacticalCorridors(),
      this.showRegionClusters(),
      this.showAgents()
    );
  }

  private renderMapLayers(
    devices: CityDevice[],
    agents: FieldAgent[],
    summaries: RegionClusterSummary[],
    corridors: ReturnType<DeviceInventoryService['tacticalCorridors']>,
    showClusters: boolean,
    showAgentsFlag: boolean
  ): void {
    if (!this.L || !this.map) return;

    this.deviceMarkersLayer?.clearLayers();
    this.agentMarkersLayer?.clearLayers();
    this.clusterMarkersLayer?.clearLayers();
    this.corridorsLayer?.clearLayers();
    this.markerByDeviceId.clear();

    const isAct3Complete = this.story.act() === 3;

    // 1. Corredores táticos
    for (const corr of corridors) {
      const color = corr.type === 'flood_bypass' ? '#ff7a3d' : '#4ca975';
      const polyline = this.L.polyline(corr.coordinates, {
        color,
        weight: 4,
        opacity: 0.85,
        dashArray: corr.type === 'flood_bypass' ? '8, 6' : undefined,
      });

      polyline.bindPopup(`
        <div class="text-xs space-y-1">
          <div class="font-semibold text-[#e9e4d8]">${corr.name}</div>
          <div class="text-[#a39e93]">Região: ${corr.region}</div>
        </div>
      `);
      this.corridorsLayer?.addLayer(polyline);
    }

    // 2. Bairros com brilho de brasa (#ff7a3d) proporcional ao IRT, apagando a cada barreira
    if (showClusters) {
      for (const summary of summaries) {
        // Quando o Ato 3 é alcançado (controle 100%), o brilho de risco apaga e a malha estabiliza em verde-suave
        const hasEmberRisk = !isAct3Complete && summary.irtScore >= 45;
        const glowColor = hasEmberRisk ? '#ff7a3d' : '#4ca975';
        const fillOpacity = isAct3Complete
          ? 0.05
          : Math.min(0.28, Math.max(0.05, (summary.irtScore / 100) * 0.26));

        const circle = this.L.circle([summary.centerLat, summary.centerLng], {
          radius: 980,
          color: glowColor,
          weight: hasEmberRisk ? 2 : 1,
          fillColor: glowColor,
          fillOpacity,
        });
        this.clusterMarkersLayer?.addLayer(circle);

        const badgeBorder = hasEmberRisk ? '#ff7a3d' : '#4ca975';
        const clusterHtml = `
          <div style="
            display:flex;
            flex-direction:column;
            align-items:center;
            justify-content:center;
            width:66px;
            height:66px;
            border-radius:9999px;
            background:rgba(26,33,36,0.94);
            border:2px solid ${badgeBorder};
            box-shadow:${hasEmberRisk ? `0 0 ${Math.round(summary.irtScore / 4)}px rgba(255,122,61,0.45)` : 'none'};
            color:#e9e4d8;
            font-family:inherit;
            text-align:center;
          ">
            <span style="font-size:12px;font-weight:700;color:${badgeBorder};line-height:1.1;">IRT ${summary.irtScore}</span>
            <span style="font-size:10px;color:#a39e93;line-height:1.15;">Saúde ${summary.healthScore}%</span>
          </div>
        `;

        const clusterMarker = this.L.marker([summary.centerLat, summary.centerLng], {
          icon: this.L.divIcon({
            html: clusterHtml,
            className: 'region-cluster-badge',
            iconSize: [66, 66],
            iconAnchor: [33, 33],
          }),
        });

        clusterMarker.bindPopup(`
          <div class="text-xs min-w-[200px] space-y-1.5">
            <div class="font-semibold text-[#e9e4d8] border-b border-[#2a3439] pb-1">${summary.region}</div>
            <div class="flex justify-between"><span>Índice de risco (IRT):</span><strong>${summary.irtScore}/100</strong></div>
            <div class="flex justify-between"><span>Saúde operacional:</span><strong>${summary.healthScore}%</strong></div>
            <div class="flex justify-between"><span>Equipamentos ativos:</span><span>${summary.operationalCount}/${summary.totalDevices}</span></div>
          </div>
        `);

        this.clusterMarkersLayer?.addLayer(clusterMarker);
      }
    }

    // 3. Marcadores de equipamentos (cinza se não verificado; cores reais se verificado ou Ato 3)
    for (const device of devices) {
      const verified = this.story.isDeviceVerified(device.id);
      const iconHtml = this.buildDeviceMarkerSvg(device, verified);
      const marker = this.L.marker([device.location.lat, device.location.lng], {
        icon: this.L.divIcon({
          html: iconHtml,
          className: 'tactical-device-pin',
          iconSize: [34, 34],
          iconAnchor: [17, 17],
          popupAnchor: [0, -17],
        }),
      });

      marker.bindPopup(this.buildDevicePopupHtml(device, verified));
      marker.on('click', () => {
        this.selectedDeviceId.set(device.id);
        this.story.verifyDeviceCluster(device.id);
      });

      this.deviceMarkersLayer?.addLayer(marker);
      this.markerByDeviceId.set(device.id, marker);
    }

    // 4. Agentes em campo
    if (showAgentsFlag) {
      for (const agent of agents) {
        const agentHtml = this.buildAgentMarkerSvg(agent);
        const marker = this.L.marker([agent.location.lat, agent.location.lng], {
          icon: this.L.divIcon({
            html: agentHtml,
            className: 'tactical-agent-pin',
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            popupAnchor: [0, -14],
          }),
        });

        marker.bindPopup(`
          <div class="text-xs min-w-[190px] space-y-1">
            <div class="font-semibold text-[#e9e4d8]">${agent.name} (${agent.badgeNumber})</div>
            <div class="text-[#a39e93]">${agent.battalion}</div>
            <div class="text-[#a39e93]">Último sinal: ${agent.lastPing}</div>
          </div>
        `);

        this.agentMarkersLayer?.addLayer(marker);
      }
    }
  }

  private getStatusRingColors(
    status: DeviceStatus,
    verified: boolean
  ): {
    ring: string;
    bg: string;
  } {
    if (!verified) {
      return { ring: '#6c767a', bg: '#1a2124' };
    }
    switch (status) {
      case 'operational':
        return { ring: '#4ca975', bg: '#101517' };
      case 'malfunction':
        return { ring: '#d9534f', bg: '#241414' };
      case 'maintenance':
        return { ring: '#d99b38', bg: '#241d12' };
      case 'stolen':
        return { ring: '#8c6bb1', bg: '#191321' };
      case 'disabled':
      case 'not_installed':
        return { ring: '#6c767a', bg: '#1a2124' };
    }
  }

  private buildDeviceMarkerSvg(device: CityDevice, verified: boolean): string {
    const { ring, bg } = this.getStatusRingColors(device.status, verified);
    const svgGlyph = this.getCategoryGlyphSvg(device.category, ring);

    return `
      <div style="
        position:relative;
        width:32px;
        height:32px;
        border-radius:9999px;
        background:${bg};
        border:2.5px solid ${ring};
        display:flex;
        align-items:center;
        justify-content:center;
      ">
        ${svgGlyph}
      </div>
    `;
  }

  private getCategoryGlyphSvg(category: DeviceCategory, strokeColor: string): string {
    switch (category) {
      case 'radar':
        return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></svg>`;
      case 'camera':
        return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`;
      case 'truck_scale':
        return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2"><rect x="2" y="7" width="20" height="10" rx="2"/><path d="M6 12h12"/></svg>`;
      case 'autonomous_patrol':
        return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2"><rect x="4" y="8" width="16" height="10" rx="3"/><path d="M12 4v4"/></svg>`;
      case 'automated_barrier':
        return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2"><path d="M4 18V6h4v12H4zM8 9h13l-2 4H8"/></svg>`;
      case 'transit_vehicle':
        return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2"><rect x="4" y="3" width="16" height="15" rx="2"/><path d="M4 11h16"/></svg>`;
      case 'parking_totem':
        return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="2"/></svg>`;
      case 'shared_micromobility':
        return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2"><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l5-8h4l3 8"/></svg>`;
      case 'police_vehicle':
        return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2"><path d="M12 2l7 4v6c0 5-3.5 9-7 10-3.5-1-7-5-7-10V6l7-4z"/></svg>`;
    }
  }

  private buildAgentMarkerSvg(agent: FieldAgent): string {
    const color =
      agent.status === 'responding'
        ? '#ff7a3d'
        : agent.status === 'patrolling'
          ? '#4ca975'
          : '#6c767a';

    return `
      <div style="
        width:26px;
        height:26px;
        border-radius:6px;
        background:#101517;
        border:2px solid ${color};
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:10px;
        font-weight:700;
        color:#e9e4d8;
      ">
        ${agent.role === 'military_police' ? 'PM' : agent.role === 'civil_guard' ? 'GM' : 'AG'}
      </div>
    `;
  }

  private buildDevicePopupHtml(device: CityDevice, verified: boolean): string {
    const { ring } = this.getStatusRingColors(device.status, verified);
    const issueHtml = device.maintenance.issueDescription
      ? `<div class="mt-1.5 p-1.5 rounded bg-[#d9534f]/15 border border-[#d9534f]/40 text-[#f28b88] text-[11px]">${device.maintenance.issueDescription}</div>`
      : '';

    return `
      <div class="text-xs min-w-[220px] space-y-1.5">
        <div class="flex items-center justify-between border-b border-[#2a3439] pb-1">
          <strong class="text-[#e9e4d8]">${device.serialNumber}</strong>
          <span style="color:${ring}" class="font-semibold">${verified ? device.status : 'Verificado agora'}</span>
        </div>
        <div class="text-[#e9e4d8] font-medium">${device.brand} · ${device.model}</div>
        <div class="text-[#a39e93]">
          ${device.location.street} · ${device.location.neighborhood}<br/>
          <span>Ref.: ${device.location.reference}</span>
        </div>
        ${issueHtml}
      </div>
    `;
  }
}
