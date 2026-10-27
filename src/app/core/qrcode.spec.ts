import { gerarQrCode, qrCodeSvgPath } from './qrcode';

// A leitura de verdade foi conferida com o decodificador ZXing (8 textos × 8 máscaras, versões 1–6, UTF-8).
// Aqui ficam as garantias estruturais da norma.
describe('QR Code', () => {
  const link = 'http://192.168.0.10:3000/api/comprovantes/OC-0042';

  it('escolhe a menor versão que cabe (tamanho = 4 × versão + 17)', () => {
    expect(gerarQrCode('A')).toHaveLength(21);
    expect(gerarQrCode(link)).toHaveLength(33); // 50 bytes → versão 4
    expect(gerarQrCode('x'.repeat(106))).toHaveLength(41);
    expect(() => gerarQrCode('x'.repeat(107))).toThrow(/longo demais/);
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
    expect(gerarQrCode(link, 0)).not.toEqual(gerarQrCode(link, 1));
    expect(gerarQrCode(link, 0).slice(0, 7).map((l) => l.slice(0, 7))).toEqual(gerarQrCode(link, 1).slice(0, 7).map((l) => l.slice(0, 7)));
  });

  it('gera o caminho SVG com margem de 4 módulos', () => {
    const m = gerarQrCode('A');
    const { d, tamanho } = qrCodeSvgPath(m);
    expect(tamanho).toBe(29);
    expect(d.match(/M/g)).toHaveLength(m.flat().filter(Boolean).length);
    expect(d.startsWith('M4 4h1v1h-1z')).toBe(true);
  });
});
