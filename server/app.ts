import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { calcularRisco, calcularSaudePorRegiao } from '../src/app/core/analysis';
import { calcularCobertura } from '../src/app/core/coverage';
import { calcularAlertas, calcularIndicadores } from '../src/app/core/indicators';
import { gerarBoletim } from '../src/app/core/bulletin';
import { gerarRotaManutencao } from '../src/app/core/maintenance-route';
import { STATUS_OCORRENCIA, StatusOcorrencia, abrirOcorrencia, validarAbertura, type AberturaOcorrencia } from '../src/app/core/occurrences';
import { recomendarAcoes } from '../src/app/core/recommendations';
import { recuperarTrechos } from '../src/app/core/manuals';
import { JANELA_VIZINHANCA_H, investigarOcorrencia } from '../src/app/core/investigation';
import { bloqueioDespacho, despachar, sugerirDespacho } from '../src/app/core/dispatch';
import { Resolucao, encerrarOcorrencia, gerarRelatorio, validarEncerramento } from '../src/app/core/closure';
import { PredictionAction, abrirOcorrenciasDaPrevisao, actionSignatures, aplicarAcoesPrevisao, validarAcoesPrevisao } from '../src/app/core/prediction-actions';
import { OcorrenciaNaoEncerradaError, montarComprovante, type Comprovante } from '../src/app/core/comprovante';
import { renderComprovanteHtml } from '../src/app/core/comprovante-html';
import { networkInterfaces } from 'node:os';
import { MANUAIS } from '../src/app/data/manuals-index';
import { Acao, AcaoInvalida, aplicarAcao, simular } from '../src/app/core/simulation';
import { SCENARIOS, ScenarioId, applyScenario, recordSnapshot, revertScenarios } from '../src/app/core/scenarios';
import type { CityState } from '../src/app/core/state';
import type { Agent, Equipment, EquipmentType } from '../src/app/models/fogo.models';
import { DEFAULT_DB_FILE, deleteDatabaseFile, openDatabase } from './db';
import { OPENAPI, SWAGGER_HTML } from './openapi';
import { Origem, Repositorio } from './repository';
import { popularSeed } from './seed';
import { validarAgente, validarEquipamento } from './validation';

export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly details?: unknown) {
    super(message);
  }
}

/** Banco + repositório. O reset fecha o arquivo, apaga e recria com a seed. */
export class Contexto {
  private db!: DatabaseSync;
  repo!: Repositorio;

  constructor(readonly dbFile = DEFAULT_DB_FILE) {
    this.open();
  }

  private open(): void {
    const { db, created } = openDatabase(this.dbFile);
    this.db = db;
    this.repo = new Repositorio(db);
    // Primeira execução: popula sozinho. Banco existente nunca é repopulado.
    if (created) popularSeed(this.repo);
  }

  reset(): void {
    this.close();
    if (this.dbFile !== ':memory:') deleteDatabaseFile(this.dbFile);
    this.open();
  }

  close(): void {
    this.db.close();
  }

  /** Recalcula os alertas a partir do estado e atualiza a tabela de alertas. */
  afterWrite(): void {
    const { equipment, agents } = this.repo.lerEstado();
    this.repo.sincronizarAlertas(calcularAlertas(equipment, agents));
  }

  estadoCompleto() {
    return { ...this.repo.lerEstado(), scenarioSnapshot: this.repo.cenarioAtivo(), acoesAplicadas: this.repo.listarAcoesPrevisaoAplicadas() };
  }
}

export interface Request {
  method: string;
  path: string;
  query: URLSearchParams;
  params: Record<string, string>;
  body: unknown;
  /** Quem fez a requisição (cabeçalho x-usuario), para a auditoria. */
  autor: string;
  /** Porta local em que a requisição chegou (para montar links para outros aparelhos da rede). */
  porta: number;
}

type Handler = (req: Request, ctx: Contexto) => unknown;

/** Resposta com status explícito (o padrão é 200, ou 201 nos POST de cadastro). */
export class Resposta {
  /** Com `contentType`, o corpo (texto) vai como está, em vez de JSON. */
  constructor(readonly status: number, readonly body: unknown, readonly contentType?: string, readonly headers: Record<string, string> = {}) {}
}

const routes: { method: string; path: string; pattern: RegExp; keys: string[]; handler: Handler }[] = [];

/** Rotas registradas, no formato do OpenAPI ('GET /api/equipamentos/{id}'). */
export function listarRotas(): string[] {
  return routes.map((r) => `${r.method} ${r.path.replace(/:(\w+)/g, '{$1}')}`);
}

/** Registra uma rota no formato '/api/equipamentos/:id'. */
export function route(method: string, path: string, handler: Handler): void {
  const keys: string[] = [];
  const pattern = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, path, pattern, keys, handler });
}

// -----------------------------------------------------------------------------
// Estado e sincronização
// -----------------------------------------------------------------------------

route('GET', '/api/saude', () => ({ ok: true }));

