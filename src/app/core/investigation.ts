import { MOBILE_TYPES } from '../models/equipment-schema';
import { Equipment, EquipmentStatus } from '../models/fogo.models';
import { analisarLotes } from './batch';
import { haversineM } from './coverage';
import { Confianca, DecisaoManual, TrechoManual, recomendarPorManual } from './manuals';
import { Ocorrencia } from './occurrences';
import { simular } from './simulation';
import { CityState } from './state';

/** Mudança de situação registrada (tabela `eventos_situacao`). */
export interface EventoSituacao {
  alvoId: string;
  situacaoAnterior: string | null;
  situacaoNova: string;
  origem: string;
  criadoEm: string;
}

/** Entrada de auditoria, só com o que o dossiê usa. */
export interface RegistroAuditoria {
  acao: string;
  descricao: string;
  criadoEm?: string;
  antes?: unknown;
  depois?: unknown;
}

export type TipoPadrao = 'LOTE' | 'VIZINHANCA' | 'POSSIVEL_ENERGIA';

export interface Padrao {
  tipo: TipoPadrao;
  titulo: string;
  descricao: string;
  /** Evidências concretas (ids, números). */
  evidencias: string[];
  equipamentoIds: string[];
}

export interface Dossie {
  ocorrenciaId: string;
  geradoEm: string;
  oQueAconteceu: {
    equipamentoId: string;
    numeroSerie: string;
    tipo: string;
    marca: string;
    modelo: string;
    bairro: string;
    endereco: string;
    situacao: EquipmentStatus;
    /** Momento da última mudança para a situação atual (null quando não há registro, ex.: estado da seed). */
    detectadoEm: string | null;
    origemDeteccao: string | null;
  };
  historico: {
    eventos: EventoSituacao[];
    auditoria: RegistroAuditoria[];
    falhasAnteriores: number;
    manutencoesAnteriores: number;
  };
  padroes: Padrao[];
  impacto: {
    descricao: string;
    pontosCegos: number;
    saudeBairro: { comEquipamento: number; semEquipamento: number } | null;
    riscoBairro: { comEquipamento: number; semEquipamento: number } | null;
    coberturaBairro: { comEquipamento: number; semEquipamento: number } | null;
  };
  hipotese: { texto: string; confianca: Confianca; limitacoes: string[] };
  recomendacao: DecisaoManual;
  proximosPassos: string[];
  /** Equipamentos relacionados (lote, vizinhança, energia), destacados no mapa. */
  relacionados: string[];
}

export interface OpcoesInvestigacao {
  eventos: readonly EventoSituacao[];
  indiceManuais: readonly TrechoManual[];
  agora: Date;
  /** Outras ocorrências (para o padrão de vizinhança). */
  ocorrencias?: readonly Ocorrencia[];
  auditoria?: readonly RegistroAuditoria[];
}

/** Parâmetros dos padrões (declarados no README). */
export const RAIO_VIZINHANCA_M = 1000;
export const JANELA_VIZINHANCA_H = 24;
export const JANELA_ENERGIA_MIN = 30;
export const MIN_QUEDAS_ENERGIA = 3;
/** Fração mínima dos fixos que operavam no bairro: um apagão derruba quase todos, uma degradação só alguns. */
export const FRACAO_ENERGIA = 0.75;
/** Abaixo disso, o histórico do equipamento é considerado curto. */
const HISTORICO_MINIMO = 3;

const PROBLEMA: string[] = ['stolen', 'malfunction'];
const HOURS = 3_600_000;

/**
 * Dossiê de uma ocorrência: o que aconteceu, histórico, padrões por regras, impacto (via `simular`),
 * hipótese e recomendação dos manuais. Determinístico e sem alterar o estado de entrada.
 */
