/** Pide al proceso principal que vigile una carpeta (sin efecto en las pruebas, donde no existe). */
export function vigilarCarpeta(ruta: string): void {
  try {
    void window.api.vigilarCarpeta?.(ruta)?.catch(() => undefined);
  } catch {
    // Sin vigilancia, la lista se refresca igual después de cada guardado.
  }
}