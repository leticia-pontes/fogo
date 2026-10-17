import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  CameraDevice,
  CityDevice,
  DeviceCategory,
  DeviceStatus,
  FieldAgent,
  GenericIoTDevice,
  MaintenanceUrgency,
  PredictiveIncident,
  RadarDevice,
} from '../models/fogo.models';

export interface AnomalyAlert {
  id: string;
  deviceId: string;
  serialNumber: string;
  category: DeviceCategory;
  severity: 'critical' | 'high' | 'warning';
  title: string;
  description: string;
  neighborhood: string;
  street: string;
  lat: number;
  lng: number;
  timestamp: string;
  isFloodAlert?: boolean;
  suggestedAgent?: FieldAgent;
}

export interface RegionClusterSummary {
  region: string;
  centerLat: number;
  centerLng: number;
  totalDevices: number;
  operationalCount: number;
  criticalCount: number;
  stolenCount: number;
  healthScore: number; // 0 - 100
  irtScore: number; // Índice de Risco Territorial 0 - 100
  activeAgents: number;
}

export interface AiTriageState {
  source: string;
  model: string;
  timestamp: string;
  tacticalBriefing: string;
  priorityLevel: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'NOMINAL';
  recommendedDirectives: string[];
  xaiReasoning: { factor: string; weight: number }[];
}

export interface TacticalCorridor {
  id: string;
  name: string;
  region: string;
  type: 'green_wave' | 'reroute' | 'flood_bypass';
  coordinates: [number, number][];
}

interface NeighborhoodSeedConfig {
  name: string;
  zone: string;
  baseLat: number;
  baseLng: number;
  cepPrefix: string;
  streets: string[];
  references: string[];
}

const NEIGHBORHOOD_CONFIGS: NeighborhoodSeedConfig[] = [
  {
    name: 'Zona Sul - Boa Viagem',
    zone: 'Zona Sul',
    baseLat: -8.1195,
    baseLng: -34.9012,
    cepPrefix: '51020',
    streets: ['Av. Boa Viagem', 'Av. Conselheiro Aguiar', 'Av. Eng. Domingos Ferreira', 'Rua Ribeiro de Brito'],
    references: ['Em frente ao Segundo Jardim', 'Próximo ao Parque Dona Lindu', 'Cruzamento com Rua Padre Carapuceiro', 'Oposto ao Nº 1840'],
  },
  {
    name: 'Zona Sul - Pina & Imbiribeira',
    zone: 'Zona Sul',
    baseLat: -8.0958,
    baseLng: -34.8965,
    cepPrefix: '51110',
    streets: ['Av. Marechal Mascarenhas de Morais', 'Av. Herculano Bandeira', 'Via Mangue', 'Av. Antônio de Goes'],
    references: ['Acesso Ponte Paulo Guerra', 'KM 04 sentido Aeroporto', 'Em frente ao Empresarial JCPM', 'Trecho Viaduto Tancredo Neves'],
  },
  {
    name: 'Centro - Porto Digital',
    zone: 'Centro',
    baseLat: -8.0631,
    baseLng: -34.8711,
    cepPrefix: '50030',
    streets: ['Av. Alfredo Lisboa', 'Rua do Bom Jesus', 'Cais do Apolo', 'Av. Rio Branco'],
    references: ['Marco Zero - Pátio Central', 'Em frente ao C.E.S.A.R', 'Ponte Maurício de Nassau', 'Acesso Cais do Sertão'],
  },
  {
    name: 'Eixo Agamenon & Derby',
    zone: 'Centro-Expandido',
    baseLat: -8.0538,
    baseLng: -34.8982,
    cepPrefix: '52010',
    streets: ['Av. Gov. Agamenon Magalhães', 'Praça do Derby', 'Av. Conde da Boa Vista', 'Rua Paissandu'],
    references: ['Cruzamento Hospital Português', 'Pista Local sentido Olinda', 'Em frente ao Quartel do Derby', 'Retorno Parque Amorim'],
  },
  {
    name: 'Zona Norte - Casa Amarela',
    zone: 'Zona Norte',
    baseLat: -8.0312,
    baseLng: -34.9168,
    cepPrefix: '52070',
    streets: ['Av. Norte Miguel Arraes', 'Estrada do Arraial', 'Av. Dezessete de Agosto', 'Rua Padre Lemos'],
    references: ['Em frente ao Mercado de Casa Amarela', 'Largo da Paz - Eixo Principal', 'Próximo ao Parque da Jaqueira', 'Oposto ao Nº 412'],
  },
  {
    name: 'Zona Oeste - Várzea & Caxangá',
    zone: 'Zona Oeste',
    baseLat: -8.0462,
    baseLng: -34.9485,
    cepPrefix: '50740',
    streets: ['Av. Caxangá', 'Av. Prof. Moraes Rego (BR-101)', 'Rua General Polidoro', 'Av. Afonso Olindense'],
    references: ['Corredor BRT Caxangá - Estação 04', 'Portão Principal UFPE', 'Viaduto da BR-101 KM 68', 'Terminal Integrado CDU'],
  },
];

@Injectable({
  providedIn: 'root',
})
export class DeviceInventoryService {
  private readonly platformId = inject(PLATFORM_ID);

  readonly devices = signal<CityDevice[]>(this.buildInitialDevices());
  readonly agents = signal<FieldAgent[]>(this.buildInitialAgents());
  readonly incidents = signal<PredictiveIncident[]>(this.buildInitialIncidents());

  readonly weatherState = signal<'nominal' | 'torrential_rain'>('nominal');
  readonly stressScenarioActive = signal<'none' | 'rain' | 'radar_theft'>('none');
  readonly floodAlertDeviceIds = signal<string[]>([]);
  readonly mitigatedIncidentIds = signal<string[]>([]);
  readonly tacticalCorridors = signal<TacticalCorridor[]>([
    {
      id: 'CORR-BASE-01',
      name: 'Corredor Expresso Agamenon Magalhães (Monitoramento Nominal)',
      region: 'Eixo Agamenon & Derby',
      type: 'green_wave',
      coordinates: [
        [-8.0425, -34.8955],
        [-8.0538, -34.8982],
        [-8.0685, -34.8971],
      ],
    },
  ]);

