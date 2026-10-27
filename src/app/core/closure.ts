import { STATUS_LABELS, TYPE_LABELS } from '../models/equipment-schema';
import { EquipmentStatus } from '../models/fogo.models';
import { Despacho, ROLE_LABELS_DESPACHO, devolverAgente } from './dispatch';
import { Dossie, RegistroAuditoria } from './investigation';
import { Ocorrencia, SnapshotOcorrencia, TIPO_ALERTA_LABELS, montarSnapshot } from './occurrences';
import { PREVENTIVE_CYCLE_DAYS } from './simulation';
import { CityState } from './state';

export type Resolucao = 'reposto' | 'consertado' | 'falso_alarme' | 'outro';
export const RESOLUCOES: Resolucao[] = ['reposto', 'consertado', 'falso_alarme', 'outro'];
export const RESOLUCAO_LABELS: Record<Resolucao, string> = {
  reposto: 'Equipamento reposto',
  consertado: 'Equipamento consertado',
  falso_alarme: 'Falso alarme',
  outro: 'Outro',
};

export interface Encerramento {
  resolucao: Resolucao;
  observacao: string | null;
  equipamento: { antes: EquipmentStatus; depois: EquipmentStatus } | null;
  agenteDevolvido: string | null;
}

/** Lista de erros do corpo de encerramento (vazia = válido). */
export function validarEncerramento(input: unknown): string[] {
  const body = input as { resolucao?: unknown; observacao?: unknown } | null;
  if (!body || typeof body !== 'object') return ['corpo inválido'];
  const errors: string[] = [];
  if (!RESOLUCOES.includes(body.resolucao as Resolucao)) errors.push(`resolucao deve ser ${RESOLUCOES.join(', ')}`);
  if (body.observacao !== undefined && body.observacao !== null && typeof body.observacao !== 'string') errors.push('observacao deve ser texto');
  return errors;
}

/**
 * Encerra a ocorrência: ajusta a situação do equipamento conforme a resolução (reposto, consertado ou
 * falso alarme → operacional; outro → mantém) e devolve o agente despachado à origem. Não muta a entrada.
 */
export function encerrarOcorrencia(
  estado: CityState,
  ocorrencia: Ocorrencia,
  input: { resolucao: Resolucao; observacao?: string | null },
  agora: Date
): { state: CityState; ocorrencia: Ocorrencia } {
  if (ocorrencia.status === 'encerrada') throw new Error(`${ocorrencia.id} já está encerrada`);
  const hoje = agora.toISOString().slice(0, 10);
  let state = estado;
  let equipamento: Encerramento['equipamento'] = null;
  const eq = estado.equipment.find((e) => e.id === ocorrencia.equipamentoId);
  if (eq) {
    const volta = input.resolucao !== 'outro';
    const depois: EquipmentStatus = volta ? 'operational' : eq.status;
    equipamento = { antes: eq.status, depois };
    if (volta) {
      // Reposto ou consertado: começa um novo ciclo de preventiva. Falso alarme: só limpa a pendência.
      const nextDate = input.resolucao === 'falso_alarme' ? eq.maintenance.nextDate : addDays(hoje, PREVENTIVE_CYCLE_DAYS);
      state = {
        ...state,
        equipment: state.equipment.map((e) =>
          e.id === eq.id ? { ...e, status: depois, maintenance: { priority: 'none', ...(nextDate ? { nextDate } : {}) } } : e
        ),
      };
    }
  }
  let despacho = ocorrencia.despacho as Despacho | null;
  if (despacho && !despacho.retornoEm) {
    state = devolverAgente(state, despacho);
    despacho = { ...despacho, retornoEm: agora.toISOString() };
  }
  const encerramento: Encerramento = {
    resolucao: input.resolucao,
    observacao: input.observacao?.trim() || null,
    equipamento,
    agenteDevolvido: despacho ? despacho.agenteId : null,
  };
  return { state, ocorrencia: { ...ocorrencia, status: 'encerrada', encerradaEm: agora.toISOString(), despacho, encerramento } };
}

// -----------------------------------------------------------------------------
// Relatório pós-ocorrência (Markdown, determinístico)
// -----------------------------------------------------------------------------

const TZ = 'America/Sao_Paulo';

/** Prevenção por padrão encontrado (regras fixas; as fontes vêm da recomendação do dossiê). */
const PREVENCAO: Record<string, string> = {
  LOTE: 'Trocar o lote inteiro e antecipar a preventiva das unidades que ainda operam; acionar a garantia do fabricante.',
  VIZINHANCA: 'Reforçar a ronda no perímetro e instalar proteção antifurto nos pontos reincidentes.',
  POSSIVEL_ENERGIA: 'Registrar o protocolo com a concessionária e avaliar alimentação de reserva para os equipamentos críticos do bairro.',
};