route('GET', '/api/openapi.json', () => OPENAPI);

route('GET', '/api/estado', (_req, ctx) => ctx.estadoCompleto());

interface SyncBody {
  equipment?: Equipment[];
  agents?: Agent[];
  removed?: { equipment?: string[]; agents?: string[] };
  peakSurge?: string | null;
  origem?: Origem;
}

/**
 * Grava em lote o que mudou no painel (cadastros, mudanças de situação, telemetria, aplicação
 * das previsões). Mudanças de situação viram histórico; as feitas pelo usuário vão para a auditoria.
 */
route('POST', '/api/sync', (req, ctx) => {
  const body = (req.body ?? {}) as SyncBody;
  const origem: Origem = body.origem === 'telemetria' ? 'telemetria' : 'usuario';
  const errors = [
    ...(body.equipment ?? []).flatMap((e) => validarEquipamento(e).map((m) => `${e?.id}: ${m}`)),
    ...(body.agents ?? []).flatMap((a) => validarAgente(a).map((m) => `${a?.id}: ${m}`)),
  ];
  if (errors.length) throw new HttpError(400, 'Dados inválidos', errors);

  const repo = ctx.repo;
  repo.transacao(() => {
    for (const e of body.equipment ?? []) {
      const before = repo.obterEquipamento(e.id);
      repo.salvarEquipamento(e, origem);
      if (origem === 'usuario' && (!before || before.status !== e.status)) {
        repo.registrarAuditoria({
          acao: before ? 'ALTERAR_SITUACAO' : 'CRIAR_EQUIPAMENTO',
          autor: req.autor,
          descricao: before ? `${e.serialNumber}: ${before.status} → ${e.status}` : `Cadastro de ${e.serialNumber} (${e.location.neighborhood})`,
          antes: before ?? undefined,
          depois: e,
        });
      }
    }
    for (const a of body.agents ?? []) {
      const before = repo.obterAgente(a.id);
      repo.salvarAgente(a, origem);
      if (origem === 'usuario' && (!before || before.status !== a.status || before.neighborhood !== a.neighborhood)) {
        repo.registrarAuditoria({
          acao: before ? 'ALTERAR_AGENTE' : 'CRIAR_AGENTE',
          autor: req.autor,
          descricao: before
            ? `${a.name}: ${before.status}/${before.neighborhood} → ${a.status}/${a.neighborhood}`
            : `Cadastro de ${a.name} (${a.neighborhood})`,
          antes: before ?? undefined,
          depois: a,
        });
      }
    }
    for (const id of body.removed?.equipment ?? []) {
      const before = repo.obterEquipamento(id);
      if (repo.excluirEquipamento(id)) {
        repo.registrarAuditoria({ acao: 'EXCLUIR_EQUIPAMENTO', autor: req.autor, descricao: `Exclusão de ${before?.serialNumber ?? id}`, antes: before });
      }
    }
    for (const id of body.removed?.agents ?? []) {
      const before = repo.obterAgente(id);
      if (repo.excluirAgente(id)) {
        repo.registrarAuditoria({ acao: 'EXCLUIR_AGENTE', autor: req.autor, descricao: `Exclusão de ${before?.name ?? id}`, antes: before });
      }
    }
    if (body.peakSurge !== undefined) repo.salvarPico(body.peakSurge);
    ctx.afterWrite();
  });
  return { ok: true };
});

// -----------------------------------------------------------------------------
// CRUD REST (equipamentos e agentes)
// -----------------------------------------------------------------------------

route('GET', '/api/equipamentos', (req, ctx) => {
  const { tipo, situacao, bairro } = Object.fromEntries(req.query);
  return ctx.repo
    .listarEquipamentos()
    .filter((e) => (!tipo || e.type === tipo) && (!situacao || e.status === situacao) && (!bairro || e.location.neighborhood === bairro));
});

route('GET', '/api/equipamentos/:id', (req, ctx) => ctx.repo.obterEquipamento(req.params['id']) ?? notFound());

route('POST', '/api/equipamentos', (req, ctx) => {
  const e = req.body as Equipment;
  const errors = validarEquipamento(e);
  if (errors.length) throw new HttpError(400, 'Dados inválidos', errors);
  if (ctx.repo.obterEquipamento(e.id)) throw new HttpError(409, `Equipamento ${e.id} já existe`);
  return saveEquipment(ctx, req, e, null);
});

route('PUT', '/api/equipamentos/:id', (req, ctx) => {
  const e = { ...(req.body as Equipment), id: req.params['id'] };
  const errors = validarEquipamento(e);
  if (errors.length) throw new HttpError(400, 'Dados inválidos', errors);
  return saveEquipment(ctx, req, e, ctx.repo.obterEquipamento(e.id) ?? notFound());
});

