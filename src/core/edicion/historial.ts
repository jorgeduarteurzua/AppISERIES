/**
 * Historial de versiones para deshacer/rehacer, genérico: sirve para pantallas
 * y para tablas.
 *
 * Es puro: cada función recibe el historial y devuelve uno nuevo. Los cambios
 * seguidos sobre la misma propiedad (por ejemplo, teclear en un cuadro de
 * texto) se fusionan en una sola entrada si llevan la misma clave y ocurren en
 * menos de `VENTANA_FUSION_MS`.
 */

import type { PantallaDSPF } from '../modelo/pantalla';

export const LIMITE_HISTORIAL = 100;
export const VENTANA_FUSION_MS = 1000;

export interface Historial<T = PantallaDSPF> {
  pasado: T[];
  futuro: T[];
  ultimaClave: string | null;
  ultimaMarca: number;
}

export function historialVacio<T = PantallaDSPF>(): Historial<T> {
  return { pasado: [], futuro: [], ultimaClave: null, ultimaMarca: 0 };
}

/**
 * Registra un cambio. `anterior` es el valor ANTES del cambio.
 * `clave` (opcional) permite fusionar cambios seguidos sobre lo mismo.
 */
export function registrarCambio<T>(
  h: Historial<T>,
  anterior: T,
  clave: string | undefined,
  ahora: number,
): Historial<T> {
  const fusiona =
    clave !== undefined &&
    clave === h.ultimaClave &&
    ahora - h.ultimaMarca < VENTANA_FUSION_MS &&
    h.pasado.length > 0 &&
    h.futuro.length === 0;
  if (fusiona) return { ...h, ultimaMarca: ahora };

  return {
    pasado: [...h.pasado, anterior].slice(-LIMITE_HISTORIAL),
    futuro: [],
    ultimaClave: clave ?? null,
    ultimaMarca: ahora,
  };
}

export function puedeDeshacer<T>(h: Historial<T>): boolean {
  return h.pasado.length > 0;
}

export function puedeRehacer<T>(h: Historial<T>): boolean {
  return h.futuro.length > 0;
}

/** Vuelve a la versión anterior. Devuelve null si no hay nada que deshacer. */
export function deshacer<T>(
  h: Historial<T>,
  actual: T,
): { historial: Historial<T>; valor: T } | null {
  if (h.pasado.length === 0) return null;
  const valor = h.pasado[h.pasado.length - 1];
  return {
    valor,
    historial: {
      pasado: h.pasado.slice(0, -1),
      futuro: [actual, ...h.futuro],
      ultimaClave: null,
      ultimaMarca: 0,
    },
  };
}

/** Avanza a la versión deshecha. Devuelve null si no hay nada que rehacer. */
export function rehacer<T>(
  h: Historial<T>,
  actual: T,
): { historial: Historial<T>; valor: T } | null {
  if (h.futuro.length === 0) return null;
  const [valor, ...resto] = h.futuro;
  return {
    valor,
    historial: {
      pasado: [...h.pasado, actual],
      futuro: resto,
      ultimaClave: null,
      ultimaMarca: 0,
    },
  };
}