  readonly activeAlertBanner = signal<{
    title: string;
    message: string;
    severity: 'critical' | 'warning' | 'info';
    targetDeviceId?: string;
    suggestedAgentName?: string;
    timestamp: string;
  } | null>(null);

  readonly selectedMapTarget = signal<{
    lat: number;
    lng: number;
    zoom: number;
    deviceId?: string;
    agentId?: string;
    timestamp: number;
  } | null>(null);

  readonly aiTriageReport = signal<AiTriageState>({
    source: 'prometheus-core',
    model: 'gemini-2.0-flash',
    timestamp: new Date().toISOString(),
    tacticalBriefing:
      '[PROMETHEUS // TELEMETRIA ATIVA] Malha metropolitana sincronizada com 84 nós IoT e 24 operadores táticos. Atenção preventiva concentrada no Eixo Agamenon e Zona Sul devido ao adensamento vespertino.',
    priorityLevel: 'MODERATE',
    recommendedDirectives: [
      'Manter patrulhamento ostensivo próximo aos radares críticos da Av. Boa Viagem',
      'Despachar equipe técnica para recalibração óptica nos sensores com urgência imediata',
      'Pré-alocar onda verde nos cruzamentos do Eixo Agamenon Magalhães às 17h45',
    ],
    xaiReasoning: [
      { factor: 'Saturação Semafórica no Horário de Pico', weight: 42 },
      { factor: 'Histórico de Ocorrências em Corredores Arteriais', weight: 33 },
      { factor: 'Sensores com Manutenção Corretiva Pendente', weight: 25 },
    ],
  });

  readonly isLoadingAiTriage = signal<boolean>(false);

  // Reactive KPIs
  readonly totalDevices = computed(() => this.devices().length);

  readonly operationalDevicesCount = computed(
    () => this.devices().filter((d) => d.status === 'operational').length
  );

  readonly networkAvailabilityPct = computed(() => {
    const all = this.devices();
    if (all.length === 0) return 100;
    const activePool = all.filter((d) => d.status !== 'not_installed');
    if (activePool.length === 0) return 100;
    const operational = activePool.filter((d) => d.status === 'operational').length;
    return Math.round((operational / activePool.length) * 1000) / 10;
  });

  readonly criticalFailureDevicesCount = computed(
    () =>
      this.devices().filter(
        (d) =>
          d.status === 'malfunction' ||
          d.status === 'stolen' ||
          d.maintenance.urgency === 'immediate'
      ).length
  );

  readonly stolenDevicesCount = computed(
    () => this.devices().filter((d) => d.status === 'stolen').length
  );

  readonly activeAgentsCount = computed(
    () =>
      this.agents().filter((a) => a.status === 'patrolling' || a.status === 'responding')
        .length
  );

  readonly activeAnomalies = computed<AnomalyAlert[]>(() => {
    const floodSet = new Set(this.floodAlertDeviceIds());
    const allAgents = this.agents();

    return this.devices()
      .filter(
        (d) =>
          d.status === 'stolen' ||
          d.status === 'malfunction' ||
          d.maintenance.urgency === 'immediate'
      )
      .map((device) => {
        const isFlood = floodSet.has(device.id);
        const nearestAgent = this.findNearestAvailableAgent(
          device.location.lat,
          device.location.lng,
          allAgents
        );

        const severity: 'critical' | 'high' | 'warning' =
          device.status === 'stolen' || isFlood
            ? 'critical'
            : device.status === 'malfunction'
              ? 'high'
              : 'warning';

        const title =
          device.status === 'stolen'
            ? `FURTO / CORTE DE TELEMETRIA: ${device.serialNumber}`
            : isFlood
              ? `ALERTA DE ALAGAMENTO CRÍTICO: ${device.serialNumber}`
              : `FALHA OPERACIONAL: ${device.serialNumber}`;

        return {
          id: `ALRT-${device.id}`,
          deviceId: device.id,
          serialNumber: device.serialNumber,
          category: device.category,
          severity,
          title,
          description:
            device.maintenance.issueDescription ??
            'Perda de sincronia de telemetria ou falha no autoteste de hardware.',
          neighborhood: device.location.neighborhood,
          street: device.location.street,
          lat: device.location.lat,
          lng: device.location.lng,
          timestamp: device.maintenance.lastServiceDate,
          isFloodAlert: isFlood,
          suggestedAgent: nearestAgent,
        };
      })
      .sort((a, b) => {
        const rank = { critical: 0, high: 1, warning: 2 };
        return rank[a.severity] - rank[b.severity];
      });
  });

  readonly regionSummaries = computed<RegionClusterSummary[]>(() => {
    const allDevices = this.devices();
    const allIncidents = this.incidents();
    const allAgents = this.agents();

    return NEIGHBORHOOD_CONFIGS.map((cfg) => {
      const regionDevices = allDevices.filter((d) => d.location.neighborhood === cfg.name);
      const total = regionDevices.length;
      const operational = regionDevices.filter((d) => d.status === 'operational').length;
      const critical = regionDevices.filter(
        (d) =>
          d.status === 'malfunction' ||
          d.status === 'stolen' ||
          d.maintenance.urgency === 'immediate'
      ).length;
      const stolen = regionDevices.filter((d) => d.status === 'stolen').length;

      const healthScore =
        total > 0 ? Math.max(0, Math.round(((operational - stolen * 1.5) / total) * 100)) : 100;

      const matchingIncident = allIncidents.find(
        (inc) => inc.targetRegion === cfg.name || inc.targetRegion.includes(cfg.zone)
      );

      const baseIrt = matchingIncident ? matchingIncident.riskScore : 34;
      const penaltyFromFailures = Math.min(25, critical * 4 + stolen * 10);
      const irtScore = matchingIncident
        ? matchingIncident.riskScore
        : Math.min(100, baseIrt + penaltyFromFailures);

      const activeAgents = allAgents.filter((ag) => {
        const dist = Math.hypot(ag.location.lat - cfg.baseLat, ag.location.lng - cfg.baseLng);
        return dist < 0.025 && (ag.status === 'patrolling' || ag.status === 'responding');
      }).length;

      return {
        region: cfg.name,
        centerLat: cfg.baseLat,
        centerLng: cfg.baseLng,
        totalDevices: total,
        operationalCount: operational,
        criticalCount: critical,
        stolenCount: stolen,
        healthScore,
        irtScore,
        activeAgents,
      };
    });
  });