/** Troca só a situação (ex.: desativar). */
route('PATCH', '/api/equipamentos/:id/situacao', (req, ctx) => {
  const before = ctx.repo.obterEquipamento(req.params['id']) ?? notFound();
  const situacao = (req.body as { situacao?: string })?.situacao;
  const e = { ...before, status: situacao } as Equipment;
  const errors = validarEquipamento(e);
  if (errors.length) throw new HttpError(400, 'Dados inválidos', errors);
  return saveEquipment(ctx, req, e, before);
});

route('DELETE', '/api/equipamentos/:id', (req, ctx) => {
  const before = ctx.repo.obterEquipamento(req.params['id']) ?? notFound();
  ctx.repo.transacao(() => {
    ctx.repo.excluirEquipamento(before.id);
    ctx.repo.registrarAuditoria({ acao: 'EXCLUIR_EQUIPAMENTO', autor: req.autor, descricao: `Exclusão de ${before.serialNumber}`, antes: before });
    ctx.afterWrite();
  });
  return { ok: true };
});

route('GET', '/api/agentes', (req, ctx) => {
  const { situacao, bairro } = Object.fromEntries(req.query);
  return ctx.repo.listarAgentes().filter((a) => (!situacao || a.status === situacao) && (!bairro || a.neighborhood === bairro));
});

route('GET', '/api/agentes/:id', (req, ctx) => ctx.repo.obterAgente(req.params['id']) ?? notFound());

route('POST', '/api/agentes', (req, ctx) => {
  const a = req.body as Agent;
  const errors = validarAgente(a);
  if (errors.length) throw new HttpError(400, 'Dados inválidos', errors);
  if (ctx.repo.obterAgente(a.id)) throw new HttpError(409, `Agente ${a.id} já existe`);
  return saveAgent(ctx, req, a, null);
});

route('PUT', '/api/agentes/:id', (req, ctx) => {
  const a = { ...(req.body as Agent), id: req.params['id'] };
  const errors = validarAgente(a);
  if (errors.length) throw new HttpError(400, 'Dados inválidos', errors);
  return saveAgent(ctx, req, a, ctx.repo.obterAgente(a.id) ?? notFound());
});

route('PATCH', '/api/agentes/:id/situacao', (req, ctx) => {
  const before = ctx.repo.obterAgente(req.params['id']) ?? notFound();
  const a = { ...before, status: (req.body as { situacao?: string })?.situacao } as Agent;
  const errors = validarAgente(a);
  if (errors.length) throw new HttpError(400, 'Dados inválidos', errors);
  return saveAgent(ctx, req, a, before);
});

route('DELETE', '/api/agentes/:id', (req, ctx) => {
  const before = ctx.repo.obterAgente(req.params['id']) ?? notFound();
  ctx.repo.transacao(() => {
    ctx.repo.excluirAgente(before.id);
    ctx.repo.registrarAuditoria({ acao: 'EXCLUIR_AGENTE', autor: req.autor, descricao: `Exclusão de ${before.name}`, antes: before });
    ctx.afterWrite();
  });
  return { ok: true };
});

function saveEquipment(ctx: Contexto, req: Request, e: Equipment, before: Equipment | null): Equipment {
  ctx.repo.transacao(() => {
    ctx.repo.salvarEquipamento(e, 'usuario');
    ctx.repo.registrarAuditoria({
      acao: before ? 'EDITAR_EQUIPAMENTO' : 'CRIAR_EQUIPAMENTO',
      autor: req.autor,
      descricao: before ? `Edição de ${e.serialNumber}` : `Cadastro de ${e.serialNumber} (${e.location.neighborhood})`,
      antes: before ?? undefined,
      depois: e,
    });
    ctx.afterWrite();
  });
  return e;
}

function saveAgent(ctx: Contexto, req: Request, a: Agent, before: Agent | null): Agent {
  ctx.repo.transacao(() => {
    ctx.repo.salvarAgente(a, 'usuario');
    ctx.repo.registrarAuditoria({
      acao: before ? 'EDITAR_AGENTE' : 'CRIAR_AGENTE',
      autor: req.autor,
      descricao: before ? `Edição de ${a.name}` : `Cadastro de ${a.name} (${a.neighborhood})`,
      antes: before ?? undefined,
      depois: a,
    });
    ctx.afterWrite();
  });
  return a;
}

/** Grava o estado novo inteiro (só o que mudou de fato é escrito e vira histórico). */
export function persistState(ctx: Contexto, before: CityState, after: CityState, origem: Origem): void {
  const oldEq = new Map(before.equipment.map((e) => [e.id, JSON.stringify(e)]));
  const oldAg = new Map(before.agents.map((a) => [a.id, JSON.stringify(a)]));
  for (const e of after.equipment) if (oldEq.get(e.id) !== JSON.stringify(e)) ctx.repo.salvarEquipamento(e, origem);
  for (const a of after.agents) if (oldAg.get(a.id) !== JSON.stringify(a)) ctx.repo.salvarAgente(a, origem);
  if (before.peakSurge !== after.peakSurge) ctx.repo.salvarPico(after.peakSurge);
}

