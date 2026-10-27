import { CUSTOM_FIELDS, EQUIPMENT_STATUSES, EQUIPMENT_TYPES } from '../src/app/models/equipment-schema';
import type { Agent, Equipment } from '../src/app/models/fogo.models';

const PRIORITIES = ['none', 'scheduled', 'immediate'];
const AGENT_ROLES = ['transit_agent', 'municipal_guard', 'military_police'];
const AGENT_STATUSES = ['active', 'off_duty', 'in_dispatch'];

const isText = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
const isCoord = (v: unknown, max: number) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;

/** Lista de erros (vazia = válido). As propriedades específicas seguem o schema do tipo. */
export function validarEquipamento(input: unknown): string[] {
  const e = input as Partial<Equipment> | null;
  if (!e || typeof e !== 'object') return ['corpo inválido'];
  const errors: string[] = [];
  for (const key of ['id', 'serialNumber', 'brand', 'model', 'agency'] as const) {
    if (!isText(e[key])) errors.push(`${key} é obrigatório`);
  }
  if (!EQUIPMENT_TYPES.includes(e.type as Equipment['type'])) errors.push('type inválido');
  if (!EQUIPMENT_STATUSES.includes(e.status as Equipment['status'])) errors.push('status inválido');
  const loc = e.location;
  if (!loc || !isText(loc.neighborhood) || !isText(loc.street) || !isText(loc.cityUf)) errors.push('location incompleta');
  else {
    if (!/^\d{5}-?\d{3}$/.test(loc.cep ?? '')) errors.push('location.cep deve ter o formato 00000-000');
    if (!isCoord(loc.lat, 90) || !isCoord(loc.lng, 180)) errors.push('coordenadas inválidas');
  }
  if (!e.maintenance || !PRIORITIES.includes(e.maintenance.priority)) errors.push('maintenance.priority inválida');
  else if (e.maintenance.nextDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(e.maintenance.nextDate)) {
    errors.push('maintenance.nextDate deve ser YYYY-MM-DD');
  }

  const props = e.customProperties as Record<string, unknown> | undefined;
  if (!props || typeof props !== 'object' || Array.isArray(props)) errors.push('customProperties deve ser um objeto');
  else if (e.type && CUSTOM_FIELDS[e.type]) {
    for (const field of CUSTOM_FIELDS[e.type]) {
      const value = props[field.key];
      if (value === undefined || value === null) {
        if (!field.optional) errors.push(`customProperties.${field.key} é obrigatório para ${e.type}`);
        continue;
      }
      const ok =
        field.kind === 'number' ? typeof value === 'number' :
        field.kind === 'boolean' ? typeof value === 'boolean' :
        field.kind === 'select' ? field.options!.some((o) => o.value === value) :
        typeof value === 'string';
      if (!ok) errors.push(`customProperties.${field.key} inválido`);
    }
  }
  return errors;
}

export function validarAgente(input: unknown): string[] {
  const a = input as Partial<Agent> | null;
  if (!a || typeof a !== 'object') return ['corpo inválido'];
  const errors: string[] = [];
  for (const key of ['id', 'name', 'badgeNumber', 'agency', 'neighborhood'] as const) {
    if (!isText(a[key])) errors.push(`${key} é obrigatório`);
  }
  if (!AGENT_ROLES.includes(a.role as string)) errors.push('role inválida');
  if (!AGENT_STATUSES.includes(a.status as string)) errors.push('status inválido');
  if (!isCoord(a.lat, 90) || !isCoord(a.lng, 180)) errors.push('coordenadas inválidas');
  return errors;
}