  focusOnDevice(deviceId: string, zoom = 16): void {
    const found = this.devices().find((d) => d.id === deviceId);
    if (!found) return;
    this.selectedMapTarget.set({
      lat: found.location.lat,
      lng: found.location.lng,
      zoom,
      deviceId: found.id,
      timestamp: Date.now(),
    });
  }

  focusOnCoordinates(lat: number, lng: number, zoom = 15): void {
    this.selectedMapTarget.set({
      lat,
      lng,
      zoom,
      timestamp: Date.now(),
    });
  }

  addDevice(newDevice: CityDevice): void {
    this.devices.update((current) => [newDevice, ...current]);
    this.activeAlertBanner.set({
      title: 'NOVO EQUIPAMENTO CATALOGADO NA MALHA',
      message: `${newDevice.serialNumber} (${newDevice.brand} ${newDevice.model}) registrado em ${newDevice.location.street}, ${newDevice.location.neighborhood}.`,
      severity: 'info',
      targetDeviceId: newDevice.id,
      timestamp: new Date().toLocaleTimeString('pt-BR'),
    });
  }

  updateDeviceStatus(
    deviceId: string,
    status: DeviceStatus,
    urgency: MaintenanceUrgency,
    issueDescription?: string
  ): void {
    this.devices.update((list) =>
      list.map((d) =>
        d.id === deviceId
          ? {
              ...d,
              status,
              maintenance: {
                ...d.maintenance,
                urgency,
                issueDescription: issueDescription ?? d.maintenance.issueDescription,
              },
            }
          : d
      )
    );
  }

  dispatchAgentToDevice(deviceId: string): void {
    const targetDevice = this.devices().find((d) => d.id === deviceId);
    if (!targetDevice) return;

    const nearest = this.findNearestAvailableAgent(
      targetDevice.location.lat,
      targetDevice.location.lng,
      this.agents()
    );
    if (!nearest) return;

    this.agents.update((list) =>
      list.map((ag) =>
        ag.id === nearest.id
          ? {
              ...ag,
              status: 'responding',
              location: {
                lat: targetDevice.location.lat + 0.0006,
                lng: targetDevice.location.lng - 0.0006,
              },
              lastPing: 'Agora mesmo (Em Deslocamento Tático)',
            }
          : ag
      )
    );

    this.activeAlertBanner.set({
      title: `VIATURA DESPACHADA // ${nearest.badgeNumber}`,
      message: `${nearest.name} (${nearest.battalion}) vetorizado para ${targetDevice.location.street} para contenção do equipamento ${targetDevice.serialNumber}.`,
      severity: 'info',
      targetDeviceId: targetDevice.id,
      suggestedAgentName: nearest.name,
      timestamp: new Date().toLocaleTimeString('pt-BR'),
    });

    this.focusOnDevice(targetDevice.id, 16);
  }

  executeMitigation(incidentId: string): void {
    const incident = this.incidents().find((inc) => inc.id === incidentId);
    if (!incident) return;

    // Reduce neighborhood risk score & update incident recommendation state
    const mitigatedScore = Math.max(18, Math.round(incident.riskScore * 0.32));

    this.incidents.update((list) =>
      list.map((inc) =>
        inc.id === incidentId
          ? {
              ...inc,
              riskScore: mitigatedScore,
              predictedIssue: `[MITIGADO] ${inc.predictedIssue.replace('[MITIGADO] ', '')}`,
              recommendedAction: `Intervenção executada com sucesso: Onda verde sincronizada e efetivo tático posicionado em ${inc.targetRegion}.`,
            }
          : inc
      )
    );

    if (!this.mitigatedIncidentIds().includes(incidentId)) {
      this.mitigatedIncidentIds.update((ids) => [...ids, incidentId]);
    }

    // Normalize any flood or malfunction sensors in that target region if applicable
    const regionConfig = NEIGHBORHOOD_CONFIGS.find(
      (c) => c.name === incident.targetRegion || incident.targetRegion.includes(c.zone)
    );

    if (regionConfig) {
      // Add tactical green-wave corridor on the map
      const newCorridor: TacticalCorridor = {
        id: `CORR-MIT-${incident.id}`,
        name: `Onda Verde & Rota Normalizada — ${regionConfig.name}`,
        region: regionConfig.name,
        type: 'green_wave',
        coordinates: [
          [regionConfig.baseLat - 0.007, regionConfig.baseLng - 0.006],
          [regionConfig.baseLat, regionConfig.baseLng],
          [regionConfig.baseLat + 0.007, regionConfig.baseLng + 0.005],
        ],
      };

      this.tacticalCorridors.update((curr) => [
        ...curr.filter((c) => c.id !== newCorridor.id),
        newCorridor,
      ]);

      // Reposition nearest patrolling agent to the region
      const nearestAgent = this.findNearestAvailableAgent(
        regionConfig.baseLat,
        regionConfig.baseLng,
        this.agents()
      );
      if (nearestAgent) {
        this.agents.update((ags) =>
          ags.map((ag) =>
            ag.id === nearestAgent.id
              ? {
                  ...ag,
                  status: 'responding',
                  location: {
                    lat: regionConfig.baseLat + 0.0009,
                    lng: regionConfig.baseLng - 0.0009,
                  },
                  lastPing: 'Alocado via Mitigação Preditiva PROMETHEUS',
                }
              : ag
          )
        );
      }

      this.focusOnCoordinates(regionConfig.baseLat, regionConfig.baseLng, 14);
    }

    this.playTacticalTone('mitigation');

    this.activeAlertBanner.set({
      title: `MITIGAÇÃO PREDITIVA EXECUTADA // ${incident.targetRegion.toUpperCase()}`,
      message: `Índice de Risco Territorial (IRT) reduzido de ${incident.riskScore} para ${mitigatedScore}. Semáforos sincronizados em Onda Verde e rota normalizada no mapa.`,
      severity: 'info',
      timestamp: new Date().toLocaleTimeString('pt-BR'),
    });
  }