// -----------------------------------------------------------------------------
// Cenários de crise, reset, consultas
// -----------------------------------------------------------------------------

route('POST', '/api/cenarios/reverter', (req, ctx) => {
  const snapshot = ctx.repo.cenarioAtivo();
  if (!snapshot) throw new HttpError(409, 'Nenhum cenário ativo');
  ctx.repo.transacao(() => {
    const before = ctx.repo.lerEstado();
    const after = revertScenarios(before, snapshot);
    persistState(ctx, before, after, 'cenario');
    ctx.repo.encerrarCenarios();
    ctx.repo.registrarAuditoria({
      acao: 'REVERTER_CENARIO',
      autor: req.autor,
      descricao: `Cenário(s) revertido(s): ${snapshot.scenarios.join(', ')}`,
      antes: { equipment: snapshot.equipment.map((e) => e.id), agents: snapshot.agents.map((a) => a.id) },
    });
    ctx.afterWrite();
  });
  return ctx.estadoCompleto();
});

route('POST', '/api/cenarios/:id', (req, ctx) => {
  const id = req.params['id'] as ScenarioId;
  if (!SCENARIOS.some((s) => s.id === id)) throw new HttpError(404, `Cenário desconhecido: ${id}`);
  const result = ctx.repo.transacao(() => {
    const before = ctx.repo.lerEstado();
    const result = applyScenario(before, id);
    persistState(ctx, before, result.state, 'cenario');
    ctx.repo.registrarCenario(id, recordSnapshot(ctx.repo.cenarioAtivo(), before, result, id));
    ctx.repo.registrarAuditoria({
      acao: 'APLICAR_CENARIO',
      autor: req.autor,
      descricao: `${result.label}: ${result.equipmentIds.length} equipamento(s) e ${result.agentIds.length} agente(s) afetados`,
      depois: { equipment: result.equipmentIds, agents: result.agentIds },
    });
    ctx.afterWrite();
    return result;
  });
  return { ...ctx.estadoCompleto(), label: result.label, focus: result.focus, messages: result.messages };
});

route('POST', '/api/reset', (req, ctx) => {
  ctx.reset();
  ctx.repo.registrarAuditoria({ acao: 'RESET', autor: req.autor, descricao: 'Banco recriado com a seed de exemplo' });
  return ctx.estadoCompleto();
});

// -----------------------------------------------------------------------------
// Cidade Preditiva: aplicar uma recomendação
// -----------------------------------------------------------------------------

/**
 * Aplica a recomendação de uma previsão numa transação: grava equipamentos e agentes, abre uma
 * ocorrência por equipamento enviado à equipe técnica com prioridade imediata (idempotente) e registra APLICAR_PREVISAO na auditoria,
 * com as assinaturas das ações (é delas que o painel sabe que a recomendação já foi aplicada).
 */
route('POST', '/api/previsoes/aplicar', (req, ctx) => {
  const body = (req.body ?? {}) as { previsaoId?: unknown; recomendacao?: unknown; acoes?: unknown };
  const before = ctx.repo.lerEstado();
  const errors = validarAcoesPrevisao(before, body.acoes);
  if (typeof body.previsaoId !== 'string' || !body.previsaoId) errors.unshift('previsaoId é obrigatório');
  if (errors.length) throw new HttpError(400, 'Dados inválidos', errors);
  const acoes = body.acoes as PredictionAction[];
  const recomendacao = typeof body.recomendacao === 'string' ? body.recomendacao : '';
  const agora = new Date();
  const ocorrencias = ctx.repo.transacao(() => {
    const after = aplicarAcoesPrevisao(before, acoes);
    persistState(ctx, before, after, 'acao');
    const abertas = abrirOcorrenciasDaPrevisao(ctx.repo.listarOcorrencias(), before, acoes, agora);
    for (const { ocorrencia, criada } of abertas) {
      if (!criada) continue;
      ctx.repo.abrirOcorrencia(ocorrencia);
      const eq = before.equipment.find((e) => e.id === ocorrencia.equipamentoId)!;
      ctx.repo.registrarAuditoria({
        acao: 'ABRIR_OCORRENCIA',
        autor: req.autor,
        descricao: `${ocorrencia.id} aberta pela Cidade Preditiva: ${ocorrencia.tipoAlerta} em ${eq.serialNumber} (${eq.location.neighborhood})`,
        depois: { ocorrenciaId: ocorrencia.id, status: ocorrencia.status, equipamentoId: eq.id, situacao: eq.status, previsaoId: body.previsaoId },
      });
    }
    const ids = new Set(acoes.flatMap((a) => (a.kind === 'maintenance' ? a.equipmentIds : a.kind === 'move_agents' ? a.agentIds : [])));
    const pick = (st: typeof before) => ({ equipamentos: st.equipment.filter((e) => ids.has(e.id)), agentes: st.agents.filter((a) => ids.has(a.id)) });
    ctx.repo.registrarAuditoria({
      acao: 'APLICAR_PREVISAO',
      autor: req.autor,
      descricao: `${body.previsaoId}: ${recomendacao}`.slice(0, 500),
      antes: pick(before),
      depois: { ...pick(after), assinaturas: acoes.flatMap(actionSignatures), ocorrencias: abertas.map((o) => o.ocorrencia.id) },
    });
    ctx.afterWrite();
    return abertas.map(({ ocorrencia, criada }) => ({ id: ocorrencia.id, equipamentoId: ocorrencia.equipamentoId, tipoAlerta: ocorrencia.tipoAlerta, criada }));
  });
  return { ...ctx.estadoCompleto(), ocorrencias };
});

