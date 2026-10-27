import { Equipment } from '../models/fogo.models';
import { RegionHealthIndex, RegionRisk, calcularRisco, calcularSaudePorRegiao } from './analysis';
import { calcularCobertura } from './coverage';
import { Indicators, calcularIndicadores, daysUntil } from './indicators';
import { CityState } from './state';

export type TipoAlerta = 'furto' | 'falha' | 'manutencao';
export type StatusOcorrencia = 'aberta' | 'investigada' | 'despachada' | 'encerrada';

export const TIPOS_ALERTA: TipoAlerta[] = ['furto', 'falha', 'manutencao'];
export const STATUS_OCORRENCIA: StatusOcorrencia[] = ['aberta', 'investigada', 'despachada', 'encerrada'];

export const TIPO_ALERTA_LABELS: Record<TipoAlerta, string> = { furto: 'Furto', falha: 'Falha', manutencao: 'Manutenção' };
export const STATUS_OCORRENCIA_LABELS: Record<StatusOcorrencia, string> = {
  aberta: 'Aberta',
  investigada: 'Investigada',
  despachada: 'Despachada',
  encerrada: 'Encerrada',
};

/** Fotografia da cidade e do bairro no momento da abertura (base do "antes × agora" do relatório). */
export interface SnapshotOcorrencia {
  indicadores: Indicators;
  bairro: string;
  saude: RegionHealthIndex | null;
  risco: RegionRisk | null;
  cobertura: { cidadePct: number; bairroPct: number | null; pontosCegos: number };
}

export interface Ocorrencia {
  id: string;
  equipamentoId: string;
  tipoAlerta: TipoAlerta;
  status: StatusOcorrencia;
  abertaEm: string;
  encerradaEm: string | null;
  snapshotAbertura: SnapshotOcorrencia;
  /** Preenchidos nas fases seguintes do fluxo (investigação, despacho, encerramento). */
  dossie: unknown | null;
  despacho: unknown | null;
  encerramento: unknown | null;
}

export interface AberturaOcorrencia {
  equipamentoId: string;
  tipoAlerta: TipoAlerta;
}

/**
 * Tipo de alerta que a situação do equipamento justifica hoje (mesmos critérios de `calcularAlertas`).
 * Furto e falha vêm da situação; manutenção, de prioridade imediata ou preventiva vencida.
 */
export function tipoAlertaDoEquipamento(e: Equipment, today?: string): TipoAlerta | null {
  if (e.status === 'stolen') return 'furto';
  if (e.status === 'malfunction') return 'falha';
  if (e.status === 'not_installed' || e.status === 'deactivated') return null;
  if (e.maintenance.priority === 'immediate') return 'manutencao';
  if (e.maintenance.nextDate && daysUntil(e.maintenance.nextDate, today) < 0) return 'manutencao';
  return null;
}

/** Indicadores gerais + saúde, risco e cobertura do bairro, reaproveitando as funções existentes. */
export function montarSnapshot(estado: CityState, bairro: string): SnapshotOcorrencia {
  const coverage = calcularCobertura(estado);
  return {
    indicadores: calcularIndicadores(estado.equipment, estado.agents),
    bairro,
    saude: calcularSaudePorRegiao(estado).find((s) => s.neighborhood === bairro) ?? null,
    risco: calcularRisco(estado, { coverage }).find((r) => r.neighborhood === bairro) ?? null,
    cobertura: {
      cidadePct: coverage.coveragePct,
      bairroPct: coverage.byNeighborhood[bairro]?.pct ?? null,
      pontosCegos: coverage.blindSpots.length,
    },
  };
}

/** Lista de erros do corpo de abertura (vazia = válido). */
export function validarAbertura(input: unknown): string[] {
  const body = input as Partial<AberturaOcorrencia> | null;
  if (!body || typeof body !== 'object') return ['corpo inválido'];
  const errors: string[] = [];
  if (typeof body.equipamentoId !== 'string' || !body.equipamentoId.trim()) errors.push('equipamentoId é obrigatório');
  if (!TIPOS_ALERTA.includes(body.tipoAlerta as TipoAlerta)) errors.push(`tipoAlerta deve ser ${TIPOS_ALERTA.join(', ')}`);
  return errors;
}

/** Ocorrência ainda não encerrada para o mesmo equipamento e tipo de alerta (chave da idempotência). */
export function ocorrenciaEmAberto(lista: readonly Ocorrencia[], input: AberturaOcorrencia): Ocorrencia | null {
  return lista.find((o) => o.status !== 'encerrada' && o.equipamentoId === input.equipamentoId && o.tipoAlerta === input.tipoAlerta) ?? null;
}

/** Próximo id sequencial (OC-0001, OC-0002…), a partir dos ids existentes. */
export function proximoIdOcorrencia(lista: readonly Pick<Ocorrencia, 'id'>[]): string {
  const max = lista.reduce((m, o) => Math.max(m, Number(/^OC-(\d+)$/.exec(o.id)?.[1] ?? 0)), 0);
  return `OC-${String(max + 1).padStart(4, '0')}`;
}

/**
 * Abre uma ocorrência (idempotente): se já houver uma não encerrada para o mesmo equipamento e tipo,
 * devolve a existente com `criada: false`. Não muta a lista nem o estado.
 */
export function abrirOcorrencia(
  lista: readonly Ocorrencia[],
  estado: CityState,
  input: AberturaOcorrencia,
  agora: Date
): { ocorrencia: Ocorrencia; criada: boolean } {
  const existente = ocorrenciaEmAberto(lista, input);
  if (existente) return { ocorrencia: existente, criada: false };
  const equipamento = estado.equipment.find((e) => e.id === input.equipamentoId);
  if (!equipamento) throw new Error(`Equipamento ${input.equipamentoId} não encontrado`);
  return {
    criada: true,
    ocorrencia: {
      id: proximoIdOcorrencia(lista),
      equipamentoId: equipamento.id,
      tipoAlerta: input.tipoAlerta,
      status: 'aberta',
      abertaEm: agora.toISOString(),
      encerradaEm: null,
      snapshotAbertura: montarSnapshot(estado, equipamento.location.neighborhood),
      dossie: null,
      despacho: null,
      encerramento: null,
    },
  };
}
