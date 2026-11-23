/**
 * Parser de fuentes DDS de display file (DSPF) de IBM i.
 *
 * Convierte el texto de una fuente (tal como se exporta de un source physical
 * file / SEU / SDA) en el modelo `PantallaDSPF`. Trabaja por columnas fijas,
 * une líneas de continuación y clasifica cada línea como: comentario, keyword
 * de archivo, definición de registro (R), definición de campo, constante
 * posicionada, o keyword suelta que aplica al último elemento/registro.
 *
 * Posiciones de columnas DDS (1-indexadas, como en SEU):
 *   6      tipo de fuente (A)
 *   7      '*' = comentario
 *   7-16   indicadores condicionales (hasta 3, cada uno 3 chars: [N]nn)
 *   17     'R' = registro
 *   19-28  nombre
 *   30-34  longitud
 *   35     tipo de dato
 *   36-37  decimales
 *   38     uso (H/O/I/B/P)
 *   39-41  fila
 *   42-44  columna
 *   45-80  funciones (keywords) o constante
 */

import type {
  Campo,
  Constante,
  IndicadorCond,
  Keyword,
  PantallaDSPF,
  Registro,
  TeclaFuncion,
  TipoCampo,
  UsoCampo,
} from '../modelo/pantalla';
import { TAMANO_24X80 } from '../modelo/pantalla';
import { nuevoId } from '../modelo/ids';
import {
  esConstante,
  extraerTextoConstante,
  separarKeywords,
} from './keywords';

/** Subcadena por columnas 1-indexadas [desde, hasta] inclusive, tolerante a líneas cortas. */
function col(linea: string, desde: number, hasta: number): string {
  return linea.slice(desde - 1, hasta);
}

/**
 * Une las líneas de continuación. Una línea DDS de funciones continúa si su
 * último carácter no blanco en la zona de funciones es '-' o '+'. El join
 * elimina ese carácter y pega la zona de funciones de la línea siguiente.
 *
 * Para simplificar, trabajamos sobre líneas completas: si una línea termina en
 * '-' o '+', se concatena con la zona de funciones (col 45+) de la siguiente.
 */
export function unirContinuaciones(lineas: string[]): string[] {
  const resultado: string[] = [];
  let acumulada: string | null = null;
  // Tipo de continuación de la línea anterior:
  //  '-' la continuación empieza en la col 45 e INCLUYE los espacios iniciales.
  //  '+' los espacios iniciales de la línea siguiente se ignoran.
  let tipoContinuacion: '-' | '+' = '-';

  for (const original of lineas) {
    const linea = original.replace(/\r$/, '');

    if (acumulada !== null) {
      // La siguiente línea aporta su zona de funciones (col 45+).
      const continuacion = linea.length >= 45 ? linea.slice(44) : '';
      acumulada =
        acumulada +
        (tipoContinuacion === '+' ? continuacion.replace(/^\s+/, '') : continuacion);
    } else {
      acumulada = linea;
    }

    const recortada: string = (acumulada as string).trimEnd();
    const ultimo: string = recortada.slice(-1);
    if (ultimo === '-' || ultimo === '+') {
      tipoContinuacion = ultimo;
      // Quitar el carácter de continuación y seguir acumulando.
      acumulada = recortada.slice(0, -1);
    } else {
      resultado.push(acumulada);
      acumulada = null;
    }
  }

  if (acumulada !== null) resultado.push(acumulada);
  return resultado;
}

/**
 * Interpreta los indicadores condicionales. La col 7 es AND/OR/comentario y los
 * indicadores ocupan las cols 8-16: hasta 3 grupos de 3 chars, cada uno
 * [N][nn] (col 8 = N opcional, cols 9-10 = número).
 */
function leerIndicadores(linea: string): IndicadorCond[] {
  const zona = col(linea, 8, 16); // 9 chars -> 3 grupos de 3
  const inds: IndicadorCond[] = [];
  for (let g = 0; g < 3; g++) {
    const trozo = zona.slice(g * 3, g * 3 + 3); // p.ej. "N30", " 99", "   "
    const t = trozo.trim();
    if (t.length === 0) continue;
    const negado = t.startsWith('N');
    const numStr = negado ? t.slice(1) : t;
    const numero = parseInt(numStr, 10);
    if (!Number.isNaN(numero)) inds.push({ numero, negado });
  }
  return inds;
}

/** Convierte keywords brutas a keywords del modelo, llevando los indicadores. */
function construirKeywords(
  zona: string,
  inds: IndicadorCond[],
  alternativas?: IndicadorCond[][],
): Keyword[] {
  if (esConstante(zona)) return [];
  return separarKeywords(zona).map((k) => ({
    nombre: k.nombre,
    parametros: k.parametros,
    indicadores: inds,
    ...(alternativas ? { alternativas } : {}),
  }));
}

