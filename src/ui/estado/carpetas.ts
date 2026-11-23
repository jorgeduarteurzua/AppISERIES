/**
 * Las carpetas abiertas en Pantallas, Tablas y Programas se mantienen al día: el proceso principal
 * avisa cuando cambia un archivo y, además, después de cada guardado propio se vuelve a leer la
 * carpeta donde quedó el archivo. Releer la lista no toca lo que se está editando.
 */
import { useStore } from './store';
import { useTablas } from './storeTablas';
import { useProgramas } from './storeProgramas';
export { vigilarCarpeta } from './vigilancia';

const normalizar = (ruta: string): string => ruta.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();

/** Carpeta de un archivo (lo que está antes de la última barra). */
export function carpetaDe(ruta: string): string {
  const i = Math.max(ruta.lastIndexOf('\\'), ruta.lastIndexOf('/'));
  return i > 0 ? ruta.slice(0, i) : ruta;
}

/** Vuelve a leer la carpeta en cada sección que la tenga abierta. */
export async function refrescarCarpeta(ruta: string): Promise<void> {
  const n = normalizar(ruta);
  const secciones = [
    { carpeta: useStore.getState().carpeta, releer: (r: string) => useStore.getState().abrirCarpetaEn(r) },
    { carpeta: useTablas.getState().carpeta, releer: (r: string) => useTablas.getState().abrirCarpetaEn(r) },
    { carpeta: useProgramas.getState().carpeta, releer: (r: string) => useProgramas.getState().abrirCarpetaEn(r) },
  ];
  for (const s of secciones) {
    if (s.carpeta && normalizar(s.carpeta) === n) await s.releer(s.carpeta);
  }
}

export function refrescarCarpetaDeArchivo(ruta: string): Promise<void> {
  return refrescarCarpeta(carpetaDe(ruta));
}

let suscrito: (() => void) | null = null;

/** Escucha los avisos del proceso principal (una sola vez). */
export function iniciarVigilancia(): void {
  if (suscrito) return;
  try {
    suscrito = window.api.alCambiarCarpeta?.((ruta) => void refrescarCarpeta(ruta)) ?? null;
  } catch {
    suscrito = null;
  }
}
