/**
 * Modelo de datos de un archivo de base de datos IBM i descrito en DDS
 * (físico PF o lógico LF).
 *
 * El modelo es independiente del texto: el parser produce este modelo desde un
 * fuente DDS, el editor lo modifica y los generadores producen de nuevo DDS o
 * SQL. Conserva los comentarios (`A*`), porque en los fuentes reales
 * documentan datos (p.ej. el significado de un código de estado).
 */

import type { Keyword } from '../modelo/pantalla';

/** Campo del registro. La longitud, los decimales y el tipo pueden ir en blanco (se heredan). */
export interface CampoTabla {
  tipo: 'campo';
  id: string;
  nombre: string;
  /** Cols 30-34. null = en blanco (campo heredado por REFFLD o de otro archivo). */
  longitud: number | null;
  /** Col 35 ('' = en blanco). Normalmente A, S, P, B, F, L, T o Z. */
  tipoDato: string;
  /** Cols 36-37. null = en blanco. */
  decimales: number | null;
  /** 'R' en la col 29: la definición se toma de un archivo de referencia. */
  referencia: boolean;
  /** Col 38 ('' = en blanco; en lógicos I, B o N). */
  uso: string;
  keywords: Keyword[];
  /** Comentarios (`A*`) que están justo antes del campo, sin la marca `A*`. */
  comentarios: string[];
}

/** Línea `K`: campo de la llave de acceso. */
export interface LlaveTabla {
  tipo: 'llave';
  id: string;
  nombre: string;
  /** DESCEND, ABSVAL, UNSIGNED, SIGNED, ZONE, DIGIT, ALTSEQ... */
  keywords: Keyword[];
  comentarios: string[];
}

/** Línea `S` (seleccionar) u `O` (omitir) de un archivo lógico. */
export interface SeleccionTabla {
  tipo: 'seleccion' | 'omision';
  id: string;
  /** Nombre de un campo, o ALL (solo con `O`). */
  nombre: string;
  /** COMP, VALUES, RANGE... */
  keywords: Keyword[];
  comentarios: string[];
}

/** Línea `J`: unión de archivos físicos (JOIN, JFLD). */
export interface UnionTabla {
  tipo: 'union';
  id: string;
  keywords: Keyword[];
  comentarios: string[];
}

export type ElementoTabla = CampoTabla | LlaveTabla | SeleccionTabla | UnionTabla;

/** Formato de registro (línea `R`). Un físico tiene uno; un lógico puede tener varios. */
export interface RegistroTabla {
  id: string;
  nombre: string;
  /** TEXT, PFILE, JFILE, JDFTVAL... */
  keywords: Keyword[];
  elementos: ElementoTabla[];
  comentarios: string[];
}

export interface Tabla {
  /** Nombre del archivo (miembro de fuente). */
  nombre: string;
  /** Keywords de archivo: UNIQUE, REF, FORMAT, ALTSEQ, DYNSLT... */
  keywords: Keyword[];
  registros: RegistroTabla[];
  /** Comentarios antes de las keywords de archivo. */
  comentariosArchivo: string[];
  /** Comentarios después del último elemento. */
  comentariosFinales: string[];
  /** Líneas que el parser no pudo interpretar. */
  advertencias: string[];
}

export type TipoArchivo = 'PF' | 'LF';

/** Es lógico si algún registro apunta a un físico con PFILE o JFILE. */
export function tipoDeTabla(t: Tabla): TipoArchivo {
  const esLogico = t.registros.some((r) =>
    r.keywords.some((k) => k.nombre === 'PFILE' || k.nombre === 'JFILE'),
  );
  return esLogico ? 'LF' : 'PF';
}

export function camposDe(r: RegistroTabla): CampoTabla[] {
  return r.elementos.filter((e): e is CampoTabla => e.tipo === 'campo');
}

export function llavesDe(r: RegistroTabla): LlaveTabla[] {
  return r.elementos.filter((e): e is LlaveTabla => e.tipo === 'llave');
}

export function seleccionesDe(r: RegistroTabla): SeleccionTabla[] {
  return r.elementos.filter((e): e is SeleccionTabla => e.tipo === 'seleccion' || e.tipo === 'omision');
}

/**
 * Nombre del archivo a partir del nombre del fuente: quita el prefijo de
 * exportación (GXCPSMI_QDDSSRC_120216_142741_) y la extensión, y lo deja en
 * mayúsculas y con 10 caracteres como máximo.
 */
export function nombreArchivoTabla(nombreFuente: string): string {
  const sinPrefijo = nombreFuente.replace(/^[A-Z0-9]+_Q[A-Z0-9]+_\d+_\d+_/i, '');
  const sinExtension = sinPrefijo.replace(/\.(TXT|PF|LF|DDS|DSPF)$/i, '');
  return sinExtension.toUpperCase().slice(0, 10);
}

/** Valor de la primera keyword con ese nombre, o null. */
export function parametroDe(keywords: Keyword[], nombre: string): string | null {
  const k = keywords.find((x) => x.nombre === nombre);
  return k ? k.parametros : null;
}

/** Texto sin las comillas exteriores: "'ABC'" -> "ABC" (con '' resuelto). */
export function sinComillas(literal: string): string {
  const t = literal.trim();
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  return t;
}

/** Literales entre comillas de una lista de parámetros: "'A' 'B C'" -> ["A", "B C"]. */
export function literalesDe(parametros: string): string[] {
  const resultado: string[] = [];
  const re = /'((?:[^']|'')*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(parametros)) !== null) resultado.push(m[1].replace(/''/g, "'"));
  return resultado;
}
