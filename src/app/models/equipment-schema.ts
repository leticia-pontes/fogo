import {
  AgentRole,
  AgentStatus,
  CustomPropertiesByType,
  Equipment,
  EquipmentStatus,
  EquipmentType,
  MaintenancePriority,
  RegionHealth,
} from './fogo.models';

export const EQUIPMENT_TYPES: EquipmentType[] = [
  'radar',
  'camera',
  'truck_scale',
  'autonomous_vehicle',
  'barrier_gate',
  'transport_vehicle',
  'parking_totem',
  'scooter',
  'agent_moto',
  'patrol_car',
  'other',
];

export const EQUIPMENT_STATUSES: EquipmentStatus[] = [
  'operational',
  'maintenance',
  'malfunction',
  'stolen',
  'deactivated',
  'not_installed',
];

export const TYPE_LABELS: Record<EquipmentType, string> = {
  radar: 'Radar de fiscalização',
  camera: 'Câmera de monitoramento',
  truck_scale: 'Balança de caminhão',
  autonomous_vehicle: 'Veículo autônomo (rotativo)',
  barrier_gate: 'Cancela automatizada',
  transport_vehicle: 'Veículo de transporte',
  parking_totem: 'Totem de estacionamento',
  scooter: 'Patinete / bicicleta elétrica',
  agent_moto: 'Moto operacional',
  patrol_car: 'Viatura',
  other: 'Outro equipamento',
};

export const STATUS_LABELS: Record<EquipmentStatus, string> = {
  operational: 'Operacional',
  maintenance: 'Em manutenção',
  malfunction: 'Mau funcionamento',
  stolen: 'Furtado',
  deactivated: 'Desativado',
  not_installed: 'Não instalado',
};

/** Cores semânticas: verde = ok, amarelo = manutenção, vermelho = falha, roxo = furto, cinzas = fora de operação. */
export const STATUS_COLORS: Record<EquipmentStatus, string> = {
  operational: '#4ca975',
  maintenance: '#d99b38',
  malfunction: '#d9534f',
  stolen: '#a97bd8',
  deactivated: '#6c767a',
  not_installed: '#a9b1b4',
};

export const PRIORITY_LABELS: Record<MaintenancePriority, string> = {
  none: 'Nenhuma',
  scheduled: 'Agendada / preventiva',
  immediate: 'Imediata / corretiva',
};

export const ROLE_LABELS: Record<AgentRole, string> = {
  transit_agent: 'Agente de trânsito',
  municipal_guard: 'Guarda municipal',
  military_police: 'Polícia militar',
};

export const ROLE_AGENCY: Record<AgentRole, string> = {
  transit_agent: 'SEMOB',
  municipal_guard: 'Guarda Municipal',
  military_police: 'Polícia Militar',
};

export const AGENT_STATUS_LABELS: Record<AgentStatus, string> = {
  active: 'Ativo em campo',
  in_dispatch: 'Em despacho',
  off_duty: 'Fora de turno',
};

export const AGENT_STATUS_COLORS: Record<AgentStatus, string> = {
  active: '#4a90c2',
  in_dispatch: '#ff7a3d',
  off_duty: '#5b7686',
};

export const HEALTH_LABELS: Record<RegionHealth, string> = {
  normal: 'Normal',
  attention: 'Atenção',
  critical: 'Crítico',
};

export const HEALTH_COLORS: Record<RegionHealth, string> = {
  normal: '#4ca975',
  attention: '#d99b38',
  critical: '#d9534f',
};

export const AGENCIES = ['SEMOB', 'Guarda Municipal', 'Polícia Militar', 'Consórcio de Transporte'];

/** Equipamento fora de operação (exceto ainda não instalado, que não conta na disponibilidade). */
export function isUnavailable(status: EquipmentStatus): boolean {
  return status !== 'operational' && status !== 'not_installed';
}

type CustomValue = string | number | boolean;

export interface CustomFieldDef {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'boolean' | 'select';
  options?: { value: string; label: string }[];
  optional?: boolean;
}

