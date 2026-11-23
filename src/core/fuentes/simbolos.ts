/**
 * Nombres de un programa para autocompletar y renombrar:
 * - COBOL: los datos de la DATA DIVISION (niveles 01-49, 66, 77, 88 y los FD/SD) y los párrafos.
 * - CL: las variables (&X), las etiquetas y las subrutinas.
 * Las ocurrencias se buscan como palabras enteras, sin mirar comentarios ni literales, y en COBOL
 * solo en las columnas 8 a 72 (lo que lee el compilador).
 */
import { estructuraDe } from './estructura';
import type { LenguajePrograma } from './lenguaje';

export interface DatoCobol {
  nombre: string;
  nivel: string;
  /** PIC del dato, si tiene. */
  pic: string | null;
  linea: number;
}

export interface Ocurrencia {
  linea: number;
  /** Columna desde 1. */
  columna: number;
  /** Columna donde termina (exclusiva). */
  hasta: number;
}

const separarLineas = (texto: string): string[] => texto.replace(/\r\n?/g, '\n').split('\n');

/** Caracteres que forman un nombre en cada lenguaje. */
const CARACTER: Record<LenguajePrograma, RegExp> = {
  cobol: /[A-Z0-9-]/i,
  cl: /[A-Z0-9&@#$_]/i,
  rpg: /[A-Z0-9@#$_]/i,
};

/** Zona que el compilador lee de una línea, con su desplazamiento; null si es comentario. */
function zonaDe(linea: string, lenguaje: LenguajePrograma): { texto: string; desde: number } | null {
  if (lenguaje === 'cobol') {
    if (linea[6] === '*' || linea[6] === '/') return null;
    return { texto: linea.slice(7, 72), desde: 7 };
  }
  return { texto: linea, desde: 0 };
}

/** La zona con los literales y comentarios reemplazados por espacios (mismas posiciones). */
function sinLiteralesNiComentarios(zona: string, lenguaje: LenguajePrograma): string {
  let salida = '';
  let comilla: string | null = null;
  for (let i = 0; i < zona.length; i++) {
    const c = zona[i];
    if (comilla) {
      salida += ' ';
      if (c === comilla) comilla = null;
      continue;
    }
    if (c === '"' || c === "'") {
      comilla = c;
      salida += ' ';
      continue;
    }
    if (lenguaje === 'cl' && c === '/' && zona[i + 1] === '*') {
      const fin = zona.indexOf('*/', i + 2);
      const hasta = fin < 0 ? zona.length : fin + 2;
      salida += ' '.repeat(hasta - i);
      i = hasta - 1;
      continue;
    }
    salida += c;
  }
  return salida;
}

/** Datos definidos en la DATA DIVISION de un programa COBOL. */
export function datosCobol(texto: string): DatoCobol[] {
  const salida: DatoCobol[] = [];
  let enDatos = false;
  separarLineas(texto).forEach((l, i) => {
    const zona = zonaDe(l, 'cobol');
    if (!zona) return;
    const t = zona.texto.trim();
    if (/^DATA\s+DIVISION\b/i.test(t)) enDatos = true;
    else if (/^PROCEDURE\s+DIVISION\b/i.test(t)) enDatos = false;
    if (!enDatos) return;
    const fd = /^(FD|SD)\s+([A-Z0-9][A-Z0-9-]*)/i.exec(t);
    if (fd) {
      salida.push({ nombre: fd[2].toUpperCase(), nivel: fd[1].toUpperCase(), pic: null, linea: i + 1 });
      return;
    }
    const m = /^(\d{1,2})\s+([A-Z0-9][A-Z0-9-]*)(.*)$/i.exec(t);
    if (!m) return;
    const nivel = Number(m[1]);
    if (!((nivel >= 1 && nivel <= 49) || nivel === 66 || nivel === 77 || nivel === 88)) return;
    const nombre = m[2].toUpperCase().replace(/\.$/, '');
    if (nombre === 'FILLER') return;
    const pic = /\bPIC(?:TURE)?\s+(?:IS\s+)?(\S+?)\.?(?:\s|$)/i.exec(m[3]);
    salida.push({ nombre, nivel: m[1].padStart(2, '0'), pic: pic ? pic[1].toUpperCase() : null, linea: i + 1 });
  });
  return salida;
}

/** Variables, etiquetas y subrutinas de CL; datos y párrafos de COBOL (sin repetir). */
export function nombresDelPrograma(texto: string, lenguaje: LenguajePrograma): Array<{ nombre: string; tipo: 'dato' | 'parrafo' | 'variable' | 'etiqueta' | 'subrutina'; detalle: string }> {
  const vistos = new Set<string>();
  const salida: Array<{ nombre: string; tipo: 'dato' | 'parrafo' | 'variable' | 'etiqueta' | 'subrutina'; detalle: string }> = [];
  const agregar = (nombre: string, tipo: (typeof salida)[number]['tipo'], detalle: string) => {
    if (vistos.has(nombre)) return;
    vistos.add(nombre);
    salida.push({ nombre, tipo, detalle });
  };
  if (lenguaje === 'cobol') {
    for (const d of datosCobol(texto)) agregar(d.nombre, 'dato', `${d.nivel}${d.pic ? ` PIC ${d.pic}` : ''}`);
    const estructura = estructuraDe(texto, 'cobol');
    // Solo lo que se puede usar en un PERFORM: párrafos y secciones de la PROCEDURE DIVISION.
    const inicio = estructura.find((e) => e.tipo === 'division' && e.nombre === 'PROCEDURE DIVISION')?.linea ?? Infinity;
    for (const e of estructura) {
      if ((e.tipo === 'parrafo' || e.tipo === 'seccion') && e.linea > inicio) agregar(e.nombre, 'parrafo', e.tipo === 'seccion' ? 'sección' : 'párrafo');
    }
  } else if (lenguaje === 'cl') {
    for (const e of estructuraDe(texto, 'cl')) {
      if (e.tipo === 'variable') agregar(e.nombre, 'variable', 'variable');
      if (e.tipo === 'etiqueta') agregar(e.nombre, 'etiqueta', 'etiqueta');
      if (e.tipo === 'subrutina') agregar(e.nombre, 'subrutina', 'subrutina');
    }
  }
  return salida;
}

/** Dónde aparece un nombre como palabra entera (sin comentarios ni literales). */
export function ocurrencias(texto: string, nombre: string, lenguaje: LenguajePrograma): Ocurrencia[] {
  const buscado = nombre.toUpperCase();
  if (buscado === '') return [];
  const esCaracter = CARACTER[lenguaje];
  const salida: Ocurrencia[] = [];
  separarLineas(texto).forEach((l, i) => {
    const zona = zonaDe(l, lenguaje);
    if (!zona) return;
    const limpia = sinLiteralesNiComentarios(zona.texto, lenguaje).toUpperCase();
    let desde = 0;
    for (;;) {
      const p = limpia.indexOf(buscado, desde);
      if (p < 0) break;
      const antes = limpia[p - 1];
      const despues = limpia[p + buscado.length];
      // En COBOL un guion al final no es parte del nombre (A- en una resta no existe), pero sí entre letras.
      const bordeAntes = antes === undefined || !esCaracter.test(antes);
      const bordeDespues = despues === undefined || !esCaracter.test(despues);
      if (bordeAntes && bordeDespues) {
        const columna = zona.desde + p + 1;
        salida.push({ linea: i + 1, columna, hasta: columna + buscado.length });
      }
      desde = p + buscado.length;
    }
  });
  return salida;
}

/** Motivo por el que un nombre nuevo no sirve, o null si sirve. */
export function errorDeNombre(nombre: string, lenguaje: LenguajePrograma, esVariableCl = false): string | null {
  const n = nombre.trim().toUpperCase();
  if (lenguaje === 'cobol') {
    if (!/^[A-Z0-9-]{1,30}$/.test(n)) return 'Un nombre COBOL lleva de 1 a 30 letras, números o guiones.';
    if (n.startsWith('-') || n.endsWith('-')) return 'Un nombre COBOL no puede empezar ni terminar con guion.';
    if (!/[A-Z]/.test(n)) return 'Un nombre COBOL necesita al menos una letra.';
    return null;
  }
  if (lenguaje === 'cl') {
    if (esVariableCl) return /^&[A-Z@#$][A-Z0-9@#$_]{0,9}$/.test(n) ? null : 'Una variable CL es & seguido de hasta 10 letras o números (empieza con letra).';
    return /^[A-Z@#$][A-Z0-9@#$_]{0,9}$/.test(n) ? null : 'Una etiqueta CL lleva hasta 10 letras o números (empieza con letra).';
  }
  return 'Renombrar todavía no está disponible para este lenguaje.';
}

export interface Renombrado {
  texto: string;
  cambios: number;
  /** Líneas COBOL que, con el nombre más largo, pasan de la columna 72. */
  largas: number[];
}

/** Cambia todas las ocurrencias de un nombre. Lanza un Error si el nombre nuevo no sirve o ya existe. */
export function renombrar(texto: string, viejo: string, nuevo: string, lenguaje: LenguajePrograma): Renombrado {
  const v = viejo.toUpperCase();
  const n = nuevo.trim().toUpperCase();
  const error = errorDeNombre(n, lenguaje, lenguaje === 'cl' && v.startsWith('&'));
  if (error) throw new Error(error);
  if (n === v) return { texto, cambios: 0, largas: [] };
  if (nombresDelPrograma(texto, lenguaje).some((x) => x.nombre === n)) throw new Error(`${n} ya existe en el programa.`);
  const lista = ocurrencias(texto, v, lenguaje);
  if (lista.length === 0) throw new Error(`${v} no aparece en el programa.`);
  const lineas = separarLineas(texto);
  const largoAntes = lineas.map((l) => l.replace(/\s+$/, '').length);
  // De derecha a izquierda, para que las columnas sigan valiendo.
  for (const o of [...lista].reverse()) {
    const l = lineas[o.linea - 1];
    lineas[o.linea - 1] = l.slice(0, o.columna - 1) + n + l.slice(o.hasta - 1);
  }
  const largas =
    lenguaje === 'cobol'
      ? [...new Set(lista.map((o) => o.linea))].filter((i) => {
          const l = lineas[i - 1];
          // Solo las que el cambio empujó más allá de la 72 (no las que ya traían identificación).
          const largo = l.replace(/\s+$/, '').length;
          return largo > 72 && largoAntes[i - 1] <= 72;
        })
      : [];
  return { texto: lineas.join('\n'), cambios: lista.length, largas };
}
