import { NEIGHBORHOODS, NEIGHBORHOOD_HISTORY, buildMockAgents, buildMockEquipment } from '../data/mock-data';
import { makeAgent, makeEquipment } from '../../testing/fixtures';
import { calcularRisco } from './analysis';
import { gerarBoletim } from './bulletin';
import { applyScenario } from './scenarios';
import { CityState } from './state';

/** 10/03/2026, 09:30 no fuso local. */
const AGORA = new Date(2026, 2, 10, 9, 30);
const HOJE = '2026-03-10';
const seed = (): CityState => ({ equipment: buildMockEquipment(), agents: buildMockAgents(), peakSurge: null });
const boletim = (state: CityState, agora = AGORA) => gerarBoletim(state, calcularRisco(state), agora);

describe('boletim da PROMETHEUS', () => {
  it('cita os números corretos do estado', () => {
    const state = seed();
    const b = boletim(state);
    const installed = state.equipment.filter((e) => e.status !== 'not_installed');
    const operational = installed.filter((e) => e.status === 'operational').length;
    const pct = Math.round((operational / installed.length) * 1000) / 10;
    expect(b.numeros).toMatchObject({ operacionais: operational, instalados: installed.length, disponibilidadePct: pct });
    expect(b.texto).toContain(`${pct.toLocaleString('pt-BR')}% de disponibilidade: ${operational} de ${installed.length}`);
    const critical = state.equipment.filter((e) => e.status === 'stolen' || e.status === 'malfunction').length;
    expect(b.numeros.alertasCriticos).toBe(critical);
    expect(b.texto).toContain(`${critical} alerta(s) crítico(s)`);
    expect(b.texto.startsWith('Bom dia, gestor. Aqui é PROMETHEUS com o boletim das 09:30.')).toBe(true);
  });

  it('é determinístico e muda quando o estado muda', () => {
    const state = seed();
    expect(boletim(state).texto).toBe(boletim(seed()).texto);
    const crisis = applyScenario(state, 'power_outage', HOJE).state;
    const after = boletim(crisis);
    expect(after.texto).not.toBe(boletim(state).texto);
    expect(after.numeros.alertasCriticos).toBeGreaterThan(boletim(state).numeros.alertasCriticos);
    expect(after.numeros.disponibilidadePct).toBeLessThan(boletim(state).numeros.disponibilidadePct);
  });

  it('cidade sem alertas gera o texto de "tudo sob controle"', () => {
    const calm: CityState = {
      equipment: NEIGHBORHOODS.map((n) => makeEquipment({ type: 'camera', neighborhood: n.name, maintenance: { priority: 'none', nextDate: '2026-06-01' } })),
      agents: NEIGHBORHOODS.flatMap((n) =>
        Array.from({ length: NEIGHBORHOOD_HISTORY[n.name].requiredAgentsAtPeak }, () => makeAgent({ neighborhood: n.name }))
      ),
      peakSurge: null,
    };
    const b = boletim(calm, new Date(2026, 2, 10, 21, 0));
    expect(b.sobControle).toBe(true);
    expect(b.texto).toContain('Tudo sob controle');
    expect(b.texto).not.toContain('Alertas críticos');
    expect(b.texto.startsWith('Boa noite')).toBe(true);
  });

  it('lista as preventivas que vencem nas próximas 48 h', () => {
    const state: CityState = {
      equipment: [
        makeEquipment({ maintenance: { priority: 'scheduled', nextDate: '2026-03-11' } }),
        makeEquipment({ maintenance: { priority: 'scheduled', nextDate: '2026-03-20' } }),
      ],
      agents: [],
      peakSurge: null,
    };
    const b = boletim(state);
    expect(b.numeros.manutencoes48h).toBe(1);
    expect(b.texto).toContain(`${state.equipment[0].serialNumber} (radar de fiscalização, amanhã)`);
  });
});
