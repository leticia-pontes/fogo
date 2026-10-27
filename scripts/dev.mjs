// npm start: sobe a API (Node + SQLite, porta 3000) e o painel Angular (porta 4200, com proxy /api).
import { spawn } from 'node:child_process';

const procs = [
  spawn('npx', ['tsx', 'server/main.ts'], { stdio: 'inherit' }),
  spawn('npx', ['ng', 'serve'], { stdio: 'inherit' }),
];
const stop = () => procs.forEach((p) => p.kill('SIGTERM'));
for (const p of procs) p.on('exit', (code) => { stop(); process.exitCode = code ?? 0; });
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
