import { TestBed } from '@angular/core/testing';
import { NEIGHBORHOODS, NEIGHBORHOOD_HISTORY } from '../data/mock-data';
import { HOOD_A, HOOD_B, makeAgent, makeEquipment } from '../../testing/fixtures';
import { CityStateService } from './city-state.service';
import { PredictionService } from './prediction.service';

describe('PredictionService', () => {
  let city: CityStateService;
  let predictor: PredictionService;

  /** Bairros com efetivo exatamente no necessário, para isolar o efeito de cada teste. */
  const staffedAgents = () =>
    NEIGHBORHOODS.flatMap((n) =>
      Array.from({ length: NEIGHBORHOOD_HISTORY[n.name].requiredAgentsAtPeak }, () => makeAgent({ neighborhood: n.name }))
    );

  const byKind = (kind: string) => predictor.predictions().filter((p) => p.kind === kind);

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    city = TestBed.inject(CityStateService);
    predictor = TestBed.inject(PredictionService);
    city.equipment.set([]);
    city.agents.set(staffedAgents());
  });

  it('não prevê nada numa cidade saudável e com efetivo completo', () => {
    city.equipment.set([makeEquipment(), makeEquipment({ type: 'camera' })]);
    expect(predictor.predictions()).toEqual([]);
  });

  it('é determinística: o mesmo estado gera as mesmas previsões', () => {
    city.equipment.set([makeEquipment({ status: 'malfunction' }), makeEquipment({ status: 'malfunction' })]);
    expect(predictor.predictions()).toEqual(predictor.predictions());
    const first = JSON.stringify(predictor.predictions());
    city.equipment.update((list) => [...list]);
    expect(JSON.stringify(predictor.predictions())).toBe(first);
  });

  describe('colapso viário', () => {
    it('combina fiscalização indisponível, fluxo histórico e déficit de efetivo', () => {
      const down = [1, 2, 3].map(() => makeEquipment({ type: 'radar', status: 'malfunction', neighborhood: HOOD_A }));
      city.equipment.set(down);
      city.agents.update((list) => list.filter((a) => a.neighborhood !== HOOD_A));

      const [collapse] = byKind('traffic_collapse');
      const flowMax = Math.max(...Object.values(NEIGHBORHOOD_HISTORY).map((h) => h.peakFlowVehiclesPerHour));
      const flowScore = Math.round((NEIGHBORHOOD_HISTORY[HOOD_A].peakFlowVehiclesPerHour / flowMax) * 30);

      expect(collapse.neighborhood).toBe(HOOD_A);
      expect(collapse.riskScore).toBe(45 + flowScore + 25);
      expect(collapse.evidence[0]).toContain('3 de 3 equipamentos de fiscalização indisponíveis');
      expect(collapse.actions[0]).toMatchObject({ kind: 'maintenance', priority: 'immediate', equipmentIds: down.map((e) => e.id) });
    });

    it('não é disparado por equipamentos que não são de fiscalização', () => {
      city.equipment.set([1, 2, 3].map(() => makeEquipment({ type: 'scooter', status: 'malfunction' })));
      expect(byKind('traffic_collapse')).toEqual([]);
    });
  });

  describe('reforço de efetivo', () => {
    it('recomenda convocar agentes de folga do próprio bairro', () => {
      const required = NEIGHBORHOOD_HISTORY[HOOD_B].requiredAgentsAtPeak;
      const offDuty = makeAgent({ neighborhood: HOOD_B, status: 'off_duty' });
      city.agents.update((list) => [
        ...list.filter((a) => a.neighborhood !== HOOD_B),
        ...Array.from({ length: required - 1 }, () => makeAgent({ neighborhood: HOOD_B })),
        offDuty,
      ]);

      const [staff] = byKind('staff_reinforcement');
      expect(staff.neighborhood).toBe(HOOD_B);
      expect(staff.actions).toEqual([{ kind: 'move_agents', neighborhood: HOOD_B, agentIds: [offDuty.id] }]);
    });
  });

  describe('falha em lote', () => {
    it('detecta modelo com taxa de falha muito acima do restante da frota', () => {
      const lot = (status: 'malfunction' | 'operational') => makeEquipment({ type: 'camera', brand: 'Lote', model: 'X1', status });
      city.equipment.set([
        lot('malfunction'),
        lot('malfunction'),
        lot('operational'),
        ...Array.from({ length: 10 }, () => makeEquipment()),
      ]);

      const [batch] = byKind('batch_failure');
      expect(batch.subject).toContain('3 unidades');
      expect(batch.actions.map((a) => a.kind === 'maintenance' && a.priority)).toEqual(['immediate', 'scheduled']);
    });
  });

  describe('onda de furtos', () => {
    it('exige 2 ou mais furtos no mesmo bairro', () => {
      city.equipment.set([makeEquipment({ status: 'stolen' })]);
      expect(byKind('security_patrol')).toEqual([]);

      city.equipment.update((list) => [...list, makeEquipment({ status: 'stolen' })]);
      expect(byKind('security_patrol')).toHaveLength(1);
    });
  });

  describe('aplicar recomendação', () => {
    it('altera o estado da cidade e marca a previsão como aplicada', () => {
      const broken = makeEquipment({ type: 'radar', status: 'malfunction' });
      city.equipment.set([broken, makeEquipment({ type: 'radar', status: 'malfunction' }), makeEquipment({ type: 'camera', status: 'stolen' })]);
      city.agents.update((list) => list.filter((a) => a.neighborhood !== HOOD_A));
      const [collapse] = byKind('traffic_collapse');

      expect(predictor.isApplied(collapse)).toBe(false);
      predictor.apply(collapse);

      const after = city.equipment().find((e) => e.id === broken.id)!;
      expect(after.status).toBe('maintenance');
      expect(after.maintenance.priority).toBe('immediate');
      expect(predictor.isApplied(collapse)).toBe(true);
      expect(city.events()[0].kind).toBe('prediction_applied');
    });
  });
});
