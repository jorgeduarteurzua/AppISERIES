/**
 * Lista de miembros de un archivo fuente del AS400, leída de las respuestas del
 * FTP (formato comprobado en un IBM i 7.5):
 *
 *   NLST  ->  ANCALCIO.MBR                                   (solo nombres)
 *   LIST  ->  -rwx---rwx   1 PRSIAS   0   99552 Jun 25 2025  PGMREF.MBR   (con SITE LISTFMT 1)
 *             -rwx---rwx   1 PRSIAS   0    4148 Oct 05 13:00 PMSBAR63SO.MBR
 *
 * El tamaño de LIST es el interno del miembro, no el del texto: no se usa.
 */

import { esNombreValido } from './validacion';

export interface MiembroFuente {
  nombre: string;
  /** Fecha del último cambio: «2025-06-25» o «2026-10-05 13:00». null si no se pudo leer. */
  fecha: string | null;
  /** Tipo de fuente como lo muestra PDM (CBLLE, DSPF, PF…). null si el servidor no lo entregó. */
  tipo: string | null;
  /** Texto descriptivo del miembro. null si el servidor no lo entregó. */
  texto: string | null;
}

export interface ResultadoListado {
  ok: boolean;
  miembros: MiembroFuente[];
  /** Pasos y avisos, en el mismo formato que el envío. */
  pasos: Array<{ nombre: string; ok: boolean; mensaje: string; aviso?: boolean }>;
}

export interface PeticionTraer {
  biblioteca: string;
  archivoFuente: string;
  miembros: string[];
  /** Reemplazar los archivos que ya existen en la carpeta (se deja copia .bak). */
  sobrescribir: boolean;
}

export interface ResultadoMiembroTraido {
  miembro: string;
  ok: boolean;
  /** Se saltó porque el archivo ya existía y no se pidió reemplazar. */
  omitido: boolean;
  /** Nombre del archivo escrito en la carpeta. */
  archivo: string | null;
  copia: string | null;
  mensaje: string;
}

export interface ResultadoTraer {
  /** null si se canceló la elección de la carpeta. */
  carpeta: string | null;
  ok: boolean;
  pasos: ResultadoListado['pasos'];
  resultados: ResultadoMiembroTraido[];
}

/** Máximo de miembros por descarga. */
export const MAX_MIEMBROS_POR_DESCARGA = 200;

const RE_MIEMBRO = /^([A-Za-z$#@][A-Za-z0-9$#@_]{0,9})\.MBR$/i;

/** Nombres de miembro de una respuesta NLST. Ignora lo que no sea un miembro válido. */
export function parsearNlst(texto: string): { nombres: string[]; ignorados: number } {
  const nombres: string[] = [];
  let ignorados = 0;
  for (const linea of texto.split(/\r?\n/)) {
    const t = linea.trim();
    if (t === '') continue;
    const m = RE_MIEMBRO.exec(t);
    if (m && esNombreValido(m[1].toUpperCase())) nombres.push(m[1].toUpperCase());
    else ignorados++;
  }
  return { nombres, ignorados };
}

const MESES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const RE_LIST_UNIX = /^\S+\s+\d+\s+\S+\s+\d+\s+\d+\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4}|\d{1,2}:\d{2})\s+(.+?)\s*$/;

const dos = (n: number): string => String(n).padStart(2, '0');

/**
 * Fecha de una línea de LIST. Si trae la hora en vez del año (cambio reciente),
 * el año es el actual, o el anterior si así la fecha no quedaría en el futuro.
 */
export function fechaDeLista(mes: string, dia: number, anioOHora: string, hoy: Date): string | null {
  const m = MESES[mes.toLowerCase()];
  if (!m || dia < 1 || dia > 31) return null;
  if (/^\d{4}$/.test(anioOHora)) return `${anioOHora}-${dos(m)}-${dos(dia)}`;
  let anio = hoy.getFullYear();
  const candidata = new Date(anio, m - 1, dia, 23, 59, 59);
  if (candidata.getTime() > hoy.getTime() + 24 * 3600 * 1000) anio -= 1;
  return `${anio}-${dos(m)}-${dos(dia)} ${anioOHora.padStart(5, '0')}`;
}

/** Fechas por miembro de una respuesta LIST con el formato UNIX (SITE LISTFMT 1). */
export function parsearListUnix(texto: string, hoy: Date = new Date()): Map<string, string> {
  const fechas = new Map<string, string>();
  for (const linea of texto.split(/\r?\n/)) {
    const m = RE_LIST_UNIX.exec(linea.trim());
    if (!m) continue;
    const mbr = RE_MIEMBRO.exec(m[4]);
    if (!mbr) continue;
    const fecha = fechaDeLista(m[1], parseInt(m[2], 10), m[3], hoy);
    if (fecha) fechas.set(mbr[1].toUpperCase(), fecha);
  }
  return fechas;
}

/** Une los nombres (NLST) con las fechas (LIST). El orden es el del servidor. */
export function unirMiembros(
  nombres: string[],
  fechas: Map<string, string>,
  tipos: Map<string, InfoMiembro> = new Map(),
): MiembroFuente[] {
  return nombres.map((nombre) => ({
    nombre,
    fecha: fechas.get(nombre) ?? null,
    tipo: tipos.get(nombre)?.tipo || null,
    texto: tipos.get(nombre)?.texto || null,
  }));
}

