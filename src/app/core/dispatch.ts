import { Agent, AgentRole, AgentStatus } from '../models/fogo.models';
import { haversineM } from './coverage';
import { Ocorrencia, TipoAlerta } from './occurrences';
import { Acao, aplicarAcao, simular } from './simulation';
import { CityState } from './state';

/** Velocidade média em linha reta (estimativa declarada, não trajeto real pelas vias). */
export const VELOCIDADE_PADRAO_KMH = 30;
/** Tempo extra para um agente de folga ser convocado e sair. */
export const PENALIDADE_CONVOCACAO_MIN = 15;

export const ROLE_LABELS_DESPACHO: Record<AgentRole, string> = {
  transit_agent: 'Agente de trânsito',
  municipal_guard: 'Guarda municipal',
  military_police: 'Polícia militar',
};

/** Furto aciona segurança (GM e PM); falha e manutenção acionam o trânsito (sinalizar o local). */
export function perfilDespacho(tipoAlerta: TipoAlerta): { funcoes: AgentRole[]; descricao: string } {
  return tipoAlerta === 'furto'
    ? { funcoes: ['municipal_guard', 'military_police'], descricao: 'Furto: guarda municipal e polícia militar' }
    : { funcoes: ['transit_agent'], descricao: 'Falha/manutenção de equipamento de trânsito: agente de trânsito' };
}

/** Posição e situação do agente antes do despacho (para devolvê-lo ao encerrar). */
export interface OrigemDespacho {
  lat: number;
  lng: number;
  bairro: string;
  status: AgentStatus;
}

export interface CustoColateral {
  bairroOrigem: string;
  efetivoOrigem: { antes: number; depois: number; necessario: number };
  riscoOrigem: { antes: number; depois: number };
  coberturaOrigem: { antes: number; depois: number } | null;
  pontosCegosNovos: number;
  texto: string;
}

export interface SugestaoDespacho {
  agenteId: string;
  nome: string;
  funcao: AgentRole;
  orgao: string;
  bairro: string;
  convocacao: boolean;
  distanciaKm: number;
  etaMin: number;
  custoColateral: CustoColateral;
  justificativa: string;
  acao: Acao;
}

export interface ResultadoDespacho {
  perfil: string;
  /** true quando não havia agente do perfil e entrou qualquer agente em serviço. */
  fallback: boolean;
  sugestoes: SugestaoDespacho[];
  observacao: string;
}

/** Registro gravado em `ocorrencia.despacho`. */
export interface Despacho {
  agenteId: string;
  agenteNome: string;
  funcao: AgentRole;
  orgao: string;
  origem: OrigemDespacho;
  destino: { lat: number; lng: number; bairro: string };
  distanciaKm: number;
  etaMin: number;
  convocacao: boolean;
  despachadoEm: string;
  retornoEm: string | null;
}

export interface OpcoesDespacho {
  topN?: number;
  velocidadeKmH?: number;
  penalidadeConvocacaoMin?: number;
}

/**
 * Ranking por ETA estimado (haversine ÷ velocidade média; de folga soma a penalidade de convocação).
 * Só entram agentes livres (ativos ou de folga); quem já está em atendimento fica de fora.
 * Cada sugestão traz o custo colateral de tirar o agente do posto, medido com `simular`.
 */
export function sugerirDespacho(estado: CityState, ocorrencia: Ocorrencia, opcoes: OpcoesDespacho = {}): ResultadoDespacho {
  const velocidade = opcoes.velocidadeKmH ?? VELOCIDADE_PADRAO_KMH;
  const penalidade = opcoes.penalidadeConvocacaoMin ?? PENALIDADE_CONVOCACAO_MIN;
  const perfil = perfilDespacho(ocorrencia.tipoAlerta);
  const observacao = `ETA estimado em linha reta a ${velocidade} km/h${penalidade ? `; convocação de folga soma ${penalidade} min` : ''}. O trajeto real pelas vias é mais longo.`;
  const eq = estado.equipment.find((e) => e.id === ocorrencia.equipamentoId);
  if (!eq) return { perfil: perfil.descricao, fallback: false, sugestoes: [], observacao };

  const livres = estado.agents.filter((a) => a.status !== 'in_dispatch');
  const doPerfil = livres.filter((a) => perfil.funcoes.includes(a.role));
  const fallback = doPerfil.length === 0;
  const candidatos = fallback ? livres.filter((a) => a.status === 'active') : doPerfil;

  const ranked = candidatos
    .map((a) => {
      const distanciaKm = haversineM(a.lat, a.lng, eq.location.lat, eq.location.lng) / 1000;
      const convocacao = a.status === 'off_duty';
      const etaMin = Math.ceil((distanciaKm / velocidade) * 60 + (convocacao ? penalidade : 0));
      return { a, distanciaKm, convocacao, etaMin };
    })
    .sort((x, y) => x.etaMin - y.etaMin || x.distanciaKm - y.distanciaKm || x.a.id.localeCompare(y.a.id))
    .slice(0, opcoes.topN ?? 3);

  return {
    perfil: perfil.descricao,
    fallback,
    observacao,
    sugestoes: ranked.map(({ a, distanciaKm, convocacao, etaMin }) => {
      const acao: Acao = { tipo: 'DESPACHAR_AGENTE', agenteId: a.id, ocorrenciaId: ocorrencia.id, equipamentoId: eq.id };
      const custoColateral = medirCusto(estado, a, acao, eq.location.neighborhood);
      return {
        agenteId: a.id,
        nome: a.name,
        funcao: a.role,
        orgao: a.agency,
        bairro: a.neighborhood,
        convocacao,
        distanciaKm: Math.round(distanciaKm * 100) / 100,
        etaMin,
        custoColateral,
        justificativa: `${ROLE_LABELS_DESPACHO[a.role]} ${convocacao ? 'de folga (convocação)' : 'em serviço'} em ${a.neighborhood}, a ${fmtKm(distanciaKm)} km do local. ${custoColateral.texto}`,
        acao,
      };
    }),
  };
}

