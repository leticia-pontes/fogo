import { CITY_MAP, DISTRICTS, districtLanes, pointOnRoad, stepAlongRoad } from './city-map';
import { MAX_STRESS_EQUIPMENT, buildStressEquipment } from './mock-data';

describe('vias e telemetria', () => {
  const onLane = (district: number, lat: number, lng: number) =>
    districtLanes(district).some((l) => l.points.some(([pLat, pLng]) => pLat === lat && pLng === lng));

  it('todo bairro tem trechos de via', () => {
    DISTRICTS.forEach((_, i) => expect(districtLanes(i).length).toBeGreaterThan(0));
  });

  it('desloca sempre para um ponto sobre a via do próprio bairro', () => {
    const d = DISTRICTS[2];
    let pos = { lat: d.lat, lng: d.lng, heading: 1 as 1 | -1 };
    for (let tick = 0; tick < 200; tick++) {
      const moved = stepAlongRoad(2, pos.lat, pos.lng, pos.heading, 2)!;
      expect(onLane(2, moved.lat, moved.lng)).toBe(true);
      pos = moved;
    }
  });

  it('inverte o sentido no fim do trecho', () => {
    const lane = districtLanes(0).find((l) => l.points.length > 3)!;
    const [lat, lng] = lane.points[lane.points.length - 1];
    const moved = stepAlongRoad(0, lat, lng, 1)!;
    expect(moved.heading).toBe(-1);
    expect([moved.lat, moved.lng]).toEqual(lane.points[lane.points.length - 2]);
  });
});

describe('teste de carga', () => {
  it('gera a mesma frota para o mesmo N, com séries únicas e sobre as vias', () => {
    const a = buildStressEquipment(500);
    expect(a).toEqual(buildStressEquipment(500));
    expect(new Set(a.map((e) => e.serialNumber)).size).toBe(500);
    const operational = a.filter((e) => e.status === 'operational').length / a.length;
    expect(operational).toBeGreaterThan(0.75);
    expect(operational).toBeLessThan(0.95);
  });

  it(`limita a ${MAX_STRESS_EQUIPMENT} equipamentos`, () => {
    expect(buildStressEquipment(MAX_STRESS_EQUIPMENT + 100)).toHaveLength(MAX_STRESS_EQUIPMENT);
  });
});

describe('clique na via', () => {
  it('encaixa o ponto na via mais próxima, com bairro e CEP do bairro', () => {
    const lane = districtLanes(1).find((l) => l.points.length > 10)!;
    const [lat, lng] = lane.points[5];
    const pick = pointOnRoad(lat + 0.0002, lng)!; // ~20 m fora do eixo
    expect(pick.street).toBe(lane.street);
    expect(pick.neighborhood).toBe(DISTRICTS[1].name);
    expect(pick.cepPrefix).toBe(DISTRICTS[1].cepPrefix);
    expect(Math.abs(pick.lat - lat)).toBeLessThan(0.0005);
  });

  it('rodovia traz a quilometragem como referência', () => {
    const highway = CITY_MAP.roads.find((r) => r.kind === 'highway')!;
    const [lat, lng] = highway.path[Math.floor(highway.path.length / 2)];
    const pick = pointOnRoad(lat, lng)!;
    expect(pick.street).toBe(highway.name);
    expect(pick.kmMarker).toMatch(/^KM \d+$/);
  });

  it('longe de qualquer via ou fora da cidade, não devolve ponto', () => {
    expect(pointOnRoad(-22.9, -47.1)).toBeNull();
  });
});
