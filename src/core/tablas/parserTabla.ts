/**
 * Parser de fuentes DDS de archivos de base de datos (PF y LF).
 *
 * Mismo formato de columnas que las pantallas (ver `formatoDds.ts`), con estas
 * marcas en la columna 17: R registro, K llave, S selección, O omisión, J unión.
 * Una línea sin marca y con nombre define un campo; sin marca y sin nombre es
 * una keyword más del elemento anterior (típico de COLHDG en su propia línea).
 *
 * Los comentarios (`A*`) se guardan en el elemento que sigue. Las líneas en
 * blanco (`A` sola) se descartan.
 */

import type { Keyword } from '../modelo/pantalla';
import { nuevoId } from '../modelo/ids';
import { separarKeywords } from '../parser/keywords';
import type {
  CampoTabla,
  ElementoTabla,
  RegistroTabla,
  Tabla,
} from './modelo';

export type LineaFuente = { tipo: 'comentario'; texto: string } | { tipo: 'linea'; texto: string };

/** Subcadena por columnas 1-indexadas [desde, hasta] inclusive, tolerante a líneas cortas. */
function col(linea: string, desde: number, hasta: number): string {
  return linea.slice(desde - 1, hasta);
}

/**
 * Une las líneas de continuación y separa los comentarios. Un comentario nunca
 * se continúa, aunque termine en '-' o '+'.
 *  '-' la continuación empieza en la col 45 e incluye los espacios iniciales.
 *  '+' los espacios iniciales de la línea siguiente se ignoran.
 */
export function prepararLineas(texto: string): LineaFuente[] {
  const resultado: LineaFuente[] = [];
  let acumulada: string | null = null;
  let tipoContinuacion: '-' | '+' = '-';

  for (const original of texto.split('\n')) {
    const linea = original.replace(/\r$/, '');

    if (acumulada === null && linea.length >= 7 && linea[5].toUpperCase() === 'A' && linea[6] === '*') {
      resultado.push({ tipo: 'comentario', texto: linea.slice(7).trimEnd() });
      continue;
    }

    if (acumulada !== null) {
      const continuacion = linea.length >= 45 ? linea.slice(44) : '';
      acumulada += tipoContinuacion === '+' ? continuacion.replace(/^\s+/, '') : continuacion;
    } else {
      acumulada = linea;
    }

    const recortada: string = (acumulada as string).trimEnd();
    const ultimo = recortada.slice(-1);
    if (ultimo === '-' || ultimo === '+') {
      tipoContinuacion = ultimo;
      acumulada = recortada.slice(0, -1);
    } else {
      resultado.push({ tipo: 'linea', texto: acumulada as string });
      acumulada = null;
    }
  }
  if (acumulada !== null) resultado.push({ tipo: 'linea', texto: acumulada });
  return resultado;
}

/** Keywords de la zona de funciones (col 45 en adelante). */
function keywordsDe(linea: string): Keyword[] {
  const zona = linea.length >= 45 ? linea.slice(44) : '';
  return separarKeywords(zona).map((k) => ({
    nombre: k.nombre,
    parametros: k.parametros.trim(),
    indicadores: [],
  }));
}

function numeroOnull(texto: string): number | null {
  const t = texto.trim();
  if (t === '') return null;
  const n = parseInt(t, 10);
  return Number.isNaN(n) ? null : n;
}

/** Parsea un fuente DDS de archivo (PF o LF) y devuelve el modelo. */
export function parsearTabla(texto: string, nombre = 'ARCHIVO'): Tabla {
  const tabla: Tabla = {
    nombre,
    keywords: [],
    registros: [],
    comentariosArchivo: [],
    comentariosFinales: [],
    advertencias: [],
  };

  let registroActual: RegistroTabla | null = null;
  /** Dónde se anexan las keywords sueltas: el archivo, el registro o un elemento. */
  let destino: Keyword[] = tabla.keywords;
  let pendientes: string[] = [];

  const tomarComentarios = (): string[] => {
    const c = pendientes;
    pendientes = [];
    return c;
  };

  for (const item of prepararLineas(texto)) {
    if (item.tipo === 'comentario') {
      pendientes.push(item.texto);
      continue;
    }

    const linea = item.texto;
    if (linea.slice(6).trim() === '') continue; // línea en blanco

    if (linea[5].toUpperCase() !== 'A') {
      tabla.advertencias.push(`No interpretada: ${linea.trimEnd()}`);
      continue;
    }

    const marca = col(linea, 17, 17).toUpperCase().trim();
    const nombreLinea = col(linea, 19, 28).trim();
    const keywords = keywordsDe(linea);

    // --- Registro ---
    if (marca === 'R') {
      const reg: RegistroTabla = {
        id: nuevoId('reg'),
        nombre: nombreLinea,
        keywords,
        elementos: [],
        comentarios: tomarComentarios(),
      };
      tabla.registros.push(reg);
      registroActual = reg;
      destino = reg.keywords;
      continue;
    }

    // --- Keywords de archivo (antes del primer registro) ---
    if (registroActual === null) {
      if (marca !== '' || nombreLinea !== '') {
        tabla.advertencias.push(`No interpretada (antes del primer registro): ${linea.trimEnd()}`);
        continue;
      }
      tabla.comentariosArchivo.push(...tomarComentarios());
      tabla.keywords.push(...keywords);
      continue;
    }

    // --- Dentro de un registro ---
    let elemento: ElementoTabla | null = null;

    if (marca === 'K') {
      elemento = { tipo: 'llave', id: nuevoId('llave'), nombre: nombreLinea, keywords, comentarios: tomarComentarios() };
    } else if (marca === 'S' || marca === 'O') {
      elemento = {
        tipo: marca === 'S' ? 'seleccion' : 'omision',
        id: nuevoId('sel'),
        nombre: nombreLinea,
        keywords,
        comentarios: tomarComentarios(),
      };
    } else if (marca === 'J') {
      elemento = { tipo: 'union', id: nuevoId('union'), keywords, comentarios: tomarComentarios() };
    } else if (marca === '' && nombreLinea !== '') {
      const campo: CampoTabla = {
        tipo: 'campo',
        id: nuevoId('campo'),
        nombre: nombreLinea,
        longitud: numeroOnull(col(linea, 30, 34)),
        tipoDato: col(linea, 35, 35).trim(),
        decimales: numeroOnull(col(linea, 36, 37)),
        referencia: col(linea, 29, 29).toUpperCase() === 'R',
        uso: col(linea, 38, 38).trim(),
        keywords,
        comentarios: tomarComentarios(),
      };
      elemento = campo;
    } else if (marca === '' && nombreLinea === '') {
      // Keyword suelta: va al elemento (o registro) anterior.
      destino.push(...keywords);
      continue;
    } else {
      tabla.advertencias.push(`Marca desconocida «${marca}»: ${linea.trimEnd()}`);
      continue;
    }

    registroActual.elementos.push(elemento);
    destino = elemento.keywords;
  }

  tabla.comentariosFinales = pendientes;
  return tabla;
}