// -----------------------------------------------------------------------------
// Simulador e próxima melhor ação
// -----------------------------------------------------------------------------

/** `DESPACHAR_AGENTE` só pode ser simulada aqui; despachar de fato passa pela ocorrência (guarda a origem do agente). */
function readAction(body: unknown, permitirDespacho = false): Acao {
  const acao = (body as { acao?: Acao })?.acao;
  const tipos = ['FALHA_EQUIPAMENTO', 'DESATIVAR_EQUIPAMENTO', 'REALOCAR_AGENTES', 'ANTECIPAR_MANUTENCAO', 'EXECUTAR_ROTA_MANUTENCAO'];
  if (permitirDespacho) tipos.push('DESPACHAR_AGENTE');
  if (!acao || !tipos.includes(acao.tipo)) throw new HttpError(400, `Ação inválida: use { acao: { tipo: ${tipos.join(' | ')} , ... } }`);
  return acao;
}

function withActionErrors<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof AcaoInvalida) throw new HttpError(400, err.message);
    throw err;
  }
}

/** Simula a ação sobre o estado atual, SEM gravar nada. */
route('POST', '/api/simulacao', (req, ctx) => {
  const acao = readAction(req.body, true);
  return withActionErrors(() => simular(ctx.repo.lerEstado(), acao));
});

route('GET', '/api/recomendacoes', (req, ctx) => recomendarAcoes(ctx.repo.lerEstado(), { topN: Number(req.query.get('topN')) || 3 }));

/**
 * Aplica de verdade: grava o novo estado e registra na auditoria quem, quando e antes → depois.
 * `contexto: 'rota'` marca a conclusão de uma parada da rota de manutenção.
 */
route('POST', '/api/acoes/aplicar', (req, ctx) => {
  const acao = readAction(req.body);
  const fromRoute = (req.body as { contexto?: string })?.contexto === 'rota';
  const simulacao = ctx.repo.transacao(() =>
    withActionErrors(() => {
      const before = ctx.repo.lerEstado();
      const sim = simular(before, acao);
      const { state: after, descricao, afetados } = aplicarAcao(before, acao, { modo: 'aplicacao' });
      persistState(ctx, before, after, 'acao');
      const pick = (s: CityState) => ({
        equipamentos: s.equipment.filter((e) => afetados.equipamentos.includes(e.id)),
        agentes: s.agents.filter((a) => afetados.agentes.includes(a.id)),
      });
      ctx.repo.registrarAuditoria({
        acao: fromRoute ? 'CONCLUIR_PARADA_ROTA' : acao.tipo,
        autor: req.autor,
        descricao: `${fromRoute ? `Parada da rota concluída: ${descricao.replace(/ para \d{2}\/\d{2}\/\d{4}$/, '')}` : descricao} · ${sim.diferencas.slice(0, 3).map((d) => d.texto).join('; ') || 'sem efeito nos indicadores'}`,
        antes: pick(before),
        depois: pick(after),
      });
      ctx.afterWrite();
      return sim;
    })
  );
  return { ...ctx.estadoCompleto(), simulacao };
});

/** Rota de manutenção: ?bairro=&tipo=&apenasCriticos=1&limite=10 */
route('GET', '/api/rota-manutencao', (req, ctx) => {
  const q = Object.fromEntries(req.query);
  return gerarRotaManutencao(ctx.repo.lerEstado(), {
    bairro: q['bairro'] || undefined,
    tipo: (q['tipo'] || undefined) as EquipmentType | undefined,
    apenasCriticos: q['apenasCriticos'] === '1' || q['apenasCriticos'] === 'true',
    limite: Number(q['limite']) || undefined,
  });
});

/** Boletim da PROMETHEUS (templates determinísticos com os números do estado; sem LLM). */
route('GET', '/api/boletim', (_req, ctx) => {
  const state = ctx.repo.lerEstado();
  const coverage = calcularCobertura(state);
  return gerarBoletim(state, calcularRisco(state, { coverage }), new Date(), { coverage });
});

/** Cobertura por bairro e lista de pontos cegos (células sem cobertura). */
route('GET', '/api/cobertura', (_req, ctx) => calcularCobertura(ctx.repo.lerEstado()));

