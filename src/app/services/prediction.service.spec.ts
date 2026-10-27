import { TestBed } from '@angular/core/testing';
import { NEIGHBORHOODS, NEIGHBORHOOD_HISTORY } from '../data/mock-data';
import { HOOD_A, HOOD_B, makeAgent, makeEquipment } from '../../testing/fixtures';
import { CityStateService } from './city-state.service';
import { OccurrenceService } from './occurrence.service';
import { PredictionService, peakHorizon } from './prediction.service';

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
      expect(byKind('enforcement_gap')).toEqual([]);
    });

    it('abaixo do limiar, fiscalização fora gera alerta de atenção que aciona a equipe técnica', () => {
      const camera = makeEquipment({ type: 'camera', status: 'malfunction', neighborhood: HOOD_A });
      city.equipment.set([camera, makeEquipment({ type: 'radar', neighborhood: HOOD_A })]);

      expect(byKind('traffic_collapse')).toEqual([]);
      const [gap] = byKind('enforcement_gap');
      expect(gap.neighborhood).toBe(HOOD_A);
      expect(gap.riskScore).toBeLessThan(55);
      expect(gap.evidence[1]).toMatch(/faltam \d+ pts para o alerta de colapso/);
      expect(gap.actions).toEqual([expect.objectContaining({ kind: 'maintenance', priority: 'immediate', equipmentIds: [camera.id] })]);
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

    it('sem agente para remanejar, oferece solicitar o reforço à escala e registra o pedido', async () => {
      city.agents.update((list) => list.filter((a) => a.neighborhood !== HOOD_B).map((a) => ({ ...a, status: 'in_dispatch' as const })));
      const required = NEIGHBORHOOD_HISTORY[HOOD_B].requiredAgentsAtPeak;

      const staff = byKind('staff_reinforcement').find((p) => p.neighborhood === HOOD_B)!;
      expect(staff.actions).toEqual([expect.objectContaining({ kind: 'request_staff', neighborhood: HOOD_B, count: required })]);
      expect(staff.recommendation).toContain('à escala');

      await predictor.apply(staff);
      expect(predictor.isApplied(byKind('staff_reinforcement').find((p) => p.neighborhood === HOOD_B)!)).toBe(true);
      expect(city.agents().filter((a) => a.neighborhood === HOOD_B)).toEqual([]);

      // O déficit mudou (chegou 1 agente): o pedido antigo não cobre o novo número, e o card volta a pendente.
      city.agents.update((list) => [...list, makeAgent({ neighborhood: HOOD_B })]);
      const after = byKind('staff_reinforcement').find((p) => p.neighborhood === HOOD_B);
      if (required > 1) expect(predictor.isApplied(after!)).toBe(false);
    });
  });

  describe('falha em lote', () => {
    it('detecta modelo com taxa de falha muito acima do restante da frota', () => {
      const lot = (status: 'malfunction' | 'operational') => makeEquipment({ type: 'scooter', brand: 'Lote', model: 'X1', status });
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

    it('não repete equipamentos que já têm ação no card do bairro', () => {
      const lot = (status: 'malfunction' | 'operational', type: 'camera' | 'scooter') =>
        makeEquipment({ type, brand: 'Lote', model: 'X1', status, neighborhood: HOOD_A });
      const camera = lot('malfunction', 'camera');
      const scooter = lot('malfunction', 'scooter');
      city.equipment.set([camera, scooter, lot('operational', 'scooter'), ...Array.from({ length: 10 }, () => makeEquipment())]);

      const [gap] = byKind('enforcement_gap');
      expect(gap.actions[0]).toMatchObject({ equipmentIds: [camera.id] });
      const [batch] = byKind('batch_failure');
      expect(batch.actions[0]).toMatchObject({ priority: 'immediate', equipmentIds: [scooter.id] });
      expect(batch.evidence.join(' ')).toContain('já está no card do bairro');
    });

    it('"Ver no mapa" aponta para a unidade com problema, mesmo quando só sobra a preventiva da que opera', () => {
      const lot = (status: 'malfunction' | 'operational') => makeEquipment({ type: 'camera', brand: 'Lote', model: 'X1', status, neighborhood: HOOD_A });
      const broken = [lot('malfunction'), lot('malfunction')];
      const healthy = lot('operational');
      city.equipment.set([...broken, healthy, ...Array.from({ length: 10 }, () => makeEquipment())]);

      const [batch] = byKind('batch_failure');
      expect(batch.actions).toEqual([expect.objectContaining({ priority: 'scheduled', equipmentIds: [healthy.id] })]);
      expect(batch.focusEquipmentIds).toEqual(broken.map((e) => e.id));
      expect(batch.evidence[0]).toContain(broken[0].serialNumber);
      expect(batch.evidence.join(' ')).toContain(`Operando normalmente: ${healthy.serialNumber}`);
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
    it('altera o estado da cidade e marca a previsão como aplicada', async () => {
      const broken = makeEquipment({ type: 'radar', status: 'malfunction' });
      city.equipment.set([broken, makeEquipment({ type: 'radar', status: 'malfunction' }), makeEquipment({ type: 'camera', status: 'stolen' })]);
      city.agents.update((list) => list.filter((a) => a.neighborhood !== HOOD_A));
      const [collapse] = byKind('traffic_collapse');

      expect(predictor.isApplied(collapse)).toBe(false);
      await predictor.apply(collapse);

      const after = city.equipment().find((e) => e.id === broken.id)!;
      expect(after.status).toBe('maintenance');
      expect(after.maintenance.priority).toBe('immediate');
      expect(predictor.isApplied(collapse)).toBe(true);
      expect(city.events()[0].kind).toBe('prediction_applied');
    });

    it('abre uma ocorrência por equipamento enviado à equipe técnica, com o tipo da situação de antes, sem duplicar', async () => {
      const radar = makeEquipment({ type: 'radar', status: 'malfunction' });
      const camera = makeEquipment({ type: 'camera', status: 'stolen' });
      city.equipment.set([radar, makeEquipment({ type: 'radar', status: 'malfunction' }), camera]);
      city.agents.update((list) => list.filter((a) => a.neighborhood !== HOOD_A));
      const occ = TestBed.inject(OccurrenceService);
      const [collapse] = byKind('traffic_collapse');

      await predictor.apply(collapse);
      const abertas = occ.list();
      expect(abertas).toHaveLength(3);
      expect(abertas.find((o) => o.equipamentoId === radar.id)!.tipoAlerta).toBe('falha');
      expect(abertas.find((o) => o.equipamentoId === camera.id)!.tipoAlerta).toBe('furto');

      // Aplicar de novo não faz nada (já aplicada), e a lista continua igual.
      await predictor.apply(collapse);
      expect(occ.list()).toHaveLength(3);
    });

    it('um equipamento que cai depois deixa pendente só ele, sem desfazer o que já foi aplicado', async () => {
      const first = makeEquipment({ type: 'radar', status: 'malfunction' });
      city.equipment.set([first, makeEquipment({ type: 'radar', status: 'malfunction' })]);
      city.agents.update((list) => list.filter((a) => a.neighborhood !== HOOD_A));
      await predictor.apply(byKind('traffic_collapse')[0]);

      const late = makeEquipment({ type: 'camera', status: 'malfunction' });
      city.equipment.update((list) => [...list, late]);
      const [collapse] = byKind('traffic_collapse');
      expect(predictor.isApplied(collapse)).toBe(false);
      expect(predictor.pendingActions(collapse).find((a) => a.kind === 'maintenance')).toMatchObject({ equipmentIds: [late.id] });
    });

    it('um equipamento que voltou a operar e caiu de novo volta a pendente', async () => {
      const radar = makeEquipment({ type: 'radar', status: 'malfunction' });
      city.equipment.set([radar]);
      const [gap] = byKind('enforcement_gap');
      await predictor.apply(gap);
      expect(predictor.isApplied(byKind('enforcement_gap')[0])).toBe(true);

      city.equipment.update((list) => list.map((e) => ({ ...e, status: 'malfunction' as const })));
      expect(predictor.isApplied(byKind('enforcement_gap')[0])).toBe(false);
    });
  });

  it('colapso também sem fiscalização caída quando fluxo e déficit de efetivo alcançam o limiar', () => {
    const busiest = Object.entries(NEIGHBORHOOD_HISTORY).sort((a, b) => b[1].peakFlowVehiclesPerHour - a[1].peakFlowVehiclesPerHour)[0][0];
    city.agents.update((list) => list.filter((a) => a.neighborhood !== busiest));
    const collapse = byKind('traffic_collapse').find((p) => p.neighborhood === busiest)!;
    expect(collapse.riskScore).toBeGreaterThanOrEqual(55);
    expect(collapse.evidence[0]).toContain('Fiscalização completa');
    expect(byKind('staff_reinforcement').some((p) => p.neighborhood === busiest)).toBe(false);
  });

  it('horizonte do pico diz quantos dias faltam', () => {
    // 2026-10-27 é terça-feira.
    const tuesday = new Date(2026, 9, 27);
    expect(peakHorizon('sexta-feira, 18h', tuesday)).toBe('Próximo pico: sexta-feira, 18h (em 3 dias)');
    expect(peakHorizon('terça-feira, 7h', tuesday)).toContain('(hoje)');
    expect(peakHorizon('quarta-feira, 7h', tuesday)).toContain('(amanhã)');
  });
});
