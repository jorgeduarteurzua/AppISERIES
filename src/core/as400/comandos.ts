import { TIPOS_FUENTE } from './tipos';
import type { PeticionEnvio, TipoFuente } from './tipos';

/**
 * Construye los comandos CL que se ejecutan en el AS400 con RCMD. Todos los
 * nombres que reciben ya deben estar validados con `validarPeticion`.
 */

/** Ruta IFS de un miembro con el formato de nombres 1 (SITE NAMEFMT 1). */
export function rutaMiembro(biblioteca: string, archivo: string, miembro: string): string {
  return `/QSYS.LIB/${biblioteca}.LIB/${archivo}.FILE/${miembro}.MBR`;
}

/** Largo del registro del archivo fuente: el fuente más 12 de secuencia y fecha. */
export function largoRegistroFuente(tipo: TipoFuente): number {
  return TIPOS_FUENTE[tipo].maxLinea + 12;
}

export function comandoExisteArchivo(biblioteca: string, archivo: string): string {
  return `CHKOBJ OBJ(${biblioteca}/${archivo}) OBJTYPE(*FILE)`;
}

export function comandoCrearArchivoFuente(tipo: TipoFuente, biblioteca: string, archivo: string): string {
  return `CRTSRCPF FILE(${biblioteca}/${archivo}) RCDLEN(${largoRegistroFuente(tipo)}) TEXT('Fuentes')`;
}

/** Fija el tipo y la descripción del miembro. Es un ajuste: si falla no impide compilar. */
export function comandoCambiarMiembro(p: PeticionEnvio): string {
  const texto = p.descripcion.trim() === '' ? '' : ` TEXT('${p.descripcion.trim()}')`;
  return `CHGPFM FILE(${p.bibliotecaFuente}/${p.archivoFuente}) MBR(${p.miembro}) SRCTYPE(${p.tipo})${texto}`;
}

export function comandoAgregarBiblioteca(biblioteca: string): string {
  return `ADDLIBLE LIB(${biblioteca})`;
}

/**
 * CRTPF y CRTLF no tienen el parámetro REPLACE: para reemplazar un archivo físico o lógico hay que
 * borrarlo (DLTF) y crearlo de nuevo.
 */
export function seBorraAntesDeCrear(tipo: TipoFuente): boolean {
  return tipo === 'PF' || tipo === 'LF';
}

/** Borra el archivo (PF o LF) que se va a crear de nuevo. */
export function comandoBorrarArchivo(p: PeticionEnvio): string {
  return `DLTF FILE(${p.bibliotecaObjeto}/${p.miembro})`;
}

/** Archivos que dependen de uno (lógicos, vistas, índices): sale en un spool con este nombre. */
export function comandoDependencias(p: PeticionEnvio): string {
  return `DSPDBR FILE(${p.bibliotecaObjeto}/${p.miembro}) OUTPUT(*PRINT)`;
}
export const SPOOL_DEPENDENCIAS = 'QPDSPDBR';

/** Comandos que se ejecutan para compilar, en orden (para mostrarlos). */
export function comandosCompilacion(p: PeticionEnvio): string[] {
  const crear = comandoCompilacion(p);
  return seBorraAntesDeCrear(p.tipo) && p.reemplazar ? [`${comandoBorrarArchivo(p)}  (si ya existe)`, crear] : [crear];
}

