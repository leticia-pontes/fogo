import { NEIGHBORHOODS, daysFromToday } from '../app/data/mock-data';
import { defaultCustomProperties } from '../app/models/equipment-schema';
import { Agent, Equipment, EquipmentStatus, EquipmentType, MaintenancePriority } from '../app/models/fogo.models';

/** Bairros reais do mapa, para que histórico e regiões encontrem os nomes. */
export const HOOD_A = NEIGHBORHOODS[0].name;
export const HOOD_B = NEIGHBORHOODS[1].name;

let seq = 0;

export function makeEquipment(
  overrides: Partial<Omit<Equipment, 'type' | 'customProperties'>> & {
    type?: EquipmentType;
    status?: EquipmentStatus;
    neighborhood?: string;
    priority?: MaintenancePriority;
    nextInDays?: number;
  } = {}
): Equipment {
  const { type = 'radar', neighborhood = HOOD_A, priority = 'none', nextInDays, ...rest } = overrides;
  const hood = NEIGHBORHOODS.find((n) => n.name === neighborhood) ?? NEIGHBORHOODS[0];
  seq += 1;
  return {
    id: `EQ-T${seq}`,
    serialNumber: `TST-${seq}`,
    brand: 'Marca',
    model: 'Modelo',
    agency: 'SEMOB',
    status: 'operational',
    location: {
      cep: `${hood.cepPrefix}-000`,
      neighborhood,
      cityUf: 'Nova Prometeia/SP',
      street: hood.streets[0],
      reference: 'S/N',
      lat: hood.lat,
      lng: hood.lng,
    },
    maintenance: { priority, nextDate: nextInDays === undefined ? undefined : daysFromToday(nextInDays) },
    ...rest,
    type,
    customProperties: defaultCustomProperties(type),
  } as Equipment;
}

export function makeAgent(overrides: Partial<Agent> = {}): Agent {
  const hood = NEIGHBORHOODS.find((n) => n.name === (overrides.neighborhood ?? HOOD_A)) ?? NEIGHBORHOODS[0];
  seq += 1;
  return {
    id: `AG-T${seq}`,
    name: `Agente ${seq}`,
    badgeNumber: `AT-${seq}`,
    role: 'transit_agent',
    agency: 'SEMOB',
    status: 'active',
    neighborhood: hood.name,
    lat: hood.lat,
    lng: hood.lng,
    ...overrides,
  };
}
