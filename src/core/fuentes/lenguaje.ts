/**
 * Lenguaje de un fuente de programa según su extensión o su tipo de miembro.
 * RPG queda reconocido para abrirlo y editarlo, pero todavía no se compila desde la aplicación.
 */
import type { TipoFuente } from '../as400/tipos';

export type LenguajePrograma = 'cobol' | 'cl' | 'rpg';

export interface InfoTipoPrograma {
  /** Tipo de miembro (SRCTYPE). */
  tipo: string;
  lenguaje: LenguajePrograma;
  /** Tipo con que se envía y compila; null si todavía no se puede (RPG). */
  envio: TipoFuente | null;
  /** Archivo fuente habitual. */
  archivoFuente: string;
}

export const TIPOS_PROGRAMA: Record<string, InfoTipoPrograma> = {
  cbl: { tipo: 'CBL', lenguaje: 'cobol', envio: 'CBL', archivoFuente: 'QCBLSRC' },
  cblle: { tipo: 'CBLLE', lenguaje: 'cobol', envio: 'CBLLE', archivoFuente: 'QCBLSRC' },
  sqlcbl: { tipo: 'SQLCBL', lenguaje: 'cobol', envio: 'SQLCBL', archivoFuente: 'QCBLSRC' },
  sqlcblle: { tipo: 'SQLCBLLE', lenguaje: 'cobol', envio: 'SQLCBLLE', archivoFuente: 'QCBLSRC' },
  clp: { tipo: 'CLP', lenguaje: 'cl', envio: 'CLP', archivoFuente: 'QCLSRC' },
  clle: { tipo: 'CLLE', lenguaje: 'cl', envio: 'CLLE', archivoFuente: 'QCLSRC' },
  rpg: { tipo: 'RPG', lenguaje: 'rpg', envio: null, archivoFuente: 'QRPGSRC' },
  rpgle: { tipo: 'RPGLE', lenguaje: 'rpg', envio: null, archivoFuente: 'QRPGLESRC' },
  sqlrpgle: { tipo: 'SQLRPGLE', lenguaje: 'rpg', envio: null, archivoFuente: 'QRPGLESRC' },
};

/** Extensiones que abre la sección de programas. */
export const EXTENSIONES_PROGRAMA = Object.keys(TIPOS_PROGRAMA);

export function extensionDe(nombre: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(nombre);
  return m ? m[1].toLowerCase() : '';
}

export function infoDeArchivo(nombre: string): InfoTipoPrograma | null {
  return TIPOS_PROGRAMA[extensionDe(nombre)] ?? null;
}

export function infoDeTipo(tipo: string): InfoTipoPrograma | null {
  return TIPOS_PROGRAMA[tipo.toLowerCase()] ?? null;
}

/** Nombre del miembro a partir del nombre del archivo: sin extensión ni prefijos de exportación. */
export function miembroDeArchivo(nombre: string): string {
  const base = nombre.replace(/^.*[\\/]/, '').replace(/\.[A-Za-z0-9]+$/, '');
  // Exportaciones como GXCPSMI_QCBLSRC_120216_142832_TABLA1P: el miembro es lo último.
  const partes = base.split('_');
  const ultimo = partes[partes.length - 1];
  return (partes.length >= 4 && /^\d+$/.test(partes[partes.length - 2]) ? ultimo : base).toUpperCase().slice(0, 10);
}

/** Secuencia estilo SEU que se muestra en el margen: 0001.00. El FTP numera de 1,00 en 1,00. */
export function secuenciaDeLinea(linea: number): string {
  return `${String(linea).padStart(4, '0')}.00`;
}
