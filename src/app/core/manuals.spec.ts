import { MANUAIS } from '../data/manuals-index';
import { ContextoDecisao, REGRAS, decidirComManual, recomendarPorManual, recuperarTrechos, tokenizar } from './manuals';

describe('manuais: busca', () => {
  it('normaliza acentos, remove stopwords e reduz plural simples', () => {
    expect(tokenizar('Falhas na Câmera de Vídeo')).toEqual(['falha', 'camera', 'video']);
  });

  it('encontra o manual do tipo certo', () => {
    const [top] = recuperarTrechos(MANUAIS, 'aferição do medidor de velocidade', { tipo: 'radar' });
    expect(top.fonte).toBe('radar.md');
    const [cam] = recuperarTrechos(MANUAIS, 'perda de vídeo imagem congelada', { tipo: 'camera' });
    expect(cam.fonte).toBe('camera.md');
  });

  it('bônus de fabricante leva o trecho específico ao topo', () => {
    const [top] = recuperarTrechos(MANUAIS, 'falha lote troca', { tipo: 'camera', fabricante: 'hikvision' });
    expect(top.id).toBe('camera#lote-darkfighter-com-degradacao');
  });

  it('é determinístico e ordenado por score', () => {
    const a = recuperarTrechos(MANUAIS, 'furto reposição boletim', { topN: 10 });
    expect(recuperarTrechos(MANUAIS, 'furto reposição boletim', { topN: 10 })).toEqual(a);
    expect(a.map((r) => r.score)).toEqual([...a.map((r) => r.score)].sort((x, y) => y - x));
  });

  it('consulta sem resultado devolve lista vazia, sem erro', () => {
    expect(recuperarTrechos(MANUAIS, 'xilofone quântico')).toEqual([]);
    expect(recuperarTrechos(MANUAIS, 'de da do')).toEqual([]);
    expect(recuperarTrechos([], 'furto')).toEqual([]);
  });
});

describe('manuais: decisão por regras', () => {
  const base: ContextoDecisao = {
    tipoAlerta: 'falha',
    tipoEquipamento: 'camera',
    situacao: 'malfunction',
    fabricante: 'Hikvision',
    modelo: 'DarkFighter DS-2DF8436',
    ocorrenciasRecentesNoBairro: 0,
    falhasMesmoModelo: 0,
  };
  const casos: [string, Partial<ContextoDecisao>][] = [
    ['EQUIPAMENTO_DESATIVADO', { situacao: 'deactivated' }],
    ['FURTO_REINCIDENTE', { tipoAlerta: 'furto', situacao: 'stolen', ocorrenciasRecentesNoBairro: 2 }],
    ['FURTO_ISOLADO', { tipoAlerta: 'furto', situacao: 'stolen' }],
    ['QUEDA_DE_ENERGIA', { falhasMesmoModelo: 2, quedaEnergia: true }],
    ['FALHA_EM_LOTE', { falhasMesmoModelo: 2 }],
    ['FALHA_ISOLADA', {}],
    ['MANUTENCAO', { tipoAlerta: 'manutencao', situacao: 'operational', tipoEquipamento: 'radar' }],
  ];

  it('toda regra da tabela tem um caso de teste', () => {
    expect(casos.map(([id]) => id).sort()).toEqual(REGRAS.map((r) => r.id).sort());
  });

  it.each(casos)('%s decide e cita ao menos uma fonte do manual', (regra, extra) => {
    const d = recomendarPorManual(MANUAIS, { ...base, ...extra });
    expect(d.regra).toBe(regra);
    expect(d.fontes.length).toBeGreaterThan(0);
    for (const f of d.fontes) expect(f.fonte).toMatch(/\.md$/);
    expect(d.confianca).not.toBe('baixa');
    expect(d.metodo).toContain('não é IA generativa');
  });

  it('falha em lote cita o trecho do fabricante e explica a evidência', () => {
    const d = recomendarPorManual(MANUAIS, { ...base, falhasMesmoModelo: 2 });
    expect(d.fontes.map((f) => f.id)).toContain('camera#lote-darkfighter-com-degradacao');
    expect(d.justificativa).toContain('2 outros equipamentos Hikvision DarkFighter DS-2DF8436');
  });

  it('sem trecho que sustente, confiança baixa e limitação declarada', () => {
    const d = decidirComManual(base, []);
    expect(d.fontes).toEqual([]);
    expect(d.confianca).toBe('baixa');
    expect(d.limitacoes.join(' ')).toContain('Nenhum trecho');
  });
});