/**
 * Relatório da ocorrência no tom da PROMETHEUS: resumo, linha do tempo (auditoria), impacto na abertura × agora,
 * ações e resultado, padrões e recomendações com as fontes. Mesmas entradas, mesmo texto.
 * Sem auditoria (modo offline), a linha do tempo é montada com as datas gravadas na própria ocorrência.
 */
export function gerarRelatorio(ocorrencia: Ocorrencia, estadoAtual: CityState, auditoria: readonly RegistroAuditoria[], agora: Date): string {
  const eq = estadoAtual.equipment.find((e) => e.id === ocorrencia.equipamentoId);
  const dossie = ocorrencia.dossie as Dossie | null;
  const despacho = ocorrencia.despacho as Despacho | null;
  const encerramento = ocorrencia.encerramento as Encerramento | null;
  const abertura = ocorrencia.snapshotAbertura;
  const atual = montarSnapshot(estadoAtual, abertura.bairro);
  const serial = eq?.serialNumber ?? dossie?.oQueAconteceu.numeroSerie ?? ocorrencia.equipamentoId;
  const tipoEq = eq ? TYPE_LABELS[eq.type] : 'Equipamento (excluído do cadastro)';
  const out: string[] = [];

  out.push(`# Relatório da ocorrência ${ocorrencia.id}`, '');
  out.push(`> ${frasePrometheus(ocorrencia, abertura, atual)}`, '');
  out.push(`Gerado em ${dataHora(agora.toISOString())} · situação da ocorrência: **${ocorrencia.status}**`, '');

  // 1. Resumo
  out.push('## 1. Resumo', '');
  out.push(`- **O quê:** ${TIPO_ALERTA_LABELS[ocorrencia.tipoAlerta]} · ${tipoEq} ${serial}${eq ? ` (${eq.brand} ${eq.model})` : ''}`);
  out.push(`- **Onde:** ${eq ? `${eq.location.street} (${eq.location.reference}), ` : ''}${abertura.bairro}`);
  out.push(`- **Quando:** aberta em ${dataHora(ocorrencia.abertaEm)}${ocorrencia.encerradaEm ? `, encerrada em ${dataHora(ocorrencia.encerradaEm)} (${duracao(ocorrencia.abertaEm, ocorrencia.encerradaEm)})` : ', ainda em andamento'}`);
  out.push(`- **Quem atendeu:** ${despacho ? `${despacho.agenteNome} (${ROLE_LABELS_DESPACHO[despacho.funcao]}, ${despacho.orgao})` : 'nenhum agente foi despachado'}`);
  if (encerramento) out.push(`- **Resolução:** ${RESOLUCAO_LABELS[encerramento.resolucao]}${encerramento.observacao ? ` · "${encerramento.observacao}"` : ''}`);
  out.push('');

  // 2. Linha do tempo
  out.push('## 2. Linha do tempo', '');
  const doCaso = auditoria
    .filter((a) => refere(a.antes, ocorrencia.id) || refere(a.depois, ocorrencia.id))
    .sort((a, b) => (a.criadoEm ?? '').localeCompare(b.criadoEm ?? ''));
  if (doCaso.length) {
    for (const a of doCaso) out.push(`- ${a.criadoEm ? dataHora(a.criadoEm) : '–'} · **${a.acao}** · ${a.descricao}`);
  } else {
    const passos: [string | null | undefined, string][] = [
      [ocorrencia.abertaEm, 'Ocorrência aberta'],
      [dossie?.geradoEm, `Investigação: ${dossie?.hipotese.texto ?? ''}`],
      [despacho?.despachadoEm, `Despacho de ${despacho?.agenteNome ?? ''}`],
      [ocorrencia.encerradaEm, `Encerramento: ${encerramento ? RESOLUCAO_LABELS[encerramento.resolucao] : ''}`],
    ];
    for (const [t, texto] of passos.filter(([t]) => t).sort((a, b) => a[0]!.localeCompare(b[0]!))) out.push(`- ${dataHora(t!)} · ${texto}`);
    out.push('', '_Sem auditoria disponível (modo offline): linha do tempo montada com as datas gravadas na ocorrência._');
  }
  out.push('');

  // 3. Impacto
  out.push('## 3. Impacto: na abertura × agora', '');
  out.push('| Indicador | Na abertura | Agora | Variação |', '| --- | --- | --- | --- |');
  const linha = (nome: string, a: number | null | undefined, d: number | null | undefined, unidade = '', melhorSeSobe = true) => {
    if (a === null || a === undefined || d === null || d === undefined) return;
    const delta = Math.round((d - a) * 10) / 10;
    // Variação de porcentagem é em pontos percentuais.
    const sinal = delta === 0 ? 'sem mudança' : `${delta > 0 ? '+' : ''}${num(delta)}${unidade === '%' ? ' p.p.' : unidade} ${(delta > 0) === melhorSeSobe ? '(melhorou)' : '(piorou)'}`;
    out.push(`| ${nome} | ${num(a)}${unidade} | ${num(d)}${unidade} | ${sinal} |`);
  };
  linha('Disponibilidade da cidade', abertura.indicadores.availabilityPct, atual.indicadores.availabilityPct, '%');
  linha(`Saúde de ${abertura.bairro}`, abertura.saude?.health, atual.saude?.health);
  linha(`Risco de ${abertura.bairro}`, abertura.risco?.risk, atual.risco?.risk, '', false);
  linha(`Cobertura de ${abertura.bairro}`, abertura.cobertura.bairroPct, atual.cobertura.bairroPct, '%');
  linha('Cobertura da cidade', abertura.cobertura.cidadePct, atual.cobertura.cidadePct, '%');
  linha('Pontos cegos na cidade', abertura.cobertura.pontosCegos, atual.cobertura.pontosCegos, '', false);
  out.push('', '_Os números vêm do estado da cidade nos dois momentos; a variação inclui tudo o que mudou no período, não só esta ocorrência._', '');

  // 4. Ações
  out.push('## 4. Ações executadas e resultado', '');
  if (despacho) {
    out.push(
      `- **Despacho:** ${despacho.agenteNome} ${despacho.convocacao ? 'convocado(a) de folga' : `saiu de ${despacho.origem.bairro}`} em ${dataHora(despacho.despachadoEm)}; ` +
        `${num(despacho.distanciaKm)} km em linha reta, ETA estimado de ~${despacho.etaMin} min.` +
        (despacho.retornoEm ? ` Retornou à origem em ${dataHora(despacho.retornoEm)}.` : ' Ainda em atendimento.')
    );
  } else {
    out.push('- **Despacho:** não ocorreu.');
  }
  if (encerramento?.equipamento) {
    const { antes, depois } = encerramento.equipamento;
    out.push(`- **Equipamento:** ${STATUS_LABELS[antes]} → ${STATUS_LABELS[depois]}${antes === depois ? ' (resolução sem mudança de situação)' : ''}.`);
  } else if (!encerramento) {
    out.push('- **Encerramento:** ainda não ocorreu.');
  }
  out.push('');

  // 5. Padrões e recomendações
  out.push('## 5. Padrões encontrados e recomendações', '');
  if (!dossie) {
    out.push('A investigação não foi realizada: não há padrões nem recomendação dos manuais para este caso.', '');
  } else {
    out.push(`**Hipótese:** ${dossie.hipotese.texto} (confiança ${confiancaTexto(dossie.hipotese.confianca)})`, '');
    if (dossie.padroes.length) {
      for (const p of dossie.padroes) out.push(`- **${p.titulo}:** ${p.descricao} ${PREVENCAO[p.tipo] ?? ''}`.trim());
    } else {
      out.push('- Nenhum padrão de lote, vizinhança ou energia: caso isolado.');
    }
    out.push('', `**Recomendação dos manuais:** ${dossie.recomendacao.decisao}. ${dossie.recomendacao.justificativa}`);
    for (const f of dossie.recomendacao.fontes) out.push(`- Fonte: \`${f.fonte}\` › ${f.secao}`);
    if (!dossie.recomendacao.fontes.length) out.push('- Nenhum trecho de manual sustentou a decisão (confiança baixa).');
    out.push('');
  }

  out.push('---', '');
  out.push(
    '_Relatório gerado por regras e templates a partir do estado da cidade, sem IA generativa. ETA e impacto são estimativas; os manuais citados são fictícios, criados para a demonstração._'
  );
  return out.join('\n') + '\n';
}

