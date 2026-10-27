import { TYPE_LABELS } from '../models/equipment-schema';
import { RiskLevel } from './analysis';
import { Encerramento, Resolucao } from './closure';
import { Despacho } from './dispatch';
import { Dossie } from './investigation';
import { Ocorrencia, SnapshotOcorrencia, TipoAlerta, montarSnapshot } from './occurrences';
import { CityState } from './state';

/** Pedido de comprovante para ocorrência que ainda não foi encerrada (a API responde 409). */
export class OcorrenciaNaoEncerradaError extends Error {
  override readonly name = 'OcorrenciaNaoEncerradaError';
  constructor(readonly ocorrenciaId: string) {
    super(`${ocorrenciaId} ainda não foi encerrada: o comprovante só é emitido no encerramento`);
  }
}

export interface LinhaComprovante {
  rotulo: string;
  valor: string;
}

export interface LinhaCidade {
  rotulo: string;
  antes: string;
  agora: string;
}

export interface Comprovante {
  id: string;
  selo: 'ENCERRADA';
  subtitulo: string;
  campos: LinhaComprovante[];
  cidade: LinhaCidade[];
  prometheus: string;
  emitidoEm: string;
  aviso: string;
  textoPlano: string;
}

export const AVISO_COMPROVANTE = 'Documento interno de demonstração. Valores estimados por regras.';
/** Largura máxima do texto puro ("Copiar texto"), em colunas. */
export const LARGURA_TEXTO = 42;

/** Rótulos do cupom (mais curtos que os do relatório, para caber numa linha). */
export const RESOLUCAO_COMPROVANTE: Record<Resolucao, string> = {
  reposto: 'Unidade reposta',
  consertado: 'Equipamento consertado',
  falso_alarme: 'Falso alarme',
  outro: 'Outro',
};

const RISCO_LABELS: Record<RiskLevel, string> = { BAIXO: 'BAIXO', MEDIO: 'MÉDIO', ALTO: 'ALTO' };
/** Concordância do "resolvido(a)" na frase da PROMETHEUS. */
const RESOLVIDO: Record<TipoAlerta, string> = { furto: 'Furto resolvido', falha: 'Falha resolvida', manutencao: 'Manutenção resolvida' };
const SEM_DADO = 'sem dado';

/**
 * Dados do comprovante de uma ocorrência encerrada: campos do cupom, cidade na abertura × agora (abertura do
 * snapshot; agora recalculado do estado atual com as mesmas funções), frase da PROMETHEUS por template e o texto puro.
 * Mesmas entradas, mesmo resultado. Não muta a entrada.
 */
