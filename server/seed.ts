import { calcularAlertas } from '../src/app/core/indicators';
import { buildMockAgents, buildMockEquipment } from '../src/app/data/mock-data';
import { Repositorio } from './repository';

/**
 * Seed curada e determinística (54 equipamentos, 19 agentes): mesma entrada, mesmo resultado.
 * As datas de manutenção são relativas ao dia em que a seed roda (vencida há 3 dias, vence
 * amanhã etc.), para que a demonstração tenha sempre os mesmos casos de borda.
 * Registros marcados com origem = 'seed'.
 */
export function popularSeed(repo: Repositorio): { equipamentos: number; agentes: number } {
  const equipment = buildMockEquipment();
  const agents = buildMockAgents();
  repo.transacao(() => {
    for (const e of equipment) repo.salvarEquipamento(e, 'seed');
    for (const a of agents) repo.salvarAgente(a, 'seed');
    repo.salvarPico(null);
    repo.sincronizarAlertas(calcularAlertas(equipment, agents));
    repo.registrarAuditoria({
      acao: 'SEED',
      autor: 'sistema',
      descricao: `Banco criado com a seed de exemplo: ${equipment.length} equipamentos e ${agents.length} agentes`,
    });
  });
  return { equipamentos: equipment.length, agentes: agents.length };
}