function frasePrometheus(o: Ocorrencia, abertura: SnapshotOcorrencia, atual: SnapshotOcorrencia): string {
  const enc = o.encerramento as Encerramento | null;
  const melhorou = (atual.saude?.health ?? 0) >= (abertura.saude?.health ?? 0);
  if (!enc) return 'PROMETHEUS: caso ainda aberto. Relatório parcial, porque eu não costumo dar spoiler.';
  if (enc.resolucao === 'falso_alarme') return 'PROMETHEUS: falso alarme. Melhor um susto registrado do que um problema ignorado.';
  if (enc.resolucao === 'outro') return 'PROMETHEUS: encerrado com resolução "outro". Anotei; a curiosidade fica para a próxima auditoria.';
  return melhorou
    ? `PROMETHEUS: caso resolvido e ${abertura.bairro} respira melhor que na abertura. Registro feito, cidade de pé.`
    : `PROMETHEUS: caso resolvido, mas ${abertura.bairro} ainda está pior que na abertura. Outros problemas pedem atenção.`;
}

function refere(v: unknown, id: string): boolean {
  return !!v && typeof v === 'object' && (v as { ocorrenciaId?: unknown }).ocorrenciaId === id;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const num = (x: number) => x.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ });
const confiancaTexto = (c: string) => (c === 'media' ? 'média' : c);

function duracao(inicio: string, fim: string): string {
  const min = Math.max(0, Math.round((Date.parse(fim) - Date.parse(inicio)) / 60_000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}
