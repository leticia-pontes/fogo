import { EquipmentStatus, EquipmentType } from '../models/fogo.models';
import type { TipoAlerta } from './occurrences';

/** Trecho de manual (uma seção "##"), como gerado por `npm run gerar-manuais`. */
export interface TrechoManual {
  id: string;
  fonte: string;
  titulo: string;
  secao: string;
  /** Tipos de equipamento a que o trecho se aplica (`geral` = transversal). */
  tipos: string[];
  fabricante: string | null;
  topicos: string[];
  texto: string;
}

export interface ResultadoBusca {
  id: string;
  trecho: string;
  fonte: string;
  secao: string;
  topicos: string[];
  tipos: string[];
  score: number;
}

export interface OpcoesBusca {
  tipo?: string;
  fabricante?: string;
  topN?: number;
}

// -----------------------------------------------------------------------------
// Texto: normalização, stopwords e tokens
// -----------------------------------------------------------------------------

const STOPWORDS = new Set(
  (
    'a o e é de da do das dos em no na nos nas um uma uns umas para por com sem que se ao aos à às ' +
    'ou como mais menos mas não sim seu sua seus suas este esta estes estas esse essa isso isto ' +
    'ele ela eles elas já até após antes pelo pela pelos pelas quando qual quais deve devem ser são ' +
    'há ter tem foi está estão entre sobre também cada todo toda todos todas outro outra outros outras'
  )
    .split(' ')
    .map((w) => normalizar(w))
);

export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Minúsculas, sem acento, sem stopwords e com plural simples reduzido ("furtos" → "furto"). */
export function tokenizar(texto: string): string[] {
  return normalizar(texto)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map((t) => (t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t));
}

// -----------------------------------------------------------------------------
// Busca BM25
// -----------------------------------------------------------------------------

const K1 = 1.2;
const B = 0.75;
const BONUS_TIPO = 1;
const BONUS_FABRICANTE = 1.5;

interface IndiceBm25 {
  docs: { trecho: TrechoManual; tf: Map<string, number>; len: number }[];
  df: Map<string, number>;
  avgLen: number;
}

const CACHE = new WeakMap<readonly TrechoManual[], IndiceBm25>();

function indexar(indice: readonly TrechoManual[]): IndiceBm25 {
  const cached = CACHE.get(indice);
  if (cached) return cached;
  const df = new Map<string, number>();
  const docs = indice.map((trecho) => {
    // Seção e tópicos entram no texto pesquisável (tópicos "manutencao-preventiva" viram dois tokens).
    const tokens = tokenizar(`${trecho.secao} ${trecho.topicos.join(' ')} ${trecho.texto}`);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    return { trecho, tf, len: tokens.length };
  });
  const built = { docs, df, avgLen: docs.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length) };
  CACHE.set(indice, built);
  return built;
}

/**
 * BM25 sobre os trechos, com bônus quando o tipo ou o fabricante coincidem (o bônus só vale para
 * trechos que já casaram com a consulta). Ordenado por score e, no empate, por id. Sem resultado: [].
 */
export function recuperarTrechos(indice: readonly TrechoManual[], consulta: string, opcoes: OpcoesBusca = {}): ResultadoBusca[] {
  const termos = [...new Set(tokenizar(consulta))];
  if (!termos.length) return [];
  const { docs, df, avgLen } = indexar(indice);
  const n = docs.length;
  const fabricante = opcoes.fabricante ? normalizar(opcoes.fabricante) : null;

  const scored = docs
    .map(({ trecho, tf, len }) => {
      let score = 0;
      for (const t of termos) {
        const f = tf.get(t);
        if (!f) continue;
        const idf = Math.log(1 + (n - df.get(t)! + 0.5) / (df.get(t)! + 0.5));
        score += (idf * f * (K1 + 1)) / (f + K1 * (1 - B + (B * len) / avgLen));
      }
      if (score > 0 && opcoes.tipo && trecho.tipos.includes(opcoes.tipo)) score += BONUS_TIPO;
      if (score > 0 && fabricante && trecho.fabricante && normalizar(trecho.fabricante) === fabricante) score += BONUS_FABRICANTE;
      return { trecho, score: Math.round(score * 10_000) / 10_000 };
    })
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score || a.trecho.id.localeCompare(b.trecho.id));

  return scored.slice(0, opcoes.topN ?? 5).map(({ trecho, score }) => ({
    id: trecho.id,
    trecho: trecho.texto,
    fonte: trecho.fonte,
    secao: trecho.secao,
    topicos: trecho.topicos,
    tipos: trecho.tipos,
    score,
  }));
}

