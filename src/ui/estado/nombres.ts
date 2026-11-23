/** Nombre corto de una pantalla: quita el prefijo de exportación GXCPSMI_QDSPSRC_aaaaaa_hhmmss_ y la extensión .TXT. */
export function nombreCortoPantalla(nombre: string): string {
  return nombre.replace(/^[A-Z0-9]+_QDSPSRC_\d+_\d+_/i, '').replace(/\.TXT$/i, '');
}