  // ============================================================================
  // BARRA DE CENÁRIOS DA BANCA AVALIADORA (STRESS TEST PROMETHEUS)
  // ============================================================================

  simulateTorrentialRain(): void {
    this.weatherState.set('torrential_rain');
    this.stressScenarioActive.set('rain');

    // Pick 4 sensors in Zona Sul and place them in critical flood alert
    const zonaSulDevices = this.devices().filter((d) =>
      d.location.neighborhood.startsWith('Zona Sul')
    );
    const targetIds = zonaSulDevices.slice(0, 4).map((d) => d.id);
    this.floodAlertDeviceIds.set(targetIds);

    this.devices.update((list) =>
      list.map((d) => {
        if (targetIds.includes(d.id)) {
          return {
            ...d,
            status: 'malfunction',
            maintenance: {
              ...d.maintenance,
              urgency: 'immediate',
              lastServiceDate: 'Há 1 min (Telemetria Pluviométrica)',
              issueDescription:
                'ALERTA DE ALAGAMENTO CRÍTICO: Lâmina d\'água > 48cm detectada. Submersão parcial de gabinete e risco elétrico.',
            },
          };
        }
        return d;
      })
    );

    // Elevate Zona Sul IRT to 92 and recalculate routes
    this.incidents.update((list) => {
      const updated = list.map((inc) => {
        if (inc.targetRegion.startsWith('Zona Sul')) {
          return {
            ...inc,
            riskScore: 92,
            confidence: 96,
            timeHorizon: 'Próximos 20 min (Crítico)',
            predictedIssue:
              'Alagamento severo e colapso de drenagem na Av. Boa Viagem e Av. Mascarenhas de Morais (4 sensores em alerta hídrico)',
            xaiFactors: [
              { factor: 'Chuva torrencial (>72mm/h)', weight: 45 },
              { factor: '4 Sensores IoT em Alerta de Alagamento', weight: 35 },
              { factor: 'Maré Alta + Retenção de Sexta-feira', weight: 20 },
            ],
            recommendedAction:
              'Ativar Rota de Desvio Tático via Via Mangue, bloquear faixas baixas e deslocar Viaturas #02 e #05 da Defesa Civil/CTTU.',
            actionPayload: {
              actionType: 'REROUTE' as const,
              targetIds,
            },
          };
        }
        return inc;
      });
      return updated;
    });

    // Remove Zona Sul incidents from mitigated list if previously mitigated
    this.mitigatedIncidentIds.update((ids) =>
      ids.filter((id) => id !== 'INC-ZS-01' && id !== 'INC-ZS-02')
    );

    // Add recalculated flood bypass route on the map
    this.tacticalCorridors.set([
      {
        id: 'CORR-FLOOD-BYPASS',
        name: 'Desvio Tático Anti-Alagamento (Via Mangue // Zona Sul)',
        region: 'Zona Sul - Boa Viagem',
        type: 'flood_bypass',
        coordinates: [
          [-8.1245, -34.9035],
          [-8.1135, -34.9048],
          [-8.0985, -34.8992],
          [-8.0882, -34.8941],
        ],
      },
    ]);

    this.playTacticalTone('critical');

    const firstFloodDevice = this.devices().find((d) => d.id === targetIds[0]);
    this.activeAlertBanner.set({
      title: 'SIMULAÇÃO PROMETHEUS // CHUVA TORRENCIAL & ALAGAMENTO (IRT ZONA SUL: 92)',
      message:
        'Estado meteorológico alterado para Tempestade Severa. 4 sensores na Zona Sul entraram em alerta de alagamento e rotas alternativas foram recalculadas via Via Mangue.',
      severity: 'critical',
      targetDeviceId: firstFloodDevice?.id,
      timestamp: new Date().toLocaleTimeString('pt-BR'),
    });

    if (firstFloodDevice) {
      this.focusOnCoordinates(firstFloodDevice.location.lat, firstFloodDevice.location.lng, 14);
    }

    void this.requestPrometheusAiTriage(
      'CHUVA_TORRENCIAL_ZONA_SUL',
      'Zona Sul - Boa Viagem',
      '4 sensores em alerta de alagamento, IRT elevado para 92 e desvio recalculado.'
    );
  }

  simulateRadarTheft(): void {
    this.stressScenarioActive.set('radar_theft');

    // Pick a prominent radar device to mark as stolen
    const radarTarget =
      this.devices().find((d) => d.category === 'radar' && d.status === 'operational') ??
      this.devices().find((d) => d.category === 'radar');

    if (!radarTarget) return;

    const nearestAgent = this.findNearestAvailableAgent(
      radarTarget.location.lat,
      radarTarget.location.lng,
      this.agents()
    );

    this.devices.update((list) =>
      list.map((d) =>
        d.id === radarTarget.id
          ? {
              ...d,
              status: 'stolen',
              maintenance: {
                urgency: 'immediate',
                lastServiceDate: 'AGORA (Corte de Telemetria)',
                issueDescription: `ALERTA DE FURTO EM ANDAMENTO: Corte súbito de alimentação e fibra óptica + acelerômetro de chassi acionado. Viatura recomendada: ${nearestAgent?.badgeNumber ?? 'GTR-04'} (${nearestAgent?.name ?? 'Patrulha Tática'}).`,
              },
            }
          : d
      )
    );

    this.playTacticalTone('siren');

    this.activeAlertBanner.set({
      title: `ALERTA CRÍTICO DE FURTO // RADAR ${radarTarget.serialNumber}`,
      message: `Telemetria interrompida em ${radarTarget.location.street} (${radarTarget.location.neighborhood}). Status alterado para FURTADO. Sugestão imediata: Despachar ${nearestAgent?.name ?? 'Viatura #04'} (${nearestAgent?.badgeNumber ?? 'PM-104'}).`,
      severity: 'critical',
      targetDeviceId: radarTarget.id,
      suggestedAgentName: nearestAgent
        ? `${nearestAgent.name} (${nearestAgent.badgeNumber})`
        : 'Viatura #04',
      timestamp: new Date().toLocaleTimeString('pt-BR'),
    });

    this.focusOnDevice(radarTarget.id, 16);

    void this.requestPrometheusAiTriage(
      'FURTO_DE_RADAR_EM_ANDAMENTO',
      radarTarget.location.neighborhood,
      `Radar ${radarTarget.serialNumber} na ${radarTarget.location.street} sofreu corte abrupto de telemetria.`
    );
  }

