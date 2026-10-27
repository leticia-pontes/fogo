import { districtSpots } from '../data/city-map';
import { NEIGHBORHOODS, daysFromToday } from '../data/mock-data';
import { STATUS_LABELS, TYPE_LABELS } from '../models/equipment-schema';
import { Agent, Equipment } from '../models/fogo.models';
import { RegionHealthIndex, RegionRisk, RiskLevel, calcularRisco, calcularSaudePorRegiao, ENFORCEMENT_TYPES } from './analysis';
import { CoverageCell, calcularCobertura } from './coverage';
import { AGENT_COVERAGE_RADIUS_M, COVERAGE_RADIUS_M } from './coverage-config';
import { Indicators, calcularIndicadores } from './indicators';
import { CityState } from './state';

/** As três ações que o gestor pode simular (e depois aplicar). */
export type Acao =
  | { tipo: 'FALHA_EQUIPAMENTO'; equipamentoId: string }
  | { tipo: 'DESATIVAR_EQUIPAMENTO'; equipamentoId: string }
  | { tipo: 'REALOCAR_AGENTES'; agentes: string[]; regiaoDestino: string }
  | { tipo: 'ANTECIPAR_MANUTENCAO'; equipamentoId: string; novaData: string };

/** Fotografia dos indicadores usada no ANTES × DEPOIS. */
export interface Panorama {
  indicadores: Indicators;
  saude: RegionHealthIndex[];
  risco: RegionRisk[];
  cobertura: { pct: number; pontosCegos: number; porBairro: Record<string, number> };
}

export interface Diferenca {
  texto: string;
  antes: number;
  depois: number;
  delta: number;
  /** true quando a mudança é boa para a cidade (saúde/cobertura sobem, risco/pontos cegos caem). */
  melhora: boolean;
  /** Tamanho da mudança em pontos, usado para ordenar. */
  impacto: number;
}

export interface Simulacao {
  acao: Acao;
  descricao: string;
  antes: Panorama;
  depois: Panorama;
  diferencas: Diferenca[];
  fatores: string[];
  avisos: string[];
  afetados: { equipamentos: string[]; agentes: string[] };
  /** Células que passam a ficar sem cobertura / que voltam a ser cobertas. */
  novosPontosCegos: CoverageCell[];
  pontosCegosRecuperados: CoverageCell[];
}

export class AcaoInvalida extends Error {}

/** Dias de um ciclo de preventiva: depois de uma manutenção, a próxima fica para daqui a 90 dias. */
export const PREVENTIVE_CYCLE_DAYS = 90;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  return iso.split('-').reverse().join('/');
}

/**
 * Aplica a ação e devolve um estado NOVO (a entrada não é alterada).
 * modo 'projecao' (simulação): manutenção antecipada é considerada concluída na nova data.
 * modo 'aplicacao' (aplicar de verdade): data no futuro só agenda; hoje ou antes = equipe executa agora.
 */
export function aplicarAcao(
  state: CityState,
  acao: Acao,
  opts: { hoje?: string; modo?: 'projecao' | 'aplicacao' } = {}
): { state: CityState; descricao: string; afetados: { equipamentos: string[]; agentes: string[] } } {
  const hoje = opts.hoje ?? daysFromToday(0);
  const modo = opts.modo ?? 'aplicacao';

  if (acao.tipo === 'REALOCAR_AGENTES') {
    const hoodIdx = NEIGHBORHOODS.findIndex((n) => n.name === acao.regiaoDestino);
    if (hoodIdx < 0) throw new AcaoInvalida(`Região desconhecida: ${acao.regiaoDestino}`);
    const ids = new Set(acao.agentes);
    const found = state.agents.filter((a) => ids.has(a.id));
    if (!found.length || found.length !== ids.size) throw new AcaoInvalida('Agente(s) não encontrado(s)');
    // Posições livres sobre as vias do destino (depois das usadas pela seed), sem aleatoriedade.
    const spots = districtSpots(hoodIdx, 30).slice(18);
    let k = 0;
    const agents = state.agents.map((a): Agent => {
      if (!ids.has(a.id)) return a;
      if (a.neighborhood === acao.regiaoDestino) return { ...a, status: a.status === 'off_duty' ? 'active' : a.status };
      const spot = spots[k++ % spots.length];
      return { ...a, neighborhood: acao.regiaoDestino, status: 'in_dispatch', lat: spot.lat, lng: spot.lng };
    });
    const origins = [...new Set(found.map((a) => a.neighborhood))].filter((n) => n !== acao.regiaoDestino);
    return {
      state: { ...state, agents },
      descricao: origins.length
        ? `Realocar ${found.length} agente(s) de ${origins.join(', ')} para ${acao.regiaoDestino}`
        : `Convocar ${found.length} agente(s) de folga em ${acao.regiaoDestino}`,
      afetados: { equipamentos: [], agentes: [...ids] },
    };
  }

  const target = state.equipment.find((e) => e.id === acao.equipamentoId);
  if (!target) throw new AcaoInvalida(`Equipamento não encontrado: ${acao.equipamentoId}`);
  const patch = (fn: (e: Equipment) => Equipment): CityState => ({
    ...state,
    equipment: state.equipment.map((e) => (e.id === target.id ? fn(e) : e)),
  });
  const afetados = { equipamentos: [target.id], agentes: [] };

  switch (acao.tipo) {
    case 'FALHA_EQUIPAMENTO':
      return {
        state: patch((e) => ({ ...e, status: 'malfunction', maintenance: { priority: 'immediate', nextDate: hoje } })),
        descricao: `Falha em ${target.serialNumber} (${target.location.neighborhood})`,
        afetados,
      };
    case 'DESATIVAR_EQUIPAMENTO':
      return {
        state: patch((e) => ({ ...e, status: 'deactivated', maintenance: { priority: 'none' } })),
        descricao: `Desativar ${target.serialNumber} (${target.location.neighborhood})`,
        afetados,
      };
    case 'ANTECIPAR_MANUTENCAO': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(acao.novaData)) throw new AcaoInvalida('novaData deve ser YYYY-MM-DD');
      const executes = modo === 'projecao' || acao.novaData <= hoje;
      // Furtado, desativado e não instalado não voltam a operar com manutenção.
      const repairable = target.status === 'malfunction' || target.status === 'maintenance' || target.status === 'operational';
      return {
        state: patch((e) =>
          executes && repairable
            ? { ...e, status: 'operational', maintenance: { priority: 'none', nextDate: addDays(acao.novaData, PREVENTIVE_CYCLE_DAYS) } }
            : { ...e, maintenance: { priority: 'scheduled', nextDate: acao.novaData } }
        ),
        descricao: `Antecipar manutenção de ${target.serialNumber} (${target.location.neighborhood}) para ${formatDate(acao.novaData)}`,
        afetados,
      };
    }
  }
}

