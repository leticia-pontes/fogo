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

/** Status usado quando o servidor não responde (queda de rede ou API parada). */
export const NETWORK_ERROR = 0;
const OFFLINE_MESSAGE = 'servidor indisponível. Verifique se a API está rodando (npm start); o painel tenta reconectar sozinho';

/** Avisado a cada falha de conexão (o CityStateService liga a reconexão automática). */
export const connection: { onLost: (() => void) | null } = { onLost: null };

export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-usuario': 'gestor (painel)' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    connection.onLost?.();
    throw new ApiError(NETWORK_ERROR, OFFLINE_MESSAGE);
  }
  const data = (await res.json().catch(() => null)) as (T & { erro?: string; detalhes?: unknown }) | null;
  // Pelo proxy do ng serve, API parada vira 5xx sem o JSON de erro da API, em vez de erro de rede.
  if (res.status >= 500 && !data?.erro) {
    connection.onLost?.();
    throw new ApiError(NETWORK_ERROR, OFFLINE_MESSAGE);
  }
  if (!res.ok) throw new ApiError(res.status, data?.erro ?? `HTTP ${res.status}`, data?.detalhes);
  return data as T;
}
