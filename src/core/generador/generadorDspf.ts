/**
 * Generador de DDS de display file (DSPF): convierte el modelo `PantallaDSPF`
 * en el texto fuente que se compila con CRTDSPF.
 *
 * Es el inverso de `parsearDspf`. El formato de columnas, las continuaciones y
 * los indicadores están en `formatoDds.ts` (compartido con los archivos PF/LF).
 */

import type {
  Campo,
  Constante,
  Keyword,
  PantallaDSPF,
  Registro,
  TeclaFuncion,
  UsoCampo,
} from '../modelo/pantalla';
import {
  cabecera,
  emitirConKeywords,
  lineasKeyword,
  lineasLogicas,
  previas,
} from './formatoDds';

/** Tipos de dato numéricos: llevan siempre la columna de decimales. */
const TIPOS_CON_DECIMALES = new Set(['S', 'Y', 'P', 'B', 'F', 'I']);

const USO_LETRA: Record<UsoCampo, string> = {
  oculto: 'H',
  salida: 'O',
  entrada: 'I',
  ambos: 'B',
  programa: 'P',
};

const KEYWORDS_SISTEMA = ['TIME', 'DATE', 'SYSNAME', 'USER'];

/** Cadena de una tecla de función: CF03(03 'Salir'). */
function textoTecla(t: TeclaFuncion): string {
  const nombre = `${t.tipo}${String(t.numero).padStart(2, '0')}`;
  const partes: string[] = [];
  if (t.respuestaInd !== undefined) partes.push(String(t.respuestaInd).padStart(2, '0'));
  if (t.texto !== undefined) partes.push(`'${t.texto}'`);
  return partes.length > 0 ? `${nombre}(${partes.join(' ')})` : nombre;
}

function emitirConstante(c: Constante): string[] {
  const literal = `'${c.texto.replace(/'/g, "''")}'`;
  const cond = { inds: c.indicadores, alternativas: c.alternativas };
  const salida = [
    ...previas(cond),
    ...lineasLogicas(cabecera({ ...cond, fila: String(c.fila), columna: String(c.columna) }), literal),
  ];
  for (const k of c.keywords) salida.push(...lineasKeyword(k));
  return salida;
}

function emitirCampo(c: Campo): string[] {
  const posicion = {
    fila: c.fila !== null ? String(c.fila) : '',
    columna: c.columna !== null ? String(c.columna) : '',
  };

  // Campo de sistema: sin nombre, longitud, tipo ni uso; la keyword de sistema
  // (TIME, DATE...) debe ir en la propia línea de definición.
  if (c.sistema) {
    const i = c.keywords.findIndex((k) => KEYWORDS_SISTEMA.includes(k.nombre));
    const ordenadas = i > 0 ? [c.keywords[i], ...c.keywords.filter((_, j) => j !== i)] : c.keywords;
    return emitirConKeywords({ inds: c.indicadores, alternativas: c.alternativas, ...posicion }, ordenadas, true);
  }

  const conDecimales = TIPOS_CON_DECIMALES.has(c.tipoDato) || c.decimales > 0;
  const heredada = c.referencia && c.heredada === true;
  return emitirConKeywords(
    {
      inds: c.indicadores,
      alternativas: c.alternativas,
      nombre: c.nombre,
      referencia: c.referencia,
      longitud: !heredada && c.longitud > 0 ? String(c.longitud) : '',
      tipo: heredada ? '' : c.tipoDato,
      decimales: !heredada && conDecimales ? String(c.decimales) : '',
      uso: USO_LETRA[c.uso],
      ...posicion,
    },
    c.keywords,
    true,
  );
}

function emitirRegistro(r: Registro): string[] {
  const salida = emitirConKeywords(
    { inds: r.indicadores, alternativas: r.alternativas, marca: 'R', nombre: r.nombre },
    r.keywords,
    true,
  );
  for (const el of r.elementos) {
    salida.push(...(el.tipo === 'constante' ? emitirConstante(el) : emitirCampo(el)));
  }
  return salida;
}

/** Keywords de archivo, añadiendo DSPSIZ si hace falta (tamaño no estándar). */
function keywordsDeArchivo(p: PantallaDSPF): Keyword[] {
  const kws = [...p.keywordsArchivo];
  const hayDspsiz = kws.some((k) => k.nombre === 'DSPSIZ');
  const estandar = p.tamano.filas === 24 && p.tamano.columnas === 80;
  if (!hayDspsiz && !estandar) {
    kws.unshift({
      nombre: 'DSPSIZ',
      parametros: `${p.tamano.filas} ${p.tamano.columnas} ${p.tamano.codigo}`,
      indicadores: [],
    });
  }
  return kws;
}

/** Genera el fuente DDS completo de una pantalla. */
export function generarDspf(pantalla: PantallaDSPF): string {
  const lineas: string[] = [];

  // Keywords de archivo con las teclas de función intercaladas en su posición
  // original; las que no tienen posición van al final.
  const kws = keywordsDeArchivo(pantalla);
  const desfase = kws.length - pantalla.keywordsArchivo.length; // DSPSIZ añadido
  const teclasEn = new Map<number, TeclaFuncion[]>();
  const teclasFinales: TeclaFuncion[] = [];
  for (const t of pantalla.teclasFuncion) {
    const pos = t.posicion === undefined ? -1 : t.posicion + desfase;
    if (pos < 0 || pos > kws.length) {
      teclasFinales.push(t);
    } else {
      teclasEn.set(pos, [...(teclasEn.get(pos) ?? []), t]);
    }
  }
  const emitirTecla = (t: TeclaFuncion) =>
    lineas.push(...lineasLogicas(cabecera({ inds: [] }), textoTecla(t)));
  for (let i = 0; i <= kws.length; i++) {
    (teclasEn.get(i) ?? []).forEach(emitirTecla);
    if (i < kws.length) lineas.push(...lineasKeyword(kws[i]));
  }
  teclasFinales.forEach(emitirTecla);
  for (const r of pantalla.registros) {
    lineas.push(...emitirRegistro(r));
  }

  return lineas.join('\n') + '\n';
}
