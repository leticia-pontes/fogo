import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** Arquivo do banco (SQLite). FOGO_DB permite apontar para outro arquivo, por exemplo nos testes. */
export const DEFAULT_DB_FILE = resolve(process.env['FOGO_DB'] ?? 'data/fogo.db');

/**
 * Esquema. Campos comuns viram colunas (filtráveis e indexadas); as propriedades específicas
 * de cada tipo ficam numa coluna JSON validada pelo próprio SQLite (json_valid) e pela API.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS equipamentos (
  id                    TEXT PRIMARY KEY,
  tipo                  TEXT NOT NULL,
  numero_serie          TEXT NOT NULL UNIQUE,
  marca                 TEXT NOT NULL,
  modelo                TEXT NOT NULL,
  orgao                 TEXT NOT NULL,
  situacao              TEXT NOT NULL,
  cep                   TEXT NOT NULL,
  logradouro            TEXT NOT NULL,
  bairro                TEXT NOT NULL,
  cidade_uf             TEXT NOT NULL,
  referencia            TEXT NOT NULL,
  latitude              REAL NOT NULL,
  longitude             REAL NOT NULL,
  manutencao_prioridade TEXT NOT NULL,
  manutencao_data       TEXT,
  propriedades          TEXT NOT NULL CHECK (json_valid(propriedades)),
  origem                TEXT NOT NULL DEFAULT 'usuario',
  atualizado_em         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_equipamentos_tipo ON equipamentos(tipo);
CREATE INDEX IF NOT EXISTS idx_equipamentos_situacao ON equipamentos(situacao);
CREATE INDEX IF NOT EXISTS idx_equipamentos_bairro ON equipamentos(bairro);

CREATE TABLE IF NOT EXISTS agentes (
  id            TEXT PRIMARY KEY,
  nome          TEXT NOT NULL,
  matricula     TEXT NOT NULL UNIQUE,
  funcao        TEXT NOT NULL,
  orgao         TEXT NOT NULL,
  situacao      TEXT NOT NULL,
  bairro        TEXT NOT NULL,
  latitude      REAL NOT NULL,
  longitude     REAL NOT NULL,
  origem        TEXT NOT NULL DEFAULT 'usuario',
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agentes_situacao ON agentes(situacao);
CREATE INDEX IF NOT EXISTS idx_agentes_bairro ON agentes(bairro);

-- Telemetria / histórico de situação (uma linha por mudança de situação).
CREATE TABLE IF NOT EXISTS eventos_situacao (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  alvo_tipo         TEXT NOT NULL,
  alvo_id           TEXT NOT NULL,
  situacao_anterior TEXT,
  situacao_nova     TEXT NOT NULL,
  origem            TEXT NOT NULL,
  criado_em         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_eventos_alvo ON eventos_situacao(alvo_id);
CREATE INDEX IF NOT EXISTS idx_eventos_data ON eventos_situacao(criado_em);

-- Alertas materializados a partir do estado: abertos quando surgem, encerrados quando somem.
CREATE TABLE IF NOT EXISTS alertas (
  id          TEXT NOT NULL,
  alvo_tipo   TEXT NOT NULL,
  alvo_id     TEXT NOT NULL,
  severidade  TEXT NOT NULL,
  titulo      TEXT NOT NULL,
  detalhe     TEXT NOT NULL,
  aberto_em   TEXT NOT NULL,
  encerrado_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_alertas_abertos ON alertas(encerrado_em, severidade);

CREATE TABLE IF NOT EXISTS auditoria (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  acao      TEXT NOT NULL,
  autor     TEXT NOT NULL,
  descricao TEXT NOT NULL,
  antes     TEXT CHECK (antes IS NULL OR json_valid(antes)),
  depois    TEXT CHECK (depois IS NULL OR json_valid(depois)),
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auditoria_data ON auditoria(criado_em);

-- Cenários de crise: o snapshot guarda a versão anterior dos itens afetados (para reverter).
CREATE TABLE IF NOT EXISTS cenarios_aplicados (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  cenario      TEXT NOT NULL,
  snapshot     TEXT NOT NULL CHECK (json_valid(snapshot)),
  aplicado_em  TEXT NOT NULL,
  revertido_em TEXT
);

-- Estado global da cidade (ex.: bairro em véspera de pico).
CREATE TABLE IF NOT EXISTS estado_cidade (
  chave TEXT PRIMARY KEY,
  valor TEXT
);
`;

export interface OpenedDatabase {
  db: DatabaseSync;
  /** true quando o arquivo acabou de ser criado (o chamador popula a seed). */
  created: boolean;
}

export function openDatabase(file = DEFAULT_DB_FILE): OpenedDatabase {
  const created = file === ':memory:' || !existsSync(file);
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return { db, created };
}

/** Apaga o arquivo do banco (e os arquivos auxiliares do modo WAL). */
export function deleteDatabaseFile(file = DEFAULT_DB_FILE): void {
  for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true });
}