/** Schema que guia o formulário dinâmico e o painel de detalhes. */
export const CUSTOM_FIELDS: Record<EquipmentType, CustomFieldDef[]> = {
  radar: [
    {
      key: 'radarSubtype',
      label: 'Fiscalização',
      kind: 'select',
      options: [
        { value: 'speed', label: 'Velocidade' },
        { value: 'traffic_light', label: 'Avanço de semáforo' },
        { value: 'prohibited_turn', label: 'Conversão / retorno proibido' },
      ],
    },
    { key: 'maxSpeedLimit', label: 'Velocidade máxima (km/h)', kind: 'number', optional: true },
  ],
  camera: [
    { key: 'resolution', label: 'Resolução', kind: 'text' },
    {
      key: 'colorMode',
      label: 'Imagem',
      kind: 'select',
      options: [
        { value: 'color', label: 'Colorida' },
        { value: 'bw', label: 'Preto e branco' },
      ],
    },
    { key: 'nightVision', label: 'Visão noturna', kind: 'boolean' },
  ],
  truck_scale: [
    { key: 'maxWeightTons', label: 'Peso máximo (t)', kind: 'number' },
    { key: 'tolerancePct', label: 'Tolerância metrológica (%)', kind: 'number' },
  ],
  autonomous_vehicle: [
    { key: 'batteryPct', label: 'Bateria (%)', kind: 'number' },
    { key: 'plateReader', label: 'Leitor de placas (LPR)', kind: 'boolean' },
  ],
  barrier_gate: [
    {
      key: 'accessControl',
      label: 'Controle de acesso',
      kind: 'select',
      options: [
        { value: 'rfid', label: 'Tag RFID' },
        { value: 'lpr', label: 'Leitura de placa' },
        { value: 'ticket', label: 'Ticket' },
      ],
    },
    { key: 'dailyCycles', label: 'Ciclos por dia', kind: 'number' },
  ],
  transport_vehicle: [
    {
      key: 'serviceKind',
      label: 'Modalidade',
      kind: 'select',
      options: [
        { value: 'taxi', label: 'Táxi' },
        { value: 'moto_taxi', label: 'Mototáxi' },
        { value: 'school', label: 'Transporte escolar' },
        { value: 'bus', label: 'Ônibus' },
      ],
    },
    { key: 'plate', label: 'Placa', kind: 'text' },
  ],
  parking_totem: [
    { key: 'paperStockPct', label: 'Bobina de papel (%)', kind: 'number' },
    { key: 'pixEnabled', label: 'Aceita PIX', kind: 'boolean' },
  ],
  scooter: [
    {
      key: 'vehicleKind',
      label: 'Veículo',
      kind: 'select',
      options: [
        { value: 'scooter', label: 'Patinete' },
        { value: 'e_bike', label: 'Bicicleta elétrica' },
      ],
    },
    { key: 'batteryPct', label: 'Bateria (%)', kind: 'number' },
  ],
  agent_moto: [
    { key: 'plate', label: 'Placa', kind: 'text' },
    { key: 'callsign', label: 'Prefixo', kind: 'text' },
  ],
  patrol_car: [
    { key: 'plate', label: 'Placa', kind: 'text' },
    { key: 'callsign', label: 'Prefixo', kind: 'text' },
    { key: 'lprCameras', label: 'Câmeras LPR embarcadas', kind: 'number' },
  ],
  other: [{ key: 'description', label: 'Descrição do equipamento', kind: 'text' }],
};

export function defaultCustomProperties<T extends EquipmentType>(type: T): CustomPropertiesByType[T] {
  const defaults: CustomPropertiesByType = {
    radar: { radarSubtype: 'speed', maxSpeedLimit: 60 },
    camera: { nightVision: true, resolution: '1080p', colorMode: 'color' },
    truck_scale: { maxWeightTons: 45, tolerancePct: 5 },
    autonomous_vehicle: { batteryPct: 100, plateReader: true },
    barrier_gate: { accessControl: 'rfid', dailyCycles: 0 },
    transport_vehicle: { serviceKind: 'taxi', plate: '' },
    parking_totem: { paperStockPct: 100, pixEnabled: true },
    scooter: { vehicleKind: 'scooter', batteryPct: 100 },
    agent_moto: { plate: '', callsign: '' },
    patrol_car: { plate: '', callsign: '', lprCameras: 0 },
    other: { description: '' },
  };
  return defaults[type];
}

/** Lista legível das propriedades específicas de um equipamento. */
export function describeCustomProperties(equipment: Equipment): { label: string; value: string }[] {
  const props = equipment.customProperties as Record<string, CustomValue | undefined>;
  return CUSTOM_FIELDS[equipment.type]
    .filter((field) => props[field.key] !== undefined && props[field.key] !== '')
    .map((field) => {
      const raw = props[field.key];
      let value = String(raw);
      if (field.kind === 'boolean') value = raw ? 'Sim' : 'Não';
      if (field.kind === 'select') value = field.options?.find((o) => o.value === raw)?.label ?? value;
      return { label: field.label, value };
    });
}

/** Dispositivos móveis têm a posição atualizada pela telemetria simulada. */
export const MOBILE_TYPES: EquipmentType[] = [
  'autonomous_vehicle',
  'transport_vehicle',
  'scooter',
  'agent_moto',
  'patrol_car',
];