route('GET', '/api/analise', (_req, ctx) => {
  const state = ctx.repo.lerEstado();
  const coverage = calcularCobertura(state);
  return {
    indicadores: calcularIndicadores(state.equipment, state.agents),
    saude: calcularSaudePorRegiao(state),
    risco: calcularRisco(state, { coverage }),
    cobertura: coverage,
  };
});

route('GET', '/api/auditoria', (req, ctx) => ctx.repo.listarAuditoria(Number(req.query.get('limite')) || 50));
route('GET', '/api/alertas', (_req, ctx) => ctx.repo.listarAlertasAbertos());
route('GET', '/api/eventos', (req, ctx) => ctx.repo.listarEventos(Number(req.query.get('limite')) || 50));

// -----------------------------------------------------------------------------
// Ocorrências
// -----------------------------------------------------------------------------

/** Idempotente: já existindo ocorrência não encerrada para o mesmo equipamento e tipo, devolve ela (200). */
route('POST', '/api/ocorrencias', (req, ctx) => {
  const errors = validarAbertura(req.body);
  if (errors.length) throw new HttpError(400, 'Dados inválidos', errors);
  const input = req.body as AberturaOcorrencia;
  if (!ctx.repo.obterEquipamento(input.equipamentoId)) throw new HttpError(404, `Equipamento ${input.equipamentoId} não encontrado`);
  return ctx.repo.transacao(() => {
    const { ocorrencia, criada } = abrirOcorrencia(ctx.repo.listarOcorrencias(), ctx.repo.lerEstado(), input, new Date());
    if (!criada) return new Resposta(200, ocorrencia);
    ctx.repo.abrirOcorrencia(ocorrencia);
    const eq = ctx.repo.obterEquipamento(ocorrencia.equipamentoId)!;
    ctx.repo.registrarAuditoria({
      acao: 'ABRIR_OCORRENCIA',
      autor: req.autor,
      descricao: `${ocorrencia.id} aberta: ${ocorrencia.tipoAlerta} em ${eq.serialNumber} (${eq.location.neighborhood})`,
      depois: { ocorrenciaId: ocorrencia.id, status: ocorrencia.status, equipamentoId: eq.id, situacao: eq.status },
    });
    return new Resposta(201, ocorrencia);
  });
});

route('GET', '/api/ocorrencias', (req, ctx) => {
  const status = req.query.get('status') || undefined;
  if (status && !STATUS_OCORRENCIA.includes(status as StatusOcorrencia)) {
    throw new HttpError(400, `status deve ser ${STATUS_OCORRENCIA.join(', ')}`);
  }
  return ctx.repo.listarOcorrencias(status as StatusOcorrencia | undefined);
});

route('GET', '/api/ocorrencias/:id', (req, ctx) => ctx.repo.obterOcorrencia(req.params['id']) ?? notFound());

/**
 * Investiga a ocorrência: gera o dossiê, grava e passa a ocorrência para "investigada" (se ainda estava aberta).
 * Pode ser chamada de novo para refazer o dossiê com os dados atuais.
 */
route('GET', '/api/ocorrencias/:id/dossie', (req, ctx) => {
  const before = ctx.repo.obterOcorrencia(req.params['id']) ?? notFound();
  const eq = ctx.repo.obterEquipamento(before.equipamentoId);
  if (!eq) throw new HttpError(409, `O equipamento ${before.equipamentoId} foi excluído; não há o que investigar`);
  const agora = new Date();
  return ctx.repo.transacao(() => {
    const dossie = investigarOcorrencia(ctx.repo.lerEstado(), before, {
      eventos: ctx.repo.listarEventosParaInvestigacao(eq.id, new Date(agora.getTime() - JANELA_VIZINHANCA_H * 3_600_000).toISOString()),
      indiceManuais: MANUAIS,
      agora,
      ocorrencias: ctx.repo.listarOcorrencias(),
      auditoria: ctx.repo.listarAuditoriaSobre(eq.id, eq.serialNumber),
    });
    const after = { ...before, dossie, status: before.status === 'aberta' ? ('investigada' as const) : before.status };
    ctx.repo.atualizarOcorrencia(after);
    ctx.repo.registrarAuditoria({
      acao: 'INVESTIGAR_OCORRENCIA',
      autor: req.autor,
      descricao: `${before.id}: ${dossie.hipotese.texto}`,
      antes: { ocorrenciaId: before.id, status: before.status },
      depois: { ocorrenciaId: before.id, status: after.status, padroes: dossie.padroes.map((p) => p.tipo), decisao: dossie.recomendacao.regra },
    });
    return after;
  });
});

/** Sugestões de despacho (top 3 por ETA estimado), sem gravar nada. */
route('GET', '/api/ocorrencias/:id/despacho', (req, ctx) => {
  const ocorrencia = ctx.repo.obterOcorrencia(req.params['id']) ?? notFound();
  if (!ctx.repo.obterEquipamento(ocorrencia.equipamentoId)) throw new HttpError(409, `O equipamento ${ocorrencia.equipamentoId} foi excluído`);
  return sugerirDespacho(ctx.repo.lerEstado(), ocorrencia, {
    topN: Math.min(10, Number(req.query.get('topN')) || 3),
    velocidadeKmH: Number(req.query.get('velocidadeKmH')) || undefined,
  });
});

