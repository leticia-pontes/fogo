import { daysFromToday } from '../data/mock-data';
import { STATUS_LABELS, TYPE_LABELS } from '../models/equipment-schema';
import { Equipment } from '../models/fogo.models';
import { calcularRisco, calcularSaudePorRegiao } from './analysis';
import { daysUntil } from './indicators';
import { Acao, Simulacao, simular } from './simulation';
import { CityState } from './state';

/**
 * Próxima melhor ação. Gera ações candidatas, simula cada uma e ranqueia pelo ganho:
 *
 *   ganho = Σ queda de risco nos bairros + 0,5 × Σ alta de saúde + 0,5 × pontos cegos recuperados
 *
 * É uma estimativa baseada em regras (as mesmas fórmulas de saúde, risco e cobertura), não uma
 * previsão estatística: a confiança informa o que a regra não enxerga.
 */
export interface Recomendacao {
  id: string;
  acao: Acao;
  titulo: string;
  justificativa: string;
  /** Bairro onde o efeito é maior. */
  regiao: string;
  impacto: {
    riscoAntes: number;
    riscoDepois: number;
    saudeAntes: number;
    saudeDepois: number;
    pontosCegosAntes: number;
    pontosCegosDepois: number;
  };
  ganho: number;
  confianca: 'alta' | 'media';
  limitacoes: string;
}

export const GAIN_WEIGHTS = { risk: 1, health: 0.5, blind: 0.5 } as const;
/** Quantas recomendações do mesmo tipo de ação entram no top N (para variar as sugestões). */
const MAX_PER_KIND = 2;

export function ganhoDe(sim: Simulacao): number {
  let riskDrop = 0;
  let healthGain = 0;
  for (const r of sim.antes.risco) riskDrop += r.risk - sim.depois.risco.find((x) => x.neighborhood === r.neighborhood)!.risk;
  for (const h of sim.antes.saude) healthGain += sim.depois.saude.find((x) => x.neighborhood === h.neighborhood)!.health - h.health;
  const blindRecovered = sim.antes.cobertura.pontosCegos - sim.depois.cobertura.pontosCegos;
  return Math.round((GAIN_WEIGHTS.risk * riskDrop + GAIN_WEIGHTS.health * healthGain + GAIN_WEIGHTS.blind * blindRecovered) * 10) / 10;
}

/** Equipamentos que uma equipe de manutenção resolve: falha, manutenção, imediata ou vencida. */
export function needsMaintenance(e: Equipment, hoje: string): boolean {
  if (e.status === 'stolen' || e.status === 'deactivated' || e.status === 'not_installed') return false;
  if (e.status === 'malfunction' || e.status === 'maintenance' || e.maintenance.priority === 'immediate') return true;
  return !!e.maintenance.nextDate && daysUntil(e.maintenance.nextDate, hoje) < 0;
}

function candidates(state: CityState, hoje: string): { acao: Acao; titulo: string; confianca: Recomendacao['confianca']; limitacoes: string }[] {
  const list: ReturnType<typeof candidates> = [];

  for (const e of state.equipment.filter((x) => needsMaintenance(x, hoje))) {
    list.push({
      acao: { tipo: 'ANTECIPAR_MANUTENCAO', equipamentoId: e.id, novaData: hoje },
      titulo: `Manutenção imediata em ${e.serialNumber} (${TYPE_LABELS[e.type].toLowerCase()}, ${e.location.neighborhood})`,
      confianca: 'alta',
      limitacoes: 'Supõe equipe disponível e reparo concluído hoje; não considera peças em falta.',
    });
  }

  // Realocação: bairros com déficit recebem agentes de folga do próprio bairro ou o excedente
  // dos bairros de menor risco.
  const risk = calcularRisco(state);
  const health = calcularSaudePorRegiao(state, hoje);
  const deficit = health.filter((h) => h.agentsOnDuty < h.agentsRequired);
  const donors = health
    .filter((h) => h.agentsOnDuty > h.agentsRequired)
    .sort((a, b) => risk.find((r) => r.neighborhood === a.neighborhood)!.risk - risk.find((r) => r.neighborhood === b.neighborhood)!.risk);

  for (const target of deficit) {
    const missing = target.agentsRequired - target.agentsOnDuty;
    const offDuty = state.agents.filter((a) => a.neighborhood === target.neighborhood && a.status === 'off_duty').slice(0, missing);
    if (offDuty.length) {
      list.push({
        acao: { tipo: 'REALOCAR_AGENTES', agentes: offDuty.map((a) => a.id), regiaoDestino: target.neighborhood },
        titulo: `Convocar ${offDuty.length} agente(s) de folga em ${target.neighborhood}`,
        confianca: 'media',
        limitacoes: 'Supõe que os agentes de folga atendem à convocação; não considera hora extra nem tempo de chegada.',
      });
    }
    for (const donor of donors) {
      const surplus = donor.agentsOnDuty - donor.agentsRequired;
      const moving = state.agents
        .filter((a) => a.neighborhood === donor.neighborhood && a.status === 'active')
        .slice(0, Math.min(surplus, missing));
      if (!moving.length) continue;
      list.push({
        acao: { tipo: 'REALOCAR_AGENTES', agentes: moving.map((a) => a.id), regiaoDestino: target.neighborhood },
        titulo: `Realocar ${moving.length} agente(s) de ${donor.neighborhood} para ${target.neighborhood}`,
        confianca: 'media',
        limitacoes: 'Supõe deslocamento imediato; não considera o tempo de trajeto nem ocorrências em andamento na origem.',
      });
    }
  }
  return list;
}

