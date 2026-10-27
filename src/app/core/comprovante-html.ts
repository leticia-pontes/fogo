import { Comprovante } from './comprovante';

/**
 * Estilo do cupom de papel, compartilhado pelo componente Angular (`ComprovanteTicket`) e pela página
 * do celular (`renderComprovanteHtml`). Os recortes usam `--ticket-fundo` (cor do fundo atrás do papel).
 */
export const TICKET_CSS = `
.tk {
  --tk-paper: #f3eee2; --tk-ink: #1a1814; --tk-ink-soft: #5c574c; --tk-perf: #b9b2a2;
  --tk-dots: #8d877a; --tk-green: #1e6b47; --tk-amber: #8a4b00;
  box-sizing: border-box;
  width: 380px;
  padding: 22px 22px 0;
  border-radius: 14px 14px 0 0;
  background: var(--tk-paper);
  color: var(--tk-ink);
  font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.tk p, .tk dl, .tk dd { margin: 0; }
.tk-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tk-small { font-size: 12px; }
.tk-soft { color: var(--tk-ink-soft); }
.tk-brand { font-size: 14px; font-weight: 500; letter-spacing: 0.18em; }
.tk-caps { margin-top: 6px !important; letter-spacing: 0.12em; }
.tk-id-row { margin-top: 18px; }
.tk-id { font-size: 34px; font-weight: 500; line-height: 1.1; }
.tk-seal {
  border: 2px solid var(--tk-green); color: var(--tk-green); border-radius: 6px; padding: 3px 10px;
  font-size: 13px; font-weight: 500; letter-spacing: 0.12em; transform: rotate(-8deg);
}
.tk-sub { margin-top: 8px !important; letter-spacing: 0.06em; }
.tk-perf { position: relative; height: 20px; margin: 12px -22px; }
.tk-perf::before { content: ''; position: absolute; left: 18px; right: 18px; top: 9px; border-top: 2px dashed var(--tk-perf); }
.tk-perf::after {
  content: ''; position: absolute; inset: 0;
  background:
    radial-gradient(circle at 0 10px, var(--ticket-fundo, #090e14) 10px, transparent 10.5px) left / 20px 20px no-repeat,
    radial-gradient(circle at 20px 10px, var(--ticket-fundo, #090e14) 10px, transparent 10.5px) right / 20px 20px no-repeat;
}
.tk-line { display: flex; align-items: baseline; gap: 8px; min-height: 28px; font-size: 13px; }
.tk-line dt { flex-shrink: 0; }
.tk-dots { flex: 1; min-width: 12px; border-bottom: 1px dotted var(--tk-dots); transform: translateY(-3px); }
.tk-line dd { font-weight: 500; text-align: right; }
.tk-section { letter-spacing: 0.1em; margin-bottom: 2px !important; }
.tk-amber { color: var(--tk-amber); letter-spacing: 0.14em; }
.tk-quote { margin-top: 4px !important; font-size: 13px; line-height: 1.5; }
.tk-foot { margin-top: 18px; line-height: 1.4; }
.tk-foot p + p { margin-top: 2px; }
.tk-serrated {
  height: 12px; margin: 18px -22px 0;
  background-color: var(--tk-paper);
  background-image: radial-gradient(circle at 8px 12px, var(--ticket-fundo, #090e14) 6px, transparent 6.5px);
  background-size: 16px 12px; background-repeat: repeat-x;
}
`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const linha = (rotulo: string, valor: string) =>
  `<div class="tk-line"><dt class="tk-soft">${esc(rotulo)}</dt><span class="tk-dots" aria-hidden="true"></span><dd>${esc(valor)}</dd></div>`;

/** Marcação do cupom (mesma estrutura do componente Angular). */
export function renderTicketHtml(c: Comprovante): string {
  return `<article class="tk" aria-label="Comprovante da ocorrência ${esc(c.id)}">
<header>
<div class="tk-row"><span class="tk-brand">F.O.G.O.</span><span class="tk-soft tk-small">Nova Prometeia</span></div>
<p class="tk-soft tk-small tk-caps">COMPROVANTE DE OCORRÊNCIA</p>
<div class="tk-row tk-id-row"><span class="tk-id">${esc(c.id)}</span><span class="tk-seal">${esc(c.selo)}</span></div>
<p class="tk-soft tk-small tk-sub">${esc(c.subtitulo)}</p>
</header>
<div class="tk-perf" aria-hidden="true"></div>
<dl>${c.campos.map((l) => linha(l.rotulo, l.valor)).join('')}</dl>
<div class="tk-perf" aria-hidden="true"></div>
<p class="tk-soft tk-small tk-section">CIDADE · ABERTURA → AGORA</p>
<dl>${c.cidade.map((l) => linha(l.rotulo, `${l.antes} → ${l.agora}`)).join('')}</dl>
<div class="tk-perf" aria-hidden="true"></div>
<section><p class="tk-small tk-amber">PROMETHEUS</p><p class="tk-quote">${esc(c.prometheus)}</p></section>
<footer class="tk-soft tk-small tk-foot"><p>${esc(c.emitidoEm)}</p><p>${esc(c.aviso)}</p></footer>
<div class="tk-serrated" aria-hidden="true"></div>
</article>`;
}

/**
 * Página autônoma do comprovante, aberta no celular pelo QR Code: o cupom, "Salvar PDF" (impressão do
 * navegador, que no celular oferece salvar/compartilhar) e "Baixar texto". Sem script além do botão.
 */
export function renderComprovanteHtml(c: Comprovante, { linkTexto }: { linkTexto: string }): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Comprovante ${esc(c.id)} · F.O.G.O.</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root { --ticket-fundo: #090e14; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: var(--ticket-fundo); padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 16px;
  font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
${TICKET_CSS}
.tk { width: 100%; max-width: 380px; }
.acoes { width: 100%; max-width: 380px; display: grid; gap: 12px; }
.acoes a, .acoes button { display: flex; align-items: center; justify-content: center; min-height: 48px; border-radius: 10px;
  font: 600 15px/1 system-ui, sans-serif; text-decoration: none; cursor: pointer; }
.principal { background: #ffb547; color: #1b1203; border: 0; }
.secundario { background: transparent; color: #e8e4da; border: 1px solid #3a4b5e; }
@media print {
  @page { margin: 10mm; }
  :root { --ticket-fundo: #fff; }
  body { background: #fff; padding: 0; min-height: 0; }
  .acoes { display: none; }
}
</style>
</head>
<body>
${renderTicketHtml(c)}
<div class="acoes">
<button type="button" class="principal" onclick="window.print()">Salvar PDF</button>
<a class="secundario" href="${esc(linkTexto)}" download="comprovante-${esc(c.id)}.txt">Baixar texto (.txt)</a>
</div>
</body>
</html>
`;
}
