import { createApp } from './app';

const port = Number(process.env['PORT'] ?? 3000);
const { server, ctx } = createApp();

server.listen(port, () => {
  const { equipment, agents } = ctx.repo.lerEstado();
  console.log(`[F.O.G.O.] API em http://localhost:${port}/api · banco ${ctx.dbFile} (${equipment.length} equipamentos, ${agents.length} agentes)`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
