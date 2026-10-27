import { mkdtempSync, rmSync } from 'node:fs';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { buildMockAgents, buildMockEquipment } from '../src/app/data/mock-data';
import type { Agent, Equipment } from '../src/app/models/fogo.models';
import { createApp } from './app';

describe('API + SQLite', () => {
  let dir: string;
  let dbFile: string;
  let server: Server;
  let base: string;

  const start = async () => {
    server = createApp(dbFile).server;
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  };
  const stop = () => new Promise<void>((r) => server.close(() => r()));
  const restart = async () => {
    await stop();
    await start();
  };
  const call = async <T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> => {
    const res = await fetch(base + path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, data: (await res.json()) as T };
  };

  const newEquipment = (): Equipment => ({
    ...buildMockEquipment()[0],
    id: 'EQ-NOVO',
    serialNumber: 'RAD-TESTE-0001',
  });
  const newAgent = (): Agent => ({ ...buildMockAgents()[0], id: 'AG-NOVO', badgeNumber: 'AT-TESTE', name: 'Agente Teste' });

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'fogo-test-'));
    dbFile = join(dir, 'fogo.db');
    await start();
  });

  afterEach(async () => {
    await stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it('cria e popula o banco na primeira execução, sem repopular depois', async () => {
    const first = await call('GET', '/estado');
    expect(first.data.equipment).toHaveLength(buildMockEquipment().length);
    expect(first.data.agents).toHaveLength(buildMockAgents().length);

    await call('DELETE', '/equipamentos/EQ-001');
    await restart();
    const again = await call('GET', '/estado');
    expect(again.data.equipment).toHaveLength(buildMockEquipment().length - 1);
  });

  it('cria, consulta, edita e desativa equipamento; tudo persiste entre reinícios', async () => {
    expect((await call('POST', '/equipamentos', newEquipment())).status).toBe(201);
    expect((await call('POST', '/equipamentos', newEquipment())).status).toBe(409);
    await call('PUT', '/equipamentos/EQ-NOVO', { ...newEquipment(), brand: 'Marca Editada' });
    await call('PATCH', '/equipamentos/EQ-NOVO/situacao', { situacao: 'deactivated' });

    await restart();
    const { data } = await call<Equipment>('GET', '/equipamentos/EQ-NOVO');
    expect(data.brand).toBe('Marca Editada');
    expect(data.status).toBe('deactivated');
    expect(data.customProperties).toEqual(newEquipment().customProperties);

    const filtered = await call<Equipment[]>('GET', '/equipamentos?situacao=deactivated');
    expect(filtered.data.map((e) => e.id)).toContain('EQ-NOVO');

    const audit = await call<{ acao: string }[]>('GET', '/auditoria');
    expect(audit.data.map((a) => a.acao)).toEqual(expect.arrayContaining(['CRIAR_EQUIPAMENTO', 'EDITAR_EQUIPAMENTO']));
    const events = await call<{ alvoId: string; situacaoNova: string }[]>('GET', '/eventos');
    expect(events.data[0]).toMatchObject({ alvoId: 'EQ-NOVO', situacaoNova: 'deactivated' });
  });

  it('cria, edita e desativa agente; persiste entre reinícios', async () => {
    expect((await call('POST', '/agentes', newAgent())).status).toBe(201);
    await call('PUT', '/agentes/AG-NOVO', { ...newAgent(), neighborhood: 'Centro Histórico' });
    await call('PATCH', '/agentes/AG-NOVO/situacao', { situacao: 'off_duty' });

    await restart();
    const { data } = await call<Agent>('GET', '/agentes/AG-NOVO');
    expect(data).toMatchObject({ neighborhood: 'Centro Histórico', status: 'off_duty' });
  });

  it('rejeita dados inválidos, inclusive propriedades específicas do tipo', async () => {
    const bad = { ...newEquipment(), customProperties: { radarSubtype: 'laser' } };
    const res = await call<{ detalhes: string[] }>('POST', '/equipamentos', bad);
    expect(res.status).toBe(400);
    expect(res.data.detalhes.join()).toContain('radarSubtype');
  });

  it('sync grava em lote, registra histórico e auditoria das mudanças do usuário', async () => {
    const eq = { ...buildMockEquipment()[2], status: 'stolen' } as Equipment;
    await call('POST', '/sync', { origem: 'usuario', equipment: [eq], removed: { agents: ['AG-01'] } });
    await restart();
    const state = await call('GET', '/estado');
    expect(state.data.equipment.find((e: Equipment) => e.id === eq.id).status).toBe('stolen');
    expect(state.data.agents.some((a: Agent) => a.id === 'AG-01')).toBe(false);
    const alerts = await call<{ id: string }[]>('GET', '/alertas');
    expect(alerts.data.map((a) => a.id)).toContain(`AL-${eq.id}`);
  });

  it('cenário de crise é persistido e pode ser revertido', async () => {
    const before = (await call('GET', '/estado')).data;
    await call('POST', '/cenarios/power_outage');
    await restart();
    const during = (await call('GET', '/estado')).data;
    expect(during.scenarioSnapshot.scenarios).toEqual(['power_outage']);
    const after = (await call('POST', '/cenarios/reverter')).data;
    expect(after.equipment).toEqual(before.equipment);
    expect(after.agents).toEqual(before.agents);
    expect(after.scenarioSnapshot).toBeNull();
  });

  it('reset restaura o estado inicial', async () => {
    const initial = (await call('GET', '/estado')).data;
    await call('DELETE', '/equipamentos/EQ-001');
    await call('POST', '/equipamentos', newEquipment());
    await call('POST', '/cenarios/theft_wave');
    const reset = (await call('POST', '/reset')).data;
    expect(reset.equipment).toEqual(initial.equipment);
    expect(reset.agents).toEqual(initial.agents);
    expect(reset.scenarioSnapshot).toBeNull();
  });
});
