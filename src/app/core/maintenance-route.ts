import { CITY_CENTER, distanciasPelasVias, trajetoPelasVias } from '../data/city-map';
import { daysFromToday } from '../data/mock-data';
import { STATUS_LABELS, TYPE_LABELS } from '../models/equipment-schema';
import { Equipment, EquipmentStatus, EquipmentType } from '../models/fogo.models';
import { UPCOMING_MAINTENANCE_DAYS, daysUntil } from './indicators';
import { CityState } from './state';

/**
 * Rota de manutenção. Seleciona o que precisa de equipe técnica e ordena as paradas pelo
 * vizinho mais próximo ponderado pela criticidade:
 *
 *   próxima parada = menor (distância até ela ÷ peso da criticidade)
 *   pesos: imediata 6 · vencida/em manutenção 2,5 · próxima (até 7 dias) 1
 *
 * Regra extra: enquanto houver imediata pendente, só imediatas são elegíveis. Assim um item
 * crítico nunca fica para o fim só por estar longe; entre as imediatas (e depois entre vencidas
 * e próximas) vale o vizinho mais próximo ponderado. Distâncias pelas vias (caminho mais curto na
 * rede viária, `distanciasPelasVias`), e o traçado sai em `trajeto` para o mapa.
 */
export type Criticidade = 'imediata' | 'vencida' | 'proxima';

export const ROUTE_WEIGHTS: Record<Criticidade, number> = { imediata: 6, vencida: 2.5, proxima: 1 };
export const ROUTE_DEFAULTS = {
  limite: 10,
  /** Velocidade média da equipe no trânsito urbano. */
  velocidadeKmh: 25,
  /** Tempo fixo de atendimento em cada parada. */
  minutosPorParada: 20,
};
/** Base da equipe de manutenção (ponto de partida padrão). */
export const MAINTENANCE_BASE = { nome: 'Base de manutenção (SEMOB)', lat: CITY_CENTER[0], lng: CITY_CENTER[1] };

export interface RouteOptions {
  origem?: { nome: string; lat: number; lng: number };
  limite?: number;
  apenasCriticos?: boolean;
  bairro?: string;
  tipo?: EquipmentType;
  velocidadeKmh?: number;
  minutosPorParada?: number;
  hoje?: string;
}

export interface RouteStop {
  ordem: number;
  equipamentoId: string;
  numeroSerie: string;
  tipo: EquipmentType;
  bairro: string;
  situacao: EquipmentStatus;
  lat: number;
  lng: number;
  criticidade: Criticidade;
  motivo: string;
  /** Justificativa da posição na rota. */
  prioridade: string;
  trechoKm: number;
  acumuladoKm: number;
}

export interface MaintenanceRoute {
  origem: { nome: string; lat: number; lng: number };
  paradas: RouteStop[];
  distanciaTotalKm: number;
  tempoEstimadoMin: number;
  velocidadeKmh: number;
  minutosPorParada: number;
  /** Caminho pelas vias da base até a última parada ([lat, lng]), para desenhar no mapa. */
  trajeto: [number, number][];
  /** Itens que pediam atenção mas ficaram de fora (limite, furtados…). */
  foraDaRota: { numeroSerie: string; motivo: string }[];
  observacao: string;
}

