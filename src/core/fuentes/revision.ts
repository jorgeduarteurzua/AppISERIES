/**
 * Revisión del formato de un fuente antes de enviarlo: columnas, tabuladores y caracteres
 * que no pasan bien a EBCDIC. No reemplaza al compilador; avisa de lo que el editor puede ver.
 */
import type { LenguajePrograma } from './lenguaje';
import type { NivelMensaje } from '../as400/listado';

export interface ProblemaFuente {
  linea: number;
  /** Columna desde 1. */
  columna: number;
  /** Columna donde termina (exclusiva), para marcar el tramo. */
  hasta: number;
  nivel: NivelMensaje;
  mensaje: string;
}

/** Largo máximo de una línea en el archivo fuente (registro de 92 = 80 + secuencia y fecha). */
export const LARGO_REGISTRO = 80;
/** En COBOL de formato fijo, de la columna 73 en adelante es identificación: no se compila. */
export const ULTIMA_COLUMNA_COBOL = 72;

const INDICADORES_COBOL = new Set([' ', '*', '/', '-', 'D', 'd']);

/** Línea de comentario COBOL: * o / en la columna 7. */
function esComentarioCobol(linea: string): boolean {
  return linea[6] === '*' || linea[6] === '/';
}

export function revisarFuente(texto: string, lenguaje: LenguajePrograma): ProblemaFuente[] {
  const salida: ProblemaFuente[] = [];
  const lineas = texto.replace(/\r\n?/g, '\n').split('\n');
  lineas.forEach((l, i) => {
    const linea = i + 1;
    const tab = l.indexOf('\t');
    if (tab >= 0) {
      salida.push({ linea, columna: tab + 1, hasta: tab + 2, nivel: 'error', mensaje: 'Tabulador: el AS400 no lo entiende en un fuente; use espacios.' });
    }
    if (l.length > LARGO_REGISTRO) {
      salida.push({
        linea,
        columna: LARGO_REGISTRO + 1,
        hasta: l.length + 1,
        nivel: 'error',
        mensaje: `La línea mide ${l.length}: el archivo fuente admite ${LARGO_REGISTRO} caracteres.`,
      });
    }
    // Con tabuladores las columnas no se pueden saber: basta con ese aviso.
    if (lenguaje === 'cobol' && l.trim() !== '' && tab < 0) {
      const indicador = l[6] ?? ' ';
      if (!INDICADORES_COBOL.has(indicador)) {
        salida.push({
          linea,
          columna: 7,
          hasta: 8,
          nivel: 'error',
          mensaje: `Columna 7 con «${indicador}»: solo puede ir espacio, * o / (comentario), - (continuación) o D (depuración).`,
        });
      }
      const fuera = l.slice(ULTIMA_COLUMNA_COBOL, LARGO_REGISTRO);
      if (fuera.trim() !== '' && !esComentarioCobol(l)) {
        salida.push({
          linea,
          columna: ULTIMA_COLUMNA_COBOL + 1,
          hasta: Math.min(l.length, LARGO_REGISTRO) + 1,
          nivel: 'aviso',
          mensaje: 'Texto después de la columna 72: el compilador no lo lee.',
        });
      }
    }
    // Acentos, eñes y otros: en un comentario no importan; en el código o en un literal pueden cambiar en EBCDIC.
    const comentario = lenguaje === 'cobol' ? esComentarioCobol(l) : false;
    if (!comentario) {
      const m = /[^\x20-\x7e\t]/.exec(lenguaje === 'cl' ? l.replace(/\/\*.*?\*\//g, (x) => ' '.repeat(x.length)) : l);
      if (m) {
        salida.push({
          linea,
          columna: m.index + 1,
          hasta: m.index + 2,
          nivel: 'aviso',
          mensaje: `Carácter «${m[0]}»: puede cambiar al pasar a EBCDIC; mejor sin acentos.`,
        });
      }
    }
  });
  return salida;
}
