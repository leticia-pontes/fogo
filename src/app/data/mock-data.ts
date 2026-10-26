import { CITY_UF, DISTRICTS, districtSpots } from './city-map';
import {
  Agent,
  AgentRole,
  AgentStatus,
  CustomPropertiesByType,
  Equipment,
  EquipmentStatus,
  EquipmentType,
  MaintenancePriority,
  NeighborhoodHistory,
  NeighborhoodInfo,
} from '../models/fogo.models';

export { CITY_CENTER, CITY_NAME, CITY_UF } from './city-map';

/** Bairros da cidade fictícia (ordem usada pelos cenários abaixo). */
export const NEIGHBORHOODS: NeighborhoodInfo[] = DISTRICTS;

/** Histórico simulado (médias das últimas 12 semanas) que alimenta a Cidade Preditiva. */
export const NEIGHBORHOOD_HISTORY: Record<string, NeighborhoodHistory> = {
  'Orla do Rio': { peakWindow: 'sexta-feira, 17h–19h', peakFlowVehiclesPerHour: 4200, incidentsPerWeek: 18, requiredAgentsAtPeak: 4 },
  'Vila Esperança': { peakWindow: 'segunda-feira, 7h–9h', peakFlowVehiclesPerHour: 3100, incidentsPerWeek: 9, requiredAgentsAtPeak: 2 },
  'Centro Histórico': { peakWindow: 'sábado, 20h–23h', peakFlowVehiclesPerHour: 1800, incidentsPerWeek: 7, requiredAgentsAtPeak: 2 },
  Entroncamento: { peakWindow: 'sexta-feira, 18h–19h30', peakFlowVehiclesPerHour: 5200, incidentsPerWeek: 21, requiredAgentsAtPeak: 3 },
  'Jardim Aurora': { peakWindow: 'sábado, 8h–12h (feira livre)', peakFlowVehiclesPerHour: 2400, incidentsPerWeek: 8, requiredAgentsAtPeak: 3 },
  'Cidade Universitária': { peakWindow: 'quarta-feira, 6h–8h', peakFlowVehiclesPerHour: 3300, incidentsPerWeek: 11, requiredAgentsAtPeak: 3 },
};

export function daysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Composição de equipamentos de cada bairro (radares e câmeras em dobro). */
const SLOTS: EquipmentType[] = [
  'radar',
  'radar',
  'camera',
  'camera',
  'truck_scale',
  'autonomous_vehicle',
  'barrier_gate',
  'transport_vehicle',
  'parking_totem',
  'scooter',
  'agent_moto',
  'patrol_car',
];

/** Equipamentos + agentes que cabem em um bairro. */
const SPOTS_PER_DISTRICT = SLOTS.length + 6;

const MODELS: Record<EquipmentType, [string, string][]> = {
  radar: [['Pumatronix', 'ITSCAM 400 OCR'], ['Sensys Gatso', 'T-Series RT4']],
  camera: [['Hikvision', 'DarkFighter DS-2DF8436'], ['Axis', 'Q6225-LE PTZ']],
  truck_scale: [['Toledo do Brasil', 'WIM-9500'], ['Kistler', 'Lineas Quartz WIM']],
  autonomous_vehicle: [['Nexus Robotics', 'Vigil-X2 LiDAR'], ['Knightscope', 'K5 Urban']],
  barrier_gate: [['Nice', 'Wide-L Pro'], ['Magnetic', 'Access Pro-H']],
  transport_vehicle: [['Mercedes-Benz', 'eO500U'], ['BYD', 'D9W Elétrico']],
  parking_totem: [['Flowbird', 'Strada Evo 3'], ['Digicon', 'VersaPark']],
  scooter: [['Segway-Ninebot', 'Max G30'], ['Tembici', 'E-Fit 5G']],
  agent_moto: [['Honda', 'XRE 300 Operacional'], ['Yamaha', 'Lander 250 Operacional']],
  patrol_car: [['Chevrolet', 'Trailblazer VTR'], ['Toyota', 'Hilux SW4 VTR']],
  other: [['Sinalvida', 'Painel PMV-200'], ['Digicon', 'Sensor Ambiental SA-10']],
};

