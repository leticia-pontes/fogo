import type { TrechoManual } from '../src/app/core/manuals';

export const MANUAIS_DIR: string;
export const MANUAIS_JSON: string;
export function parseManual(fonte: string, markdown: string): TrechoManual[];
export function gerarIndice(dir?: string): TrechoManual[];
