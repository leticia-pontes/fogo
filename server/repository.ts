import type { DatabaseSync } from 'node:sqlite';
import type { Ocorrencia, StatusOcorrencia, TipoAlerta } from '../src/app/core/occurrences';
import type { ScenarioId, ScenarioSnapshot } from '../src/app/core/scenarios';
import type { CityState } from '../src/app/core/state';
import type { Agent, Equipment, OpsAlert } from '../src/app/models/fogo.models';

/** Quem originou uma gravação: vai para o histórico de situação e para a auditoria. */
export type Origem = 'seed' | 'usuario' | 'telemetria' | 'cenario' | 'acao' | 'sintetico';

export interface AuditEntry {
  id?: number;
  acao: string;
  autor: string;
  descricao: string;
  antes?: unknown;
  depois?: unknown;
  criadoEm?: string;
}

export interface StatusEvent {
  alvoTipo: 'equipamento' | 'agente';
  alvoId: string;
  situacaoAnterior: string | null;
  situacaoNova: string;
  origem: Origem;
  criadoEm: string;
}

const now = () => new Date().toISOString();

/**
 * Acesso ao estado da cidade. Toda a API passa por aqui; as funções de análise (core/)
 * recebem o resultado de `lerEstado()` e nunca falam com o banco.
 */
export class Repositorio {
  constructor(private readonly db: DatabaseSync) {}

  // ---------------------------------------------------------------------------
  // Equipamentos e agentes
  // ---------------------------------------------------------------------------

  listarEquipamentos(): Equipment[] {
    return (this.db.prepare('SELECT * FROM equipamentos ORDER BY id').all() as unknown as EquipmentRow[]).map(fromEquipmentRow);
  }

  obterEquipamento(id: string): Equipment | null {
    const row = this.db.prepare('SELECT * FROM equipamentos WHERE id = ?').get(id) as unknown as EquipmentRow | undefined;
    return row ? fromEquipmentRow(row) : null;
  }

  listarAgentes(): Agent[] {
    return (this.db.prepare('SELECT * FROM agentes ORDER BY id').all() as unknown as AgentRow[]).map(fromAgentRow);
  }

  obterAgente(id: string): Agent | null {
    const row = this.db.prepare('SELECT * FROM agentes WHERE id = ?').get(id) as unknown as AgentRow | undefined;
    return row ? fromAgentRow(row) : null;
  }

  /** Insere ou atualiza. Mudança de situação vira um evento no histórico. `origem` só vale na criação. */
  salvarEquipamento(e: Equipment, origem: Origem = 'usuario'): void {
    const previous = this.db.prepare('SELECT situacao FROM equipamentos WHERE id = ?').get(e.id) as { situacao: string } | undefined;
    this.db
      .prepare(
        `INSERT INTO equipamentos (id, tipo, numero_serie, marca, modelo, orgao, situacao, cep, logradouro, bairro, cidade_uf,
           referencia, latitude, longitude, manutencao_prioridade, manutencao_data, propriedades, origem, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET tipo = excluded.tipo, numero_serie = excluded.numero_serie, marca = excluded.marca,
           modelo = excluded.modelo, orgao = excluded.orgao, situacao = excluded.situacao, cep = excluded.cep,
           logradouro = excluded.logradouro, bairro = excluded.bairro, cidade_uf = excluded.cidade_uf,
           referencia = excluded.referencia, latitude = excluded.latitude, longitude = excluded.longitude,
           manutencao_prioridade = excluded.manutencao_prioridade, manutencao_data = excluded.manutencao_data,
           propriedades = excluded.propriedades, atualizado_em = excluded.atualizado_em`
      )
      .run(
        e.id, e.type, e.serialNumber, e.brand, e.model, e.agency, e.status, e.location.cep, e.location.street,
        e.location.neighborhood, e.location.cityUf, e.location.reference, e.location.lat, e.location.lng,
        e.maintenance.priority, e.maintenance.nextDate ?? null, JSON.stringify(e.customProperties), origem, now()
      );
    if (previous?.situacao !== e.status) {
      this.registrarEvento({ alvoTipo: 'equipamento', alvoId: e.id, situacaoAnterior: previous?.situacao ?? null, situacaoNova: e.status, origem, criadoEm: now() });
    }
  }

