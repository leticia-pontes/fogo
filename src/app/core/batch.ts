import { Equipment } from '../models/fogo.models';

/** Em falha para fins de lote: mau funcionamento, em manutenção ou manutenção imediata (furto não conta). */
export function emFalha(e: Equipment): boolean {
  if (e.status === 'not_installed' || e.status === 'deactivated' || e.status === 'stolen') return false;
  return e.status === 'malfunction' || e.status === 'maintenance' || e.maintenance.priority === 'immediate';
}

export interface Lote {
  /** "Marca Modelo" */
  lote: string;
  marca: string;
  modelo: string;
  unidades: Equipment[];
  emFalha: Equipment[];
  /** Fração das unidades do lote em falha. */
  taxa: number;
  /** Fração em falha na frota instalada inteira (base de comparação). */
  taxaFrota: number;
}

/**
 * Agrupa a frota instalada por fabricante + modelo e mede a taxa de falha de cada lote.
 * Usado pela previsão de falha em lote (Parte 3) e pelo padrão LOTE da investigação.
 */
export function analisarLotes(equipment: readonly Equipment[]): Lote[] {
  const installed = equipment.filter((e) => e.status !== 'not_installed' && e.status !== 'deactivated');
  const taxaFrota = installed.length ? installed.filter(emFalha).length / installed.length : 0;
  const groups = new Map<string, Equipment[]>();
  for (const e of installed) {
    const key = `${e.brand} ${e.model}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return [...groups].map(([lote, unidades]) => {
    const falhas = unidades.filter(emFalha);
    return { lote, marca: unidades[0].brand, modelo: unidades[0].model, unidades, emFalha: falhas, taxa: falhas.length / unidades.length, taxaFrota };
  });
}