export function montarComprovante(
  ocorrencia: Ocorrencia,
  estadoAtual: CityState,
  agora: Date,
  { fusoHorario = 'America/Sao_Paulo' }: { fusoHorario?: string } = {}
): Comprovante {
  if (ocorrencia.status !== 'encerrada' || !ocorrencia.encerradaEm) throw new OcorrenciaNaoEncerradaError(ocorrencia.id);
  const encerramento = ocorrencia.encerramento as Encerramento | null;
  const dossie = ocorrencia.dossie as Dossie | null;
  const despacho = ocorrencia.despacho as Despacho | null;
  const eq = estadoAtual.equipment.find((e) => e.id === ocorrencia.equipamentoId);
  const abertura = ocorrencia.snapshotAbertura;
  const atual = montarSnapshot(estadoAtual, abertura.bairro);

  const tipoEq = eq ? TYPE_LABELS[eq.type] : dossie ? (TYPE_LABELS[dossie.oQueAconteceu.tipo as keyof typeof TYPE_LABELS] ?? 'Equipamento') : 'Equipamento';
  const serie = eq?.serialNumber ?? dossie?.oQueAconteceu.numeroSerie ?? ocorrencia.equipamentoId;
  const marca = eq?.brand ?? dossie?.oQueAconteceu.marca;
  const local = eq ? [eq.location.street, eq.location.reference].filter(Boolean).join(', ') : (dossie?.oQueAconteceu.endereco ?? '');
  const detectado = dossie?.oQueAconteceu.detectadoEm ?? ocorrencia.abertaEm;
  const minutos = minutosEntre(detectado, ocorrencia.encerradaEm);
  const resolucao = encerramento?.resolucao ?? 'outro';
  const dataHora = (iso: string) => formatarDataHora(iso, fusoHorario);

  const campos: LinhaComprovante[] = [
    { rotulo: 'Equipamento', valor: marca ? `${serie} · ${marca}` : serie },
    { rotulo: 'Local', valor: local || 'Equipamento excluído do cadastro' },
    { rotulo: 'Bairro', valor: abertura.bairro },
    { rotulo: 'Detectado', valor: dataHora(detectado) },
    { rotulo: 'Encerrado', valor: dataHora(ocorrencia.encerradaEm) },
    { rotulo: 'Duração', valor: formatarDuracao(minutos) },
    { rotulo: 'Atendido por', valor: despacho?.agenteNome ?? 'Sem agente despachado' },
    { rotulo: 'Resolução', valor: RESOLUCAO_COMPROVANTE[resolucao] },
  ];

  const cidade: LinhaCidade[] = [
    { rotulo: 'Disponibilidade', antes: pct(abertura.indicadores.availabilityPct), agora: pct(atual.indicadores.availabilityPct) },
    { rotulo: 'Saúde do bairro', antes: saude(abertura), agora: saude(atual) },
    { rotulo: 'Risco do bairro', antes: risco(abertura), agora: risco(atual) },
  ];

  const deltaSaude = abertura.saude && atual.saude ? Math.round(atual.saude.health) - Math.round(abertura.saude.health) : null;
  const prometheus = frasePrometheus(ocorrencia, resolucao, minutos, abertura.bairro, deltaSaude, atual.saude ? Math.round(atual.saude.health) : null);
  const [data, hora] = dataHora(agora.toISOString()).split(' ');
  const emitidoEm = `Emitido em ${data} às ${hora}`;
  const subtitulo = `${TIPO_LABEL[ocorrencia.tipoAlerta]} · ${tipoEq}`.toLocaleUpperCase('pt-BR');

  const base = { id: ocorrencia.id, selo: 'ENCERRADA' as const, subtitulo, campos, cidade, prometheus, emitidoEm, aviso: AVISO_COMPROVANTE };
  return { ...base, textoPlano: textoPlano(base) };
}

const TIPO_LABEL: Record<TipoAlerta, string> = { furto: 'Furto', falha: 'Falha', manutencao: 'Manutenção' };

/** "47 min", "1 h 05 min", "2 d 3 h". */
export function formatarDuracao(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  if (m < 1) return 'menos de 1 min';
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
  const d = Math.floor(m / (24 * 60));
  const h = Math.floor((m % (24 * 60)) / 60);
  return h ? `${d} d ${h} h` : `${d} d`;
}

/** Duração para a frase: por extenso abaixo de 1 hora ("47 minutos"), senão o formato curto. */
function duracaoFrase(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  if (m < 1) return 'menos de 1 minuto';
  if (m < 60) return m === 1 ? '1 minuto' : `${m} minutos`;
  return formatarDuracao(m);
}

/** "27/10/2026 15:19" no fuso informado (montado por partes para não depender da pontuação do ICU). */
export function formatarDataHora(iso: string, fusoHorario: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: fusoHorario })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value])
  );
  return `${parts['day']}/${parts['month']}/${parts['year']} ${parts['hour']}:${parts['minute']}`;
}

/**
 * Três variações por resolução, escolhidas pelo número do id (determinístico). Só cita números reais:
 * a duração e, quando há saúde do bairro nos dois momentos, a variação (positiva, zero ou negativa).
 */
