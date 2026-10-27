import { buildStressEquipment } from '../src/app/data/mock-data';
import { EQUIPMENT_STATUSES } from '../src/app/models/equipment-schema';
import { Contexto } from './app';
import { DEFAULT_DB_FILE } from './db';

/**
 * Dados SINTÉTICOS de volume, desligados por padrão (o banco abre só com a seed enxuta).
 *   npm run sintetico -- --eventos=5000          histórico de telemetria (sem mudar o estado atual)
 *   npm run sintetico -- --equipamentos=500      frota extra no mapa (origem = 'sintetico')
 * Para voltar ao estado limpo: npm run reset. Determinístico: mesma quantidade, mesmos dados.
 * Rode com o servidor parado (ou reinicie-o depois).
 */
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string])
);
const eventos = Math.min(200_000, Number(args['eventos'] ?? 0));
const equipamentos = Math.min(5000, Number(args['equipamentos'] ?? 0));

if (!eventos && !equipamentos) {
  console.log('Nada a gerar. Use --eventos=N e/ou --equipamentos=N (ex.: npm run sintetico -- --eventos=5000).');
  process.exit(0);
}

let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const ctx = new Contexto(DEFAULT_DB_FILE);
const repo = ctx.repo;
repo.transacao(() => {
  if (equipamentos) {
    for (const e of buildStressEquipment(equipamentos)) repo.salvarEquipamento(e, 'sintetico');
  }
  const ids = repo.listarEquipamentos().map((e) => e.id);
  const start = Date.now() - 90 * 86_400_000;
  for (let i = 0; i < eventos; i++) {
    repo.registrarEvento({
      alvoTipo: 'equipamento',
      alvoId: ids[Math.floor(rand() * ids.length)],
      situacaoAnterior: EQUIPMENT_STATUSES[Math.floor(rand() * EQUIPMENT_STATUSES.length)],
      situacaoNova: EQUIPMENT_STATUSES[Math.floor(rand() * EQUIPMENT_STATUSES.length)],
      origem: 'sintetico',
      criadoEm: new Date(start + (i / Math.max(1, eventos)) * 90 * 86_400_000).toISOString(),
    });
  }
  repo.registrarAuditoria({
    acao: 'DADOS_SINTETICOS',
    autor: 'linha de comando',
    descricao: `Gerados ${eventos} eventos de telemetria e ${equipamentos} equipamentos sintéticos`,
  });
  ctx.afterWrite();
});
ctx.close();
console.log(`OK: ${eventos} eventos e ${equipamentos} equipamentos sintéticos em ${DEFAULT_DB_FILE}.`);