export function panorama(state: CityState, hoje = daysFromToday(0)): Panorama & { blind: CoverageCell[] } {
  const coverage = calcularCobertura(state);
  return {
    indicadores: calcularIndicadores(state.equipment, state.agents),
    saude: calcularSaudePorRegiao(state, hoje),
    risco: calcularRisco(state, { coverage }),
    cobertura: {
      pct: coverage.coveragePct,
      pontosCegos: coverage.blindSpots.length,
      porBairro: Object.fromEntries(Object.entries(coverage.byNeighborhood).map(([k, v]) => [k, v.pct])),
    },
    blind: coverage.blindSpots,
  };
}

const LEVEL_LABEL: Record<RiskLevel, string> = { BAIXO: 'BAIXO', MEDIO: 'MÉDIO', ALTO: 'ALTO' };

/**
 * Simula a ação SEM aplicá-la: calcula indicadores, saúde, risco e cobertura antes e depois,
 * lista as diferenças por ordem de impacto e explica o que pesou no cálculo.
 */
export function simular(state: CityState, acao: Acao, hoje = daysFromToday(0)): Simulacao {
  // Cópia profunda: nada do que acontece aqui pode vazar para o estado real.
  const copy = structuredClone(state);
  const { state: after, descricao, afetados } = aplicarAcao(copy, acao, { hoje, modo: 'projecao' });
  const { blind: blindBefore, ...antes } = panorama(copy, hoje);
  const { blind: blindAfter, ...depois } = panorama(after, hoje);

  const beforeIds = new Set(blindBefore.map((c) => c.id));
  const afterIds = new Set(blindAfter.map((c) => c.id));
  const novosPontosCegos = blindAfter.filter((c) => !beforeIds.has(c.id));
  const pontosCegosRecuperados = blindBefore.filter((c) => !afterIds.has(c.id));

  return {
    acao,
    descricao,
    antes,
    depois,
    diferencas: diferencas(antes, depois),
    fatores: fatores(copy, acao),
    avisos: avisos(copy, after, acao, antes, depois, novosPontosCegos, hoje),
    afetados,
    novosPontosCegos,
    pontosCegosRecuperados,
  };
}

