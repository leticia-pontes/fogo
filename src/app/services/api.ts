import { ScenarioSnapshot } from '../core/scenarios';
import { CityState } from '../core/state';

/** Base da API (no `ng serve`, o proxy encaminha /api para o servidor Node na porta 3000). */
export const API_BASE = '/api';

/** Estado completo devolvido pelo servidor após leituras e ações. */
export interface ServerState extends CityState {
  scenarioSnapshot: ScenarioSnapshot | null;
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly details?: unknown) {
    super(message);
  }
}

export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-usuario': 'gestor (painel)' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as (T & { erro?: string; detalhes?: unknown }) | null;
  if (!res.ok) throw new ApiError(res.status, data?.erro ?? `HTTP ${res.status}`, data?.detalhes);
  return data as T;
}
