/**
 * Geometría del lienzo: dónde cae cada elemento de un registro en la pantalla.
 *
 * Las posiciones de un registro con ventana (WINDOW) son relativas al interior
 * de la ventana. Aquí se calculan las cajas en coordenadas de pantalla
 * (1-indexadas) para poder seleccionar con el ratón y detectar solapamientos,
 * y el marco (área útil) para limitar el movimiento de los elementos.
 */

import type { Campo, Elemento, PantallaDSPF, Registro } from '../modelo/pantalla';
import { ventanaDe, type Ventana } from './lienzo';

/** Área donde se ubican los elementos de un registro. */
export interface Marco {
  /** Desplazamiento a sumar a (fila-1, columna-1) del registro para obtener la pantalla. */
  offF: number;
  offC: number;
  filas: number;
  columnas: number;
  ventana: Ventana | null;
}

export interface Dimension {
  ancho: number;
  alto: number;
}

export interface Caja extends Dimension {
  elementoId: string;
  /** Coordenadas de pantalla, 1-indexadas. */
  fila: number;
  columna: number;
}

/** Marco de un registro. Un subfile usa la ventana de su control. */
export function marcoDe(pantalla: PantallaDSPF, registro: Registro): Marco {
  let ventana = ventanaDe(pantalla, registro);
  if (registro.clase === 'subfile') {
    const control = pantalla.registros.find(
      (r) => r.clase === 'control-subfile' && r.subfileControlado === registro.nombre,
    );
    ventana = control ? ventanaDe(pantalla, control) : null;
  }
  return {
    offF: ventana ? ventana.fila - 1 : 0,
    offC: ventana ? ventana.columna - 1 : 0,
    // La última línea de una ventana es la de mensajes (*MSGLIN, por defecto): no admite campos.
    filas: ventana ? (ventana.sinLineaMensaje ? ventana.alto : Math.max(1, ventana.alto - 1)) : pantalla.tamano.filas,
    columnas: ventana ? ventana.ancho : pantalla.tamano.columnas,
    ventana,
  };
}

/** Texto con el que se dibujan los botones de un campo PSHBTNFLD: [F3-Salir] [F9-Grabar]. */
function anchoBotones(campo: Campo): number | null {
  if (!campo.keywords.some((k) => k.nombre === 'PSHBTNFLD')) return null;
  const textos: string[] = [];
  for (const k of campo.keywords) {
    if (k.nombre !== 'PSHBTNCHC') continue;
    const m = /'([^']*)'/.exec(k.parametros);
    if (m) textos.push(m[1]);
  }
  if (textos.length === 0) return null;
  return textos.map((t) => `[${t}]`).join(' ').length;
}

const LONGITUD_SISTEMA: Record<string, number> = { TIME: 8, DATE: 8, SYSNAME: 8, USER: 10 };

/** Ancho y alto que ocupa un campo, según cómo se dibuja (CNTFLD, salto de línea, botones...). */
export function dimensionCampo(campo: Campo, marco: Marco): Dimension {
  const botones = anchoBotones(campo);
  if (botones !== null) return { ancho: botones, alto: 1 };

  const sistema = campo.keywords.find((k) => Object.hasOwn(LONGITUD_SISTEMA, k.nombre));
  if (sistema) return { ancho: LONGITUD_SISTEMA[sistema.nombre], alto: 1 };

  const longitud = Math.max(1, campo.longitud);
  const cnt = campo.keywords.find((k) => k.nombre === 'CNTFLD');
  const segmento = cnt ? parseInt(cnt.parametros.trim(), 10) : NaN;
  if (!Number.isNaN(segmento) && segmento > 0) {
    return { ancho: Math.min(segmento, longitud), alto: Math.ceil(longitud / segmento) };
  }

  const columna = campo.columna ?? 1;
  const disponible = Math.max(1, marco.columnas - columna + 1);
  if (longitud <= disponible) return { ancho: longitud, alto: 1 };
  return { ancho: disponible, alto: 1 + Math.ceil((longitud - disponible) / marco.columnas) };
}

/** Ancho y alto de cualquier elemento. */
export function dimensionElemento(el: Elemento, marco: Marco): Dimension {
  if (el.tipo === 'constante') return { ancho: Math.max(1, el.texto.length), alto: 1 };
  return dimensionCampo(el, marco);
}

/** Cajas (en coordenadas de pantalla) de los elementos visibles de un registro. */
export function cajasElementos(pantalla: PantallaDSPF, registro: Registro): Caja[] {
  const marco = marcoDe(pantalla, registro);
  const cajas: Caja[] = [];
  for (const el of registro.elementos) {
    if (el.fila === null || el.columna === null) continue; // ocultos / de programa
    if (el.tipo === 'campo' && (el.uso === 'oculto' || el.uso === 'programa')) continue;
    const dim = dimensionElemento(el, marco);
    cajas.push({
      elementoId: el.id,
      fila: el.fila + marco.offF,
      columna: el.columna + marco.offC,
      ancho: dim.ancho,
      alto: dim.alto,
    });
  }
  return cajas;
}

/** Elemento visible en una celda de pantalla (el último dibujado gana). */
export function elementoEnCelda(cajas: Caja[], fila: number, columna: number): Caja | null {
  for (let i = cajas.length - 1; i >= 0; i--) {
    const c = cajas[i];
    if (fila >= c.fila && fila < c.fila + c.alto && columna >= c.columna && columna < c.columna + c.ancho) {
      return c;
    }
  }
  return null;
}

/**
 * Limita la posición (coordenadas del registro) para que el elemento quepa en
 * el marco. Los campos más anchos que el marco se quedan en la columna 1.
 */
export function limitarPosicion(
  fila: number,
  columna: number,
  dim: Dimension,
  marco: Marco,
): { fila: number; columna: number } {
  const maxFila = Math.max(1, marco.filas - dim.alto + 1);
  const maxCol = Math.max(1, marco.columnas - dim.ancho + 1);
  return {
    fila: Math.min(Math.max(1, fila), maxFila),
    columna: Math.min(Math.max(1, columna), maxCol),
  };
}
