/**
 * QR Code (ISO/IEC 18004) sem dependências: modo byte (UTF-8), correção de erros L ou M, versões 1 a 40.
 * Função pura: mesmo texto, mesma matriz (true = módulo escuro). Tabelas e procedimentos seguem a norma.
 */

export type NivelCorrecao = 'L' | 'M';

/** Bytes de correção por bloco e número de blocos, por versão (índice 0 não usado). */
const EC_POR_BLOCO: Record<NivelCorrecao, number[]> = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
};
const BLOCOS: Record<NivelCorrecao, number[]> = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
};
/** Bits do nível no formato: L = 01, M = 00. */
const BITS_NIVEL: Record<NivelCorrecao, number> = { L: 1, M: 0 };

/** Módulos disponíveis para dados (sem padrões fixos, formato e versão). */
function modulosDeDados(v: number): number {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) {
    const n = Math.floor(v / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (v >= 7) r -= 36;
  }
  return r;
}

const bytesDeDados = (v: number, nivel: NivelCorrecao) => Math.floor(modulosDeDados(v) / 8) - EC_POR_BLOCO[nivel][v] * BLOCOS[nivel][v];
/** Bits do cabeçalho do segmento byte: modo (4) + contagem (8 até a versão 9, 16 depois). */
const bitsCabecalho = (v: number) => 4 + (v <= 9 ? 8 : 16);

/** `mascara` (0–7) fixa a máscara; sem ela, vale a de menor penalidade. */
export function gerarQrCode(texto: string, { nivel = 'M', mascara }: { nivel?: NivelCorrecao; mascara?: number } = {}): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(texto));
  let versao = 1;
  while (versao <= 40 && bitsCabecalho(versao) + bytes.length * 8 > bytesDeDados(versao, nivel) * 8) versao++;
  if (versao > 40) throw new Error(`Texto longo demais para o QR Code (${bytes.length} bytes; máximo ${bytesDeDados(40, nivel) - 3})`);
  const codewords = montarCodewords(bytes, versao, nivel);
  const size = versao * 4 + 17;

  let melhor: boolean[][] | null = null;
  let menorPenalidade = Infinity;
  for (const mask of mascara == null ? [0, 1, 2, 3, 4, 5, 6, 7] : [mascara]) {
    const { modulos, funcao } = matrizBase(versao, size);
    posicionarDados(modulos, funcao, codewords);
    aplicarMascara(modulos, funcao, mask);
    desenharFormato(modulos, funcao, mask, nivel);
    const p = penalidade(modulos);
    if (p < menorPenalidade) {
      menorPenalidade = p;
      melhor = modulos;
    }
  }
  return melhor!;
}

/** Caminho SVG (um quadrado por módulo escuro) com margem de 4 módulos; viewBox = `0 0 tamanho tamanho`. */
export function qrCodeSvgPath(matriz: boolean[][], margem = 4): { d: string; tamanho: number } {
  const partes: string[] = [];
  matriz.forEach((linha, y) => linha.forEach((escuro, x) => escuro && partes.push(`M${x + margem} ${y + margem}h1v1h-1z`)));
  return { d: partes.join(''), tamanho: matriz.length + margem * 2 };
}

// -----------------------------------------------------------------------------
// Dados: segmento byte, preenchimento, Reed-Solomon e intercalação dos blocos
// -----------------------------------------------------------------------------

function montarCodewords(bytes: number[], versao: number, nivel: NivelCorrecao): number[] {
  const capacidade = bytesDeDados(versao, nivel);
  const bits: number[] = [];
  const push = (valor: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((valor >>> i) & 1);
  };
  push(0b0100, 4); // modo byte
  push(bytes.length, versao <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, capacidade * 8 - bits.length)); // terminador
  push(0, (8 - (bits.length % 8)) % 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((acc, b) => (acc << 1) | b, 0));
  for (let pad = 0xec; data.length < capacidade; pad ^= 0xec ^ 0x11) data.push(pad);

  // Blocos curtos primeiro; os longos têm um byte de dados a mais. Intercala dados e depois correções.
  const ec = EC_POR_BLOCO[nivel][versao];
  const nBlocos = BLOCOS[nivel][versao];
  const total = Math.floor(modulosDeDados(versao) / 8);
  const curtos = nBlocos - (total % nBlocos);
  const tamCurto = Math.floor(total / nBlocos) - ec;
  const gerador = polinomioGerador(ec);
  const grupos: number[][] = [];
  for (let b = 0, k = 0; b < nBlocos; b++) {
    const n = tamCurto + (b < curtos ? 0 : 1);
    grupos.push(data.slice(k, k + n));
    k += n;
  }
  const correcoes = grupos.map((g) => restoReedSolomon(g, gerador));
  const out: number[] = [];
  for (let i = 0; i <= tamCurto; i++) for (const g of grupos) if (i < g.length) out.push(g[i]);
  for (let i = 0; i < ec; i++) for (const c of correcoes) out.push(c[i]);
  return out;
}

