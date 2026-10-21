export type EquipmentType =
  | 'radar'
  | 'camera'
  | 'truck_scale'
  | 'autonomous_vehicle'
  | 'barrier_gate'
  | 'transport_vehicle'
  | 'parking_totem'
  | 'scooter'
  | 'agent_moto'
  | 'patrol_car';

export type EquipmentStatus =
  | 'not_installed'
  | 'operational'
  | 'maintenance'
  | 'malfunction'
  | 'deactivated'
  | 'stolen';

export type MaintenancePriority = 'none' | 'scheduled' | 'immediate';

export interface EquipmentLocation {
  cep: string;
  neighborhood: string;
  cityUf: string;
  street: string;
  /** Ex.: "Oposto ao nº 181", "KM 203" */
  reference: string;
  lat: number;
  lng: number;
}

export interface EquipmentMaintenance {
  priority: MaintenancePriority;
  /** ISO date (YYYY-MM-DD) */
  nextDate?: string;
}

/** Propriedades específicas de cada tipo de equipamento. */
export interface CustomPropertiesByType {
  radar: { radarSubtype: 'speed' | 'traffic_light' | 'prohibited_turn'; maxSpeedLimit?: number };
  camera: { nightVision: boolean; resolution: string; colorMode: 'color' | 'bw' };
  truck_scale: { maxWeightTons: number; tolerancePct: number };
  autonomous_vehicle: { batteryPct: number; plateReader: boolean };
  barrier_gate: { accessControl: 'rfid' | 'lpr' | 'ticket'; dailyCycles: number };
  transport_vehicle: { serviceKind: 'taxi' | 'moto_taxi' | 'school' | 'bus'; plate: string };
  parking_totem: { paperStockPct: number; pixEnabled: boolean };
  scooter: { vehicleKind: 'scooter' | 'e_bike'; batteryPct: number };
  agent_moto: { plate: string; callsign: string };
  patrol_car: { plate: string; callsign: string; lprCameras: number };
}

interface EquipmentBase {
  id: string;
  serialNumber: string;
  brand: string;
  model: string;
  /** Órgão responsável pelo equipamento. */
  agency: string;
  location: EquipmentLocation;
  status: EquipmentStatus;
  maintenance: EquipmentMaintenance;
}

/** União discriminada: `type` define o formato de `customProperties`. */
export type Equipment = {
  [T in EquipmentType]: EquipmentBase & { type: T; customProperties: CustomPropertiesByType[T] };
}[EquipmentType];

export type AgentRole = 'transit_agent' | 'municipal_guard' | 'military_police';
export type AgentStatus = 'active' | 'off_duty' | 'in_dispatch';

export interface Agent {
  id: string;
  name: string;
  badgeNumber: string;
  role: AgentRole;
  agency: string;
  status: AgentStatus;
  neighborhood: string;
  lat: number;
  lng: number;
}

export interface NeighborhoodInfo {
  name: string;
  zone: string;
  lat: number;
  lng: number;
  cepPrefix: string;
  streets: string[];
  references: string[];
  polygon: [number, number][];
}

/** Histórico simulado de mobilidade usado pela Cidade Preditiva. */
export interface NeighborhoodHistory {
  peakWindow: string;
  peakFlowVehiclesPerHour: number;
  incidentsPerWeek: number;
  requiredAgentsAtPeak: number;
}

export type RegionHealth = 'normal' | 'attention' | 'critical';

export interface RegionSummary {
  neighborhood: string;
  zone: string;
  lat: number;
  lng: number;
  total: number;
  operational: number;
  unavailable: number;
  unavailableRatio: number;
  health: RegionHealth;
  activeAgents: number;
}

export type AlertSeverity = 'critical' | 'high' | 'warning';

export interface OpsAlert {
  id: string;
  equipmentId: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
}

export interface OpsFilters {
  type: EquipmentType | 'all';
  status: EquipmentStatus | 'all';
  neighborhood: string;
  agency: string;
}

export interface CityEvent {
  id: string;
  time: string;
  message: string;
  tone: 'info' | 'good' | 'bad';
}
