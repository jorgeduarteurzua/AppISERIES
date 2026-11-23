/**
 * Estructura de un fuente para el panel de navegación y para ir a la definición:
 * - COBOL: divisiones, secciones y párrafos (los de la PROCEDURE DIVISION), y los COPY.
 * - CL: PGM, variables declaradas, etiquetas y subrutinas.
 * Las líneas se cuentan desde 1.
 */
import type { LenguajePrograma } from './lenguaje';

export type TipoElemento = 'division' | 'seccion' | 'parrafo' | 'copy' | 'programa' | 'variable' | 'etiqueta' | 'subrutina';

export interface ElementoEstructura {
  tipo: TipoElemento;
  nombre: string;
  linea: number;
}

/** Texto de una línea COBOL que el compilador lee: columnas 8 a 72, o null si es comentario. */
function zonaCobol(linea: string): { texto: string; areaA: boolean } | null {
  const indicador = linea[6] ?? ' ';
  if (indicador === '*' || indicador === '/') return null;
  const zona = linea.slice(7, 72);
  if (zona.trim() === '') return null;
  // Área A: columnas 8 a 11.
  const areaA = /\S/.test(zona.slice(0, 4));
  return { texto: zona.trim(), areaA };
}

function estructuraCobol(lineas: string[]): ElementoEstructura[] {
  const salida: ElementoEstructura[] = [];
  let enProcedimientos = false;
  lineas.forEach((l, i) => {
    const z = zonaCobol(l);
    if (!z) return;
    const linea = i + 1;
    const division = /^([A-Z][A-Z0-9-]*)\s+DIVISION\b/i.exec(z.texto);
    if (division && z.areaA) {
      enProcedimientos = division[1].toUpperCase() === 'PROCEDURE';
      salida.push({ tipo: 'division', nombre: `${division[1].toUpperCase()} DIVISION`, linea });
      return;
    }
    const seccion = /^([A-Z0-9][A-Z0-9-]*)\s+SECTION\s*\./i.exec(z.texto);
    if (seccion && z.areaA) {
      salida.push({ tipo: 'seccion', nombre: seccion[1].toUpperCase(), linea });
      return;
    }
    const copy = /^COPY\s+([A-Z0-9$#@][A-Z0-9$#@_-]*)(?:\s+OF\s+([A-Z0-9$#@][A-Z0-9$#@_/-]*))?/i.exec(z.texto);
    if (copy) {
      salida.push({ tipo: 'copy', nombre: `${copy[1].toUpperCase()}${copy[2] ? ` OF ${copy[2].toUpperCase()}` : ''}`, linea });
      return;
    }
    if (enProcedimientos && z.areaA) {
      const parrafo = /^([A-Z0-9][A-Z0-9-]*)\s*\.\s*$/i.exec(z.texto);
      if (parrafo && !/^END-/i.test(parrafo[1])) salida.push({ tipo: 'parrafo', nombre: parrafo[1].toUpperCase(), linea });
    }
  });
  return salida;
}

/** Quita los comentarios de CL (/* ... *\/) de una línea, sin tocar los literales. */
function sinComentarioCl(linea: string): string {
  let salida = '';
  let enLiteral = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === "'") enLiteral = !enLiteral;
    if (!enLiteral && c === '/' && linea[i + 1] === '*') {
      const fin = linea.indexOf('*/', i + 2);
      if (fin < 0) break;
      i = fin + 1;
      continue;
    }
    salida += c;
  }
  return salida;
}

function estructuraCl(lineas: string[]): ElementoEstructura[] {
  const salida: ElementoEstructura[] = [];
  lineas.forEach((l, i) => {
    const t = sinComentarioCl(l).trim();
    if (t === '') return;
    const linea = i + 1;
    let resto = t;
    const etiqueta = /^([A-Z@#$][A-Z0-9@#$_]{0,9}):\s*/i.exec(resto);
    if (etiqueta) {
      salida.push({ tipo: 'etiqueta', nombre: etiqueta[1].toUpperCase(), linea });
      resto = resto.slice(etiqueta[0].length);
    }
    if (/^PGM\b/i.test(resto)) salida.push({ tipo: 'programa', nombre: 'PGM', linea });
    const dcl = /^DCL\s+(?:VAR\()?\s*(&[A-Z@#$][A-Z0-9@#$_]*)/i.exec(resto);
    if (dcl) salida.push({ tipo: 'variable', nombre: dcl[1].toUpperCase(), linea });
    const subr = /^SUBR\s+(?:SUBR\()?\s*([A-Z@#$][A-Z0-9@#$_]*)/i.exec(resto);
    if (subr) salida.push({ tipo: 'subrutina', nombre: subr[1].toUpperCase(), linea });
  });
  return salida;
}

export function estructuraDe(texto: string, lenguaje: LenguajePrograma): ElementoEstructura[] {
  const lineas = texto.replace(/\r\n?/g, '\n').split('\n');
  if (lenguaje === 'cobol') return estructuraCobol(lineas);
  if (lenguaje === 'cl') return estructuraCl(lineas);
  return [];
}

/** Palabra (nombre COBOL o CL) en una columna de una línea (columna desde 1). */
export function palabraEn(linea: string, columna: number): string | null {
  const re = /[&A-Z0-9@#$_-]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(linea)) !== null) {
    const inicio = m.index + 1;
    const fin = inicio + m[0].length;
    if (columna >= inicio && columna <= fin) return m[0].replace(/^-+|-+$/g, '').toUpperCase() || null;
  }
  return null;
}

/**
 * Dónde está definido el nombre que se usa en una línea: el párrafo o sección de un PERFORM
 * o GO TO en COBOL; la etiqueta de un GOTO, la subrutina de un CALLSUBR o la variable en CL.
 */
export function definicionDe(estructura: ElementoEstructura[], nombre: string, lenguaje: LenguajePrograma): ElementoEstructura | null {
  const n = nombre.toUpperCase();
  const tipos: TipoElemento[] = lenguaje === 'cobol' ? ['parrafo', 'seccion'] : ['etiqueta', 'subrutina', 'variable'];
  return estructura.find((e) => tipos.includes(e.tipo) && e.nombre === n) ?? null;
}
