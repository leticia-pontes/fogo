import { CITY_MAP } from '../data/city-map';
import { NEIGHBORHOODS } from '../data/mock-data';
import { Agent, Equipment } from '../models/fogo.models';
import { AGENT_COVERAGE_RADIUS_M, COVERAGE_CELL_M, COVERAGE_RADIUS_M } from './coverage-config';
import { CityState } from './state';

/**
 * Pontos cegos de cobertura. A cidade é dividida numa grade de células de COVERAGE_CELL_M;
 * uma célula está coberta quando o centro dela fica a até R metros (haversine) de pelo
 * menos um equipamento OPERACIONAL (R por tipo) ou de um agente em serviço.
 */

export interface CoverageCell {
  /** "linha:coluna" na grade (estável entre cálculos, permite comparar antes × depois). */
  id: string;
  lat: number;
  lng: number;
  neighborhood: string;
  /** Polígono da célula (para desenhar no mapa). */
  bounds: [[number, number], [number, number]];
}

export interface CoverageResult {
  totalCells: number;
  coveredCells: number;
  coveragePct: number;
  byNeighborhood: Record<string, { cells: number; covered: number; pct: number }>;
  blindSpots: CoverageCell[];
}

const EARTH_RADIUS_M = 6_371_000;

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export function pointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Grade fixa da cidade: só células cujo centro cai dentro de algum bairro. Calculada uma vez. */
let gridCache: CoverageCell[] | null = null;

export function coverageGrid(): CoverageCell[] {
  if (gridCache) return gridCache;
  const lats = CITY_MAP.outline.map((p) => p[0]);
  const lngs = CITY_MAP.outline.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const minLng = Math.min(...lngs);
  const dLat = COVERAGE_CELL_M / 110_570;
  const dLng = COVERAGE_CELL_M / (111_320 * Math.cos((minLat * Math.PI) / 180));
  const rows = Math.ceil((Math.max(...lats) - minLat) / dLat);
  const cols = Math.ceil((Math.max(...lngs) - minLng) / dLng);

  const cells: CoverageCell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lat = minLat + (r + 0.5) * dLat;
      const lng = minLng + (c + 0.5) * dLng;
      const hood = NEIGHBORHOODS.find((n) => pointInPolygon(lat, lng, n.polygon));
      if (!hood) continue;
      cells.push({
        id: `${r}:${c}`,
        lat,
        lng,
        neighborhood: hood.name,
        bounds: [
          [minLat + r * dLat, minLng + c * dLng],
          [minLat + (r + 1) * dLat, minLng + (c + 1) * dLng],
        ],
      });
    }
  }
  gridCache = cells;
  return cells;
}

/** Fontes de cobertura ativas: equipamentos operacionais com raio > 0 e agentes em serviço. */
export function coverageSources(equipment: Equipment[], agents: Agent[]): { lat: number; lng: number; radius: number }[] {
  return [
    ...equipment
      .filter((e) => e.status === 'operational' && COVERAGE_RADIUS_M[e.type] > 0)
      .map((e) => ({ lat: e.location.lat, lng: e.location.lng, radius: COVERAGE_RADIUS_M[e.type] })),
    ...agents.filter((a) => a.status !== 'off_duty').map((a) => ({ lat: a.lat, lng: a.lng, radius: AGENT_COVERAGE_RADIUS_M })),
  ];
}

export function calcularCobertura(state: Pick<CityState, 'equipment' | 'agents'>): CoverageResult {
  const sources = coverageSources(state.equipment, state.agents);
  const byNeighborhood: CoverageResult['byNeighborhood'] = {};
  for (const n of NEIGHBORHOODS) byNeighborhood[n.name] = { cells: 0, covered: 0, pct: 0 };

  const blindSpots: CoverageCell[] = [];
  const grid = coverageGrid();
  for (const cell of grid) {
    const stats = byNeighborhood[cell.neighborhood];
    stats.cells++;
    // Pré-filtro barato por caixa (1° de latitude ≈ 111 km) antes do haversine.
    const covered = sources.some(
      (s) =>
        Math.abs(s.lat - cell.lat) * 111_000 <= s.radius &&
        Math.abs(s.lng - cell.lng) * 103_000 <= s.radius &&
        haversineM(s.lat, s.lng, cell.lat, cell.lng) <= s.radius
    );
    if (covered) stats.covered++;
    else blindSpots.push(cell);
  }
  for (const stats of Object.values(byNeighborhood)) stats.pct = stats.cells ? Math.round((stats.covered / stats.cells) * 100) : 0;

  const covered = grid.length - blindSpots.length;
  return {
    totalCells: grid.length,
    coveredCells: covered,
    coveragePct: grid.length ? Math.round((covered / grid.length) * 1000) / 10 : 0,
    byNeighborhood,
    blindSpots,
  };
}