export function investigarOcorrencia(estado: CityState, ocorrencia: Ocorrencia, opcoes: OpcoesInvestigacao): Dossie {
  const { eventos, indiceManuais, agora } = opcoes;
  const eq = estado.equipment.find((e) => e.id === ocorrencia.equipamentoId);
  if (!eq) throw new Error(`Equipamento ${ocorrencia.equipamentoId} não encontrado`);
  const byId = new Map(estado.equipment.map((e) => [e.id, e]));

  // 1. O que aconteceu
  const proprios = eventos.filter((ev) => ev.alvoId === eq.id).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  const deteccao = [...proprios].reverse().find((ev) => ev.situacaoNova === eq.status) ?? null;

  // 2. Histórico
  const auditoria = (opcoes.auditoria ?? [])
    .filter((a) => JSON.stringify([a.antes ?? null, a.depois ?? null]).includes(`"${eq.id}"`) || a.descricao.includes(eq.serialNumber))
    .sort((a, b) => (a.criadoEm ?? '').localeCompare(b.criadoEm ?? ''));
  const anteriores = proprios.filter((ev) => ev !== deteccao);

  // 3. Padrões
  const padroes: Padrao[] = [];
  const outrasFalhasDoModelo = padraoLote(estado, eq, ocorrencia, padroes);
  const vizinhos = padraoVizinhanca(eq, ocorrencia, opcoes, byId, padroes);
  padraoEnergia(estado, eq, deteccao, eventos, byId, padroes, agora);
  const quedaEnergia = padroes.some((p) => p.tipo === 'POSSIVEL_ENERGIA');

  // 4. Impacto: o mesmo equipamento operando × fora de operação, pelo simulador (nada é gravado).
  const impacto = medirImpacto(estado, eq);

  // 5. Hipótese
  const limitacoes: string[] = [];
  if (proprios.length < HISTORICO_MINIMO) limitacoes.push(`Base de histórico curta: ${proprios.length} mudança(s) de situação registrada(s) para o equipamento.`);
  if (!deteccao) limitacoes.push('Sem registro do momento da detecção (situação vinda da carga inicial).');
  const hipotese = formularHipotese(ocorrencia, eq, padroes, limitacoes);

  // 6. Recomendação dos manuais
  const recomendacao = recomendarPorManual(indiceManuais, {
    tipoAlerta: ocorrencia.tipoAlerta,
    tipoEquipamento: eq.type,
    situacao: eq.status,
    fabricante: eq.brand,
    modelo: eq.model,
    ocorrenciasRecentesNoBairro: vizinhos,
    falhasMesmoModelo: outrasFalhasDoModelo,
    quedaEnergia,
  });

  return {
    ocorrenciaId: ocorrencia.id,
    geradoEm: agora.toISOString(),
    oQueAconteceu: {
      equipamentoId: eq.id,
      numeroSerie: eq.serialNumber,
      tipo: eq.type,
      marca: eq.brand,
      modelo: eq.model,
      bairro: eq.location.neighborhood,
      endereco: `${eq.location.street} (${eq.location.reference})`,
      situacao: eq.status,
      detectadoEm: deteccao?.criadoEm ?? null,
      origemDeteccao: deteccao?.origem ?? null,
    },
    historico: {
      eventos: proprios,
      auditoria,
      falhasAnteriores: anteriores.filter((ev) => ev.situacaoNova === 'malfunction').length,
      manutencoesAnteriores: anteriores.filter((ev) => ev.situacaoAnterior === 'maintenance' || ev.situacaoNova === 'maintenance').length,
    },
    padroes,
    impacto,
    hipotese,
    recomendacao,
    proximosPassos: proximosPassos(ocorrencia, recomendacao),
    relacionados: [...new Set(padroes.flatMap((p) => p.equipamentoIds))].filter((id) => id !== eq.id).sort(),
  };
}

/** LOTE: outras unidades do mesmo fabricante/modelo em falha (mesma análise da previsão de falha em lote). */
function padraoLote(estado: CityState, eq: Equipment, ocorrencia: Ocorrencia, padroes: Padrao[]): number {
  if (ocorrencia.tipoAlerta === 'furto') return 0;
  const lote = analisarLotes(estado.equipment).find((l) => l.marca === eq.brand && l.modelo === eq.model);
  const outras = (lote?.emFalha ?? []).filter((e) => e.id !== eq.id);
  if (!lote || !outras.length) return 0;
  padroes.push({
    tipo: 'LOTE',
    titulo: 'Falha em lote',
    descricao: `${outras.length} outra(s) unidade(s) ${lote.lote} também em falha.`,
    evidencias: [
      `${lote.emFalha.length} de ${lote.unidades.length} unidades do modelo em falha (${pct(lote.taxa)}), contra ${pct(lote.taxaFrota)} na frota`,
      ...outras.map((e) => `${e.serialNumber} (${e.location.neighborhood})`),
    ],
    equipamentoIds: outras.map((e) => e.id).sort(),
  });
  return outras.length;
}

