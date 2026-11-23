/** Pregunta antes de descartar cambios sin guardar. */
export function confirmarDescarte(modificado: boolean, que = 'la pantalla actual'): boolean {
  if (!modificado) return true;
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true;
  return window.confirm(`Hay cambios sin guardar en ${que}. ¿Descartarlos?`);
}
