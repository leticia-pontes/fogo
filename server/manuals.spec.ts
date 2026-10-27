import { readFileSync } from 'node:fs';
import { MANUAIS_JSON, gerarIndice, parseManual } from '../scripts/gerar-manuais.mjs';
import { EQUIPMENT_TYPES } from '../src/app/models/equipment-schema';

describe('npm run gerar-manuais', () => {
  const indice = gerarIndice();

  it('gera JSON válido, igual ao arquivo versionado (rode npm run gerar-manuais se falhar)', () => {
    const versionado = JSON.parse(readFileSync(MANUAIS_JSON, 'utf8'));
    expect(JSON.parse(JSON.stringify(indice))).toEqual(versionado);
  });

  it('cada trecho tem id único, fonte, seção, tópicos e texto', () => {
    expect(new Set(indice.map((t: { id: string }) => t.id)).size).toBe(indice.length);
    for (const t of indice) {
      expect(t.fonte).toMatch(/\.md$/);
      expect(t.secao).toBeTruthy();
      expect(t.topicos.length).toBeGreaterThan(0);
      expect(t.texto.length).toBeGreaterThan(40);
    }
  });

  it('há manual para todo tipo de equipamento e os dois transversais', () => {
    const tipos = new Set(indice.flatMap((t: { tipos: string[] }) => t.tipos));
    for (const tipo of EQUIPMENT_TYPES) expect(tipos.has(tipo)).toBe(true);
    const fontes = new Set(indice.map((t: { fonte: string }) => t.fonte));
    expect(fontes.has('procedimento-furto.md')).toBe(true);
    expect(fontes.has('falha-em-lote.md')).toBe(true);
  });

  it('lê front-matter, tópicos e fabricante por seção', () => {
    const [t] = parseManual('x.md', '---\ntipo: camera\n---\n# T\n## Seção Um\nTópicos: falha, lote\nFabricante: Axis\nTexto da seção.\n');
    expect(t).toEqual({ id: 'x#secao-um', fonte: 'x.md', titulo: 'T', secao: 'Seção Um', tipos: ['camera'], fabricante: 'Axis', topicos: ['falha', 'lote'], texto: 'Texto da seção.' });
    expect(parseManual('sem.md', '# Sem front-matter\n## A\nB')).toEqual([]);
  });
});