  salvarAgente(a: Agent, origem: Origem = 'usuario'): void {
    const previous = this.db.prepare('SELECT situacao FROM agentes WHERE id = ?').get(a.id) as { situacao: string } | undefined;
    this.db
      .prepare(
        `INSERT INTO agentes (id, nome, matricula, funcao, orgao, situacao, bairro, latitude, longitude, origem, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET nome = excluded.nome, matricula = excluded.matricula, funcao = excluded.funcao,
           orgao = excluded.orgao, situacao = excluded.situacao, bairro = excluded.bairro, latitude = excluded.latitude,
           longitude = excluded.longitude, atualizado_em = excluded.atualizado_em`
      )
      .run(a.id, a.name, a.badgeNumber, a.role, a.agency, a.status, a.neighborhood, a.lat, a.lng, origem, now());
    if (previous?.situacao !== a.status) {
      this.registrarEvento({ alvoTipo: 'agente', alvoId: a.id, situacaoAnterior: previous?.situacao ?? null, situacaoNova: a.status, origem, criadoEm: now() });
    }
  }

  excluirEquipamento(id: string): boolean {
    return Number(this.db.prepare('DELETE FROM equipamentos WHERE id = ?').run(id).changes) > 0;
  }

  excluirAgente(id: string): boolean {
    return Number(this.db.prepare('DELETE FROM agentes WHERE id = ?').run(id).changes) > 0;
  }

  /** Origem do registro ('seed' = dado de exemplo). */
  origemDe(tabela: 'equipamentos' | 'agentes', id: string): Origem | null {
    const row = this.db.prepare(`SELECT origem FROM ${tabela} WHERE id = ?`).get(id) as { origem: Origem } | undefined;
    return row?.origem ?? null;
  }

  // ---------------------------------------------------------------------------
  // Estado global, cenários
  // ---------------------------------------------------------------------------

  lerEstado(): CityState {
    return { equipment: this.listarEquipamentos(), agents: this.listarAgentes(), peakSurge: this.lerPico() };
  }

  lerPico(): string | null {
    const row = this.db.prepare("SELECT valor FROM estado_cidade WHERE chave = 'pico'").get() as { valor: string | null } | undefined;
    return row?.valor ?? null;
  }

  salvarPico(bairro: string | null): void {
    this.db.prepare("INSERT INTO estado_cidade (chave, valor) VALUES ('pico', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor").run(bairro);
  }

  /** Snapshot acumulado dos cenários ainda não revertidos (o mais recente guarda o acumulado). */
  cenarioAtivo(): ScenarioSnapshot | null {
    const row = this.db
      .prepare('SELECT snapshot FROM cenarios_aplicados WHERE revertido_em IS NULL ORDER BY id DESC LIMIT 1')
      .get() as { snapshot: string } | undefined;
    return row ? (JSON.parse(row.snapshot) as ScenarioSnapshot) : null;
  }

  registrarCenario(id: ScenarioId, snapshot: ScenarioSnapshot): void {
    this.db.prepare('INSERT INTO cenarios_aplicados (cenario, snapshot, aplicado_em) VALUES (?, ?, ?)').run(id, JSON.stringify(snapshot), now());
  }

  encerrarCenarios(): void {
    this.db.prepare('UPDATE cenarios_aplicados SET revertido_em = ? WHERE revertido_em IS NULL').run(now());
  }

  // ---------------------------------------------------------------------------
  // Histórico, alertas e auditoria
  // ---------------------------------------------------------------------------

  registrarEvento(ev: StatusEvent): void {
    this.db
      .prepare('INSERT INTO eventos_situacao (alvo_tipo, alvo_id, situacao_anterior, situacao_nova, origem, criado_em) VALUES (?, ?, ?, ?, ?, ?)')
      .run(ev.alvoTipo, ev.alvoId, ev.situacaoAnterior, ev.situacaoNova, ev.origem, ev.criadoEm);
  }

