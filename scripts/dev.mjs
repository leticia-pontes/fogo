// npm start: sobe a API (Node + SQLite, porta 3000) e o painel Angular (porta 4200, com proxy /api).
import { spawn } from 'node:child_process';

// Cada comando em seu próprio grupo de processos, para encerrar também os filhos do npx.
const procs = [
  spawn('npx', ['tsx', 'server/main.ts'], { stdio: 'inherit', detached: true }),
  spawn('npx', ['ng', 'serve'], { stdio: 'inherit', detached: true }),
];
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const p of procs) {
    try {
      process.kill(-p.pid, 'SIGTERM');
    } catch {
      // Já encerrado.
    }
  }
};
for (const p of procs) p.on('exit', (code) => { stop(); process.exitCode ||= code ?? 0; });
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, stop);
