/**
 * QR Code (ISO/IEC 18004) sem dependências: modo byte (UTF-8), correção de erros nível M, versões 1 a 6
 * (até 106 bytes, o bastante para um link). Função pura: mesmo texto, mesma matriz (true = módulo escuro).
 */

/** Por versão (1–6), nível M: bytes de correção por bloco, número de blocos e bytes de dados por bloco. */
const BLOCOS_M: Record<number, { ec: number; blocos: number; dados: number }> = {
  1: { ec: 10, blocos: 1, dados: 16 },
  2: { ec: 16, blocos: 1, dados: 28 },
  3: { ec: 26, blocos: 1, dados: 44 },
  4: { ec: 18, blocos: 2, dados: 32 },
  5: { ec: 24, blocos: 2, dados: 43 },
  6: { ec: 16, blocos: 4, dados: 27 },
};
/** Centro do único padrão de alinhamento (versões 2–6). */
const ALINHAMENTO: Record<number, number> = { 2: 18, 3: 22, 4: 26, 5: 30, 6: 34 };
/** Bits de nível de correção no formato: M = 00. */
const NIVEL_M = 0;

/** `mascara` (0–7) fixa a máscara; sem ela, vale a de menor penalidade. */
export function gerarQrCode(texto: string, mascara?: number): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(texto));
  const versao = [1, 2, 3, 4, 5, 6].find((v) => BLOCOS_M[v].blocos * BLOCOS_M[v].dados >= bytes.length + 2);
  if (!versao) throw new Error(`Texto longo demais para o QR Code (${bytes.length} bytes; máximo 106)`);
  const codewords = montarCodewords(bytes, versao);
  const size = versao * 4 + 17;

  let melhor: boolean[][] | null = null;
  let menorPenalidade = Infinity;
  for (const mask of mascara === undefined ? [0, 1, 2, 3, 4, 5, 6, 7] : [mascara]) {
    const { modulos, funcao } = matrizBase(versao, size);
    posicionarDados(modulos, funcao, codewords);
    aplicarMascara(modulos, funcao, mask);
    desenharFormato(modulos, funcao, mask);
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

function montarCodewords(bytes: number[], versao: number): number[] {
  const { ec, blocos, dados } = BLOCOS_M[versao];
  const capacidade = blocos * dados;
  const bits: number[] = [];
  const push = (valor: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((valor >>> i) & 1);
  };
  push(0b0100, 4); // modo byte
  push(bytes.length, 8); // contagem (8 bits nas versões 1–9)
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, capacidade * 8 - bits.length)); // terminador
  push(0, (8 - (bits.length % 8)) % 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((acc, b) => (acc << 1) | b, 0));
  for (let pad = 0xec; data.length < capacidade; pad ^= 0xec ^ 0x11) data.push(pad);

  const gerador = polinomioGerador(ec);
  const grupos = Array.from({ length: blocos }, (_, i) => data.slice(i * dados, (i + 1) * dados));
  const correcoes = grupos.map((g) => restoReedSolomon(g, gerador));
  const out: number[] = [];
  for (let i = 0; i < dados; i++) for (const g of grupos) out.push(g[i]);
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
  const a = ALINHAMENTO[versao];
  if (a) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(a + dx, a + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // Reserva a área do formato (preenchida depois, com a máscara escolhida).
  desenharFormato(modulos, funcao, 0);
  return { modulos, funcao };
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

function desenharFormato(modulos: boolean[][], funcao: boolean[][], mask: number): void {
  const size = modulos.length;
  const data = (NIVEL_M << 3) | mask;
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
