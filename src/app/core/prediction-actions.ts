import { NEIGHBORHOODS } from '../data/mock-data';
import { MaintenancePriority } from '../models/fogo.models';
import { Ocorrencia, TipoAlerta, abrirOcorrencia, tipoAlertaDoEquipamento } from './occurrences';
import { CityState } from './state';

/** Ação de uma recomendação da Cidade Preditiva. */
export type PredictionAction =
  | { kind: 'move_agents'; neighborhood: string; agentIds: string[] }
  | { kind: 'maintenance'; equipmentIds: string[]; priority: MaintenancePriority; nextDate: string };

const PRIORIDADES: MaintenancePriority[] = ['none', 'scheduled', 'immediate'];

/** Identidade estável de uma ação (marca a recomendação como aplicada). */
export function actionSignature(action: PredictionAction): string {
  return action.kind === 'move_agents'
    ? `move:${action.neighborhood}:${[...action.agentIds].sort().join(',')}`
    : `mnt:${action.priority}:${[...action.equipmentIds].sort().join(',')}`;
}

/** Lista de erros das ações recebidas (vazia = válidas). */
export function validarAcoesPrevisao(estado: CityState, input: unknown): string[] {
  if (!Array.isArray(input) || !input.length) return ['acoes deve ser uma lista não vazia'];
  const eqIds = new Set(estado.equipment.map((e) => e.id));
  const agIds = new Set(estado.agents.map((a) => a.id));
  const errors: string[] = [];
  input.forEach((a: Partial<PredictionAction> & Record<string, unknown>, i) => {
    if (a?.kind === 'maintenance') {
      const ids = a['equipmentIds'];
      if (!Array.isArray(ids) || !ids.length) errors.push(`acoes[${i}]: equipmentIds é obrigatório`);
      else ids.filter((id) => !eqIds.has(id)).forEach((id) => errors.push(`acoes[${i}]: equipamento ${id} não encontrado`));
      if (!PRIORIDADES.includes(a['priority'] as MaintenancePriority)) errors.push(`acoes[${i}]: priority deve ser ${PRIORIDADES.join(', ')}`);
      if (typeof a['nextDate'] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(a['nextDate'])) errors.push(`acoes[${i}]: nextDate deve ser AAAA-MM-DD`);
    } else if (a?.kind === 'move_agents') {
      if (!NEIGHBORHOODS.some((n) => n.name === a['neighborhood'])) errors.push(`acoes[${i}]: bairro ${String(a['neighborhood'])} não existe`);
      const ids = a['agentIds'];
      if (!Array.isArray(ids) || !ids.length) errors.push(`acoes[${i}]: agentIds é obrigatório`);
      else ids.filter((id) => !agIds.has(id)).forEach((id) => errors.push(`acoes[${i}]: agente ${id} não encontrado`));
    } else {
      errors.push(`acoes[${i}]: kind deve ser maintenance ou move_agents`);
    }
  });
  return errors;
}

/**
 * Aplica as ações de uma recomendação. Manutenção: o equipamento em falha passa a "em manutenção"
 * (equipe acionada) com a prioridade e a data da ação. Agentes: de folga no próprio bairro são
 * convocados; de outros bairros vão para o destino "em atendimento". Não muta a entrada.
 */
export function aplicarAcoesPrevisao(estado: CityState, acoes: readonly PredictionAction[]): CityState {
  let equipment = estado.equipment;
  let agents = estado.agents;
  for (const action of acoes) {
    if (action.kind === 'maintenance') {
      const ids = new Set(action.equipmentIds);
      equipment = equipment.map((e) =>
        ids.has(e.id)
          ? { ...e, status: e.status === 'malfunction' ? 'maintenance' : e.status, maintenance: { priority: action.priority, nextDate: action.nextDate } }
          : e
      );
    } else {
      const hood = NEIGHBORHOODS.find((n) => n.name === action.neighborhood);
      const ids = new Set(action.agentIds);
      let k = 0;
      agents = agents.map((a) => {
        if (!ids.has(a.id)) return a;
        if (a.neighborhood === action.neighborhood) return { ...a, status: 'active' };
        // Chegam ao centro do bairro, espalhados em espiral (determinístico).
        const angulo = k * 2.4;
        const raio = 0.0012 * (1 + k++ * 0.35);
        return {
          ...a,
          neighborhood: action.neighborhood,
          status: 'in_dispatch',
          lat: (hood?.lat ?? a.lat) + raio * Math.sin(angulo),
          lng: (hood?.lng ?? a.lng) + raio * Math.cos(angulo),
        };
      });
    }
  }
  return { ...estado, equipment, agents };
}

/**
 * Ocorrências que a recomendação abre: uma por equipamento enviado à equipe técnica com prioridade imediata, com o tipo de alerta da
 * situação ANTES da ação (furto, falha ou manutenção). Idempotente: já havendo uma não encerrada para o
 * mesmo equipamento (de qualquer tipo), devolve a existente com `criada: false`.
 */
export function abrirOcorrenciasDaPrevisao(
  lista: readonly Ocorrencia[],
  antes: CityState,
  acoes: readonly PredictionAction[],
  agora: Date
): { ocorrencia: Ocorrencia; criada: boolean }[] {
  const ids = [...new Set(acoes.flatMap((a) => (a.kind === 'maintenance' && a.priority === 'immediate' ? a.equipmentIds : [])))];
  const atual = [...lista];
  const out: { ocorrencia: Ocorrencia; criada: boolean }[] = [];
  for (const id of ids) {
    // Uma ocorrência aberta por equipamento basta: depois de acionada a equipe, a "falha" vira "manutenção" e não deve gerar outra.
    const aberta = atual.find((o) => o.equipamentoId === id && o.status !== 'encerrada');
    if (aberta) {
      out.push({ ocorrencia: aberta, criada: false });
      continue;
    }
    const eq = antes.equipment.find((e) => e.id === id);
    const tipoAlerta: TipoAlerta | null = eq ? tipoAlertaDoEquipamento(eq) : null;
    if (!eq || !tipoAlerta) continue;
    const r = abrirOcorrencia(atual, antes, { equipamentoId: id, tipoAlerta }, agora);
    if (r.criada) atual.push(r.ocorrencia);
    out.push(r);
  }
  return out;
}