  resetScenarioData(): void {
    this.weatherState.set('nominal');
    this.stressScenarioActive.set('none');
    this.floodAlertDeviceIds.set([]);
    this.mitigatedIncidentIds.set([]);
    this.devices.set(this.buildInitialDevices());
    this.agents.set(this.buildInitialAgents());
    this.incidents.set(this.buildInitialIncidents());
    this.tacticalCorridors.set([
      {
        id: 'CORR-BASE-01',
        name: 'Corredor Expresso Agamenon Magalhães (Monitoramento Nominal)',
        region: 'Eixo Agamenon & Derby',
        type: 'green_wave',
        coordinates: [
          [-8.0425, -34.8955],
          [-8.0538, -34.8982],
          [-8.0685, -34.8971],
        ],
      },
    ]);
    this.activeAlertBanner.set({
      title: 'SEED ORIGINAL RESTAURADO // SISTEMA NOMINAL',
      message:
        'Todos os 84 equipamentos IoT, 24 agentes de campo e modelos preditivos voltaram ao estado inicial de operação.',
      severity: 'info',
      timestamp: new Date().toLocaleTimeString('pt-BR'),
    });
  }

  async requestPrometheusAiTriage(
    scenario: string,
    region: string,
    incidentSummary: string
  ): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    this.isLoadingAiTriage.set(true);

    try {
      const response = await fetch('/api/prometheus-triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario,
          region,
          activeFailures: this.criticalFailureDevicesCount(),
          stolenCount: this.stolenDevicesCount(),
          weatherAlert: this.weatherState() === 'torrential_rain',
          incidentSummary,
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as AiTriageState;
        this.aiTriageReport.set(data);
        this.isLoadingAiTriage.set(false);
        return;
      }
    } catch {
      // Fallback when running in pure ng serve without Vercel edge runtime
    }

    const isRain = this.weatherState() === 'torrential_rain';
    const isStolen = this.stolenDevicesCount() > 1;