function frasePrometheus(o: Ocorrencia, resolucao: Resolucao, minutos: number, bairro: string, delta: number | null, saudeAgora: number | null): string {
  const d = duracaoFrase(minutos);
  const pts = (n: number) => `${n} ${n === 1 ? 'ponto' : 'pontos'}`;
  const saude =
    delta === null ? '' : delta > 0 ? `${bairro} recuperou ${pts(delta)} de saúde. ` : delta === 0 ? `${bairro} manteve a saúde em ${saudeAgora}. ` : `${bairro} ainda perdeu ${pts(-delta)} de saúde no período. `;
  const variacoes: Record<Resolucao, string[]> = {
    reposto: [
      `${RESOLVIDO[o.tipoAlerta]} em ${d}. ${saude}Não precisa agradecer.`,
      `Unidade nova no lugar em ${d}. ${saude}O estoque sente; eu só registro.`,
      `Reposição concluída em ${d}. ${saude}Mais um item riscado da lista.`,
    ],
    consertado: [
      `Equipamento de volta à ativa em ${d}. ${saude}`,
      `Conserto concluído em ${d}. ${saude}Nada como um parafuso bem apertado.`,
      `Foram ${d} de oficina e o equipamento voltou a operar. ${saude}Anotado no histórico.`,
    ],
    falso_alarme: [
      `Falso alarme encerrado em ${d}. Fingirei que não me assustei.`,
      `Falso alarme, ${d} para confirmar. Melhor um susto registrado do que um problema ignorado.`,
      `Alarme descartado em ${d}. O sensor e eu vamos ter uma conversa.`,
    ],
    outro: [
      `Ocorrência encerrada em ${d}. ${saude}`,
      `Encerrada em ${d} com resolução "outro". Anotei; a curiosidade fica para a auditoria.`,
      `Caso fechado em ${d}. ${saude}O resto está no relatório.`,
    ],
  };
  const n = Number(/(\d+)$/.exec(o.id)?.[1] ?? 0);
  return variacoes[resolucao][n % 3].trim();
}

function textoPlano(c: Omit<Comprovante, 'textoPlano'>): string {
  const sep = '-'.repeat(LARGURA_TEXTO);
  const linhas = [
    'F.O.G.O. · Nova Prometeia',
    'COMPROVANTE DE OCORRÊNCIA',
    `${c.id} · ${c.selo}`,
    c.subtitulo,
    sep,
    ...c.campos.map((l) => `${l.rotulo}: ${l.valor}`),
    sep,
    'CIDADE · ABERTURA → AGORA',
    ...c.cidade.map((l) => `${l.rotulo}: ${l.antes} → ${l.agora}`),
    sep,
    'PROMETHEUS',
    c.prometheus,
    sep,
    c.emitidoEm,
    c.aviso,
  ];
  return linhas.flatMap((l) => quebrar(l, LARGURA_TEXTO)).join('\n') + '\n';
}

/** Quebra por palavras em até `largura` colunas (continuação com 2 espaços; palavra longa é cortada). */
export function quebrar(linha: string, largura: number): string[] {
  if (linha.length <= largura) return [linha];
  const out: string[] = [];
  let atual = '';
  for (const palavra of linha.split(' ')) {
    const prefixo = out.length ? '  ' : '';
    const candidato = atual ? `${atual} ${palavra}` : `${prefixo}${palavra}`;
    if (candidato.length <= largura) {
      atual = candidato;
      continue;
    }
    if (atual) out.push(atual);
    let resto = `${out.length ? '  ' : ''}${palavra}`;
    while (resto.length > largura) {
      out.push(resto.slice(0, largura));
      resto = `  ${resto.slice(largura)}`;
    }
    atual = resto;
  }
  if (atual) out.push(atual);
  return out;
}

function minutosEntre(inicio: string, fim: string): number {
  return Math.max(0, (Date.parse(fim) - Date.parse(inicio)) / 60_000);
}

const pct = (x: number | null | undefined) => (typeof x === 'number' && Number.isFinite(x) ? `${x.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : SEM_DADO);
const saude = (s: SnapshotOcorrencia) => (s.saude && Number.isFinite(s.saude.health) ? String(Math.round(s.saude.health)) : SEM_DADO);
const risco = (s: SnapshotOcorrencia) => (s.risco ? RISCO_LABELS[s.risco.level] : SEM_DADO);
