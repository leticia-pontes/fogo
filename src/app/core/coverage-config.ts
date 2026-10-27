import { EquipmentType } from '../models/fogo.models';

/**
 * Raio de cobertura (metros) de cada tipo de equipamento OPERACIONAL e dos agentes em serviço.
 * Valores de referência para a demonstração, não medições de campo:
 * - câmeras PTZ enxergam um cruzamento e as quadras vizinhas;
 * - radares, balanças, cancelas e totens fiscalizam só o próprio ponto da via;
 * - viaturas, motos e veículos autônomos patrulham o entorno de onde estão;
 * - ônibus/táxis e patinetes não fiscalizam nada: raio 0 (não cobrem).
 */
export const COVERAGE_RADIUS_M: Record<EquipmentType, number> = {
  camera: 450,
  radar: 300,
  truck_scale: 150,
  barrier_gate: 150,
  parking_totem: 120,
  autonomous_vehicle: 400,
  patrol_car: 600,
  agent_moto: 500,
  transport_vehicle: 0,
  scooter: 0,
  other: 150,
};

/** Agente em serviço (a pé ou em viatura): raio menor que o de uma viatura equipada. */
export const AGENT_COVERAGE_RADIUS_M = 400;

/** Lado de cada célula da grade de cobertura. */
export const COVERAGE_CELL_M = 250;
