import { TestBed } from '@angular/core/testing';
import { NEIGHBORHOOD_HISTORY, buildMockAgents, buildMockEquipment } from '../data/mock-data';
import { HOOD_A, HOOD_B, makeAgent, makeEquipment } from '../../testing/fixtures';
import { CityStateService, EMPTY_FILTERS } from './city-state.service';

describe('CityStateService', () => {
  let city: CityStateService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    city = TestBed.inject(CityStateService);
    city.agents.set([]);
  });

  describe('dados de exemplo', () => {
    it('carrega o seed quando não há estado salvo', () => {
      expect(city.equipment().length).toBe(buildMockEquipment().length);
    });

    it('gera o seed de forma determinística', () => {
      const strip = (list: { id: string }[]) => list.map(({ id, ...rest }) => rest);
      expect(strip(buildMockEquipment())).toEqual(strip(buildMockEquipment()));
      expect(strip(buildMockAgents())).toEqual(strip(buildMockAgents()));
    });
  });

  describe('KPIs', () => {
    it('calcula disponibilidade sobre os instalados, ignorando os não instalados', () => {
      city.equipment.set([
        makeEquipment({ status: 'operational' }),
        makeEquipment({ status: 'operational' }),
        makeEquipment({ status: 'operational' }),
        makeEquipment({ status: 'malfunction' }),
        makeEquipment({ status: 'not_installed' }),
      ]);
      city.agents.set([makeAgent(), makeAgent({ status: 'in_dispatch' }), makeAgent({ status: 'off_duty' })]);

      expect(city.kpis()).toMatchObject({
        total: 5,
        operational: 3,
        unavailable: 1,
        notInstalled: 1,
        availabilityPct: 75,
        activeAgents: 2,
        inDispatch: 1,
        totalAgents: 3,
      });
    });

    it('retorna 0% de disponibilidade sem equipamentos instalados', () => {
      city.equipment.set([makeEquipment({ status: 'not_installed' })]);
      expect(city.kpis().availabilityPct).toBe(0);
    });
  });

  describe('filtros', () => {
    beforeEach(() => {
      city.equipment.set([
        makeEquipment({ type: 'radar', status: 'stolen', neighborhood: HOOD_A }),
        makeEquipment({ type: 'camera', status: 'operational', neighborhood: HOOD_B }),
      ]);
      city.agents.set([makeAgent({ neighborhood: HOOD_A }), makeAgent({ neighborhood: HOOD_B })]);
    });

    it('aplica o mesmo recorte a KPIs, alertas e regiões', () => {
      city.filters.set({ ...EMPTY_FILTERS, neighborhood: HOOD_B });

      expect(city.kpis().total).toBe(1);
      expect(city.kpis().totalAgents).toBe(1);
      expect(city.alerts()).toEqual([]);
      expect(city.regions().map((r) => r.neighborhood)).toEqual([HOOD_B]);
    });

    it('tipo e situação filtram equipamentos, mas não agentes', () => {
      city.filters.set({ ...EMPTY_FILTERS, type: 'radar', status: 'stolen' });

      expect(city.filteredEquipment()).toHaveLength(1);
      expect(city.filteredAgents()).toHaveLength(2);
    });
  });

  describe('saúde por região', () => {
    const healthWith = (unavailable: number, total: number) => {
      city.equipment.set(
        Array.from({ length: total }, (_, i) => makeEquipment({ status: i < unavailable ? 'malfunction' : 'operational' }))
      );
      return city.regions().find((r) => r.neighborhood === HOOD_A)!.health;
    };

    it('usa os limiares de 15% e 30% de indisponibilidade', () => {
      expect(healthWith(1, 10)).toBe('normal');
      expect(healthWith(15, 100)).toBe('attention');
      expect(healthWith(29, 100)).toBe('attention');
      expect(healthWith(3, 10)).toBe('critical');
    });
  });

  describe('alertas', () => {
    const alertFor = (id: string) => city.alerts().find((a) => a.target.id === id);

    it('marca furto e mau funcionamento como críticos', () => {
      const stolen = makeEquipment({ status: 'stolen' });
      const broken = makeEquipment({ status: 'malfunction' });
      city.equipment.set([stolen, broken]);

      expect(alertFor(stolen.id)?.severity).toBe('critical');
      expect(alertFor(broken.id)?.severity).toBe('critical');
    });

    it('distingue manutenção vencida, próxima (até 7 dias) e distante', () => {
      const overdue = makeEquipment({ priority: 'scheduled', nextInDays: -2 });
      const soon = makeEquipment({ priority: 'scheduled', nextInDays: 7 });
      const later = makeEquipment({ priority: 'scheduled', nextInDays: 8 });
      city.equipment.set([overdue, soon, later]);

      expect(alertFor(overdue.id)).toMatchObject({ severity: 'high', title: expect.stringContaining('vencida há 2') });
      expect(alertFor(soon.id)).toMatchObject({ severity: 'warning', title: expect.stringContaining('em 7 dia') });
      expect(alertFor(later.id)).toBeUndefined();
    });

    it('ordena por severidade', () => {
      city.equipment.set([
        makeEquipment({ priority: 'scheduled', nextInDays: 1 }),
        makeEquipment({ status: 'stolen' }),
        makeEquipment({ priority: 'immediate' }),
      ]);
      expect(city.alerts().map((a) => a.severity)).toEqual(['critical', 'high', 'warning']);
    });

    it('alerta agente fora de turno quando o bairro está abaixo do efetivo de pico', () => {
      const required = NEIGHBORHOOD_HISTORY[HOOD_A].requiredAgentsAtPeak;
      const idle = makeAgent({ status: 'off_duty' });
      city.equipment.set([]);
      city.agents.set([idle, ...Array.from({ length: required - 1 }, () => makeAgent())]);

      expect(alertFor(idle.id)).toMatchObject({ severity: 'warning', target: { kind: 'agent', id: idle.id } });

      city.agents.update((list) => [...list, makeAgent()]);
      expect(alertFor(idle.id)).toBeUndefined();
    });
  });

  describe('CRUD e persistência', () => {
    it('cria, edita e remove equipamentos, registrando eventos', () => {
      const item = makeEquipment();
      city.equipment.set([]);

      city.upsertEquipment(item);
      city.upsertEquipment({ ...item, brand: 'Outra' });
      expect(city.equipment()).toEqual([{ ...item, brand: 'Outra' }]);

      city.deleteEquipment(item.id);
      expect(city.equipment()).toEqual([]);
      expect(city.events().map((e) => e.kind)).toEqual(['system', 'system', 'equipment_created']);
    });

    it('ao marcar falha ou furto, exige manutenção imediata; ao recuperar, limpa a prioridade', () => {
      const item = makeEquipment({ priority: 'none' });
      city.equipment.set([item]);

      city.setEquipmentStatus(item.id, 'stolen');
      expect(city.equipment()[0].maintenance.priority).toBe('immediate');

      city.setEquipmentStatus(item.id, 'operational');
      expect(city.equipment()[0].maintenance.priority).toBe('none');
    });

    it('persiste no localStorage e recarrega o estado salvo', () => {
      const item = makeEquipment();
      city.equipment.set([item]);
      TestBed.tick();

      TestBed.resetTestingModule();
      const reloaded = TestBed.inject(CityStateService);
      expect(reloaded.equipment()).toEqual([item]);
    });
  });
});
