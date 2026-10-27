// npm run gerar-manuais: lê manuais/*.md e gera src/app/data/manuais.json (um trecho por seção "##").
// O JSON é versionado e importado pelo painel e pela API, então o modo offline e o deploy estático funcionam.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MANUAIS_DIR = join(ROOT, 'manuais');
export const MANUAIS_JSON = join(ROOT, 'src/app/data/manuais.json');

const slug = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

/** Trechos de um arquivo Markdown com front-matter (`tipo`, `fabricante`). Sem front-matter, o arquivo é ignorado. */
export function parseManual(fonte, markdown) {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(markdown);
  if (!fm) return [];
  const meta = Object.fromEntries(fm[1].split('\n').map((l) => l.split(/:(.*)/s).map((x) => x.trim())).filter(([k]) => k));
  const body = markdown.slice(fm[0].length);
  const titulo = /^# (.+)$/m.exec(body)?.[1].trim() ?? fonte;
  return body
    .split(/^## /m)
    .slice(1)
    .map((block) => {
      const [heading, ...rest] = block.split('\n');
      let topicos = [];
      let fabricante = meta.fabricante || null;
      const texto = [];
      for (const line of rest) {
        const t = /^T[óo]picos:\s*(.+)$/i.exec(line);
        const f = /^Fabricante:\s*(.+)$/i.exec(line);
        if (t) topicos = list(t[1]);
        else if (f) fabricante = f[1].trim();
        else if (line.trim()) texto.push(line.trim());
      }
      const secao = heading.trim();
      return { id: `${fonte.replace(/\.md$/, '')}#${slug(secao)}`, fonte, titulo, secao, tipos: list(meta.tipo ?? 'geral'), fabricante, topicos, texto: texto.join(' ') };
    });
}

export function gerarIndice(dir = MANUAIS_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .flatMap((f) => parseManual(f, readFileSync(join(dir, f), 'utf8')));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const indice = gerarIndice();
  writeFileSync(MANUAIS_JSON, JSON.stringify(indice, null, 2) + '\n');
  console.log(`[F.O.G.O.] ${indice.length} trechos de manual → src/app/data/manuais.json`);
}
