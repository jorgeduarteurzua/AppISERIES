/**
 * Generador de DDS de archivos (PF/LF): convierte el modelo `Tabla` en el
 * fuente que se compila con CRTPF o CRTLF. Es el inverso de `parsearTabla`.
 *
 * Cada keyword de archivo va en su línea; en registros, campos, llaves y
 * selecciones la primera keyword va en la propia línea de la definición (como
 * hace SEU) y las demás en líneas siguientes. Los comentarios se escriben
 * antes del elemento al que pertenecen.
 */

import type { Keyword } from '../modelo/pantalla';
import { cabecera, emitirConKeywords, lineasLogicas, textoKeyword } from './../generador/formatoDds';
import type { CampoTabla, ElementoTabla, RegistroTabla, Tabla } from './modelo';

function comentarios(textos: string[]): string[] {
  return textos.map((t) => `     A*${t}`.trimEnd());
}

function emitirCampo(c: CampoTabla): string[] {
  return [
    ...comentarios(c.comentarios),
    ...emitirConKeywords(
      {
        inds: [],
        nombre: c.nombre,
        referencia: c.referencia,
        longitud: c.longitud !== null ? String(c.longitud) : '',
        tipo: c.tipoDato,
        decimales: c.decimales !== null ? String(c.decimales) : '',
        uso: c.uso,
      },
      c.keywords,
      true,
    ),
  ];
}

const MARCA: Record<Exclude<ElementoTabla['tipo'], 'campo'>, string> = {
  llave: 'K',
  seleccion: 'S',
  omision: 'O',
  union: 'J',
};

function emitirElemento(e: ElementoTabla): string[] {
  if (e.tipo === 'campo') return emitirCampo(e);
  return [
    ...comentarios(e.comentarios),
    ...emitirConKeywords(
      { inds: [], marca: MARCA[e.tipo], nombre: e.tipo === 'union' ? '' : e.nombre },
      e.keywords,
      true,
    ),
  ];
}

function emitirRegistro(r: RegistroTabla): string[] {
  const salida = [
    ...comentarios(r.comentarios),
    ...emitirConKeywords({ inds: [], marca: 'R', nombre: r.nombre }, r.keywords, true),
  ];
  for (const e of r.elementos) salida.push(...emitirElemento(e));
  return salida;
}

function emitirKeywordSuelta(k: Keyword): string[] {
  return lineasLogicas(cabecera({ inds: [] }), textoKeyword(k));
}

/** Genera el fuente DDS completo de un archivo (PF o LF). */
export function generarTabla(tabla: Tabla): string {
  const lineas: string[] = [...comentarios(tabla.comentariosArchivo)];
  for (const k of tabla.keywords) lineas.push(...emitirKeywordSuelta(k));
  for (const r of tabla.registros) lineas.push(...emitirRegistro(r));
  lineas.push(...comentarios(tabla.comentariosFinales));
  return lineas.join('\n') + '\n';
}