/** Extrae las teclas de función (CFnn/CAnn) de las keywords de archivo. */
function extraerTeclaFuncion(k: Keyword): TeclaFuncion | null {
  const m = /^(CF|CA)(\d{2})$/.exec(k.nombre);
  if (!m) return null;
  const tipo = m[1] as 'CF' | 'CA';
  const numero = parseInt(m[2], 10);
  // parametros: "03 'Salir'" -> respuestaInd=3, texto=Salir
  const partes = k.parametros.trim();
  const mp = /^(\d{1,2})?\s*(?:'(.*)')?$/.exec(partes);
  let respuestaInd: number | undefined;
  let texto: string | undefined;
  if (mp) {
    if (mp[1]) respuestaInd = parseInt(mp[1], 10);
    if (mp[2] !== undefined) texto = mp[2];
  }
  return { tipo, numero, respuestaInd, texto };
}

const RE_NOMBRE = /^[A-Z#$@][A-Z0-9#$@_]*$/i;

/**
 * Parsea una fuente DDS DSPF completa y devuelve el modelo PantallaDSPF.
 */
export function parsearDspf(
  texto: string,
  nombre = 'PANTALLA',
): PantallaDSPF {
  const pantalla: PantallaDSPF = {
    nombre,
    tamano: { ...TAMANO_24X80 },
    keywordsArchivo: [],
    teclasFuncion: [],
    registros: [],
    advertencias: [],
  };

  const lineasFisicas = texto.split('\n');
  const lineas = unirContinuaciones(lineasFisicas);

  let registroActual: Registro | null = null;
  // Grupos de indicadores de las líneas `A nn` / `AO nn` que preceden a una definición.
  let condicionPendiente: IndicadorCond[][] = [];
  // Último "destino" de keywords sueltas: un elemento o el registro/archivo.
  let destinoKeywords:
    | { tipo: 'archivo' }
    | { tipo: 'registro'; reg: Registro }
    | { tipo: 'elemento'; el: Campo | Constante } = { tipo: 'archivo' };

  for (const linea of lineas) {
    // Línea en blanco.
    if (linea.trim().length === 0) continue;

    // Col 6 debe ser 'A' (tipo de especificación). Si no, ignorar.
    const tipoEspec = col(linea, 6, 6);
    if (tipoEspec !== 'A' && tipoEspec !== 'a') {
      // Puede ser una línea de numeración/basura; la registramos y seguimos.
      continue;
    }

    // Comentario: '*' en col 7.
    if (col(linea, 7, 7) === '*') continue;

    const indsLinea = leerIndicadores(linea);
    const marcaR = col(linea, 17, 17).trim();
    const nombreCampo = col(linea, 19, 28).trim();
    const zonaFunciones = linea.length >= 45 ? linea.slice(44) : '';

    // Condición con OR: líneas que solo traen indicadores (`A 40`, `AO 41`) y se suman a la
    // definición que viene después, que lleva el último grupo (col 7 = 'O').
    const esOr = col(linea, 7, 7).toUpperCase() === 'O';
    if (
      indsLinea.length > 0 &&
      marcaR === '' &&
      nombreCampo === '' &&
      zonaFunciones.trim() === '' &&
      col(linea, 30, 44).trim() === ''
    ) {
      if (!esOr) condicionPendiente = [];
      condicionPendiente.push(indsLinea);
      continue;
    }
    const grupos = esOr && condicionPendiente.length > 0 ? [...condicionPendiente, indsLinea] : [indsLinea];
    condicionPendiente = [];
    const inds = grupos[0];
    const alternativas = grupos.length > 1 ? grupos.slice(1) : undefined;

    // --- Definición de registro (R en col 17) ---
    if (marcaR === 'R') {
      const kws = construirKeywords(zonaFunciones, inds, alternativas);
      const esSfl = kws.some((k) => k.nombre === 'SFL');
      const sflctl = kws.find((k) => k.nombre === 'SFLCTL');
      const reg: Registro = {
        id: nuevoId('reg'),
        nombre: nombreCampo,
        clase: esSfl
          ? 'subfile'
          : sflctl
            ? 'control-subfile'
            : 'normal',
        subfileControlado: sflctl ? sflctl.parametros.trim() : undefined,
        keywords: kws,
        elementos: [],
        indicadores: inds,
        ...(alternativas ? { alternativas } : {}),
      };
      pantalla.registros.push(reg);
      registroActual = reg;
      destinoKeywords = { tipo: 'registro', reg };
      continue;
    }

    // --- Keyword de archivo (sin registro todavía) ---
    if (registroActual === null) {
      const kws = construirKeywords(zonaFunciones, inds, alternativas);
      for (const k of kws) {
        if (k.nombre === 'DSPSIZ') aplicarDspsiz(pantalla, k.parametros);
        const tf = extraerTeclaFuncion(k);
        if (tf) {
          tf.posicion = pantalla.keywordsArchivo.length;
          pantalla.teclasFuncion.push(tf);
        } else pantalla.keywordsArchivo.push(k);
      }
      continue;
    }

    // --- Dentro de un registro ---
    const longitud = col(linea, 30, 34).trim();
    const tipoDato = col(linea, 35, 35).trim();
    const decimales = col(linea, 36, 37).trim();
    const uso = col(linea, 38, 38).trim();
    const fila = col(linea, 39, 41).trim();
    const columna = col(linea, 42, 44).trim();

    const tieneNombreValido = nombreCampo.length > 0 && RE_NOMBRE.test(nombreCampo);
    const esDefinicionCampo = tieneNombreValido && (longitud !== '' || uso !== '');

    // --- Campo ---
    if (esDefinicionCampo) {
      const campo: Campo = {
        tipo: 'campo',
        id: nuevoId('campo'),
        nombre: nombreCampo,
        longitud: longitud ? parseInt(longitud, 10) : 0,
        decimales: decimales ? parseInt(decimales, 10) : 0,
        tipoDato: tipoDato as TipoCampo,
        uso: mapearUso(uso),
        fila: fila ? parseInt(fila, 10) : null,
        columna: columna ? parseInt(columna, 10) : null,
        keywords: construirKeywords(zonaFunciones, inds, alternativas),
        indicadores: inds,
        ...(alternativas ? { alternativas } : {}),
        referencia: col(linea, 29, 29).toUpperCase() === 'R',
      };
      registroActual.elementos.push(campo);
      destinoKeywords = { tipo: 'elemento', el: campo };
      continue;
    }

    // --- Constante posicionada (fila/col + texto entre comillas) ---
    if (fila !== '' && columna !== '' && esConstante(zonaFunciones)) {
      const constante: Constante = {
        tipo: 'constante',
        id: nuevoId('cte'),
        fila: parseInt(fila, 10),
        columna: parseInt(columna, 10),
        texto: extraerTextoConstante(zonaFunciones),
        keywords: [],
        indicadores: inds,
        ...(alternativas ? { alternativas } : {}),
      };
      registroActual.elementos.push(constante);
      destinoKeywords = { tipo: 'elemento', el: constante };
      continue;
    }

    // --- Campo de sistema sin nombre (TIME, DATE, SYSNAME, USER) con posición ---
    const kwsSistema = construirKeywords(zonaFunciones, inds, alternativas);
    const kwSistema = kwsSistema.find((k) =>
      ['TIME', 'DATE', 'SYSNAME', 'USER'].includes(k.nombre),
    );
    if (nombreCampo === '' && fila !== '' && columna !== '' && kwSistema) {
      const longitudes: Record<string, number> = { TIME: 8, DATE: 8, SYSNAME: 8, USER: 10 };
      const campoSis: Campo = {
        tipo: 'campo',
        id: nuevoId('campo'),
        nombre: kwSistema.nombre,
        longitud: longitudes[kwSistema.nombre],
        decimales: 0,
        tipoDato: 'A',
        uso: 'salida',
        fila: parseInt(fila, 10),
        columna: parseInt(columna, 10),
        keywords: kwsSistema,
        indicadores: inds,
        ...(alternativas ? { alternativas } : {}),
        referencia: false,
        sistema: true,
      };
      registroActual.elementos.push(campoSis);
      destinoKeywords = { tipo: 'elemento', el: campoSis };
      continue;
    }

    // --- Keyword suelta: aplica al último destino ---
    const kws = kwsSistema;
    if (kws.length === 0) {
      if (zonaFunciones.trim().length > 0) {
        pantalla.advertencias.push(`No interpretada: ${linea.trimEnd()}`);
      }
      continue;
    }
    aplicarKeywordsSueltas(destinoKeywords, registroActual, kws);
  }

  return pantalla;
}

function mapearUso(uso: string): UsoCampo {
  switch (uso.toUpperCase()) {
    case 'H':
      return 'oculto';
    case 'O':
      return 'salida';
    case 'I':
      return 'entrada';
    case 'B':
      return 'ambos';
    case 'P':
      return 'programa';
    default:
      return 'salida';
  }
}

function aplicarDspsiz(pantalla: PantallaDSPF, parametros: string): void {
  // "24 80 *DS3"
  const partes = parametros.trim().split(/\s+/);
  if (partes.length >= 2) {
    const filas = parseInt(partes[0], 10);
    const columnas = parseInt(partes[1], 10);
    if (!Number.isNaN(filas) && !Number.isNaN(columnas)) {
      pantalla.tamano = {
        filas,
        columnas,
        codigo: partes[2] ?? '*DS3',
      };
    }
  }
}

function aplicarKeywordsSueltas(
  destino:
    | { tipo: 'archivo' }
    | { tipo: 'registro'; reg: Registro }
    | { tipo: 'elemento'; el: Campo | Constante },
  registroActual: Registro,
  kws: Keyword[],
): void {
  if (destino.tipo === 'elemento') {
    destino.el.keywords.push(...kws);
  } else if (destino.tipo === 'registro') {
    destino.reg.keywords.push(...kws);
  } else {
    registroActual.keywords.push(...kws);
  }
}