/** Despacha o agente: move até o local, grava a origem (para o retorno), passa para "despachada" e audita. */
route('POST', '/api/ocorrencias/:id/despachar', (req, ctx) => {
  const before = ctx.repo.obterOcorrencia(req.params['id']) ?? notFound();
  const agenteId = (req.body as { agenteId?: unknown })?.agenteId;
  if (typeof agenteId !== 'string' || !agenteId) throw new HttpError(400, 'Dados inválidos', ['agenteId é obrigatório']);
  const bloqueio = bloqueioDespacho(before);
  if (bloqueio) throw new HttpError(409, bloqueio);
  const agente = ctx.repo.obterAgente(agenteId);
  if (!agente) throw new HttpError(404, `Agente ${agenteId} não encontrado`);
  if (agente.status === 'in_dispatch') throw new HttpError(409, `${agente.name} já está em atendimento`);
  if (!ctx.repo.obterEquipamento(before.equipamentoId)) throw new HttpError(409, `O equipamento ${before.equipamentoId} foi excluído`);
  const ocorrencia = ctx.repo.transacao(() =>
    withActionErrors(() => {
      const estado = ctx.repo.lerEstado();
      const { state, despacho, descricao } = despachar(estado, before, agenteId, new Date());
      persistState(ctx, estado, state, 'acao');
      const after = { ...before, despacho, status: 'despachada' as const };
      ctx.repo.atualizarOcorrencia(after);
      ctx.repo.registrarAuditoria({
        acao: 'DESPACHAR_AGENTE',
        autor: req.autor,
        descricao: `${descricao} · ${despacho.distanciaKm.toLocaleString('pt-BR')} km, ETA estimado ~${despacho.etaMin} min`,
        antes: { ocorrenciaId: before.id, status: before.status, agente },
        depois: { ocorrenciaId: before.id, status: after.status, agente: state.agents.find((a) => a.id === agenteId) },
      });
      ctx.afterWrite();
      return after;
    })
  );
  return { ...ctx.estadoCompleto(), ocorrencia };
});

/** Encerra: ajusta o equipamento conforme a resolução, devolve o agente à origem e audita. Encerrar de novo dá 409. */
route('POST', '/api/ocorrencias/:id/encerrar', (req, ctx) => {
  const before = ctx.repo.obterOcorrencia(req.params['id']) ?? notFound();
  const errors = validarEncerramento(req.body);
  if (errors.length) throw new HttpError(400, 'Dados inválidos', errors);
  if (before.status === 'encerrada') throw new HttpError(409, `${before.id} já está encerrada`);
  const body = req.body as { resolucao: Resolucao; observacao?: string | null };
  const ocorrencia = ctx.repo.transacao(() => {
    const estado = ctx.repo.lerEstado();
    const { state, ocorrencia: after } = encerrarOcorrencia(estado, before, body, new Date());
    persistState(ctx, estado, state, 'acao');
    ctx.repo.atualizarOcorrencia(after);
    const eq = state.equipment.find((e) => e.id === after.equipamentoId);
    ctx.repo.registrarAuditoria({
      acao: 'ENCERRAR_OCORRENCIA',
      autor: req.autor,
      descricao: `${after.id} encerrada (${body.resolucao})${eq ? `: ${eq.serialNumber}` : ''}${after.encerramento && (after.encerramento as { agenteDevolvido: string | null }).agenteDevolvido ? '; agente devolvido à origem' : ''}`,
      antes: { ocorrenciaId: before.id, status: before.status },
      depois: { ocorrenciaId: after.id, status: after.status, encerramento: after.encerramento },
    });
    ctx.afterWrite();
    return after;
  });
  return { ...ctx.estadoCompleto(), ocorrencia };
});

/** Relatório pós-ocorrência: ?formato=md devolve o Markdown puro; sem formato, { markdown }. */
route('GET', '/api/ocorrencias/:id/relatorio', (req, ctx) => {
  const ocorrencia = ctx.repo.obterOcorrencia(req.params['id']) ?? notFound();
  const markdown = gerarRelatorio(ocorrencia, ctx.repo.lerEstado(), ctx.repo.listarAuditoriaSobre(ocorrencia.id), new Date());
  return req.query.get('formato') === 'md' ? new Resposta(200, markdown, 'text/markdown; charset=utf-8') : { markdown };
});

/** Comprovante (cupom) da ocorrência encerrada; ainda aberta dá 409. */
route('GET', '/api/ocorrencias/:id/comprovante', (req, ctx) => comprovante(req, ctx));