  listarEventos(limit = 50): StatusEvent[] {
    return (
      this.db.prepare('SELECT * FROM eventos_situacao ORDER BY id DESC LIMIT ?').all(limit) as Record<string, string>[]
    ).map((r) => ({
      alvoTipo: r['alvo_tipo'] as StatusEvent['alvoTipo'],
      alvoId: r['alvo_id'],
      situacaoAnterior: r['situacao_anterior'],
      situacaoNova: r['situacao_nova'],
      origem: r['origem'] as Origem,
      criadoEm: r['criado_em'],
    }));
  }

  contarEventos(): number {
    return Number((this.db.prepare('SELECT COUNT(*) n FROM eventos_situacao').get() as { n: number }).n);
  }

  /** Abre os alertas novos e encerra os que deixaram de existir no estado atual. */
  sincronizarAlertas(alerts: OpsAlert[]): void {
    const open = new Map(
      (this.db.prepare('SELECT id, severidade, titulo FROM alertas WHERE encerrado_em IS NULL').all() as { id: string; severidade: string; titulo: string }[]).map(
        (r) => [r.id, r]
      )
    );
    const ts = now();
    const close = this.db.prepare('UPDATE alertas SET encerrado_em = ? WHERE id = ? AND encerrado_em IS NULL');
    const insert = this.db.prepare(
      'INSERT INTO alertas (id, alvo_tipo, alvo_id, severidade, titulo, detalhe, aberto_em) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    for (const a of alerts) {
      const current = open.get(a.id);
      open.delete(a.id);
      if (current && current.severidade === a.severity && current.titulo === a.title) continue;
      if (current) close.run(ts, a.id);
      insert.run(a.id, a.target.kind, a.target.id, a.severity, a.title, a.detail, ts);
    }
    for (const id of open.keys()) close.run(ts, id);
  }

  listarAlertasAbertos(): { id: string; severidade: string; titulo: string; detalhe: string; abertoEm: string }[] {
    return (
      this.db.prepare("SELECT * FROM alertas WHERE encerrado_em IS NULL ORDER BY CASE severidade WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, aberto_em DESC").all() as Record<string, string>[]
    ).map((r) => ({ id: r['id'], severidade: r['severidade'], titulo: r['titulo'], detalhe: r['detalhe'], abertoEm: r['aberto_em'] }));
  }

  registrarAuditoria(entry: AuditEntry): void {
    this.db
      .prepare('INSERT INTO auditoria (acao, autor, descricao, antes, depois, criado_em) VALUES (?, ?, ?, ?, ?, ?)')
      .run(
        entry.acao,
        entry.autor,
        entry.descricao,
        entry.antes === undefined ? null : JSON.stringify(entry.antes),
        entry.depois === undefined ? null : JSON.stringify(entry.depois),
        now()
      );
  }

  listarAuditoria(limit = 50): AuditEntry[] {
    return (this.db.prepare('SELECT * FROM auditoria ORDER BY id DESC LIMIT ?').all(limit) as Record<string, string | number | null>[]).map((r) => ({
      id: Number(r['id']),
      acao: String(r['acao']),
      autor: String(r['autor']),
      descricao: String(r['descricao']),
      antes: r['antes'] ? JSON.parse(String(r['antes'])) : undefined,
      depois: r['depois'] ? JSON.parse(String(r['depois'])) : undefined,
      criadoEm: String(r['criado_em']),
    }));
  }

