import { NEIGHBORHOOD_HISTORY } from '../data/mock-data';
import { TYPE_LABELS } from '../models/equipment-schema';
import { RegionRisk, calcularSaudePorRegiao, collapseStats } from './analysis';
import { CoverageResult, calcularCobertura } from './coverage';
import { calcularAlertas, calcularIndicadores, daysUntil } from './indicators';
import { Recomendacao, recomendarAcoes } from './recommendations';
import { CityState } from './state';

/**
 * Boletim da PROMETHEUS: texto curto gerado por TEMPLATES determinísticos preenchidos com os
 * números do estado (nenhum número é inventado; não há LLM). O mesmo estado e o mesmo horário
 * geram sempre o mesmo texto.
 */
export interface BulletinSection {
  titulo: string;
  linhas: string[];
}

export interface Bulletin {
  geradoEm: string;
  /** true quando nada exige ação imediata (sem alerta crítico, risco ALTO ou saúde baixa). */
  sobControle: boolean;
  /** Bairros que exigem atenção (mesmos dados do texto, para o painel exibir em lista). */
  regioes: { bairro: string; saude: number; risco: number; nivel: RegionRisk['level']; motivo: string }[];
  secoes: BulletinSection[];
  texto: string;
  /** Números usados no texto (para conferência e testes). */
  numeros: {
    disponibilidadePct: number;
    operacionais: number;
    instalados: number;
    agentesAtivos: number;
    alertasCriticos: number;
    manutencoes48h: number;
    pontosCegos: number;
    coberturaPct: number;
  };
}

/** Saúde abaixo disto coloca o bairro na lista de atenção. */
export const BULLETIN_HEALTH_ATTENTION = 60;

