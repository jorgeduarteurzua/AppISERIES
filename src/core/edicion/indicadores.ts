import type { GruposAlternativos, IndicadorCond } from '../modelo/pantalla';

/** Texto legible de una lista de indicadores: "N30 99". */
export function formatearIndicadores(inds: IndicadorCond[]): string {
  return inds.map((i) => `${i.negado ? 'N' : ''}${String(i.numero).padStart(2, '0')}`).join(' ');
}

/**
 * Lee indicadores escritos por el usuario ("N30 99", "30, 99"). Devuelve null
 * si algún elemento no es un indicador válido (01-99, con N opcional).
 */
export function leerIndicadores(texto: string): IndicadorCond[] | null {
  const trozos = texto.split(/[\s,]+/).filter((t) => t.length > 0);
  const resultado: IndicadorCond[] = [];
  for (const t of trozos) {
    const m = /^(N)?(\d{1,2})$/i.exec(t);
    if (!m) return null;
    const numero = parseInt(m[2], 10);
    if (numero < 1 || numero > 99) return null;
    resultado.push({ numero, negado: m[1] !== undefined });
  }
  return resultado;
}

/** Condición completa: los indicadores de un grupo se unen con AND y los grupos entre sí con OR. */
export interface Condicion {
  indicadores: IndicadorCond[];
  alternativas?: GruposAlternativos;
}

/** Todos los grupos de una condición, el primero con las alternativas detrás. */
export function gruposDe(c: Condicion): IndicadorCond[][] {
  return [c.indicadores, ...(c.alternativas ?? [])];
}

/** Texto de una condición: "40 | 41" es 40 O 41; "N30 99 | 40" es (N30 Y 99) O 40. */
export function formatearCondicion(c: Condicion): string {
  return gruposDe(c).map(formatearIndicadores).join(' | ');
}

/** Lee una condición escrita con `|` entre alternativas. Devuelve null si algo no es válido. */
export function leerCondicion(texto: string): Condicion | null {
  const partes = texto.split('|');
  const grupos: IndicadorCond[][] = [];
  for (const parte of partes) {
    const inds = leerIndicadores(parte);
    if (inds === null) return null;
    grupos.push(inds);
  }
  // Un grupo vacío solo es válido si es la condición completa ("sin condición").
  if (grupos.length > 1 && grupos.some((g) => g.length === 0)) return null;
  const [primero, ...resto] = grupos;
  return resto.length > 0 ? { indicadores: primero, alternativas: resto } : { indicadores: primero };
}
