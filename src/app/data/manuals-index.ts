import { TrechoManual } from '../core/manuals';
import manuais from './manuais.json';

/** Trechos dos manuais fictícios (gerados de `manuais/` por `npm run gerar-manuais`), embutidos no painel e na API. */
export const MANUAIS: readonly TrechoManual[] = manuais as TrechoManual[];