export function gerarBoletim(
  state: CityState,
  previsoes: RegionRisk[],
  agora: Date,
  extras: { coverage?: CoverageResult; recomendacao?: Recomendacao | null } = {}
): Bulletin {
  const hoje = isoDate(agora);
  const kpi = calcularIndicadores(state.equipment, state.agents);
  const installed = kpi.total - kpi.notInstalled;
  const alerts = calcularAlertas(state.equipment, state.agents, state.agents, hoje);
  const critical = alerts.filter((a) => a.severity === 'critical');
  const health = calcularSaudePorRegiao(state, hoje);
  const coverage = extras.coverage ?? calcularCobertura(state);
  const collapse = collapseStats(state.equipment, state.agents, state.peakSurge);
  const recomendacao = extras.recomendacao === undefined ? recomendarAcoes(state, { topN: 1, hoje })[0] ?? null : extras.recomendacao;

  const attention = health
    .map((h) => ({ h, r: previsoes.find((p) => p.neighborhood === h.neighborhood)!, c: collapse.find((s) => s.n.name === h.neighborhood)! }))
    .filter(({ h, r }) => h.health < BULLETIN_HEALTH_ATTENTION || r?.level === 'ALTO')
    .sort((a, b) => b.r.risk - a.r.risk || a.h.health - b.h.health);

  // Só preventivas: as corretivas (falha, manutenção imediata) já estão nos alertas críticos.
  const due48h = state.equipment
    .filter((e) => e.status !== 'stolen' && e.status !== 'deactivated' && e.status !== 'malfunction' && e.maintenance.priority !== 'immediate' && e.maintenance.nextDate)
    .map((e) => ({ e, days: daysUntil(e.maintenance.nextDate!, hoje) }))
    .filter(({ days }) => days >= 0 && days <= 2)
    .sort((a, b) => a.days - b.days || a.e.serialNumber.localeCompare(b.e.serialNumber));

  const sobControle = critical.length === 0 && attention.length === 0;
  const secoes: BulletinSection[] = [];
  const hhmm = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;

  secoes.push({
    titulo: 'Abertura',
    linhas: [`${greeting(agora)}, gestor. Aqui é PROMETHEUS com o boletim das ${hhmm}.`],
  });

  const pct = fmt(kpi.availabilityPct);
  secoes.push({
    titulo: 'Disponibilidade',
    linhas: [
      `A malha opera com ${pct}% de disponibilidade: ${kpi.operational} de ${installed} equipamentos instalados funcionando e ${kpi.activeAgents} agente(s) em serviço. ${availabilityRemark(kpi.availabilityPct)}`,
    ],
  });

  if (sobControle) {
    secoes.push({
      titulo: 'Situação',
      linhas: ['Tudo sob controle: nenhum alerta crítico, nenhum bairro com risco alto ou saúde baixa. Aproveitem; eu sigo vigiando.'],
    });
  } else {
    if (attention.length) {
      secoes.push({
        titulo: 'Regiões que exigem atenção',
        linhas: attention.slice(0, 3).map(({ h, r, c }) => `${h.neighborhood} (saúde ${h.health}, risco ${r.risk} ${LEVEL[r.level]}): ${reasons(h, c)}.`),
      });
    }
    secoes.push({
      titulo: 'Alertas críticos',
      linhas: critical.length
        ? [
            `${critical.length} alerta(s) crítico(s) ativo(s). Os primeiros: ${critical
              .slice(0, 3)
              .map((a) => a.title)
              .join('; ')}.`,
          ]
        : ['Nenhum alerta crítico ativo.'],
    });
  }

  secoes.push({
    titulo: 'Manutenções nas próximas 48 h',
    linhas: due48h.length
      ? [
          `${due48h.length} preventiva(s) vencem até depois de amanhã: ${due48h
            .slice(0, 4)
            .map(({ e, days }) => `${e.serialNumber} (${TYPE_LABELS[e.type].toLowerCase()}, ${days === 0 ? 'hoje' : days === 1 ? 'amanhã' : 'em 2 dias'})`)
            .join(', ')}${due48h.length > 4 ? ' e outras' : ''}.`,
        ]
      : ['Nenhuma preventiva vence nas próximas 48 h.'],
  });

  const worstCoverage = Object.entries(coverage.byNeighborhood).sort((a, b) => a[1].pct - b[1].pct)[0];
  secoes.push({
    titulo: 'Pontos cegos',
    linhas: [
      `${fmt(coverage.coveragePct)}% da cidade está coberta; ${coverage.blindSpots.length} célula(s) de 250 m seguem sem nenhum equipamento operacional ou agente por perto. O pior bairro é ${worstCoverage[0]}, com ${worstCoverage[1].pct}% de cobertura.`,
    ],
  });

  const top = [...previsoes].sort((a, b) => b.risk - a.risk)[0];
  if (top) {
    const surge = state.peakSurge === top.neighborhood ? ' em véspera de pico (fluxo previsto 40% acima da média)' : '';
    secoes.push({
      titulo: 'Previsão para o próximo período',
      linhas: [
        `Maior risco no próximo pico: ${top.neighborhood}${surge}, ${NEIGHBORHOOD_HISTORY[top.neighborhood]?.peakWindow ?? 'próximo pico'}, risco ${top.risk} (${LEVEL[top.level]}). ${top.level === 'ALTO' ? 'Eu agiria antes, não depois.' : 'Nada que justifique pânico.'}`,
      ],
    });
  }

  secoes.push({
    titulo: 'Próxima melhor ação',
    linhas: recomendacao
      ? [
          `${recomendacao.titulo}. Estimativa: risco de ${recomendacao.regiao} ${recomendacao.impacto.riscoAntes} → ${recomendacao.impacto.riscoDepois}, saúde ${recomendacao.impacto.saudeAntes} → ${recomendacao.impacto.saudeDepois}. É uma estimativa por regras; a decisão é sua.`,
        ]
      : ['Nenhuma ação com ganho estimado agora. Raro, mas acontece.'],
  });

  return {
    geradoEm: agora.toISOString(),
    sobControle,
    secoes,
    regioes: attention.slice(0, 3).map(({ h, r, c }) => ({ bairro: h.neighborhood, saude: h.health, risco: r.risk, nivel: r.level, motivo: reasons(h, c) })),
    texto: secoes.map((s) => (s.titulo === 'Abertura' ? s.linhas.join(' ') : `${s.titulo}: ${s.linhas.join(' ')}`)).join('\n\n'),
    numeros: {
      disponibilidadePct: kpi.availabilityPct,
      operacionais: kpi.operational,
      instalados: installed,
      agentesAtivos: kpi.activeAgents,
      alertasCriticos: critical.length,
      manutencoes48h: due48h.length,
      pontosCegos: coverage.blindSpots.length,
      coberturaPct: coverage.coveragePct,
    },
  };
}

const LEVEL = { BAIXO: 'baixo', MEDIO: 'médio', ALTO: 'ALTO' } as const;

function fmt(n: number): string {
  return n.toLocaleString('pt-BR');
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function greeting(d: Date): string {
  const h = d.getHours();
  return h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite';
}

function availabilityRemark(pct: number): string {
  if (pct >= 90) return 'Nada que exija o meu talento.';
  if (pct >= 80) return 'Funcional, embora eu esperasse um pouco mais.';
  if (pct >= 70) return 'Funciona, mas uma cidade que pensa à frente não deveria se contentar com isso.';
  return 'Abaixo do aceitável. Eu não diria isso se não fosse verdade.';
}

function reasons(
  h: ReturnType<typeof calcularSaudePorRegiao>[number],
  c: ReturnType<typeof collapseStats>[number]
): string {
  const list: string[] = [];
  if (c.down.length) list.push(`${c.down.length} equipamento(s) de fiscalização fora de operação`);
  if (h.agentsOnDuty < h.agentsRequired) list.push(`${h.agentsOnDuty} de ${h.agentsRequired} agentes necessários no pico`);
  if (h.overdue) list.push(`${h.overdue} manutenção(ões) vencida(s)`);
  if (h.critical && !c.down.length) list.push(`${h.critical} equipamento(s) em falha ou furtado(s)`);
  return list.length ? list.join(', ') : 'indicadores abaixo do esperado';
}