/** VIZINHANÇA: furtos/falhas e outras ocorrências a até ~1 km, nas últimas 24 h. */
function padraoVizinhanca(
  eq: Equipment,
  ocorrencia: Ocorrencia,
  { eventos, ocorrencias = [], agora }: OpcoesInvestigacao,
  byId: Map<string, Equipment>,
  padroes: Padrao[]
): number {
  const desde = agora.getTime() - JANELA_VIZINHANCA_H * HOURS;
  const perto = (id: string) => {
    const other = byId.get(id);
    return other && id !== eq.id && haversineM(eq.location.lat, eq.location.lng, other.location.lat, other.location.lng) <= RAIO_VIZINHANCA_M
      ? other
      : null;
  };
  const recente = (iso: string) => {
    const t = Date.parse(iso);
    return t >= desde && t <= agora.getTime();
  };
  const found = new Map<string, string>();
  for (const ev of eventos) {
    if (ev.origem === 'seed' || !PROBLEMA.includes(ev.situacaoNova) || !recente(ev.criadoEm)) continue;
    const other = perto(ev.alvoId);
    if (other) found.set(other.id, `${other.serialNumber}: ${ev.situacaoNova === 'stolen' ? 'furto' : 'falha'} às ${hora(ev.criadoEm)} (${metros(eq, other)} m)`);
  }
  for (const o of ocorrencias) {
    if (o.id === ocorrencia.id || !recente(o.abertaEm)) continue;
    const other = perto(o.equipamentoId);
    if (other && !found.has(other.id)) found.set(other.id, `${other.serialNumber}: ocorrência ${o.id} (${o.tipoAlerta}) às ${hora(o.abertaEm)} (${metros(eq, other)} m)`);
  }
  if (!found.size) return 0;
  const ids = [...found.keys()].sort();
  padroes.push({
    tipo: 'VIZINHANCA',
    titulo: 'Ocorrências na vizinhança',
    descricao: `${ids.length} furto(s)/falha(s) a até ${RAIO_VIZINHANCA_M / 1000} km nas últimas ${JANELA_VIZINHANCA_H} h.`,
    evidencias: ids.map((id) => found.get(id)!),
    equipamentoIds: ids,
  });
  return ids.length;
}

/** POSSÍVEL_ENERGIA: vários equipamentos fixos do mesmo bairro caindo em janela curta. */
function padraoEnergia(
  estado: CityState,
  eq: Equipment,
  deteccao: EventoSituacao | null,
  eventos: readonly EventoSituacao[],
  byId: Map<string, Equipment>,
  padroes: Padrao[],
  agora: Date
): void {
  if (MOBILE_TYPES.includes(eq.type)) return;
  const ancora = Date.parse(deteccao?.criadoEm ?? agora.toISOString());
  const janela = JANELA_ENERGIA_MIN * 60_000;
  const quedas = new Map<string, string>();
  for (const ev of eventos) {
    if (ev.origem === 'seed' || ev.situacaoNova !== 'malfunction' || Math.abs(Date.parse(ev.criadoEm) - ancora) > janela) continue;
    const other = byId.get(ev.alvoId);
    if (other && other.location.neighborhood === eq.location.neighborhood && !MOBILE_TYPES.includes(other.type)) {
      quedas.set(other.id, `${other.serialNumber} às ${hora(ev.criadoEm)}`);
    }
  }
  // Fixos que operavam antes da janela = os que ainda operam + os que caíram nela.
  const fixosOperando = estado.equipment.filter(
    (e) => e.location.neighborhood === eq.location.neighborhood && !MOBILE_TYPES.includes(e.type) && e.status === 'operational' && !quedas.has(e.id)
  ).length + quedas.size;
  const fracao = quedas.size / fixosOperando;
  if (quedas.size < MIN_QUEDAS_ENERGIA || fracao < FRACAO_ENERGIA) return;
  const ids = [...quedas.keys()].sort();
  padroes.push({
    tipo: 'POSSIVEL_ENERGIA',
    titulo: 'Possível falha de energia',
    descricao: `${ids.length} de ${fixosOperando} equipamentos fixos que operavam em ${eq.location.neighborhood} caíram numa janela de ${JANELA_ENERGIA_MIN} min.`,
    evidencias: [`${pct(fracao)} dos fixos em operação no bairro caíram juntos`, ...ids.map((id) => quedas.get(id)!)],
    equipamentoIds: ids,
  });
}