/** Multiplicação em GF(256) com o polinômio 0x11D. */
function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function polinomioGerador(grau: number): number[] {
  const r = new Array<number>(grau).fill(0);
  r[grau - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grau; i++) {
    for (let j = 0; j < grau; j++) {
      r[j] = gfMul(r[j], raiz);
      if (j + 1 < grau) r[j] ^= r[j + 1];
    }
    raiz = gfMul(raiz, 0x02);
  }
  return r;
}

function restoReedSolomon(dados: number[], gerador: number[]): number[] {
  const r = new Array<number>(gerador.length).fill(0);
  for (const b of dados) {
    const fator = b ^ r.shift()!;
    r.push(0);
    gerador.forEach((coef, i) => (r[i] ^= gfMul(coef, fator)));
  }
  return r;
}

// -----------------------------------------------------------------------------
// Matriz: padrões fixos, dados em zigue-zague, máscara e informação de formato
// -----------------------------------------------------------------------------

function matrizBase(versao: number, size: number) {
  const modulos = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const funcao = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, escuro: boolean) => {
    modulos[y][x] = escuro;
    funcao[y][x] = true;
  };
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4);
      }
    }
  }
  const pos = posicoesAlinhamento(versao, size);
  for (const [i, cy] of pos.entries()) {
    for (const [j, cx] of pos.entries()) {
      const canto = (i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0);
      if (canto) continue; // sobreporia um localizador
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  // Reserva a área do formato (preenchida depois, com a máscara escolhida).
  desenharFormato(modulos, funcao, 0, 'M');
  if (versao >= 7) {
    let rem = versao;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (versao << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const escuro = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, escuro);
      set(b, a, escuro);
    }
  }
  return { modulos, funcao };
}

/** Centros dos padrões de alinhamento (mesma lista nos dois eixos). */
function posicoesAlinhamento(versao: number, size: number): number[] {
  if (versao === 1) return [];
  const n = Math.floor(versao / 7) + 2;
  const passo = versao === 32 ? 26 : Math.ceil((versao * 4 + 4) / (n * 2 - 2)) * 2;
  const r = [6];
  for (let p = size - 7; r.length < n; p -= passo) r.splice(1, 0, p);
  return r;
}

function posicionarDados(modulos: boolean[][], funcao: boolean[][], codewords: number[]): void {
  const size = modulos.length;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const subindo = ((right + 1) & 2) === 0;
        const y = subindo ? size - 1 - vert : vert;
        if (!funcao[y][x] && i < codewords.length * 8) {
          modulos[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
    }
  }
}

const MASCARAS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function aplicarMascara(modulos: boolean[][], funcao: boolean[][], mask: number): void {
  for (let y = 0; y < modulos.length; y++) {
    for (let x = 0; x < modulos.length; x++) if (!funcao[y][x] && MASCARAS[mask](x, y)) modulos[y][x] = !modulos[y][x];
  }
}

function desenharFormato(modulos: boolean[][], funcao: boolean[][], mask: number, nivel: NivelCorrecao): void {
  const size = modulos.length;
  const data = (BITS_NIVEL[nivel] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  const set = (x: number, y: number, escuro: boolean) => {
    modulos[y][x] = escuro;
    funcao[y][x] = true;
  };
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6));
  set(8, 8, bit(7));
  set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  set(8, size - 8, true); // módulo escuro fixo
}

/** Penalidade da norma (sequências, blocos 2×2, padrões parecidos com localizador e equilíbrio claro/escuro). */
function penalidade(m: boolean[][]): number {
  const size = m.length;
  let total = 0;
  const linhas = [...m.map((l) => l.map(Number).join('')), ...m[0].map((_, x) => m.map((l) => Number(l[x])).join(''))];
  for (const l of linhas) {
    for (const run of l.match(/0{5,}|1{5,}/g) ?? []) total += run.length - 2;
    for (const p of ['10111010000', '00001011101']) for (let i = l.indexOf(p); i >= 0; i = l.indexOf(p, i + 1)) total += 40;
  }
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) total += 3;
  }
  const escuros = m.flat().filter(Boolean).length;
  total += Math.floor(Math.abs(escuros * 20 - size * size * 10) / (size * size)) * 10;
  return total;
}