export function recomendarAcoes(state: CityState, opts: { topN?: number; hoje?: string } = {}): Recomendacao[] {
  const topN = opts.topN ?? 3;
  const hoje = opts.hoje ?? daysFromToday(0);

  const ranked = candidates(state, hoje)
    .map((c) => {
      const sim = simular(state, c.acao, hoje);
      return { ...c, sim, ganho: ganhoDe(sim) };
    })
    .filter((c) => c.ganho > 0)
    .sort((a, b) => b.ganho - a.ganho || a.titulo.localeCompare(b.titulo));

  const picked: typeof ranked = [];
  const perKind = new Map<string, number>();
  for (const c of ranked) {
    const n = perKind.get(c.acao.tipo) ?? 0;
    if (n >= MAX_PER_KIND && ranked.some((o) => !picked.includes(o) && o.acao.tipo !== c.acao.tipo)) continue;
    picked.push(c);
    perKind.set(c.acao.tipo, n + 1);
    if (picked.length === topN) break;
  }

  return picked.map((c, i) => {
    const { sim } = c;
    // Bairro de maior efeito: maior queda de risco (empate: maior alta de saúde).
    const effect = sim.antes.risco
      .map((r) => {
        const after = sim.depois.risco.find((x) => x.neighborhood === r.neighborhood)!;
        const hb = sim.antes.saude.find((x) => x.neighborhood === r.neighborhood)!;
        const ha = sim.depois.saude.find((x) => x.neighborhood === r.neighborhood)!;
        return { hood: r.neighborhood, rb: r.risk, ra: after.risk, hb: hb.health, ha: ha.health };
      })
      .sort((a, b) => b.rb - b.ra - (a.rb - a.ra) || b.ha - b.hb - (a.ha - a.hb))[0];
    const recovered = sim.pontosCegosRecuperados.length;
    return {
      id: `REC-${i + 1}`,
      acao: c.acao,
      titulo: c.titulo,
      regiao: effect.hood,
      justificativa: justify(state, c.acao, effect, recovered),
      impacto: {
        riscoAntes: effect.rb,
        riscoDepois: effect.ra,
        saudeAntes: effect.hb,
        saudeDepois: effect.ha,
        pontosCegosAntes: sim.antes.cobertura.pontosCegos,
        pontosCegosDepois: sim.depois.cobertura.pontosCegos,
      },
      ganho: c.ganho,
      confianca: c.confianca,
      limitacoes: c.limitacoes,
    };
  });
}

function justify(state: CityState, acao: Acao, effect: { hood: string; rb: number; ra: number; hb: number; ha: number }, recovered: number): string {
  const riskPart = effect.rb !== effect.ra ? `risco de ${effect.hood} ${effect.rb} → ${effect.ra}` : `saúde de ${effect.hood} ${effect.hb} → ${effect.ha}`;
  const blindPart = recovered ? ` e recupera ${recovered} célula(s) de cobertura` : '';
  if (acao.tipo === 'REALOCAR_AGENTES') {
    const h = calcularSaudePorRegiao(state).find((x) => x.neighborhood === acao.regiaoDestino)!;
    return `${acao.regiaoDestino} tem ${h.agentsOnDuty} de ${h.agentsRequired} agentes necessários no pico. Reforço reduz o ${riskPart}${blindPart}.`;
  }
  const e = state.equipment.find((x) => x.id === (acao as { equipamentoId: string }).equipamentoId)!;
  const pending = e.maintenance.priority === 'immediate' ? ', manutenção imediata pendente' : '';
  return `${e.serialNumber} (situação: ${STATUS_LABELS[e.status].toLowerCase()}${pending}). O reparo melhora o ${riskPart}${blindPart}.`;
}
