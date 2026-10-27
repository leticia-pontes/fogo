/**
 * Geometria da cidade fictícia "Nova Prometeia".
 *
 * Tudo é desenhado num plano local em quilômetros (x = leste, y = norte) e convertido para
 * lat/lng no fim, para que equipamentos e agentes tenham coordenadas geográficas reais.
 * Bairros são células de Voronoi recortadas pelo contorno da cidade e "entortadas" por um
 * campo de deformação contínuo, o que mantém as divisas compartilhadas e com aspecto orgânico.
 */

export type LatLng = [number, number];
type Km = [number, number];

export const CITY_NAME = 'Nova Prometeia';
export const CITY_UF = `${CITY_NAME}/SP`;

const LAT0 = -22.35;
const LNG0 = -47.85;
const KM_PER_DEG_LAT = 110.57;
const KM_PER_DEG_LNG = 111.32 * Math.cos((LAT0 * Math.PI) / 180);

export function toLatLng([x, y]: Km): LatLng {
  return [Number((LAT0 + y / KM_PER_DEG_LAT).toFixed(6)), Number((LNG0 + x / KM_PER_DEG_LNG).toFixed(6))];
}

export const CITY_CENTER: LatLng = toLatLng([0, 0.2]);

// -----------------------------------------------------------------------------
// Utilitários geométricos
// -----------------------------------------------------------------------------

/** Spline Catmull-Rom: transforma poucos pontos de controle em uma curva suave. */
function smooth(points: Km[], closed = false, steps = 12): Km[] {
  const n = points.length;
  const at = (i: number): Km => (closed ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))]);
  const out: Km[] = [];
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const coord = (k: 0 | 1) =>
        0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([coord(0), coord(1)]);
    }
  }
  if (!closed) out.push(points[n - 1]);
  return out;
}

/** Campo de deformação suave: pontos iguais sempre vão para o mesmo lugar. */
function warp([x, y]: Km): Km {
  return [x + 0.11 * Math.sin(2.3 * y + 0.4 * x + 1.1), y + 0.11 * Math.sin(2.1 * x - 0.6 * y + 0.3)];
}

function densify(poly: Km[], step = 0.1): Km[] {
  const out: Km[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let s = 0; s < n; s++) out.push([a[0] + ((b[0] - a[0]) * s) / n, a[1] + ((b[1] - a[1]) * s) / n]);
  }
  return out;
}

/** Recorta o polígono mantendo o lado do semiplano mais próximo de `c` do que de `o`. */
function clipCloserTo(poly: Km[], c: Km, o: Km): Km[] {
  const m: Km = [(c[0] + o[0]) / 2, (c[1] + o[1]) / 2];
  const f = (p: Km) => (p[0] - m[0]) * (o[0] - c[0]) + (p[1] - m[1]) * (o[1] - c[1]);
  const out: Km[] = [];
  for (let i = 0; i < poly.length; i++) {
    const prev = poly[(i - 1 + poly.length) % poly.length];
    const cur = poly[i];
    const fp = f(prev);
    const fc = f(cur);
    const cross = (): Km => {
      const t = fp / (fp - fc);
      return [prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])];
    };
    if (fc <= 0) {
      if (fp > 0) out.push(cross());
      out.push(cur);
    } else if (fp <= 0) {
      out.push(cross());
    }
  }
  return out;
}