// -----------------------------------------------------------------------------
// Decisão por regras
// -----------------------------------------------------------------------------

export interface ContextoDecisao {
  tipoAlerta: TipoAlerta;
  tipoEquipamento: EquipmentType;
  situacao: EquipmentStatus;
  fabricante?: string;
  modelo?: string;
  /** Outras ocorrências, furtos ou falhas recentes na vizinhança (padrão VIZINHANCA da investigação). */
  ocorrenciasRecentesNoBairro: number;
  /** Outros equipamentos do mesmo fabricante e modelo em falha. */
  falhasMesmoModelo: number;
  /** Padrão de queda de energia no bairro (vários fixos caindo juntos). */
  quedaEnergia?: boolean;
}

export type Confianca = 'alta' | 'media' | 'baixa';

interface Regra {
  id: string;
  quando: (c: ContextoDecisao) => boolean;
  decisao: string;
  justificativa: (c: ContextoDecisao) => string;
  /** Tópico do manual que precisa sustentar a decisão. */
  topico: string;
  /** Consulta usada para recuperar os trechos. */
  consulta: string;
  confianca: Confianca;
}

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

/** Tabela de regras, avaliada em ordem: a primeira que casa decide. */
export const REGRAS: readonly Regra[] = [
  {
    id: 'EQUIPAMENTO_DESATIVADO',
    quando: (c) => c.situacao === 'deactivated',
    decisao: 'Planejar a reposição do equipamento',
    justificativa: () => 'O equipamento está desativado: não há reparo a fazer no local, só reposição ou substituição.',
    topico: 'substituicao',
    consulta: 'substituição reposição equipamento desativado',
    confianca: 'alta',
  },
  {
    id: 'FURTO_REINCIDENTE',
    quando: (c) => c.tipoAlerta === 'furto' && c.ocorrenciasRecentesNoBairro > 0,
    decisao: 'Acionar guarda municipal e polícia militar para ronda no perímetro e registrar boletim de ocorrência',
    justificativa: (c) =>
      `Furto com ${plural(c.ocorrenciasRecentesNoBairro, 'outra ocorrência recente', 'outras ocorrências recentes')} na vizinhança: padrão de furtos em série.`,
    topico: 'reincidencia',
    consulta: 'furtos em série mesmo bairro ronda policiamento guarda municipal polícia militar boletim',
    confianca: 'alta',
  },
  {
    id: 'FURTO_ISOLADO',
    quando: (c) => c.tipoAlerta === 'furto',
    decisao: 'Registrar boletim de ocorrência, bloquear o equipamento nos sistemas e solicitar reposição',
    justificativa: () => 'Furto sem outras ocorrências recentes na vizinhança: procedimento padrão de furto.',
    topico: 'furto',
    consulta: 'furto boletim ocorrência bloquear reposição',
    confianca: 'media',
  },
  {
    id: 'QUEDA_DE_ENERGIA',
    quando: (c) => c.tipoAlerta === 'falha' && !!c.quedaEnergia,
    decisao: 'Acionar a concessionária de energia e deslocar agentes para os pontos sem fiscalização, sem abrir OS individuais',
    justificativa: () => 'Vários equipamentos fixos do bairro caíram juntos: a causa provável é a alimentação, não o equipamento.',
    topico: 'energia',
    consulta: 'queda de energia concessionária vários equipamentos apagão',
    confianca: 'media',
  },
  {
    id: 'FALHA_EM_LOTE',
    quando: (c) => c.tipoAlerta === 'falha' && c.falhasMesmoModelo >= 1,
    decisao: 'Abrir OS de troca em lote do modelo e antecipar a preventiva das unidades que ainda operam',
    justificativa: (c) =>
      `${plural(c.falhasMesmoModelo, 'outro equipamento', 'outros equipamentos')} ${c.fabricante ?? ''} ${c.modelo ?? ''} também em falha: indício de defeito de lote.`
        .replace(/\s+/g, ' ')
        .trim(),
    topico: 'lote',
    consulta: 'falha em lote fabricante modelo troca preventiva',
    confianca: 'alta',
  },
  {
    id: 'FALHA_ISOLADA',
    quando: (c) => c.tipoAlerta === 'falha',
    decisao: 'Abrir OS corretiva imediata',
    justificativa: () => 'Falha sem outras unidades do mesmo modelo em falha: tratamento corretivo do equipamento.',
    topico: 'falha',
    consulta: 'falha corretiva imediata verificar alimentação',
    confianca: 'media',
  },
  {
    id: 'MANUTENCAO',
    quando: () => true,
    decisao: 'Executar a manutenção preventiva pendente',
    justificativa: () => 'Manutenção imediata ou vencida: seguir o procedimento preventivo do tipo de equipamento.',
    topico: 'manutencao-preventiva',
    consulta: 'manutenção preventiva revisão calibração',
    confianca: 'media',
  },
];

