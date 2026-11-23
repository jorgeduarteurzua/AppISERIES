/**
 * Formato de columnas de las líneas DDS, común a pantallas (DSPF) y archivos
 * (PF/LF). Posiciones (1-indexadas):
 *   1-5    números de secuencia (en blanco)
 *   6      'A'
 *   7      AND/OR/comentario (en blanco)
 *   8-16   indicadores condicionales: 3 grupos de [N][nn] (solo pantallas)
 *   17     marca: R registro, K llave, S selección, O omisión, J unión
 *   19-28  nombre del registro o del campo
 *   29     'R' si el campo se toma de un archivo de referencia (REFFLD)
 *   30-34  longitud (derecha)
 *   35     tipo de dato
 *   36-37  decimales (derecha)
 *   38     uso
 *   39-41  fila (pantallas)
 *   42-44  columna (pantallas)
 *   45-79  keywords o literal; col 80 = carácter de continuación
 *
 * Una línea lógica que no cabe en las columnas 45-79 se parte en trozos de 35
 * caracteres terminados en '-' (col 80). Con '-' la continuación empieza en la
 * col 45 de la línea siguiente y los espacios iniciales cuentan.
 */

import type { GruposAlternativos, IndicadorCond, Keyword } from '../modelo/pantalla';

/** Caracteres útiles por línea en la zona de keywords (cols 45-79). */
const TROZO = 35;
/** Máximo de caracteres de la zona si la línea no necesita continuación (cols 45-80). */
const ZONA_MAX = 36;
/** Indicadores que caben en una línea DDS. */
export const MAX_INDICADORES = 3;

export interface CabeceraDds {
  /** Indicadores (AND) de la línea; con `alternativas`, es el primer grupo de la condición. */
  inds: IndicadorCond[];
  /** Otros grupos de la condición (OR): cada uno es una línea `AO` antes de la definición. */
  alternativas?: GruposAlternativos;
  /** Letra de la columna 17: R, K, S, O o J. */
  marca?: string;
  nombre?: string;
  referencia?: boolean;
  longitud?: string;
  tipo?: string;
  decimales?: string;
  uso?: string;
  fila?: string;
  columna?: string;
}

/** Indicadores en las cols 8-16 (9 caracteres). */
function formatearIndicadores(inds: IndicadorCond[]): string {
  if (inds.length > MAX_INDICADORES) {
    throw new Error(
      `Una línea DDS admite como máximo ${MAX_INDICADORES} indicadores (hay ${inds.length}).`,
    );
  }
  const grupos = inds.map((i) => `${i.negado ? 'N' : ' '}${String(i.numero).padStart(2, '0')}`);
  return grupos.join('').padEnd(9);
}

/** Marca de la columna 7: 'O' si la línea es una alternativa (OR) de la anterior. */
const MARCA_OR = 'O';

type Condicion = Pick<CabeceraDds, 'inds' | 'alternativas'>;

/** Grupos de una condición: el primero con las alternativas detrás. */
function grupos(c: Condicion): IndicadorCond[][] {
  return [c.inds, ...(c.alternativas ?? [])];
}

/**
 * Líneas que solo llevan indicadores y van antes de la definición cuando la
 * condición tiene OR. La definición lleva el último grupo:
 *   A  40
 *   AO 41                       DSPATR(PR)
 */
export function previas(c: Condicion): string[] {
  return grupos(c)
    .slice(0, -1)
    .map((inds, i) => ('     A' + (i > 0 ? MARCA_OR : ' ') + formatearIndicadores(inds)).trimEnd());
}

/** Las 44 primeras columnas de la línea con la definición (lleva el último grupo de la condición). */
export function cabecera(c: CabeceraDds): string {
  const g = grupos(c);
  const ultimo = g[g.length - 1];
  const esOr = g.length > 1;
  const nombre = c.nombre ?? '';
  if (nombre.length > 10) {
    throw new Error(`El nombre "${nombre}" supera los 10 caracteres permitidos en DDS.`);
  }
  return (
    '     A' + // cols 1-6
    (esOr ? MARCA_OR : ' ') + // col 7
    formatearIndicadores(ultimo) + // cols 8-16
    (c.marca ?? ' ').padEnd(1) + // col 17
    ' ' + // col 18
    nombre.padEnd(10) + // cols 19-28
    (c.referencia ? 'R' : ' ') + // col 29
    (c.longitud ?? '').padStart(5) + // cols 30-34
    (c.tipo ?? ' ').padEnd(1) + // col 35
    (c.decimales ?? '').padStart(2) + // cols 36-37
    (c.uso ?? ' ').padEnd(1) + // col 38
    (c.fila ?? '').padStart(3) + // cols 39-41
    (c.columna ?? '').padStart(3) // cols 42-44
  );
}

/** Prefijo en blanco para las líneas de continuación (cols 1-44). */
const PREFIJO_CONTINUACION = '     A'.padEnd(44);

/**
 * Compone una línea lógica: cabecera + zona. Si la zona no cabe, la parte en
 * trozos con '-' en la col 80.
 */
export function lineasLogicas(cab: string, zona: string): string[] {
  if (zona.length === 0) return [cab.trimEnd()];
  if (zona.length <= ZONA_MAX) return [cab + zona];

  const lineas: string[] = [];
  let restante = zona;
  let primera = true;
  while (restante.length > ZONA_MAX) {
    const trozo = restante.slice(0, TROZO);
    lineas.push((primera ? cab : PREFIJO_CONTINUACION) + trozo + '-');
    restante = restante.slice(TROZO);
    primera = false;
  }
  lineas.push((primera ? cab : PREFIJO_CONTINUACION) + restante);
  return lineas;
}

export function textoKeyword(k: Keyword): string {
  return k.parametros.length > 0 ? `${k.nombre}(${k.parametros})` : k.nombre;
}

export function mismosIndicadores(a: IndicadorCond[], b: IndicadorCond[]): boolean {
  return (
    a.length === b.length &&
    a.every((x, i) => x.numero === b[i].numero && x.negado === b[i].negado)
  );
}

/** Dos condiciones iguales: mismo primer grupo y mismas alternativas. */
export function mismasCondiciones(a: Condicion, b: Condicion): boolean {
  const ga = grupos(a);
  const gb = grupos(b);
  return ga.length === gb.length && ga.every((g, i) => mismosIndicadores(g, gb[i]));
}

/** Líneas de una keyword suelta: sus líneas de OR (si tiene) y la keyword con el último grupo. */
export function lineasKeyword(k: Keyword): string[] {
  const cond = { inds: k.indicadores, alternativas: k.alternativas };
  return [...previas(cond), ...lineasLogicas(cabecera(cond), textoKeyword(k))];
}

/**
 * Emite una definición con sus keywords. La primera keyword va en la misma
 * línea de la definición si tiene los mismos indicadores; el resto, una por
 * línea con sus propios indicadores.
 */
export function emitirConKeywords(
  cab: CabeceraDds,
  keywords: Keyword[],
  permitirEnLinea: boolean,
): string[] {
  const salida: string[] = [];
  let resto = keywords;
  let zona = '';
  if (
    permitirEnLinea &&
    keywords.length > 0 &&
    mismasCondiciones({ inds: keywords[0].indicadores, alternativas: keywords[0].alternativas }, cab)
  ) {
    zona = textoKeyword(keywords[0]);
    resto = keywords.slice(1);
  }
  salida.push(...previas(cab), ...lineasLogicas(cabecera(cab), zona));
  for (const k of resto) salida.push(...lineasKeyword(k));
  return salida;
}