function medirImpacto(estado: CityState, eq: Equipment): Dossie['impacto'] {
  const bairro = eq.location.neighborhood;
  // Contrafactual: o equipamento operando; a simulação de falha mostra o que se perde sem ele.
  const comEquipamento: CityState = {
    ...estado,
    equipment: estado.equipment.map((e) => (e.id === eq.id ? { ...e, status: 'operational', maintenance: { ...e.maintenance, priority: 'none' } } : e)),
  };
  const sim = simular(comEquipamento, { tipo: 'FALHA_EQUIPAMENTO', equipamentoId: eq.id });
  const par = <T extends { neighborhood: string }>(antes: T[], depois: T[], key: keyof T) => {
    const a = antes.find((x) => x.neighborhood === bairro);
    const d = depois.find((x) => x.neighborhood === bairro);
    return a && d ? { comEquipamento: a[key] as number, semEquipamento: d[key] as number } : null;
  };
  const saude = par(sim.antes.saude, sim.depois.saude, 'health');
  const risco = par(sim.antes.risco, sim.depois.risco, 'risk');
  const cobA = sim.antes.cobertura.porBairro[bairro];
  const cobD = sim.depois.cobertura.porBairro[bairro];
  const cobertura = cobA === undefined || cobD === undefined ? null : { comEquipamento: cobA, semEquipamento: cobD };
  const pontosCegos = sim.novosPontosCegos.length;
  const partes = [
    pontosCegos ? `${pontosCegos} ponto(s) cego(s) a mais` : 'nenhum ponto cego novo (outras fontes cobrem a área)',
    saude ? `saúde de ${bairro} ${saude.comEquipamento} → ${saude.semEquipamento}` : null,
    risco ? `risco ${risco.comEquipamento} → ${risco.semEquipamento}` : null,
  ].filter(Boolean);
  return {
    descricao: `Sem este equipamento: ${partes.join('; ')}. Estimativa pelo simulador (operando × fora de operação).`,
    pontosCegos,
    saudeBairro: saude,
    riscoBairro: risco,
    coberturaBairro: cobertura,
  };
}

function formularHipotese(ocorrencia: Ocorrencia, eq: Equipment, padroes: Padrao[], limitacoes: string[]): Dossie['hipotese'] {
  const tem = (t: TipoPadrao) => padroes.find((p) => p.tipo === t);
  const energia = tem('POSSIVEL_ENERGIA');
  const lote = tem('LOTE');
  const vizinhanca = tem('VIZINHANCA');
  if (ocorrencia.tipoAlerta === 'furto') {
    return vizinhanca
      ? { texto: `Ação coordenada de furto em ${eq.location.neighborhood}: ${vizinhanca.descricao}`, confianca: 'alta', limitacoes }
      : { texto: 'Furto isolado: nenhuma outra ocorrência registrada na vizinhança nas últimas 24 h.', confianca: 'media', limitacoes };
  }
  if (energia) {
    return {
      texto: `Queda de energia em ${eq.location.neighborhood}, não defeito do equipamento: ${energia.descricao}`,
      confianca: 'media',
      limitacoes: [...limitacoes, 'O sistema não recebe dados da concessionária de energia; a hipótese vem só da simultaneidade das quedas.'],
    };
  }
  if (lote) return { texto: `Defeito de lote do modelo ${eq.brand} ${eq.model}: ${lote.descricao}`, confianca: 'alta', limitacoes };
  if (ocorrencia.tipoAlerta === 'manutencao') {
    return { texto: 'Manutenção pendente: o equipamento precisa de serviço preventivo ou corretivo agendado.', confianca: 'alta', limitacoes };
  }
  return { texto: 'Falha isolada do equipamento: sem padrão de lote, vizinhança ou energia.', confianca: 'media', limitacoes };
}

function proximosPassos(ocorrencia: Ocorrencia, rec: DecisaoManual): string[] {
  const passos = [`Executar: ${rec.decisao.charAt(0).toLowerCase()}${rec.decisao.slice(1)}.`];
  passos.push(
    ocorrencia.tipoAlerta === 'furto'
      ? 'Despachar o agente de segurança (GM/PM) mais próximo ao local.'
      : 'Despachar o agente de trânsito mais próximo para sinalizar o local até o reparo.'
  );
  passos.push('Encerrar a ocorrência com a resolução e gerar o relatório.');
  return passos;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
/** Hora no fuso da cidade (fixo, para o texto não depender do fuso da máquina). */
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const metros = (a: Equipment, b: Equipment) => Math.round(haversineM(a.location.lat, a.location.lng, b.location.lat, b.location.lng));