const SERIAL_PREFIX: Record<EquipmentType, string> = {
  radar: 'RAD',
  camera: 'CAM',
  truck_scale: 'BAL',
  autonomous_vehicle: 'VAU',
  barrier_gate: 'CAN',
  transport_vehicle: 'TRP',
  parking_totem: 'TOT',
  scooter: 'PAT',
  agent_moto: 'MOT',
  patrol_car: 'VTR',
  other: 'OUT',
};

/** Cenário inicial: Entroncamento concentra falhas, lote Hikvision degradando, Orla do Rio com furto. */
const STATUS_OVERRIDES: Record<string, { status: EquipmentStatus; priority: MaintenancePriority; nextInDays?: number }> = {
  // Orla do Rio
  '0-1': { status: 'stolen', priority: 'immediate' },
  '0-2': { status: 'malfunction', priority: 'immediate', nextInDays: 0 },
  '0-9': { status: 'maintenance', priority: 'scheduled', nextInDays: 2 },
  // Vila Esperança
  '1-0': { status: 'operational', priority: 'scheduled', nextInDays: 6 },
  '1-6': { status: 'deactivated', priority: 'none' },
  '1-8': { status: 'not_installed', priority: 'scheduled', nextInDays: 5 },
  // Centro Histórico
  '2-4': { status: 'operational', priority: 'scheduled', nextInDays: 1 },
  '2-9': { status: 'stolen', priority: 'immediate' },
  // Entroncamento
  '3-0': { status: 'maintenance', priority: 'scheduled', nextInDays: -1 },
  '3-1': { status: 'malfunction', priority: 'immediate', nextInDays: 0 },
  '3-3': { status: 'operational', priority: 'scheduled', nextInDays: 3 },
  '3-6': { status: 'malfunction', priority: 'immediate', nextInDays: 0 },
  '3-10': { status: 'maintenance', priority: 'scheduled', nextInDays: 4 },
  // Jardim Aurora
  '4-2': { status: 'malfunction', priority: 'immediate', nextInDays: 0 },
  '4-4': { status: 'operational', priority: 'scheduled', nextInDays: -3 },
  '4-8': { status: 'deactivated', priority: 'none' },
  // Cidade Universitária
  '5-2': { status: 'maintenance', priority: 'immediate', nextInDays: 1 },
  '5-5': { status: 'not_installed', priority: 'scheduled', nextInDays: 10 },
  '5-7': { status: 'malfunction', priority: 'immediate', nextInDays: 0 },
};

function seedCustomProperties(type: EquipmentType, seed: number): CustomPropertiesByType[EquipmentType] {
  const plate = `P${String.fromCharCode(65 + (seed % 26))}${String.fromCharCode(65 + ((seed * 7) % 26))}-${1000 + seed * 37}`;
  switch (type) {
    case 'radar': {
      const subtypes = ['speed', 'traffic_light', 'prohibited_turn'] as const;
      const radarSubtype = subtypes[seed % 3];
      return radarSubtype === 'prohibited_turn'
        ? { radarSubtype }
        : { radarSubtype, maxSpeedLimit: seed % 2 === 0 ? 60 : 50 };
    }
    case 'camera':
      return { nightVision: seed % 4 !== 0, resolution: seed % 2 === 0 ? '4K' : '1080p', colorMode: seed % 5 === 0 ? 'bw' : 'color' };
    case 'truck_scale':
      return { maxWeightTons: 45, tolerancePct: 5 };
    case 'autonomous_vehicle':
      return { batteryPct: 55 + (seed % 40), plateReader: true };
    case 'barrier_gate':
      return { accessControl: seed % 2 === 0 ? 'rfid' : 'lpr', dailyCycles: 900 + seed * 11 };
    case 'transport_vehicle': {
      const kinds = ['bus', 'taxi', 'moto_taxi', 'school'] as const;
      return { serviceKind: kinds[seed % 4], plate };
    }
    case 'parking_totem':
      return { paperStockPct: 30 + (seed % 65), pixEnabled: true };
    case 'scooter':
      return { vehicleKind: seed % 2 === 0 ? 'scooter' : 'e_bike', batteryPct: 40 + (seed % 55) };
    case 'agent_moto':
      return { plate, callsign: `MOTO-${200 + seed}` };
    case 'patrol_car':
      return { plate, callsign: `VTR-${100 + seed}`, lprCameras: 2 + (seed % 3) };
    case 'other':
      return { description: seed % 2 === 0 ? 'Painel de mensagem variável' : 'Sensor de qualidade do ar' };
  }
}