function insidePolygon([x, y]: Km, poly: Km[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function ellipse([cx, cy]: Km, rx: number, ry: number, wobble: number, seed: number): Km[] {
  return Array.from({ length: 40 }, (_, i) => {
    const a = (i / 40) * Math.PI * 2;
    const r = 1 + wobble * Math.sin(3 * a + seed) + wobble * 0.6 * Math.sin(5 * a + seed * 2);
    return [cx + rx * r * Math.cos(a), cy + ry * r * Math.sin(a)] as Km;
  });
}

// -----------------------------------------------------------------------------
// Contorno e bairros
// -----------------------------------------------------------------------------

const OUTLINE: Km[] = Array.from({ length: 96 }, (_, i) => {
  const a = (i / 96) * Math.PI * 2;
  const r = 3.1 + 0.35 * Math.sin(3 * a + 0.6) + 0.2 * Math.sin(5 * a + 1.9) + 0.1 * Math.sin(9 * a);
  return [r * Math.cos(a) * 1.12, r * Math.sin(a) * 0.95] as Km;
});

interface DistrictSeed {
  name: string;
  zone: string;
  center: Km;
  cepPrefix: string;
  streets: [string, string];
  references: string[];
}

const DISTRICT_SEEDS: DistrictSeed[] = [
  {
    name: 'Orla do Rio',
    zone: 'Zona Leste',
    center: [1.9, -0.5],
    cepPrefix: '13901',
    streets: ['Rua dos Pescadores', 'Rua da Ribeira'],
    references: ['Em frente ao Cais da Brasa', 'Oposto ao nº 181', 'Próximo à Ponte Velha', 'Esquina com a Rua das Garças'],
  },
  {
    name: 'Vila Esperança',
    zone: 'Zona Sul',
    center: [0.2, -2.0],
    cepPrefix: '13904',
    streets: ['Rua São Jorge', 'Rua das Acácias'],
    references: ['Em frente à Escola Estadual', 'Nº 412', 'S/N', 'Ao lado da Praça da Matriz', 'Oposto ao Mercado Esperança'],
  },
  {
    name: 'Centro Histórico',
    zone: 'Centro',
    center: [0.15, 0.25],
    cepPrefix: '13900',
    streets: ['Rua do Comércio', 'Rua das Flores'],
    references: ['Praça da Fundação', 'Em frente à Prefeitura', 'Oposto ao nº 181', 'Esquina com a Rua do Teatro'],
  },
  {
    name: 'Entroncamento',
    zone: 'Centro',
    center: [-1.45, 0.85],
    cepPrefix: '13902',
    streets: ['Rua dos Ferroviários', 'Travessa da Estação'],
    references: ['Rotatória das Palmeiras', 'Em frente à Estação Ferroviária', 'Viaduto do Entroncamento', 'Nº 920'],
  },
  {
    name: 'Jardim Aurora',
    zone: 'Zona Norte',
    center: [-0.1, 2.25],
    cepPrefix: '13905',
    streets: ['Alameda dos Ipês', 'Rua do Mirante'],
    references: ['Portão do Parque do Lago', 'Em frente à Feira do Sábado', 'Oposto ao nº 77', 'S/N', 'Mirante da Aurora'],
  },
  {
    name: 'Cidade Universitária',
    zone: 'Zona Oeste',
    center: [-2.3, -0.9],
    cepPrefix: '13903',
    streets: ['Rua do Campus', 'Rua da Biblioteca'],
    references: ['Portão principal da Universidade', 'Terminal de Ônibus Oeste', 'Em frente ao Hospital Escola', 'Nº 1500'],
  },
];

const DISTRICT_POLYGONS_KM: Km[][] = DISTRICT_SEEDS.map((seed) => {
  let cell = OUTLINE;
  for (const other of DISTRICT_SEEDS) {
    if (other !== seed) cell = clipCloserTo(cell, seed.center, other.center);
  }
  return densify(cell).map(warp);
});

const CITY_OUTLINE_KM: Km[] = densify(OUTLINE).map(warp);

// -----------------------------------------------------------------------------
// Rio, áreas verdes e vias
// -----------------------------------------------------------------------------

const RIVER_KM = smooth([
  [-4.2, 2.9], [-2.9, 2.5], [-2.0, 1.75], [-0.8, 1.45], [0.6, 1.25], [1.15, 0.55],
  [0.95, -0.3], [1.55, -1.1], [2.5, -1.9], [3.4, -2.3], [4.5, -3.1],
]);

const LAKE_KM = ellipse([-0.55, 2.75], 0.38, 0.24, 0.08, 1.2);

export type RoadKind = 'highway' | 'avenue' | 'street';

interface RoadSeed {
  name: string;
  kind: RoadKind;
  points: Km[];
  closed?: boolean;
}

const ROAD_SEEDS: RoadSeed[] = [
  {
    name: 'Avenida do Contorno',
    kind: 'avenue',
    closed: true,
    points: Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      const r = 2.25 + 0.25 * Math.sin(3 * a + 0.4);
      return [r * Math.cos(a) * 1.1, r * Math.sin(a) * 0.92 + 0.05] as Km;
    }),
  },
  { name: 'Avenida Prometeu', kind: 'avenue', points: [[-3.6, -1.3], [-2.3, -0.95], [-1.0, -0.15], [0.15, 0.25], [1.2, -0.25], [1.9, -0.5], [3.5, -0.35]] },
  { name: 'Avenida das Palmeiras', kind: 'avenue', points: [[-2.9, 3.0], [-2.1, 1.7], [-1.45, 0.85], [-0.5, 0.45], [0.15, 0.25], [0.35, -0.9], [0.2, -2.0], [0.05, -3.3]] },
  { name: 'Rua da Aurora', kind: 'avenue', points: [[0.9, 3.3], [0.35, 2.6], [-0.1, 2.0], [-0.75, 1.3], [-1.45, 0.85], [-2.5, 0.45], [-3.6, 0.6]] },
  { name: 'Estrada da Serra', kind: 'avenue', points: [[1.6, 3.0], [1.75, 1.7], [1.9, 0.6], [1.9, -0.5], [1.45, -1.55], [0.2, -2.0]] },
  { name: 'Rodovia do Fogo', kind: 'highway', points: [[-4.4, -2.0], [-2.6, -2.35], [-1.0, -2.85], [0.6, -3.05], [2.2, -2.75], [4.4, -2.2]] },
];