  abrirOcorrencia(o: Ocorrencia): void {
    this.db
      .prepare(
        `INSERT INTO ocorrencias (id, equipamento_id, tipo_alerta, status, aberta_em, encerrada_em, snapshot_abertura, dossie, despacho, encerramento)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(o.id, o.equipamentoId, o.tipoAlerta, o.status, o.abertaEm, o.encerradaEm, JSON.stringify(o.snapshotAbertura), ...jsonCols(o));
  }

  /** Grava status, encerramento e os blocos JSON das etapas seguintes. */
  atualizarOcorrencia(o: Ocorrencia): void {
    this.db
      .prepare('UPDATE ocorrencias SET status = ?, encerrada_em = ?, dossie = ?, despacho = ?, encerramento = ? WHERE id = ?')
      .run(o.status, o.encerradaEm, ...jsonCols(o), o.id);
  }

  listarOcorrencias(status?: StatusOcorrencia): Ocorrencia[] {
    const rows = status
      ? this.db.prepare('SELECT * FROM ocorrencias WHERE status = ? ORDER BY aberta_em DESC, id DESC').all(status)
      : this.db.prepare('SELECT * FROM ocorrencias ORDER BY aberta_em DESC, id DESC').all();
    return (rows as unknown as OcorrenciaRow[]).map(fromOcorrenciaRow);
  }

  obterOcorrencia(id: string): Ocorrencia | null {
    const row = this.db.prepare('SELECT * FROM ocorrencias WHERE id = ?').get(id) as unknown as OcorrenciaRow | undefined;
    return row ? fromOcorrenciaRow(row) : null;
  }

  /** Executa `fn` numa transação (tudo ou nada). */
  transacao<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}

interface EquipmentRow {
  id: string;
  tipo: string;
  numero_serie: string;
  marca: string;
  modelo: string;
  orgao: string;
  situacao: string;
  cep: string;
  logradouro: string;
  bairro: string;
  cidade_uf: string;
  referencia: string;
  latitude: number;
  longitude: number;
  manutencao_prioridade: string;
  manutencao_data: string | null;
  propriedades: string;
}

interface AgentRow {
  id: string;
  nome: string;
  matricula: string;
  funcao: string;
  orgao: string;
  situacao: string;
  bairro: string;
  latitude: number;
  longitude: number;
}

function fromEquipmentRow(r: EquipmentRow): Equipment {
  return {
    id: r.id,
    type: r.tipo,
    serialNumber: r.numero_serie,
    brand: r.marca,
    model: r.modelo,
    agency: r.orgao,
    status: r.situacao,
    location: {
      cep: r.cep,
      street: r.logradouro,
      neighborhood: r.bairro,
      cityUf: r.cidade_uf,
      reference: r.referencia,
      lat: r.latitude,
      lng: r.longitude,
    },
    maintenance: { priority: r.manutencao_prioridade, ...(r.manutencao_data ? { nextDate: r.manutencao_data } : {}) },
    customProperties: JSON.parse(r.propriedades),
  } as Equipment;
}

function fromAgentRow(r: AgentRow): Agent {
  return {
    id: r.id,
    name: r.nome,
    badgeNumber: r.matricula,
    role: r.funcao as Agent['role'],
    agency: r.orgao,
    status: r.situacao as Agent['status'],
    neighborhood: r.bairro,
    lat: r.latitude,
    lng: r.longitude,
  };
}

interface OcorrenciaRow {
  id: string;
  equipamento_id: string;
  tipo_alerta: string;
  status: string;
  aberta_em: string;
  encerrada_em: string | null;
  snapshot_abertura: string;
  dossie: string | null;
  despacho: string | null;
  encerramento: string | null;
}

const parseJson = (v: string | null) => (v ? JSON.parse(v) : null);
const jsonCols = (o: Ocorrencia) =>
  [o.dossie, o.despacho, o.encerramento].map((v) => (v === null || v === undefined ? null : JSON.stringify(v)));

function fromOcorrenciaRow(r: OcorrenciaRow): Ocorrencia {
  return {
    id: r.id,
    equipamentoId: r.equipamento_id,
    tipoAlerta: r.tipo_alerta as TipoAlerta,
    status: r.status as StatusOcorrencia,
    abertaEm: r.aberta_em,
    encerradaEm: r.encerrada_em,
    snapshotAbertura: JSON.parse(r.snapshot_abertura),
    dossie: parseJson(r.dossie),
    despacho: parseJson(r.despacho),
    encerramento: parseJson(r.encerramento),
  };
}