function medirCusto(estado: CityState, agente: Agent, acao: Acao, bairroLocal: string): CustoColateral {
  const sim = simular(estado, acao);
  const origem = agente.neighborhood;
  const sa = sim.antes.saude.find((h) => h.neighborhood === origem)!;
  const sd = sim.depois.saude.find((h) => h.neighborhood === origem)!;
  const ra = sim.antes.risco.find((r) => r.neighborhood === origem)!;
  const rd = sim.depois.risco.find((r) => r.neighborhood === origem)!;
  const ca = sim.antes.cobertura.porBairro[origem];
  const cd = sim.depois.cobertura.porBairro[origem];
  const pontosCegosNovos = sim.novosPontosCegos.length;
  let texto: string;
  if (agente.status === 'off_duty') texto = 'Convocado de folga: não desfalca nenhum posto.';
  else if (origem === bairroLocal) texto = 'Já está no bairro do local: o efetivo do bairro não muda.';
  else {
    texto = `${origem} fica com ${sd.agentsOnDuty} de ${sd.agentsRequired} agentes no pico; risco ${ra.risk} → ${rd.risk}`;
    texto += pontosCegosNovos ? `; ${pontosCegosNovos} ponto(s) cego(s) novo(s).` : '.';
  }
  return {
    bairroOrigem: origem,
    efetivoOrigem: { antes: sa.agentsOnDuty, depois: sd.agentsOnDuty, necessario: sa.agentsRequired },
    riscoOrigem: { antes: ra.risk, depois: rd.risk },
    coberturaOrigem: ca === undefined || cd === undefined ? null : { antes: ca, depois: cd },
    pontosCegosNovos,
    texto,
  };
}

/** Motivo para não despachar (null = pode). */
export function bloqueioDespacho(ocorrencia: Ocorrencia): string | null {
  if (ocorrencia.status === 'encerrada') return `${ocorrencia.id} já está encerrada`;
  if (ocorrencia.despacho) return `${ocorrencia.id} já tem agente despachado`;
  return null;
}

/** Despacha de fato: novo estado (agente no local, em atendimento) + registro com a origem para o retorno. */
export function despachar(
  estado: CityState,
  ocorrencia: Ocorrencia,
  agenteId: string,
  agora: Date,
  opcoes: OpcoesDespacho = {}
): { state: CityState; despacho: Despacho; descricao: string } {
  const agente = estado.agents.find((a) => a.id === agenteId);
  if (!agente) throw new Error(`Agente ${agenteId} não encontrado`);
  const acao: Acao = { tipo: 'DESPACHAR_AGENTE', agenteId, ocorrenciaId: ocorrencia.id, equipamentoId: ocorrencia.equipamentoId };
  const { state, descricao } = aplicarAcao(estado, acao);
  const eq = state.equipment.find((e) => e.id === ocorrencia.equipamentoId)!;
  const distanciaKm = haversineM(agente.lat, agente.lng, eq.location.lat, eq.location.lng) / 1000;
  const convocacao = agente.status === 'off_duty';
  const velocidade = opcoes.velocidadeKmH ?? VELOCIDADE_PADRAO_KMH;
  const penalidade = opcoes.penalidadeConvocacaoMin ?? PENALIDADE_CONVOCACAO_MIN;
  return {
    state,
    descricao,
    despacho: {
      agenteId,
      agenteNome: agente.name,
      funcao: agente.role,
      orgao: agente.agency,
      origem: { lat: agente.lat, lng: agente.lng, bairro: agente.neighborhood, status: agente.status },
      destino: { lat: eq.location.lat, lng: eq.location.lng, bairro: eq.location.neighborhood },
      distanciaKm: Math.round(distanciaKm * 100) / 100,
      etaMin: Math.ceil((distanciaKm / velocidade) * 60 + (convocacao ? penalidade : 0)),
      convocacao,
      despachadoEm: agora.toISOString(),
      retornoEm: null,
    },
  };
}

/** Devolve o agente à posição, bairro e situação de antes do despacho (usado ao encerrar a ocorrência). */
export function devolverAgente(estado: CityState, despacho: Despacho): CityState {
  const { lat, lng, bairro, status } = despacho.origem;
  return {
    ...estado,
    agents: estado.agents.map((a) => (a.id === despacho.agenteId ? { ...a, lat, lng, neighborhood: bairro, status } : a)),
  };
}

const fmtKm = (km: number) => km.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