    this.aiTriageReport.set({
      source: 'prometheus-local-engine',
      model: 'gemini-2.0-flash',
      timestamp: new Date().toISOString(),
      tacticalBriefing: isRain
        ? `[PROMETHEUS // ALERTA HIDROMETEOROLÓGICO] Precipitação torrencial em ${region}. 4 sensores acusando alagamento severo e IRT em 92/100. Onda verde de escoamento e bloqueio de faixas alagadas prontos para execução.`
        : isStolen
          ? `[PROMETHEUS // INTERCEPTAÇÃO TÁTICA] Violação física e perda de portadora óptica detectadas em ${region}. Viatura mais próxima calculada por georreferenciamento para bloqueio de perímetro.`
          : `[PROMETHEUS // ANÁLISE CONTÍNUA] ${incidentSummary}`,
      priorityLevel: isRain || isStolen ? 'CRITICAL' : 'HIGH',
      recommendedDirectives: isRain
        ? [
            'Acionar bloqueio preventivo nos 4 pontos críticos da Zona Sul',
            'Ativar Onda Verde de escoamento na Via Mangue e Domingos Ferreira',
            'Despachar Viaturas #02 e #05 para suporte semafórico presencial',
          ]
        : [
            `Deslocar viatura tática mais próxima para inspeção imediata em ${region}`,
            'Cruzar placas capturadas pelas câmeras adjacentes nos últimos 8 minutos',
            'Emitir Ordem de Serviço de reposição emergencial para equipe de engenharia',
          ],
      xaiReasoning: isRain
        ? [
            { factor: 'Chuva Torrencial (>70mm/h)', weight: 45 },
            { factor: '4 Sensores com Submersão Crítica', weight: 35 },
            { factor: 'Histórico de Retenção em Horário de Pico', weight: 20 },
          ]
        : [
            { factor: 'Corte Abrupto de Heartbeat + Fibra', weight: 45 },
            { factor: 'Alarme de Vibração no Gabinete', weight: 35 },
            { factor: 'Proximidade de Rota de Fuga Arterial', weight: 20 },
          ],
    });
    this.isLoadingAiTriage.set(false);
  }

  private findNearestAvailableAgent(
    lat: number,
    lng: number,
    agents: FieldAgent[]
  ): FieldAgent | undefined {
    const candidates = agents.filter(
      (a) => a.status === 'patrolling' || a.status === 'responding'
    );
    const pool = candidates.length > 0 ? candidates : agents;
    let best: FieldAgent | undefined;
    let minDistance = Number.POSITIVE_INFINITY;

    for (const agent of pool) {
      const dist = Math.hypot(agent.location.lat - lat, agent.location.lng - lng);
      if (dist < minDistance) {
        minDistance = dist;
        best = agent;
      }
    }
    return best;
  }

  private playTacticalTone(mode: 'critical' | 'siren' | 'mitigation'): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (mode === 'siren') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.linearRampToValueAtTime(880, now + 0.18);
        osc.frequency.linearRampToValueAtTime(480, now + 0.36);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
        osc.start(now);
        osc.stop(now + 0.42);
      } else if (mode === 'critical') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(660, now + 0.12);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        osc.start(now);
        osc.stop(now + 0.32);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.setValueAtTime(880, now + 0.1);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.28);
      }
    } catch {
      // Ignore audio errors if browser autoplay policy blocks sound before user interaction
    }
  }

  private buildInitialDevices(): CityDevice[] {
    const categories: DeviceCategory[] = [
      'radar',
      'camera',
      'truck_scale',
      'autonomous_patrol',
      'automated_barrier',
      'transit_vehicle',
      'parking_totem',
      'shared_micromobility',
      'police_vehicle',
    ];

    const brandsByCategory: Record<DeviceCategory, { brand: string; model: string }[]> = {
      radar: [
        { brand: 'Sensys Gatso', model: 'T-Series RT4 Doppler' },
        { brand: 'Pumatronix', model: 'ITSCAM 400 OCR' },
      ],
      camera: [
        { brand: 'Axis Communications', model: 'Q6225-LE PTZ Thermal' },
        { brand: 'Hikvision', model: 'DarkFighter DS-2DF8436' },
      ],
      truck_scale: [
        { brand: 'Toledo do Brasil', model: 'WIM-9500 Dinâmica' },
        { brand: 'Kistler', model: 'Lineas Quartz WIM' },
      ],
      autonomous_patrol: [
        { brand: 'Knightscope', model: 'K5 Urban Sentinel' },
        { brand: 'Nexus Robotics', model: 'Vigil-X2 LiDAR' },
      ],
      automated_barrier: [
        { brand: 'Nice Group', model: 'Wide-L Barrier Pro' },
        { brand: 'Magnetic AutoControl', model: 'Access Pro-H' },
      ],
      transit_vehicle: [
        { brand: 'Marcopolo / BYD', model: 'Attivi Express Articulado BRT' },
        { brand: 'Mercedes-Benz', model: 'eO500U Telemetria Integrada' },
      ],
      parking_totem: [
        { brand: 'Flowbird', model: 'Strada Evo 3 Solar' },
        { brand: 'Digicon', model: ' VersaPark Smart Totem' },
      ],
      shared_micromobility: [
        { brand: 'Segway-Ninebot', model: 'Max Plus IoT Dock' },
        { brand: 'Tembici / PBSC', model: 'E-Fit 5G Station' },
      ],
      police_vehicle: [
        { brand: 'Chevrolet / Motorola', model: 'Trailblazer Command VTR' },
        { brand: 'Renault / Harris', model: 'Duster Tática LPR' },
      ],
    };

    const result: CityDevice[] = [];
    let index = 1;

    // Generate 84 devices (14 per neighborhood across 6 neighborhoods)
    for (let nIdx = 0; nIdx < NEIGHBORHOOD_CONFIGS.length; nIdx++) {
      const nCfg = NEIGHBORHOOD_CONFIGS[nIdx];

      for (let localIdx = 0; localIdx < 14; localIdx++) {
        const category = categories[(nIdx * 3 + localIdx) % categories.length];
        const brandInfo = brandsByCategory[category][(nIdx + localIdx) % 2];

        // Deterministic coordinate offset so markers form realistic corridors & clusters
        const latOffset = ((localIdx % 5) - 2) * 0.0034 + (localIdx * 0.00055);
        const lngOffset = (Math.floor(localIdx / 3) - 2) * 0.0031 - (localIdx % 2) * 0.0012;

        // Deterministic status distribution (mostly operational, plus malfunction, maintenance, stolen, disabled, not_installed)
        let status: DeviceStatus = 'operational';
        let urgency: MaintenanceUrgency = 'none';
        let issueDescription: string | undefined;
        let nextScheduledDate: string | undefined = '2026-11-15';

        if (index === 7) {
          status = 'stolen';
          urgency = 'immediate';
          issueDescription =
            'Violação de gabinete e perda total de portadora óptica às 03h14. Boletim tático aberto.';
          nextScheduledDate = undefined;
        } else if (index % 13 === 0) {
          status = 'malfunction';
          urgency = 'immediate';
          issueDescription =
            'Desvio crítico na calibração do sensor primário e perda intermitente de pacotes MQTT.';
        } else if (index % 9 === 0) {
          status = 'maintenance';
          urgency = 'scheduled';
          issueDescription = 'Manutenção preventiva periódica: aferição INMETRO e limpeza óptica.';
          nextScheduledDate = '2026-10-22';
        } else if (index === 22 || index === 55) {
          status = 'disabled';
          urgency = 'none';
          issueDescription = 'Desativado temporariamente devido a obras de recapeamento na via.';
        } else if (index === 41 || index === 78) {
          status = 'not_installed';
          urgency = 'scheduled';
          issueDescription = 'Aguardando homologação final da concessionária de energia.';
          nextScheduledDate = '2026-10-29';
        } else if (index % 17 === 0) {
          status = 'operational';
          urgency = 'immediate';
          issueDescription =
            'Operando em bateria de backup (UPS < 28%). Necessita intervenção elétrica imediata.';
        } else if (index % 5 === 0) {
          status = 'operational';
          urgency = 'scheduled';
          nextScheduledDate = '2026-11-04';
        }

        const street = nCfg.streets[localIdx % nCfg.streets.length];
        const reference = nCfg.references[localIdx % nCfg.references.length];
        const serialPrefix = category.slice(0, 3).toUpperCase();
        const serialNumber = `${serialPrefix}-${nCfg.cepPrefix.slice(0, 3)}-${String(index).padStart(4, '0')}`;

        const baseDevice = {
          id: `DEV-${String(index).padStart(3, '0')}`,
          serialNumber,
          brand: brandInfo.brand,
          model: brandInfo.model,
          location: {
            cep: `${nCfg.cepPrefix}-${String(100 + localIdx * 7).slice(0, 3)}`,
            street,
            neighborhood: nCfg.name,
            city: 'Recife',
            state: 'PE',
            reference,
            lat: Number((nCfg.baseLat + latOffset).toFixed(6)),
            lng: Number((nCfg.baseLng + lngOffset).toFixed(6)),
          },
          status,
          maintenance: {
            urgency,
            nextScheduledDate,
            lastServiceDate: `2026-10-${String((index % 15) + 1).padStart(2, '0')} 08:30`,
            issueDescription,
          },
        };

        if (category === 'radar') {
          const enforcementTypes: ('speed' | 'red_light' | 'turn')[] = [
            'speed',
            'red_light',
            'turn',
          ];
          const radarDevice: RadarDevice = {
            ...baseDevice,
            category: 'radar',
            specs: {
              speedLimitKmH: localIdx % 2 === 0 ? 60 : 50,
              monitoredLanes: (localIdx % 3) + 2,
              enforcementType: enforcementTypes[localIdx % enforcementTypes.length],
            },
          };
          result.push(radarDevice);
        } else if (category === 'camera') {
          const cameraDevice: CameraDevice = {
            ...baseDevice,
            category: 'camera',
            specs: {
              resolution: localIdx % 2 === 0 ? '4k' : '1080p',
              nightVision: true,
              streamType: localIdx % 3 === 0 ? 'hls' : 'rtsp',
              ptz: localIdx % 2 === 0,
            },
          };
          result.push(cameraDevice);
        } else {
          const genericDevice: GenericIoTDevice = {
            ...baseDevice,
            category,
            specs: this.buildGenericSpecs(category, index),
          };
          result.push(genericDevice);
        }

        index++;
      }
    }

    return result;
  }

  private buildGenericSpecs(
    category: Exclude<DeviceCategory, 'radar' | 'camera'>,
    seedIndex: number
  ): Record<string, string | number | boolean> {
    switch (category) {
      case 'truck_scale':
        return {
          maxWeightTons: 45,
          metrologicalTolerancePct: 2.5,
          axialSensorsCount: 6,
          overloadAutoAlert: true,
        };
      case 'autonomous_patrol':
        return {
          batteryLevelPct: 68 + (seedIndex % 30),
          lidarRangeMeters: 120,
          autonomyLevel: 'SAE L4 Urbano',
          plateRecognitionActive: true,
        };
      case 'automated_barrier':
        return {
          openingTimeSec: 1.8,
          rfidReaderIntegrated: true,
          connectivityStatus: 'Fibra + 5G Failover',
          dailyCycles: 1240 + seedIndex * 12,
        };
      case 'transit_vehicle':
        return {
          lineCode: `BRT-${10 + (seedIndex % 9)}`,
          passengerOccupancyPct: 55 + (seedIndex % 40),
          averageSpeedKmH: 34,
          priorityTrafficLightSync: true,
        };
      case 'parking_totem':
        return {
          paperRollStockPct: 40 + (seedIndex % 55),
          nfcPixEnabled: true,
          connectivityStatus: 'LTE-M Operacional',
          activeParkingSlots: 24,
        };
      case 'shared_micromobility':
        return {
          availableUnits: 6 + (seedIndex % 10),
          dockTotalCapacity: 16,
          solarChargingActive: true,
          averageBatteryPct: 84,
        };
      case 'police_vehicle':
        return {
          tacticalCallsign: `GTR-${100 + seedIndex}`,
          lprCamerasMounted: 4,
          encryptedRadioChannel: 'TETRA-CH08',
          dashcamLiveStream: true,
        };
    }
  }

  private buildInitialAgents(): FieldAgent[] {
    const names = [
      'Cap. Lucas Mendonça',
      'Sgt. Helena Albuquerque',
      'Insp. Rodrigo Cavalcanti',
      'Ag. Camila Monteiro',
      'Ten. Bruno Vasconcelos',
      'Cb. Patrícia Ferraz',
      'Ag. Eduardo Tavares',
      'GCM Rafael Nogueira',
      'GCM Juliana Bezerra',
      'Subten. Marcos Lira',
      'Ag. Larissa Correia',
      'Sgt. Diego Gouveia',
      'GCM Vitor Peixoto',
      'Ag. Fernanda Arruda',
      'Cb. Thiago Maranhão',
      'GCM Priscila Dantas',
      'Ag. Gustavo Paiva',
      'Sgt. Andréia Valença',
      'GCM Leonardo Siqueira',
      'Ag. Mariana Caldas',
      'Ten. Felipe Holanda',
      'GCM Renato Bastos',
      'Ag. Beatriz Meireles',
      'Cb. Daniel Maciel',
    ];

    const roles: FieldAgent['role'][] = ['traffic_agent', 'civil_guard', 'military_police'];
    const mobilities: FieldAgent['mobilityType'][] = ['patrol_car', 'motorcycle', 'foot'];
    const statuses: FieldAgent['status'][] = [
      'patrolling',
      'responding',
      'patrolling',
      'patrolling',
      'break',
      'off_duty',
    ];
    const battalions = [
      '1º BPTur / Zona Sul',
      'CTTU - GTOP Móvel',
      'ROMU - Guarda Civil',
      '19º BPM - Boa Viagem',
      'BPTran - Eixo Agamenon',
      '11º BPM - Casa Amarela',
    ];

    return names.map((name, idx) => {
      const cfg = NEIGHBORHOOD_CONFIGS[idx % NEIGHBORHOOD_CONFIGS.length];
      const latOffset = ((idx % 4) - 1.5) * 0.0028;
      const lngOffset = ((idx % 3) - 1) * 0.0026;

      return {
        id: `AGT-${String(idx + 1).padStart(2, '0')}`,
        badgeNumber: `OP-${4800 + idx * 17}`,
        name,
        role: roles[idx % roles.length],
        battalion: battalions[idx % battalions.length],
        mobilityType: mobilities[idx % mobilities.length],
        status: statuses[idx % statuses.length],
        location: {
          lat: Number((cfg.baseLat + latOffset).toFixed(6)),
          lng: Number((cfg.baseLng + lngOffset).toFixed(6)),
        },
        lastPing: `Há ${(idx % 4) + 1} min`,
      };
    });
  }

  private buildInitialIncidents(): PredictiveIncident[] {
    return [
      {
        id: 'INC-ZS-01',
        targetRegion: 'Zona Sul - Boa Viagem',
        riskScore: 78,
        timeHorizon: '18h15 - 19h30 (Hoje)',
        predictedIssue:
          'Gargalo severo na Av. Conselheiro Aguiar e Av. Boa Viagem com retenção estimada de 3,8 km',
        confidence: 91,
        xaiFactors: [
          { factor: 'Fluxo de Saída Comercial + Sexta-feira', weight: 40 },
          { factor: 'Maré Alta e Acúmulo Pluviométrico Costeiro', weight: 35 },
          { factor: 'Semáforo Descalibrado no Cruzamento Nº 14', weight: 25 },
        ],
        recommendedAction:
          'Deslocar Viatura OP-4800 e ativar onda verde nos cruzamentos 12, 13 e 14 da Av. Eng. Domingos Ferreira.',
        actionPayload: {
          actionType: 'CHANGE_TRAFFIC_PHASE',
          targetIds: ['DEV-001', 'DEV-002', 'AGT-01'],
        },
      },
      {
        id: 'INC-EA-02',
        targetRegion: 'Eixo Agamenon & Derby',
        riskScore: 84,
        timeHorizon: '17h45 - 19h00 (Hoje)',
        predictedIssue:
          'Saturação crítica no cruzamento da Praça do Derby e pista local do Polo Médico',
        confidence: 94,
        xaiFactors: [
          { factor: 'Convergência de 4 Corredores Arteriais', weight: 45 },
          { factor: 'Radar em Manutenção Corretiva na Pista Central', weight: 30 },
          { factor: 'Histórico de Sinistros Vespertinos', weight: 25 },
        ],
        recommendedAction:
          'Posicionar 2 motocicletas da CTTU no retorno do Parque Amorim e ampliar fase verde norte-sul em +22s.',
        actionPayload: {
          actionType: 'DISPATCH_AGENT',
          targetIds: ['AGT-04', 'AGT-10'],
        },
      },
      {
        id: 'INC-ZS-02',
        targetRegion: 'Zona Sul - Pina & Imbiribeira',
        riskScore: 71,
        timeHorizon: 'Próximos 45 min',
        predictedIssue:
          'Risco elevado de retenção e colisão traseira no acesso à Ponte Paulo Guerra e Via Mangue',
        confidence: 87,
        xaiFactors: [
          { factor: 'Excesso de Velocidade Detectado em Lote', weight: 40 },
          { factor: 'Redução abrupta de 4 para 2 faixas', weight: 35 },
          { factor: 'Câmera PTZ com Visibilidade Reduzida', weight: 25 },
        ],
        recommendedAction:
          'Ativar painel de redução gradual (50 km/h) e reposicionar viatura do BPTran na cabeceira da ponte.',
        actionPayload: {
          actionType: 'REROUTE',
          targetIds: ['DEV-016', 'AGT-02'],
        },
      },
      {
        id: 'INC-CT-03',
        targetRegion: 'Centro - Porto Digital',
        riskScore: 62,
        timeHorizon: '18h00 - 20h00 (Hoje)',
        predictedIssue:
          'Conflito modal entre veículos de aplicativo, pedestres e micromobilidade no Cais do Apolo',
        confidence: 88,
        xaiFactors: [
          { factor: 'Evento Corporativo no Bairro do Recife', weight: 45 },
          { factor: 'Alta Ocupação nos Totens de Estacionamento (96%)', weight: 30 },
          { factor: 'Fluxo Intenso de Patinetes/Ciclovia', weight: 25 },
        ],
        recommendedAction:
          'Fechar conversão à esquerda na Ponte Maurício de Nassau e alocar patrulha a pé da Guarda Municipal.',
        actionPayload: {
          actionType: 'DISPATCH_AGENT',
          targetIds: ['AGT-03', 'AGT-09'],
        },
      },
      {
        id: 'INC-ZN-04',
        targetRegion: 'Zona Norte - Casa Amarela',
        riskScore: 58,
        timeHorizon: '17h30 - 18h45 (Hoje)',
        predictedIssue:
          'Gargalo operacional no Largo da Paz e Av. Norte por carga/descarga fora de janela',
        confidence: 83,
        xaiFactors: [
          { factor: 'Incidência de Caminhões Acima da Tolerância', weight: 40 },
          { factor: 'Estreitamento Viário Comercial', weight: 35 },
          { factor: 'Baixa Cobertura de Fiscalização Automática', weight: 25 },
        ],
        recommendedAction:
          'Acionar fiscalização autônoma de estacionamento rotativo e desviar veículos pesados acima de 12t.',
        actionPayload: {
          actionType: 'REROUTE',
          targetIds: ['DEV-059', 'AGT-06'],
        },
      },
      {
        id: 'INC-ZO-05',
        targetRegion: 'Zona Oeste - Várzea & Caxangá',
        riskScore: 66,
        timeHorizon: '18h00 - 19h15 (Hoje)',
        predictedIssue:
          'Atraso em cadeia na frota BRT do Corredor Caxangá próximo ao viaduto da BR-101',
        confidence: 89,
        xaiFactors: [
          { factor: 'Invasão de Faixa Exclusiva BRT', weight: 45 },
          { factor: 'Fluxo Universitário Noturno (UFPE)', weight: 30 },
          { factor: 'Latência no Semáforo Inteligente da Estação 04', weight: 25 },
        ],
        recommendedAction:
          'Sincronizar prioridade semafórica por telemetria dos ônibus BRT e enviar viatura LPR ao corredor.',
        actionPayload: {
          actionType: 'CHANGE_TRAFFIC_PHASE',
          targetIds: ['DEV-073', 'AGT-12'],
        },
      },
    ];
  }
}