/** Duas ruas curtas e curvas por bairro, recortadas para ficar dentro dele. */
function districtStreets(seed: DistrictSeed, polygon: Km[], index: number): RoadSeed[] {
  return seed.streets.map((name, k) => {
    const radius = k === 0 ? 0.42 : 0.78;
    const start = index * 1.3 + k * 2.2;
    const arc = Array.from({ length: 40 }, (_, i) => {
      const a = start + (i / 39) * Math.PI * 1.1;
      const r = radius * (1 + 0.12 * Math.sin(3 * a));
      return [seed.center[0] + r * Math.cos(a), seed.center[1] + r * Math.sin(a)] as Km;
    });
    // Mantém o trecho contínuo mais longo dentro do bairro.
    let best: Km[] = [];
    let run: Km[] = [];
    for (const p of arc) {
      if (insidePolygon(p, polygon)) run.push(p);
      else run = [];
      if (run.length > best.length) best = [...run];
    }
    return { name, kind: 'street', points: best };
  });
}

interface RoadGeometry {
  name: string;
  kind: RoadKind;
  km: Km[];
}

const ROADS_KM: RoadGeometry[] = [
  ...ROAD_SEEDS.map((r) => ({ name: r.name, kind: r.kind, km: smooth(r.points, r.closed) })),
  ...DISTRICT_SEEDS.flatMap((seed, i) =>
    districtStreets(seed, DISTRICT_POLYGONS_KM[i], i)
      .filter((r) => r.points.length >= 6)
      .map((r) => ({ name: r.name, kind: r.kind, km: r.points }))
  ),
];

// -----------------------------------------------------------------------------
// Pontos ao longo das vias (onde ficam equipamentos e agentes)
// -----------------------------------------------------------------------------

export interface RoadSpot {
  lat: number;
  lng: number;
  street: string;
  /** Quilometragem para rodovias (ex.: "KM 14"). */
  kmMarker?: string;
}