/** Comando de compilación. Los programas SQL siempre usan COMMIT(*NONE). */
export function comandoCompilacion(p: PeticionEnvio): string {
  const fuente = `SRCFILE(${p.bibliotecaFuente}/${p.archivoFuente}) SRCMBR(${p.miembro})`;
  const objeto = `${p.bibliotecaObjeto}/${p.miembro}`;
  const reemplazo = `REPLACE(${p.reemplazar ? '*YES' : '*NO'})`;
  switch (p.tipo) {
    case 'DSPF':
      return `CRTDSPF FILE(${objeto}) ${fuente} ${reemplazo}`;
    case 'PF':
      return `CRTPF FILE(${objeto}) ${fuente} SIZE(*NOMAX)`;
    case 'LF':
      return `CRTLF FILE(${objeto}) ${fuente}`;
    case 'SQL':
      return `RUNSQLSTM ${fuente} COMMIT(*NONE) DFTRDBCOL(${p.bibliotecaObjeto})`;
    case 'CBL':
      return `CRTCBLPGM PGM(${objeto}) ${fuente} ${reemplazo}`;
    case 'CBLLE':
      return `CRTBNDCBL PGM(${objeto}) ${fuente} ${reemplazo}`;
    case 'SQLCBL':
      return `CRTSQLCBL PGM(${objeto}) ${fuente} COMMIT(*NONE) ${reemplazo}`;
    case 'SQLCBLLE':
      return `CRTSQLCBLI OBJ(${objeto}) ${fuente} COMMIT(*NONE) OBJTYPE(*PGM) ${reemplazo}`;
    case 'CLP':
      return `CRTCLPGM PGM(${objeto}) ${fuente} ${reemplazo}`;
    case 'CLLE':
      return `CRTBNDCL PGM(${objeto}) ${fuente} ${reemplazo}`;
  }
}

/** Archivo temporal donde se copia el listado del compilador. */
export const ARCHIVO_LISTADO = 'APPLISTADO';

export function comandoCrearArchivoListado(): string {
  return `CRTPF FILE(QTEMP/${ARCHIVO_LISTADO}) RCDLEN(132) MAXMBRS(1)`;
}

export function comandoCopiarListado(spool = 'QSYSPRT'): string {
  return `CPYSPLF FILE(${spool}) TOFILE(QTEMP/${ARCHIVO_LISTADO}) SPLNBR(*LAST) MBROPT(*REPLACE)`;
}

/**
 * Spools donde queda el listado de la compilación, en orden. El precompilador SQL escribe en
 * QSYSPRT; los compiladores COBOL y CL, en un spool con el nombre del programa.
 */
export function spoolsDeListado(tipo: TipoFuente, miembro: string): string[] {
  switch (tipo) {
    case 'SQLCBL':
    case 'SQLCBLLE':
      return ['QSYSPRT', miembro];
    case 'CBL':
    case 'CBLLE':
    case 'CLP':
    case 'CLLE':
      return [miembro];
    default:
      return ['QSYSPRT'];
  }
}

export const RUTA_LISTADO = `/QSYS.LIB/QTEMP.LIB/${ARCHIVO_LISTADO}.FILE/${ARCHIVO_LISTADO}.MBR`;

/** Tabla de QTEMP con la lista de miembros de un archivo fuente (DSPFD *MBRLIST). */
export const ARCHIVO_MIEMBROS = 'APPMBRLST';
/** Tabla de QTEMP con solo nombre, tipo y texto de cada miembro (columnas de 10, 10 y 50). */
export const ARCHIVO_TIPOS = 'APPMBRTIP';
export const RUTA_TIPOS = `/QSYS.LIB/QTEMP.LIB/${ARCHIVO_TIPOS}.FILE/${ARCHIVO_TIPOS}.MBR`;

export function comandoListaMiembros(biblioteca: string, archivo: string): string {
  return `DSPFD FILE(${biblioteca}/${archivo}) TYPE(*MBRLIST) OUTPUT(*OUTFILE) OUTFILE(QTEMP/${ARCHIVO_MIEMBROS})`;
}

export function comandoBorrarTipos(): string {
  return `DLTF FILE(QTEMP/${ARCHIVO_TIPOS})`;
}

export function comandoCrearTipos(): string {
  return `RUNSQL SQL('CREATE TABLE QTEMP/${ARCHIVO_TIPOS} AS (SELECT MLNAME, MLSEU2, MLMTXT FROM QTEMP/${ARCHIVO_MIEMBROS}) WITH DATA') COMMIT(*NONE)`;
}
