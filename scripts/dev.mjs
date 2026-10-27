// npm start: sobe a API (Node + SQLite, porta 3000) e o painel Angular (porta 4200, com proxy /api).
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Os CLIs rodam direto com o Node atual: no Windows não há `npx` executável (é `npx.cmd`).
const bin = (path) => join(ROOT, 'node_modules', path);
const windows = process.platform === 'win32';

// Fora do Windows, cada comando em seu próprio grupo de processos, para encerrar também os filhos.
const procs = [
  // `watch`: a API reinicia sozinha quando o código do servidor muda (como o painel, que recarrega).
  spawn(process.execPath, [bin('tsx/dist/cli.mjs'), 'watch', '--clear-screen=false', 'server/main.ts'], { cwd: ROOT, stdio: 'inherit', detached: !windows }),
  spawn(process.execPath, [bin('@angular/cli/bin/ng.js'), 'serve'], { cwd: ROOT, stdio: 'inherit', detached: !windows }),
];
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const p of procs) {
    try {
      // No Windows não existe grupo de processos; o Ctrl+C do console já chega aos filhos.
      if (windows) p.kill();
      else process.kill(-p.pid, 'SIGTERM');
    } catch {
      // Já encerrado.
    }
  }
};
for (const p of procs) p.on('exit', (code) => { stop(); process.exitCode ||= code ?? 0; });
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, stop);
