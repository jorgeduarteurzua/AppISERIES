import type { TipoFuente } from '@core/as400/tipos';

const CLAVE_CARPETA = 'appiseries.carpetaFuentes';

/** Extensión con que se guarda en el equipo cada tipo de fuente. */
export function extensionFuente(tipo: TipoFuente): string {
  switch (tipo) {
    case 'DSPF':
      return 'dspf';
    case 'PF':
      return 'pf';
    case 'LF':
      return 'lf';
    case 'SQL':
      return 'sql';
    case 'CBL':
      return 'cbl';
    case 'CBLLE':
      return 'cblle';
    case 'SQLCBL':
      return 'sqlcbl';
    case 'SQLCBLLE':
      return 'sqlcblle';
    case 'CLP':
      return 'clp';
    case 'CLLE':
      return 'clle';
  }
}

export function carpetaRecordada(): string {
  try {
    return window.localStorage.getItem(CLAVE_CARPETA) ?? '';
  } catch {
    return '';
  }
}

function recordarCarpeta(carpeta: string): void {
  try {
    window.localStorage.setItem(CLAVE_CARPETA, carpeta);
  } catch {
    // Sin almacenamiento: no se recuerda y nada más.
  }
}

export interface ResultadoGuardadoLocal {
  ok: boolean;
  /** Texto para mostrar al usuario. */
  mensaje: string;
}

/**
 * Pide una carpeta (la última usada queda como sugerencia) y guarda ahí los
 * fuentes. Si un archivo ya existía, deja su copia `.bak`.
 */
export async function guardarFuentesLocal(
  archivos: Array<{ nombre: string; texto: string }>,
): Promise<ResultadoGuardadoLocal> {
  try {
    const r = await window.api.guardarEnCarpeta(archivos, carpetaRecordada());
    if (r === null) return { ok: false, mensaje: 'Guardado cancelado.' };
    recordarCarpeta(r.carpeta);
    // Importación diferida: carpetas usa los stores, que a su vez usan este módulo.
    void import('./carpetas').then((m) => m.refrescarCarpeta(r.carpeta));
    const copias = r.copias.length > 0 ? ` Los originales quedaron como ${r.copias.map((c) => c.split(/[\\/]/).pop()).join(', ')}.` : '';
    return { ok: true, mensaje: `Guardado en ${r.carpeta}: ${r.rutas.map((x) => x.split(/[\\/]/).pop()).join(', ')}.${copias}` };
  } catch (e) {
    const texto = e instanceof Error ? e.message : String(e);
    return { ok: false, mensaje: `No se pudo guardar: ${texto.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}` };
  }
}