/** Link do comprovante para abrir no celular (QR Code): endereço da máquina na rede local, não localhost. */
route('GET', '/api/ocorrencias/:id/comprovante/link', (req, ctx) => {
  const { id } = comprovante(req, ctx);
  return { url: `${urlNaRede(req.porta)}/api/comprovantes/${encodeURIComponent(id)}` };
});

/** Página do comprovante para o celular (HTML autônomo); ?formato=txt baixa o texto puro. */
route('GET', '/api/comprovantes/:id', (req, ctx) => {
  const c = comprovante(req, ctx);
  if (req.query.get('formato') === 'txt') {
    return new Resposta(200, c.textoPlano, 'text/plain; charset=utf-8', { 'content-disposition': `attachment; filename="comprovante-${c.id}.txt"` });
  }
  return new Resposta(200, renderComprovanteHtml(c, { linkTexto: `${encodeURIComponent(c.id)}?formato=txt` }), 'text/html; charset=utf-8');
});

function comprovante(req: Request, ctx: Contexto): Comprovante {
  const ocorrencia = ctx.repo.obterOcorrencia(req.params['id']) ?? notFound();
  try {
    return montarComprovante(ocorrencia, ctx.repo.lerEstado(), new Date());
  } catch (err) {
    if (err instanceof OcorrenciaNaoEncerradaError) throw new HttpError(409, err.message);
    throw err;
  }
}

/**
 * Endereço da API visto por outro aparelho da mesma rede: FOGO_URL_PUBLICA, se definida; senão o IPv4 da
 * rede local (192.168.x antes de 10.x e 172.x, que costumam ser adaptadores virtuais); sem rede, localhost.
 */
export function urlNaRede(porta: number, interfaces = networkInterfaces()): string {
  const fixa = process.env['FOGO_URL_PUBLICA']?.replace(/\/$/, '');
  if (fixa) return fixa;
  const ips = Object.values(interfaces)
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address);
  const prioridade = (ip: string) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3);
  const ip = ips.sort((a, b) => prioridade(a) - prioridade(b))[0] ?? 'localhost';
  return `http://${ip}:${porta}`;
}

/** Busca nos manuais fictícios (BM25 + bônus por tipo e fabricante). */
route('GET', '/api/manuais/busca', (req) => {
  const q = req.query.get('q')?.trim();
  if (!q) throw new HttpError(400, 'Informe a consulta em ?q=');
  return recuperarTrechos(MANUAIS, q, {
    tipo: req.query.get('tipo') || undefined,
    fabricante: req.query.get('fabricante') || undefined,
    topN: Math.min(20, Number(req.query.get('topN')) || 5),
  });
});

function notFound(): never {
  throw new HttpError(404, 'Não encontrado');
}

// -----------------------------------------------------------------------------
// Servidor HTTP
// -----------------------------------------------------------------------------

const STATIC_DIR = resolve('dist/fogo-nexus/browser');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.txt': 'text/plain',
};

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (!chunks.length) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSON inválido');
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/** Em produção (`npm run serve`) o mesmo processo entrega o build do Angular. */
function serveStatic(path: string, res: ServerResponse): boolean {
  if (!existsSync(STATIC_DIR)) return false;
  let file = normalize(join(STATIC_DIR, path));
  if (!file.startsWith(STATIC_DIR)) return false;
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(STATIC_DIR, 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
  return true;
}

export function createApp(dbFile = DEFAULT_DB_FILE): { server: Server; ctx: Contexto } {
  const ctx = new Contexto(dbFile);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const method = req.method ?? 'GET';
    try {
      if (!url.pathname.startsWith('/api/')) {
        if (method === 'GET' && serveStatic(url.pathname, res)) return;
        throw new HttpError(404, 'Não encontrado');
      }
      if (method === 'GET' && /^\/api\/docs\/?$/.test(url.pathname)) {
        res.writeHead(200, { 'content-type': MIME['.html'] });
        return void res.end(SWAGGER_HTML);
      }
      for (const r of routes) {
        const match = r.method === method ? r.pattern.exec(url.pathname) : null;
        if (!match) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
        const autor = String(req.headers['x-usuario'] ?? 'gestor');
        const body = method === 'GET' ? undefined : await readBody(req);
        const result = await r.handler({ method, path: url.pathname, query: url.searchParams, params, body, autor, porta: req.socket.localPort ?? 3000 }, ctx);
        if (result instanceof Resposta && result.contentType) {
          res.writeHead(result.status, { ...result.headers, 'content-type': result.contentType });
          return void res.end(String(result.body));
        }
        if (result instanceof Resposta) return send(res, result.status, result.body);
        return send(res, method === 'POST' && url.pathname.match(/^\/api\/(equipamentos|agentes)$/) ? 201 : 200, result ?? { ok: true });
      }
      throw new HttpError(404, `Rota não encontrada: ${method} ${url.pathname}`);
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { erro: err.message, detalhes: err.details });
      console.error(err);
      send(res, 500, { erro: (err as Error).message });
    }
  });
  server.on('close', () => ctx.close());
  return { server, ctx };
}