export interface InfoMiembro {
  tipo: string;
  texto: string;
}

/**
 * Tipo y texto de cada miembro, de la tabla que arma el servidor con
 * SELECT MLNAME, MLSEU2, MLMTXT (columnas fijas de 10, 10 y 50 caracteres):
 *
 *   ANCALCIO  CBLLE     Emision de Polizas
 *   INSMQPUTCBCBL       Envia Mensajes a Cola MQ
 */
export function parsearTiposMiembros(texto: string): Map<string, InfoMiembro> {
  const mapa = new Map<string, InfoMiembro>();
  for (const linea of texto.split(/\r?\n/)) {
    if (linea.trim() === '') continue;
    const nombre = linea.slice(0, 10).trim().toUpperCase();
    if (!esNombreValido(nombre)) continue;
    mapa.set(nombre, { tipo: linea.slice(10, 20).trim().toUpperCase(), texto: linea.slice(20, 70).trim() });
  }
  return mapa;
}

/** Extensión local a partir del tipo del miembro (PF → pf, SQLCBLLE → sqlcblle). null si no es usable. */
export function extensionDeTipo(tipo: string | null | undefined): string | null {
  const t = (tipo ?? '').trim().toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(t) ? t : null;
}

export type TipoFuente = 'dspf' | 'pf' | 'lf' | 'prtf' | 'dds' | 'cbl' | 'sqlcbl' | 'clp';

const CLAVES_DSPF = /\b(DSPSIZ|CF\d\d|CA\d\d|SFL|SFLCTL|SFLDSP|SFLDSPCTL|SFLCLR|SFLEND|SFLSIZ|SFLPAG|ERRMSG|ERRMSGID|DSPATR|OVERLAY|PUTOVR|WINDOW|ALWROL|ROLLUP|ROLLDOWN|CSRLOC|MSGCON|CHGINPDFT)\b/;
const CLAVES_PRTF = /\b(POSITION|SKIPB|SKIPA|SPACEB|SPACEA|PAGNBR|LPI|CPI|FORMSIZE|OUTBIN|PAGRTT|DRAWER)\s*\(/;

/**
 * Tipo de un fuente deducido de su contenido, que es lo único que el FTP deja ver
 * (el atributo del miembro, como lo muestra PDM, no viene en el listado).
 *
 * En DDS devuelve 'dspf', 'prtf' o 'lf' solo si hay marcas propias de ese tipo.
 * Si es DDS pero sin marcas, devuelve 'dds': puede ser un PF, o una pantalla muy simple,
 * y se decide por el nombre del archivo fuente. Devuelve null si no lo reconoce.
 */
export function tipoPorContenido(texto: string): TipoFuente | null {
  if (/\b(IDENTIFICATION|ID)\s+DIVISION\b|\bPROGRAM-ID\b|\bPROCEDURE\s+DIVISION\b/i.test(texto)) {
    return /EXEC\s+SQL/i.test(texto) ? 'sqlcbl' : 'cbl';
  }
  let hayDds = false;
  let dspf = false;
  let prtf = false;
  let lf = false;
  for (const linea of texto.split(/\r?\n/)) {
    // DDS: «A» en la columna 6; la columna 7 con «*» es comentario.
    if (linea.length < 6 || linea[5] !== 'A' || !/^[\s\d]{5}$/.test(linea.slice(0, 5)) || linea[6] === '*') continue;
    hayDds = true;
    const funciones = linea.slice(44);
    const uso = linea.charAt(37);
    if (/[IOBHM]/.test(uso) || /\d/.test(linea.slice(38, 44)) || CLAVES_DSPF.test(funciones)) dspf = true;
    if (CLAVES_PRTF.test(funciones)) prtf = true;
    if (/\b(PFILE|JFILE)\s*\(/.test(funciones)) lf = true;
  }
  if (dspf) return 'dspf';
  if (prtf) return 'prtf';
  if (lf) return 'lf';
  if (hayDds) return 'dds';
  if (/^\s*(PGM(\s|\(|$)|ENDPGM\b)/im.test(texto)) return 'clp';
  return null;
}

/**
 * Extensión con que se guarda un miembro en el equipo: dspf, pf, lf, prtf, cbl, sqlcbl, clp, sql o txt.
 * Manda el contenido (un QDDSSRC mezcla pantallas, archivos físicos y lógicos);
 * el nombre del archivo fuente solo decide lo que el contenido no aclara.
 */
export function extensionLocal(archivoFuente: string, texto: string): string {
  const a = archivoFuente.toUpperCase();
  const tipo = tipoPorContenido(texto);
  if (tipo === 'dds') return a.includes('DSP') ? 'dspf' : 'pf';
  if (tipo) return tipo;
  if (a.includes('DSP')) return 'dspf';
  if (a.includes('DDS') || /^Q?(PF|LF)/.test(a)) return 'pf';
  if (a.includes('CBL')) return /EXEC\s+SQL/i.test(texto) ? 'sqlcbl' : 'cbl';
  if (a.includes('SQL')) return 'sql';
  return 'txt';
}