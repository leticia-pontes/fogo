import { gerarQrCode, qrCodeSvgPath } from './qrcode';

// A leitura de verdade foi conferida com o decodificador ZXing (versões 1 a 40, níveis L e M, todas as máscaras, UTF-8).
// Aqui ficam as garantias estruturais da norma.
describe('QR Code', () => {
  const link = 'http://192.168.0.10:3000/api/comprovantes/OC-0042';

  it('escolhe a menor versão que cabe (tamanho = 4 × versão + 17)', () => {
    expect(gerarQrCode('A')).toHaveLength(21);
    expect(gerarQrCode(link)).toHaveLength(33); // 50 bytes → versão 4
    expect(gerarQrCode('x'.repeat(106))).toHaveLength(41); // limite da versão 6-M
    expect(gerarQrCode('x'.repeat(107))).toHaveLength(45);
    expect(gerarQrCode('x'.repeat(2331))).toHaveLength(177); // versão 40-M
    expect(() => gerarQrCode('x'.repeat(2332))).toThrow(/longo demais/);
    expect(gerarQrCode('x'.repeat(2332), { nivel: 'L' })).toHaveLength(161); // L cabe mais: versão 36
  });

  it('tem os três localizadores, o padrão de sincronismo e o módulo escuro fixo', () => {
    const m = gerarQrCode(link);
    const n = m.length;
    const localizador = (x0: number, y0: number) =>
      [0, 1, 2, 3, 4, 5, 6].every((d) => m[y0][x0 + d] && m[y0 + 6][x0 + d] && m[y0 + d][x0] && m[y0 + d][x0 + 6]) && m[y0 + 3][x0 + 3];
    expect(localizador(0, 0) && localizador(n - 7, 0) && localizador(0, n - 7)).toBe(true);
    for (let i = 8; i < n - 8; i++) expect(m[6][i]).toBe(i % 2 === 0);
    expect(m[n - 8][8]).toBe(true);
  });

  it('é determinístico; a máscara fixa muda só a área de dados', () => {
    expect(gerarQrCode(link)).toEqual(gerarQrCode(link));
    expect(gerarQrCode(link, { mascara: 0 })).not.toEqual(gerarQrCode(link, { mascara: 1 }));
    const canto = (m: boolean[][]) => m.slice(0, 7).map((l) => l.slice(0, 7));
    expect(canto(gerarQrCode(link, { mascara: 0 }))).toEqual(canto(gerarQrCode(link, { mascara: 1 })));
  });

  it('a partir da versão 7 grava a informação de versão nos dois cantos', () => {
    const m = gerarQrCode('x'.repeat(150)); // versão 8 (49×49)
    const n = m.length;
    const blocoA = [0, 1, 2, 3, 4, 5].map((y) => [0, 1, 2].map((d) => m[y][n - 11 + d]));
    const blocoB = [0, 1, 2, 3, 4, 5].map((x) => [0, 1, 2].map((d) => m[n - 11 + d][x]));
    expect(blocoA).toEqual(blocoB);
    expect(blocoA.flat().some(Boolean)).toBe(true);
  });

  it('gera o caminho SVG com margem de 4 módulos', () => {
    const m = gerarQrCode('A');
    const { d, tamanho } = qrCodeSvgPath(m);
    expect(tamanho).toBe(29);
    expect(d.match(/M/g)).toHaveLength(m.flat().filter(Boolean).length);
    expect(d.startsWith('M4 4h1v1h-1z')).toBe(true);
  });
});