function classify(e: Equipment, hoje: string): { criticidade: Criticidade; motivo: string } | null {
  if (e.status === 'stolen' || e.status === 'deactivated' || e.status === 'not_installed') return null;
  if (e.status === 'malfunction') return { criticidade: 'imediata', motivo: 'Falha grave em operação' };
  if (e.maintenance.priority === 'immediate') return { criticidade: 'imediata', motivo: 'Manutenção imediata pendente' };
  const days = e.maintenance.nextDate ? daysUntil(e.maintenance.nextDate, hoje) : null;
  if (days !== null && days < 0) return { criticidade: 'vencida', motivo: `Preventiva vencida há ${-days} dia(s)` };
  if (e.status === 'maintenance') return { criticidade: 'vencida', motivo: 'Em manutenção (concluir atendimento)' };
  if (days !== null && days <= UPCOMING_MAINTENANCE_DAYS) {
    return { criticidade: 'proxima', motivo: days === 0 ? 'Preventiva vence hoje' : `Preventiva vence em ${days} dia(s)` };
  }
  return null;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const km = (value: number) => `${round1(value).toLocaleString('pt-BR')} km`;

export function gerarRotaManutencao(state: CityState, opts: RouteOptions = {}): MaintenanceRoute {
  const hoje = opts.hoje ?? daysFromToday(0);
  const origem = opts.origem ?? MAINTENANCE_BASE;
  const limite = opts.limite ?? ROUTE_DEFAULTS.limite;
  const velocidadeKmh = opts.velocidadeKmh ?? ROUTE_DEFAULTS.velocidadeKmh;
  const minutosPorParada = opts.minutosPorParada ?? ROUTE_DEFAULTS.minutosPorParada;

  const foraDaRota: MaintenanceRoute['foraDaRota'] = [];
  const pending = state.equipment
    .filter((e) => (!opts.bairro || e.location.neighborhood === opts.bairro) && (!opts.tipo || e.type === opts.tipo))
    .flatMap((e) => {
      if (e.status === 'stolen') {
        foraDaRota.push({ numeroSerie: e.serialNumber, motivo: 'Furtado: exige reposição, não manutenção' });
        return [];
      }
      const c = classify(e, hoje);
      if (!c || (opts.apenasCriticos && c.criticidade === 'proxima')) return [];
      return [{ e, ...c }];
    });

  const paradas: RouteStop[] = [];
  let here = { lat: origem.lat, lng: origem.lng };
  let total = 0;
  const remaining = [...pending];
  while (remaining.length && paradas.length < limite) {
    const kms = distanciasPelasVias(here, remaining.map((r) => r.e.location));
    const all = remaining.map((r, i) => ({ r, km: kms[i], cost: kms[i] / ROUTE_WEIGHTS[r.criticidade] }));
    const urgentLeft = all.some((x) => x.r.criticidade === 'imediata');
    const scored = all
      .filter((x) => !urgentLeft || x.r.criticidade === 'imediata')
      .sort((a, b) => a.cost - b.cost || a.r.e.id.localeCompare(b.r.e.id));
    const best = scored[0];
    // Mais próxima entre TODAS as pendentes: mostra quando a criticidade furou a fila.
    const nearest = [...all].sort((a, b) => a.km - b.km)[0];
    remaining.splice(remaining.indexOf(best.r), 1);
    total += round1(best.km);

    const prioridade =
      best.r.criticidade === 'imediata'
        ? best === nearest
          ? 'Crítica e a mais próxima da posição atual'
          : `Crítica: atendida antes de paradas mais próximas (${km(nearest.km)}) de menor criticidade`
        : best === nearest
          ? 'A mais próxima da posição atual'
          : `Melhor relação distância ÷ criticidade (peso ${ROUTE_WEIGHTS[best.r.criticidade]}×)`;
    paradas.push({
      ordem: paradas.length + 1,
      equipamentoId: best.r.e.id,
      numeroSerie: best.r.e.serialNumber,
      tipo: best.r.e.type,
      bairro: best.r.e.location.neighborhood,
      situacao: best.r.e.status,
      lat: best.r.e.location.lat,
      lng: best.r.e.location.lng,
      criticidade: best.r.criticidade,
      motivo: best.r.motivo,
      prioridade,
      trechoKm: round1(best.km),
      acumuladoKm: round1(total),
    });
    here = { lat: best.r.e.location.lat, lng: best.r.e.location.lng };
  }
  for (const r of remaining) foraDaRota.push({ numeroSerie: r.e.serialNumber, motivo: `Além do limite de ${limite} paradas (${r.criticidade})` });

  const distanciaTotalKm = round1(total);
  const trajeto: [number, number][] = [];
  let de = { lat: origem.lat, lng: origem.lng };
  for (const p of paradas) {
    const { caminho } = trajetoPelasVias(de, p);
    trajeto.push(...(trajeto.length ? caminho.slice(1) : caminho));
    de = p;
  }
  return {
    origem,
    paradas,
    trajeto,
    distanciaTotalKm,
    tempoEstimadoMin: Math.round((distanciaTotalKm / velocidadeKmh) * 60 + paradas.length * minutosPorParada),
    velocidadeKmh,
    minutosPorParada,
    foraDaRota,
    observacao: `Estimativa: caminho mais curto pelas vias do mapa, ${velocidadeKmh} km/h de média e ${minutosPorParada} min por atendimento (sem trânsito, semáforos nem mão de direção).`,
  };
}

/** Texto curto de uma parada (usado no boletim e nas recomendações). */
export function describeStop(p: RouteStop): string {
  return `${p.numeroSerie} (${TYPE_LABELS[p.tipo].toLowerCase()}, ${p.bairro}): ${p.motivo.toLowerCase()} · ${STATUS_LABELS[p.situacao].toLowerCase()}`;
}