function sampleRoad(road: RoadGeometry, step = 0.07): { p: Km; dist: number }[] {
  const samples: { p: Km; dist: number }[] = [];
  let dist = 0;
  let carry = 0;
  for (let i = 1; i < road.km.length; i++) {
    const a = road.km[i - 1];
    const b = road.km[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = carry;
    while (t <= len) {
      samples.push({ p: [a[0] + ((b[0] - a[0]) * t) / len, a[1] + ((b[1] - a[1]) * t) / len], dist: dist + t });
      t += step;
    }
    carry = t - len;
    dist += len;
  }
  return samples;
}

/** Escolhe `count` pontos bem espaçados sobre as vias de um bairro (determinístico). */
function spotsForDistrict(index: number, count: number): RoadSpot[] {
  const polygon = DISTRICT_POLYGONS_KM[index];
  const candidates = ROADS_KM.flatMap((road) =>
    sampleRoad(road)
      .filter((s) => insidePolygon(s.p, polygon))
      .map((s) => ({ ...s, road }))
  );
  // Embaralhamento determinístico para alternar entre vias diferentes.
  const ordered = candidates
    .map((c, i) => ({ c, key: Math.sin(i * 12.9898 + index * 78.233) }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.c);

  const picked: typeof ordered = [];
  for (const minGap of [0.32, 0.22, 0.14, 0.07, 0]) {
    for (const c of ordered) {
      if (picked.length >= count) break;
      if (picked.includes(c)) continue;
      if (picked.every((p) => Math.hypot(p.p[0] - c.p[0], p.p[1] - c.p[1]) >= minGap)) picked.push(c);
    }
    if (picked.length >= count) break;
  }

  return picked.map((c) => {
    const [lat, lng] = toLatLng(c.p);
    return {
      lat,
      lng,
      street: c.road.name,
      kmMarker: c.road.kind === 'highway' ? `KM ${Math.round(8 + c.dist)}` : undefined,
    };
  });
}

// -----------------------------------------------------------------------------
// Exportações em lat/lng
// -----------------------------------------------------------------------------

export interface District {
  name: string;
  zone: string;
  lat: number;
  lng: number;
  cepPrefix: string;
  streets: string[];
  references: string[];
  polygon: LatLng[];
}

export const DISTRICTS: District[] = DISTRICT_SEEDS.map((seed, i) => {
  const [lat, lng] = toLatLng(seed.center);
  const polygon = DISTRICT_POLYGONS_KM[i];
  const streets = [
    ...new Set(ROADS_KM.filter((r) => r.km.some((p) => insidePolygon(p, polygon))).map((r) => r.name)),
  ];
  return {
    name: seed.name,
    zone: seed.zone,
    lat,
    lng,
    cepPrefix: seed.cepPrefix,
    streets,
    references: seed.references,
    polygon: polygon.map(toLatLng),
  };
});

/** Vias, rio e áreas verdes para desenhar o mapa base. */
export const CITY_MAP = {
  outline: CITY_OUTLINE_KM.map(toLatLng),
  river: { name: 'Rio Brasa', path: RIVER_KM.map(toLatLng) },
  lake: { name: 'Lago da Aurora', polygon: LAKE_KM.map(toLatLng) },
  parks: [
    { name: 'Parque do Lago', polygon: ellipse([-0.5, 2.72], 0.62, 0.42, 0.1, 0.4).map(toLatLng) },
    { name: 'Bosque da Universidade', polygon: ellipse([-2.75, -1.55], 0.45, 0.32, 0.14, 2.3).map(toLatLng) },
  ],
  roads: ROADS_KM.map((r) => ({ name: r.name, kind: r.kind, path: r.km.map(toLatLng) })),
};

const SPOT_CACHE = new Map<number, RoadSpot[]>();

/** Posições sobre as vias de um bairro; as mesmas a cada chamada. */
export function districtSpots(districtIndex: number, count: number): RoadSpot[] {
  const cached = SPOT_CACHE.get(districtIndex);
  if (cached && cached.length >= count) return cached.slice(0, count);
  const spots = spotsForDistrict(districtIndex, count);
  SPOT_CACHE.set(districtIndex, spots);
  return spots;
}

export interface RoadPick extends RoadSpot {
  neighborhood: string;
  cepPrefix: string;
}

/**
 * Ponto da via mais próxima de (lat, lng), dentro de `maxKm`, já com bairro e quilometragem.
 * Usado ao clicar no mapa para cadastrar um equipamento ali. Fora da cidade ou longe de vias: null.
 */
export function pointOnRoad(lat: number, lng: number, maxKm = 0.08): RoadPick | null {
  const q: Km = [(lng - LNG0) * KM_PER_DEG_LNG, (lat - LAT0) * KM_PER_DEG_LAT];
  let best: { p: Km; d: number; road: RoadGeometry; dist: number } | null = null;
  for (const road of ROADS_KM) {
    let dist = 0;
    for (let i = 1; i < road.km.length; i++) {
      const a = road.km[i - 1];
      const b = road.km[i];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const t = len ? Math.max(0, Math.min(1, ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / len ** 2)) : 0;
      const p: Km = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (!best || d < best.d) best = { p, d, road, dist: dist + t * len };
      dist += len;
    }
  }
  if (!best || best.d > maxKm) return null;
  const { p, road, dist } = best;
  const index = DISTRICT_POLYGONS_KM.findIndex((poly) => insidePolygon(p, poly));
  if (index < 0) return null;
  const [pLat, pLng] = toLatLng(p);
  return {
    lat: pLat,
    lng: pLng,
    street: road.name,
    kmMarker: road.kind === 'highway' ? `KM ${Math.round(8 + dist)}` : undefined,
    neighborhood: DISTRICT_SEEDS[index].name,
    cepPrefix: DISTRICT_SEEDS[index].cepPrefix,
  };
}

// -----------------------------------------------------------------------------
// Trechos de via por bairro (deslocamento da telemetria e teste de carga)
// -----------------------------------------------------------------------------

export interface Lane {
  street: string;
  points: LatLng[];
}

const LANE_CACHE = new Map<number, Lane[]>();

/** Trechos contínuos de cada via dentro do bairro, amostrados a cada ~35 m. */
export function districtLanes(districtIndex: number): Lane[] {
  const cached = LANE_CACHE.get(districtIndex);
  if (cached) return cached;
  const polygon = DISTRICT_POLYGONS_KM[districtIndex];
  const lanes: Lane[] = [];
  for (const road of ROADS_KM) {
    let run: LatLng[] = [];
    for (const s of sampleRoad(road, 0.035)) {
      if (insidePolygon(s.p, polygon)) {
        run.push(toLatLng(s.p));
        continue;
      }
      if (run.length > 1) lanes.push({ street: road.name, points: run });
      run = [];
    }
    if (run.length > 1) lanes.push({ street: road.name, points: run });
  }
  LANE_CACHE.set(districtIndex, lanes);
  return lanes;
}

/**
 * Avança `steps` amostras sobre a via mais próxima do ponto, no sentido `heading`.
 * Ao chegar ao fim do trecho, inverte o sentido (o veículo faz o retorno).
 */
export function stepAlongRoad(
  districtIndex: number,
  lat: number,
  lng: number,
  heading: 1 | -1,
  steps = 1
): { lat: number; lng: number; street: string; heading: 1 | -1 } | null {
  let best: { lane: Lane; index: number; d: number } | null = null;
  for (const lane of districtLanes(districtIndex)) {
    lane.points.forEach(([pLat, pLng], index) => {
      const d = (pLat - lat) ** 2 + ((pLng - lng) * KM_PER_DEG_LNG / KM_PER_DEG_LAT) ** 2;
      if (!best || d < best.d) best = { lane, index, d };
    });
  }
  if (!best) return null;
  const { lane, index } = best as { lane: Lane; index: number };
  let next = index + heading * steps;
  if (next < 0 || next >= lane.points.length) {
    heading = heading === 1 ? -1 : 1;
    next = Math.min(lane.points.length - 1, Math.max(0, index + heading * steps));
  }
  const [nLat, nLng] = lane.points[next];
  return { lat: nLat, lng: nLng, street: lane.street, heading };
}
