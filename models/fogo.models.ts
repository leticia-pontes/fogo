export type DeviceCategory = 
  | 'radar' 
  | 'camera' 
  | 'truck_scale' 
  | 'autonomous_patrol' 
  | 'automated_barrier' 
  | 'transit_vehicle' 
  | 'parking_totem' 
  | 'shared_micromobility' 
  | 'police_vehicle';

export type DeviceStatus = 
  | 'not_installed' 
  | 'operational' 
  | 'malfunction' 
  | 'maintenance' 
  | 'disabled' 
  | 'stolen';

export type MaintenanceUrgency = 'none' | 'immediate' | 'scheduled';

export interface BaseDevice {
  id: string;
  serialNumber: string;
  brand: string;
  model: string;
  location: {
    cep: string;
    street: string;
    neighborhood: string;
    city: string;
    state: string;
    reference: string;
    lat: number;
    lng: number;
  };
  status: DeviceStatus;
  maintenance: {
    urgency: MaintenanceUrgency;
    nextScheduledDate?: string;
    lastServiceDate: string;
    issueDescription?: string;
  };
}

export type RadarDevice = BaseDevice & {
  category: 'radar';
  specs: { speedLimitKmH: number; monitoredLanes: number; enforcementType: 'speed' | 'red_light' | 'turn' };
};

export type CameraDevice = BaseDevice & {
  category: 'camera';
  specs: { resolution: '1080p' | '4k'; nightVision: boolean; streamType: 'rtsp' | 'hls'; ptz: boolean };
};

export type GenericIoTDevice = BaseDevice & {
  category: Exclude<DeviceCategory, 'radar' | 'camera'>;
  specs: Record<string, string | number | boolean>;
};

export type CityDevice = RadarDevice | CameraDevice | GenericIoTDevice;

export interface FieldAgent {
  id: string;
  badgeNumber: string;
  name: string;
  role: 'traffic_agent' | 'civil_guard' | 'military_police';
  battalion: string;
  mobilityType: 'foot' | 'motorcycle' | 'patrol_car';
  status: 'patrolling' | 'responding' | 'break' | 'off_duty';
  location: { lat: number; lng: number };
  lastPing: string;
}

export interface PredictiveIncident {
  id: string;
  targetRegion: string;
  riskScore: number; // 0 - 100
  timeHorizon: string;
  predictedIssue: string;
  confidence: number;
  xaiFactors: { factor: string; weight: number }[];
  recommendedAction: string;
  actionPayload?: {
    actionType: 'REROUTE' | 'DISPATCH_AGENT' | 'CHANGE_TRAFFIC_PHASE';
    targetIds: string[];
  };
}

