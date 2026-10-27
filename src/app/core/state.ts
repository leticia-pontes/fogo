import { Agent, Equipment } from '../models/fogo.models';

/**
 * Estado da cidade consumido pelas funções puras de `core/` (indicadores, risco, cobertura,
 * simulação, recomendação, rota e boletim). Nenhuma delas muta este objeto.
 */
export interface CityState {
  equipment: Equipment[];
  agents: Agent[];
  /** Bairro em véspera de horário de pico (cenário de crise), ou null. */
  peakSurge: string | null;
}
