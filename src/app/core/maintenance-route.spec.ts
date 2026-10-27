import { buildMockAgents, buildMockEquipment } from '../data/mock-data';
import { makeEquipment } from '../../testing/fixtures';
import { MAINTENANCE_BASE, gerarRotaManutencao } from './maintenance-route';
import { CityState } from './state';

const HOJE = '2026-03-10';
const at = (lat: number, lng: number, overrides: Parameters<typeof makeEquipment>[0]) => {
  const e = makeEquipment(overrides);
  return { ...e, location: { ...e.location, lat, lng } };
};

describe('rota de manutenção', () => {
  const seed = (): CityState => ({ equipment: buildMockEquipment(), agents: buildMockAgents(), peakSurge: null });

  it('itens imediatos aparecem antes dos de menor criticidade, mesmo mais longe', () => {
    const [lat, lng] = [MAINTENANCE_BASE.lat, MAINTENANCE_BASE.lng];
    const state: CityState = {
      equipment: [
        at(lat + 0.001, lng, { maintenance: { priority: 'scheduled', nextDate: '2026-03-12' } }), // próxima, colada na base
        at(lat + 0.03, lng + 0.03, { status: 'malfunction', maintenance: { priority: 'immediate' } }), // imediata, ~4,5 km
        at(lat - 0.002, lng, { maintenance: { priority: 'scheduled', nextDate: '2026-03-05' } }), // vencida, perto
      ],
      agents: [],
      peakSurge: null,
    };
    const route = gerarRotaManutencao(state, { hoje: HOJE });
    expect(route.paradas.map((p) => p.criticidade)).toEqual(['imediata', 'vencida', 'proxima']);
  });

  it('na seed, todas as imediatas vêm antes das demais', () => {
    const order = gerarRotaManutencao(seed(), { hoje: HOJE, limite: 50 }).paradas.map((p) => p.criticidade);
    expect(order.lastIndexOf('imediata')).toBeLessThan(order.findIndex((c) => c !== 'imediata'));
  });

  it('não repete paradas e a distância total é a soma dos trechos', () => {
    const route = gerarRotaManutencao(seed(), { hoje: HOJE, limite: 50 });
    const ids = route.paradas.map((p) => p.equipamentoId);
    expect(new Set(ids).size).toBe(ids.length);
    const sum = Math.round(route.paradas.reduce((s, p) => s + p.trechoKm, 0) * 10) / 10;
    expect(route.distanciaTotalKm).toBe(sum);
    expect(route.paradas.at(-1)!.acumuladoKm).toBe(route.distanciaTotalKm);
    expect(route.tempoEstimadoMin).toBe(Math.round((route.distanciaTotalKm / route.velocidadeKmh) * 60 + ids.length * route.minutosPorParada));
  });

  it('lista vazia retorna rota vazia sem erro', () => {
    const route = gerarRotaManutencao({ equipment: [], agents: [], peakSurge: null }, { hoje: HOJE });
    expect(route.paradas).toEqual([]);
    expect(route.distanciaTotalKm).toBe(0);
    expect(route.tempoEstimadoMin).toBe(0);
  });

  it('respeita filtros, limite e deixa furtados fora (exigem reposição)', () => {
    const state = seed();
    const route = gerarRotaManutencao(state, { hoje: HOJE, bairro: 'Entroncamento', apenasCriticos: true, limite: 2 });
    expect(route.paradas.length).toBeLessThanOrEqual(2);
    expect(route.paradas.every((p) => p.bairro === 'Entroncamento' && p.criticidade !== 'proxima')).toBe(true);
    const all = gerarRotaManutencao(state, { hoje: HOJE, limite: 50 });
    expect(all.paradas.some((p) => p.situacao === 'stolen')).toBe(false);
    expect(all.foraDaRota.some((f) => f.motivo.startsWith('Furtado'))).toBe(true);
  });
});