function diferencas(antes: Panorama, depois: Panorama): Diferenca[] {
  const list: Diferenca[] = [];
  const add = (texto: string, a: number, d: number, higherIsBetter: boolean, unit = '', suffix = '') => {
    const delta = Math.round((d - a) * 10) / 10;
    if (delta === 0) return;
    const sign = delta > 0 ? '+' : '−';
    list.push({
      texto: `${texto}: ${a.toLocaleString('pt-BR')}${unit} → ${d.toLocaleString('pt-BR')}${unit} (${sign}${Math.abs(delta).toLocaleString('pt-BR')})${suffix}`,
      antes: a,
      depois: d,
      delta,
      melhora: higherIsBetter ? delta > 0 : delta < 0,
      impacto: Math.abs(delta),
    });
  };

  add('Disponibilidade geral', antes.indicadores.availabilityPct, depois.indicadores.availabilityPct, true, '%');
  add('Pontos cegos na cidade', antes.cobertura.pontosCegos, depois.cobertura.pontosCegos, false);
  for (const h of antes.saude) {
    const after = depois.saude.find((x) => x.neighborhood === h.neighborhood)!;
    add(`Saúde de ${h.neighborhood}`, h.health, after.health, true);
  }
  for (const r of antes.risco) {
    const after = depois.risco.find((x) => x.neighborhood === r.neighborhood)!;
    const levels = r.level !== after.level ? `, nível ${LEVEL_LABEL[r.level]} → ${LEVEL_LABEL[after.level]}` : '';
    add(`Risco de ${r.neighborhood}`, r.risk, after.risk, false, '', levels);
  }
  for (const [hood, pct] of Object.entries(antes.cobertura.porBairro)) {
    add(`Cobertura de ${hood}`, pct, depois.cobertura.porBairro[hood], true, '%');
  }
  return list.sort((a, b) => b.impacto - a.impacto);
}

function fatores(state: CityState, acao: Acao): string[] {
  if (acao.tipo === 'REALOCAR_AGENTES') {
    return [
      'Efetivo em serviço comparado ao necessário no pico, na origem e no destino (déficit pesa 10 pontos por agente no risco)',
      `Cobertura de agentes: raio de ${AGENT_COVERAGE_RADIUS_M} m em torno da nova posição de cada agente`,
      'Saúde do bairro: componente de efetivo (peso 25)',
    ];
  }
  const e = state.equipment.find((x) => x.id === acao.equipamentoId)!;
  const radius = COVERAGE_RADIUS_M[e.type];
  const list = [
    `Disponibilidade de ${e.location.neighborhood}: ${TYPE_LABELS[e.type].toLowerCase()} hoje com situação "${STATUS_LABELS[e.status]}"`,
    radius ? `Cobertura do equipamento: raio de ${radius} m (${TYPE_LABELS[e.type].toLowerCase()})` : 'Este tipo de equipamento não conta na cobertura (raio 0)',
  ];
  if (ENFORCEMENT_TYPES.includes(e.type)) list.push('Equipamento de fiscalização: cada um indisponível soma 15 pontos ao escore de colapso viário');
  if (acao.tipo === 'ANTECIPAR_MANUTENCAO') {
    list.push(
      `Projeção com a manutenção concluída em ${formatDate(acao.novaData)}: o equipamento volta a operar e a próxima preventiva fica para ${PREVENTIVE_CYCLE_DAYS} dias depois`,
      'Manutenção vencida ou imediata deixa de penalizar a saúde do bairro (peso 20)'
    );
  } else if (acao.tipo === 'FALHA_EQUIPAMENTO') {
    list.push('Falha grave gera alerta crítico e manutenção imediata (penaliza a saúde do bairro)');
  } else {
    list.push('Desativado sai da disponibilidade e da cobertura, sem abrir alerta de manutenção');
  }
  return list;
}

function avisos(
  before: CityState,
  after: CityState,
  acao: Acao,
  antes: Panorama,
  depois: Panorama,
  novosPontosCegos: CoverageCell[],
  hoje: string
): string[] {
  const list: string[] = [];
  for (const r of depois.risco) {
    const prev = antes.risco.find((x) => x.neighborhood === r.neighborhood)!;
    if (r.level === 'ALTO' && prev.level !== 'ALTO') list.push(`${r.neighborhood} passa a ter risco ALTO (${prev.risk} → ${r.risk})`);
  }
  for (const h of depois.saude) {
    const prev = antes.saude.find((x) => x.neighborhood === h.neighborhood)!;
    if (prev.health - h.health >= 10) list.push(`Saúde de ${h.neighborhood} cai ${prev.health - h.health} pontos`);
    if (acao.tipo === 'REALOCAR_AGENTES' && h.agentsOnDuty < prev.agentsOnDuty && h.agentsOnDuty < h.agentsRequired) {
      list.push(`${h.neighborhood} fica com ${h.agentsOnDuty} de ${h.agentsRequired} agentes necessários no pico`);
    }
  }
  if (novosPontosCegos.length) {
    const hoods = [...new Set(novosPontosCegos.map((c) => c.neighborhood))];
    list.push(`Surgem ${novosPontosCegos.length} novo(s) ponto(s) cego(s) em ${hoods.join(', ')}`);
  }
  if (acao.tipo === 'ANTECIPAR_MANUTENCAO') {
    const e = before.equipment.find((x) => x.id === acao.equipamentoId)!;
    const changed = after.equipment.find((x) => x.id === acao.equipamentoId)!;
    if (changed.status === e.status && e.status !== 'operational') {
      list.push(`${e.serialNumber} está com situação "${STATUS_LABELS[e.status]}": manutenção não o devolve à operação`);
    }
    if (acao.novaData > hoje) list.push(`Efeito só a partir de ${formatDate(acao.novaData)}; até lá o equipamento segue como está`);
  }
  return list;
}
