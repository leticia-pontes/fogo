import { Contexto } from './app';
import { DEFAULT_DB_FILE } from './db';

/**
 * npm run reset: apaga o banco e recria com a seed de exemplo. Se o servidor estiver no ar,
 * pede o reset a ele (que mantém o arquivo aberto); senão, recria o arquivo diretamente.
 */
const port = Number(process.env['PORT'] ?? 3000);

async function main(): Promise<void> {
  try {
    const res = await fetch(`http://localhost:${port}/api/reset`, { method: 'POST', headers: { 'x-usuario': 'linha de comando' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { equipment, agents } = (await res.json()) as { equipment: unknown[]; agents: unknown[] };
    console.log(
      `Banco recriado pelo servidor em execução: ${equipment.length} equipamentos, ${agents.length} agentes. Recarregue o painel.`,
    );
  } catch {
    const ctx = new Contexto(DEFAULT_DB_FILE);
    ctx.reset();
    ctx.repo.registrarAuditoria({ acao: 'RESET', autor: 'linha de comando', descricao: 'Banco recriado com a seed de exemplo' });
    const { equipment, agents } = ctx.repo.lerEstado();
    ctx.close();
    console.log(`Banco recriado em ${DEFAULT_DB_FILE}: ${equipment.length} equipamentos, ${agents.length} agentes.`);
  }
}

void main();