function agencyFor(type: EquipmentType, slot: number): string {
  switch (type) {
    case 'transport_vehicle':
    case 'scooter':
      return 'Consórcio de Transporte';
    case 'patrol_car':
      return 'Polícia Militar';
    case 'agent_moto':
      return 'Guarda Municipal';
    case 'camera':
      return slot === 3 ? 'Guarda Municipal' : 'SEMOB';
    default:
      return 'SEMOB';
  }
}

export function buildMockEquipment(): Equipment[] {
  const list: Equipment[] = [];
  let seq = 1;

  NEIGHBORHOODS.forEach((hood, hoodIdx) => {
    const spots = districtSpots(hoodIdx, SPOTS_PER_DISTRICT);
    SLOTS.forEach((type, slot) => {
      const spot = spots[slot];
      const override = STATUS_OVERRIDES[`${hoodIdx}-${slot}`];
      const [brand, model] = MODELS[type][type === 'camera' ? (slot === 2 ? 0 : 1) : (hoodIdx + slot) % 2];
      const nextInDays = override?.nextInDays ?? 20 + ((seq * 7) % 70);

      list.push({
        id: `EQ-${String(seq).padStart(3, '0')}`,
        serialNumber: `${SERIAL_PREFIX[type]}-${hood.cepPrefix.slice(-3)}-${String(seq).padStart(4, '0')}`,
        brand,
        model,
        agency: agencyFor(type, slot),
        type,
        customProperties: seedCustomProperties(type, seq),
        location: {
          cep: `${hood.cepPrefix}-${String(100 + slot * 37).padStart(3, '0')}`,
          neighborhood: hood.name,
          cityUf: CITY_UF,
          street: spot.street,
          reference: spot.kmMarker ?? hood.references[(slot + hoodIdx) % hood.references.length],
          lat: spot.lat,
          lng: spot.lng,
        },
        status: override?.status ?? 'operational',
        maintenance: {
          priority: override?.priority ?? 'none',
          nextDate: override?.status === 'stolen' ? undefined : daysFromToday(nextInDays),
        },
      } as Equipment);
      seq++;
    });
  });

  return list;
}

const AGENT_NAMES = [
  'Lucas Mendonça', 'Helena Albuquerque', 'Rodrigo Cavalcanti', 'Camila Monteiro',
  'Bruno Vasconcelos', 'Patrícia Ferraz', 'Eduardo Tavares', 'Rafael Nogueira',
  'Juliana Bezerra', 'Marcos Lira', 'Larissa Correia', 'Diego Gouveia',
  'Vitor Peixoto', 'Fernanda Arruda', 'Thiago Maranhão', 'Priscila Dantas',
  'Gustavo Paiva', 'Andréia Valença', 'Leonardo Siqueira', 'Mariana Caldas',
  'Felipe Holanda', 'Renato Bastos', 'Beatriz Meireles', 'Daniel Maciel',
];

/** Efetivo por bairro: Orla do Rio, Entroncamento e Cidade Universitária abaixo do necessário; Centro Histórico com sobra. */
const AGENT_DISTRIBUTION: { neighborhood: string; statuses: AgentStatus[] }[] = [
  { neighborhood: 'Orla do Rio', statuses: ['active', 'off_duty', 'off_duty'] },
  { neighborhood: 'Vila Esperança', statuses: ['active', 'active', 'active', 'off_duty'] },
  { neighborhood: 'Centro Histórico', statuses: ['active', 'active', 'active', 'active', 'active', 'active'] },
  { neighborhood: 'Entroncamento', statuses: ['active', 'off_duty'] },
  { neighborhood: 'Jardim Aurora', statuses: ['active', 'active', 'active', 'active', 'in_dispatch'] },
  { neighborhood: 'Cidade Universitária', statuses: ['active', 'active', 'off_duty', 'off_duty'] },
];

