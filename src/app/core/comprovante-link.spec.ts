import { Comprovante } from './comprovante';
import { lerComprovanteDoLink, linkDoComprovante } from './comprovante-link';
import { gerarQrCode } from './qrcode';

const ROTULOS = ['Equipamento', 'Local', 'Bairro', 'Detectado', 'Encerrado', 'Duração', 'Atendido por', 'Resolução'];
const VALORES = ['CAM-901-0003 · Hikvision', 'Rua da Ribeira, Próximo à Ponte Velha', 'Orla do Rio', '27/10/2026 17:35', '27/10/2026 18:22', '47 min', 'Ana Souza', 'Unidade reposta'];

function comprovante(): Comprovante {
  return {
    id: 'OC-0042',
    selo: 'ENCERRADA',
    subtitulo: 'FALHA · CÂMERA DE MONITORAMENTO',
    campos: ROTULOS.map((rotulo, i) => ({ rotulo, valor: VALORES[i] })),
    cidade: [
      { rotulo: 'Disponibilidade', antes: '78,8%', agora: '80,8%' },
      { rotulo: 'Saúde do bairro', antes: '65', agora: '76' },
      { rotulo: 'Risco do bairro', antes: 'ALTO', agora: 'MÉDIO' },
    ],
    prometheus: 'Falha resolvida em 47 minutos. Orla do Rio recuperou 11 pontos de saúde. Não precisa agradecer.',
    emitidoEm: 'Emitido em 27/10/2026 às 18:22',
    aviso: 'Documento interno de demonstração. Valores estimados por regras.',
    textoPlano: '',
  };
}

describe('comprovante no link (QR Code sem servidor)', () => {
  it('ida e volta: o link leva o comprovante e a página o reconstrói igual', async () => {
    const c = comprovante();
    const link = await linkDoComprovante(c, 'https://fogo-chi.vercel.app/');
    expect(link).toMatch(/^https:\/\/fogo-chi\.vercel\.app\/comprovante#c1[zj]\.[A-Za-z0-9_-]+$/);
    const volta = await lerComprovanteDoLink(new URL(link).hash);
    expect({ ...volta, textoPlano: '' }).toEqual(c);
    expect(volta.textoPlano).toContain('Local: Rua da Ribeira');
    expect(gerarQrCode(link, { nivel: 'L' }).length).toBeLessThanOrEqual(4 * 20 + 17); // cabe num QR legível na tela
  });

  it('sem CompressionStream, usa o modo sem compressão e continua legível', async () => {
    const original = globalThis.CompressionStream;
    // @ts-expect-error: simula navegador sem a API
    delete globalThis.CompressionStream;
    try {
      const link = await linkDoComprovante(comprovante(), 'https://x.app');
      expect(link).toContain('#c1j.');
      expect((await lerComprovanteDoLink(new URL(link).hash)).id).toBe('OC-0042');
    } finally {
      globalThis.CompressionStream = original;
    }
  });

  it('recusa link inválido ou adulterado', async () => {
    await expect(lerComprovanteDoLink('')).rejects.toThrow(/inválido/);
    await expect(lerComprovanteDoLink('#c1j.@@@')).rejects.toThrow(/inválido/);
    const falso = btoa(JSON.stringify(['OC-1', 'x', ['só um valor'], [], 'y', 'z'])).replace(/=+$/, '');
    await expect(lerComprovanteDoLink(`#c1j.${falso}`)).rejects.toThrow(/inválido/);
  });
});