export interface DecisaoManual {
  regra: string;
  decisao: string;
  justificativa: string;
  fontes: { id: string; fonte: string; secao: string; trecho: string }[];
  confianca: Confianca;
  limitacoes: string[];
  metodo: string;
}

export const METODO_DECISAO = 'Recomendação por regras sobre trechos recuperados por palavras-chave (BM25); não é IA generativa.';

export function regraPara(contexto: ContextoDecisao): Regra {
  return REGRAS.find((r) => r.quando(contexto))!;
}

/**
 * Aplica a primeira regra que casa e cita os trechos (recuperados antes) que tratam do tópico da regra.
 * Sem trecho que sustente a decisão, a confiança cai para baixa e a limitação é declarada.
 */
export function decidirComManual(contexto: ContextoDecisao, trechos: readonly ResultadoBusca[]): DecisaoManual {
  const regra = regraPara(contexto);
  const sobreOTopico = trechos.filter((r) => r.topicos.includes(regra.topico));
  // Prefere o manual do próprio tipo e os transversais; os de outros tipos só entram se não houver nenhum desses.
  const doTipo = sobreOTopico.filter((r) => r.tipos.includes(contexto.tipoEquipamento) || r.tipos.includes('geral'));
  const fontes = (doTipo.length ? doTipo : sobreOTopico)
    .slice(0, 2)
    .map(({ id, fonte, secao, trecho }) => ({ id, fonte, secao, trecho }));
  const limitacoes = ['Manuais fictícios, criados para a demonstração.'];
  if (!fontes.length) limitacoes.push(`Nenhum trecho de manual sobre "${regra.topico}" foi encontrado para sustentar a decisão.`);
  if (contexto.tipoAlerta === 'furto') limitacoes.push('Reincidência considera só as ocorrências registradas no sistema.');
  return {
    regra: regra.id,
    decisao: regra.decisao,
    justificativa: regra.justificativa(contexto),
    fontes,
    confianca: fontes.length ? regra.confianca : 'baixa',
    limitacoes,
    metodo: METODO_DECISAO,
  };
}

/** Busca + decisão em um passo: a consulta e o tópico vêm da regra que casa com o contexto. */
export function recomendarPorManual(indice: readonly TrechoManual[], contexto: ContextoDecisao): DecisaoManual {
  const regra = regraPara(contexto);
  const trechos = recuperarTrechos(indice, regra.consulta, { tipo: contexto.tipoEquipamento, fabricante: contexto.fabricante, topN: 8 });
  return decidirComManual(contexto, trechos);
}
