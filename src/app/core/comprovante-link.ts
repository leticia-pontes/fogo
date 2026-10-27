import { AVISO_COMPROVANTE, Comprovante, ROTULOS_CAMPOS, ROTULOS_CIDADE, gerarTextoPlano } from './comprovante';

/**
 * Comprovante dentro do próprio link (`/comprovante#c1z.…`), para o QR Code funcionar sem servidor (deploy
 * estático, ex.: Vercel, e de qualquer rede). O trecho depois do `#` não é enviado ao servidor: os dados vão
 * direto do QR para o navegador do celular. Só os valores viajam; rótulos, selo e aviso são fixos.
 */
export const ROTA_COMPROVANTE = '/comprovante';
const VERSAO = 'c1';

/** id, subtítulo, valores dos campos, [antes, agora] da cidade, frase da PROMETHEUS e "Emitido em". */
type Compacto = [string, string, string[], [string, string][], string, string];

export async function linkDoComprovante(c: Comprovante, origem: string): Promise<string> {
  const compacto: Compacto = [c.id, c.subtitulo, c.campos.map((l) => l.valor), c.cidade.map((l) => [l.antes, l.agora]), c.prometheus, c.emitidoEm];
  const json = new TextEncoder().encode(JSON.stringify(compacto));
  const comprimido = await transformar(json, 'comprimir');
  const carga = comprimido ? `z.${base64url(comprimido)}` : `j.${base64url(json)}`;
  return `${origem.replace(/\/$/, '')}${ROTA_COMPROVANTE}#${VERSAO}${carga}`;
}

/** Lê o comprovante do trecho depois do `#`. Entrada vem de fora (URL): valida a forma antes de usar. */
export async function lerComprovanteDoLink(hash: string): Promise<Comprovante> {
  const m = new RegExp(`^#?${VERSAO}([zj])\\.([A-Za-z0-9_-]+)$`).exec(hash.trim());
  if (!m) throw new Error('Link de comprovante inválido ou incompleto');
  const bytes = deBase64url(m[2]);
  const json = m[1] === 'z' ? await transformar(bytes, 'descomprimir') : bytes;
  if (!json) throw new Error('Este navegador não consegue abrir o comprovante comprimido');
  const dados = JSON.parse(new TextDecoder().decode(json)) as unknown;
  if (!valido(dados)) throw new Error('Link de comprovante inválido ou incompleto');
  const [id, subtitulo, valores, cidade, prometheus, emitidoEm] = dados;
  const base = {
    id,
    selo: 'ENCERRADA' as const,
    subtitulo,
    campos: ROTULOS_CAMPOS.map((rotulo, i) => ({ rotulo, valor: valores[i] })),
    cidade: ROTULOS_CIDADE.map((rotulo, i) => ({ rotulo, antes: cidade[i][0], agora: cidade[i][1] })),
    prometheus,
    emitidoEm,
    aviso: AVISO_COMPROVANTE,
  };
  return { ...base, textoPlano: gerarTextoPlano(base) };
}

function valido(d: unknown): d is Compacto {
  const texto = (x: unknown) => typeof x === 'string' && x.length <= 300;
  return (
    Array.isArray(d) &&
    d.length === 6 &&
    texto(d[0]) &&
    texto(d[1]) &&
    Array.isArray(d[2]) &&
    d[2].length === ROTULOS_CAMPOS.length &&
    d[2].every(texto) &&
    Array.isArray(d[3]) &&
    d[3].length === ROTULOS_CIDADE.length &&
    d[3].every((p: unknown) => Array.isArray(p) && p.length === 2 && p.every(texto)) &&
    texto(d[4]) &&
    texto(d[5])
  );
}

/** deflate-raw nativo do navegador/Node; null quando o ambiente não tem CompressionStream. */
async function transformar(bytes: Uint8Array, sentido: 'comprimir' | 'descomprimir'): Promise<Uint8Array | null> {
  const Stream = sentido === 'comprimir' ? globalThis.CompressionStream : globalThis.DecompressionStream;
  if (!Stream) return null;
  const saida = new Response(bytes as BodyInit).body!.pipeThrough(new Stream('deflate-raw'));
  return new Uint8Array(await new Response(saida).arrayBuffer());
}

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