export function buildMockAgents(): Agent[] {
  const roles: AgentRole[] = ['transit_agent', 'municipal_guard', 'military_police'];
  const agencies: Record<AgentRole, string> = {
    transit_agent: 'SEMOB',
    municipal_guard: 'Guarda Municipal',
    military_police: 'Polícia Militar',
  };
  const agents: Agent[] = [];
  let idx = 0;

  for (const group of AGENT_DISTRIBUTION) {
    const hoodIdx = NEIGHBORHOODS.findIndex((n) => n.name === group.neighborhood);
    const hood = NEIGHBORHOODS[hoodIdx];
    // Agentes ocupam os pontos de via que sobraram depois dos equipamentos.
    const spots = districtSpots(hoodIdx, SPOTS_PER_DISTRICT).slice(SLOTS.length);
    group.statuses.forEach((status, k) => {
      const role = roles[idx % roles.length];
      agents.push({
        id: `AG-${String(idx + 1).padStart(2, '0')}`,
        name: AGENT_NAMES[idx],
        badgeNumber: `${role === 'military_police' ? 'PM' : role === 'municipal_guard' ? 'GM' : 'AT'}-${4800 + idx * 17}`,
        role,
        agency: agencies[role],
        status,
        neighborhood: hood.name,
        lat: spots[k].lat,
        lng: spots[k].lng,
      });
      idx++;
    });
  }

  return agents;
}

// -----------------------------------------------------------------------------
// "Telemetria detectada": dados realistas para pré-preencher os formulários de cadastro
// -----------------------------------------------------------------------------

const DETECTED_AGENT_NAMES = [
  'Paula Rezende', 'Otávio Brandão', 'Sabrina Toledo', 'Caio Fontes', 'Lívia Sampaio',
  'Henrique Duarte', 'Natália Prado', 'Igor Valadares', 'Elisa Moura', 'Rafaela Couto',
];

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/** Ponto livre sobre uma via do bairro (depois das posições usadas pelos dados de exemplo). */
function freeSpot(neighborhood: string) {
  const index = Math.max(0, NEIGHBORHOODS.findIndex((n) => n.name === neighborhood));
  const spots = districtSpots(index, SPOTS_PER_DISTRICT + 12);
  return { hood: NEIGHBORHOODS[index], spot: spots[SPOTS_PER_DISTRICT + Math.floor(Math.random() * 12)] ?? pick(spots) };
}

export function detectedEquipmentTelemetry(
  type: EquipmentType,
  neighborhood: string,
  takenSerials: ReadonlySet<string>
): Omit<Equipment, 'id'> {
  const { hood, spot } = freeSpot(neighborhood);
  const [brand, model] = pick(MODELS[type]);
  let serialNumber = '';
  do {
    serialNumber = `${SERIAL_PREFIX[type]}-${hood.cepPrefix.slice(-3)}-${String(1000 + Math.floor(Math.random() * 9000))}`;
  } while (takenSerials.has(serialNumber.toLowerCase()));

  return {
    serialNumber,
    brand,
    model,
    agency: agencyFor(type, 2),
    type,
    customProperties: seedCustomProperties(type, Math.floor(Math.random() * 97)),
    location: {
      cep: `${hood.cepPrefix}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
      neighborhood: hood.name,
      cityUf: CITY_UF,
      street: spot.street,
      reference: spot.kmMarker ?? pick(hood.references),
      lat: spot.lat,
      lng: spot.lng,
    },
    status: 'operational',
    maintenance: { priority: 'scheduled', nextDate: daysFromToday(30) },
  } as Omit<Equipment, 'id'>;
}

export function detectedAgentTelemetry(neighborhood: string): Omit<Agent, 'id'> {
  const { hood, spot } = freeSpot(neighborhood);
  const role = pick(['transit_agent', 'municipal_guard', 'military_police'] as const);
  const prefix = role === 'military_police' ? 'PM' : role === 'municipal_guard' ? 'GM' : 'AT';
  return {
    name: pick(DETECTED_AGENT_NAMES),
    badgeNumber: `${prefix}-${5000 + Math.floor(Math.random() * 4000)}`,
    role,
    agency: { transit_agent: 'SEMOB', municipal_guard: 'Guarda Municipal', military_police: 'Polícia Militar' }[role],
    status: 'active',
    neighborhood: hood.name,
    lat: spot.lat,
    lng: spot.lng,
  };
}
