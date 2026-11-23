/**
 * Plan de un CRUD: de la tabla (PF) saca qué campos entran, con qué tipo,
 * cómo se llaman en la pantalla, qué teclas se usan y cómo se reparte todo en
 * la pantalla (normal o window, de 80 o 132 columnas). Lo comparten el
 * generador de la pantalla (DSPF) y el del programa COBOL, así los dos usan
 * siempre los mismos nombres, posiciones y tipos.
 */

import { definicionDe } from '../tablas/generadorSql';
import { camposDe, literalesDe, llavesDe, parametroDe, tipoDeTabla } from '../tablas/modelo';
import type { CampoTabla, Tabla } from '../tablas/modelo';
import { TAMANO_24X80, TAMANO_27X132 } from '../modelo/pantalla';
import type { TamanoPantalla } from '../modelo/pantalla';
import {
  almacenamientosPosibles,
  expresionActual,
  FORMATOS_FECHA,
  FORMATOS_HORA,
  largoFormato,
  tokensFormato,
} from './fechaHora';
import type { DefinicionDds, FechaHoraCampo, TipoFechaHora } from './fechaHora';
import { resolverValidaciones } from './validacionesCrud';
import type { ValidacionCampo, ValidacionPlan } from './validacionesCrud';

/** COBOL con SQL: OPM (CRTSQLCBL) o ILE (CRTSQLCBLI). */
export type TipoCobolCrud = 'SQLCBL' | 'SQLCBLLE';
export type TipoPantallaCrud = 'normal' | 'window';
export type AnchoPantallaCrud = 80 | 132 | 'auto';

/** Qué hace una tecla. `personalizada` deja un párrafo vacío para que el programador agregue su código. */
export type AccionTecla =
  | 'salir'
  | 'ayuda'
  | 'renovar'
  | 'insertar'
  | 'modificar'
  | 'grabar'
  | 'volver'
  | 'izquierda'
  | 'derecha'
  | 'eliminar'
  /** Ayuda del campo donde está el cursor (llama a un programa de ayuda). Solo en el detalle, al agregar o modificar. */
  | 'ayudaCampo'
  | 'personalizada';

export type DondeTecla = 'lista' | 'detalle' | 'ambas';

export interface TeclaCrud {
  /** Número de la tecla de función, de 1 a 24. */
  numero: number;
  /** Texto que se ve en la leyenda: F8=Modificar. */
  texto: string;
  accion: AccionTecla;
  /** Solo cuenta para las personalizadas; las demás tienen su lugar fijo. */
  donde: DondeTecla;
}

export const TECLAS_POR_DEFECTO: TeclaCrud[] = [
  { numero: 1, texto: 'Ayuda', accion: 'ayuda', donde: 'ambas' },
  { numero: 3, texto: 'Salir', accion: 'salir', donde: 'ambas' },
  { numero: 4, texto: 'Ayuda campo', accion: 'ayudaCampo', donde: 'detalle' },
  { numero: 5, texto: 'Renovar', accion: 'renovar', donde: 'ambas' },
  { numero: 6, texto: 'Insertar', accion: 'insertar', donde: 'lista' },
  { numero: 8, texto: 'Modificar', accion: 'modificar', donde: 'ambas' },
  { numero: 9, texto: 'Grabar', accion: 'grabar', donde: 'detalle' },
  { numero: 12, texto: 'Volver', accion: 'volver', donde: 'ambas' },
  { numero: 19, texto: 'Izquierda', accion: 'izquierda', donde: 'lista' },
  { numero: 20, texto: 'Derecha', accion: 'derecha', donde: 'lista' },
  { numero: 23, texto: 'Eliminar', accion: 'eliminar', donde: 'ambas' },
];

/** Valor que se asigna a un campo que no se muestra en el detalle. */
export type ValorAuto =
  | { tipo: 'defecto' }
  | { tipo: 'fechaActual' }
  | { tipo: 'horaActual' }
  | { tipo: 'usuario' }
  | { tipo: 'fijo'; valor: string };

export interface AyudaCampo {
  /** Nombre del párrafo COBOL que se genera, por ejemplo AYUDA-GENERO. */
  parrafo: string;
  /** Programa que muestra la ayuda y devuelve código y descripción; vacío = el CALL queda para completar. */
  programa: string;
}

export interface OpcionesCrud {
  /** Nombre de la tabla (el archivo) sobre la que se hace el CRUD. */
  nombreTabla: string;
  /** Nombre del miembro de la pantalla (DSPF). */
  nombrePantalla: string;
  /** Nombre del programa. */
  nombrePrograma: string;
  tipoCobol: TipoCobolCrud;
  /** Título que se ve en las pantallas. */
  titulo: string;
  /** Va en AUTHOR del programa. */
  autor: string;
  /** Si se indica, la tabla se califica en el SQL (BIBLIOTECA/TABLA). */
  bibliotecaTabla: string;
  /** Pantalla completa o en ventanas. Por defecto, normal. */
  tipoPantalla?: TipoPantallaCrud;
  /** 80 o 132 columnas; automático elige 80 si todo cabe. */
  ancho?: AnchoPantallaCrud;
  /** Teclas de función. Por defecto, TECLAS_POR_DEFECTO. */
  teclas?: TeclaCrud[];
  /** Campos de la lista. Si falta, entran todos los del detalle que caben. */
  camposLista?: string[];
  /** Campos del detalle. Si falta, entran todos los que caben. */
  camposDetalle?: string[];
  /**
   * Largo de la fila de los campos de texto que no caben en una sola fila del detalle
   * (CNTFLD). Si falta, se usa el mayor divisor exacto del largo del campo.
   */
  ajustesCntfld?: Record<string, number>;
  /**
   * Ayuda de campo (tecla «ayudaCampo»), por nombre de campo de la tabla: el párrafo que se genera
   * en el programa y el programa de ayuda que ese párrafo llama (puede quedar vacío).
   */
  ayudasCampo?: Record<string, AyudaCampo>;
  /** Validaciones de los campos del detalle al agregar y al modificar (por nombre de campo). */
  validacionesCampo?: Record<string, ValidacionCampo>;
  /** Campos que son fecha u hora y cómo se ven (por nombre de campo). */
  camposFechaHora?: Record<string, FechaHoraCampo>;
  /** Valor de los campos que no están en el detalle al agregar un registro. */
  valoresAlAgregar?: Record<string, ValorAuto>;
  /** Valor de los campos que no están en el detalle al modificar un registro. */
  valoresAlModificar?: Record<string, ValorAuto>;
  /** Para resolver los campos que se definen por referencia (REFFLD). */
  resolverArchivo?: (nombre: string) => Tabla | null;
}

export interface CampoCrud {
  /** Nombre de la columna en la tabla. */
  nombre: string;
  /** Nombre del campo en la pantalla y base del nombre COBOL. */
  nombrePantalla: string;
  /** Cómo es la variable del programa (la que va al SQL): A = texto, N = numérico. */
  clase: 'A' | 'N';
  longitud: number;
  decimales: number;
  /** Texto del campo en el detalle. */
  etiqueta: string;
  /** Encabezado de la columna en la lista. */
  encabezado: string;
  llave: boolean;
  descendente: boolean;
  /** Definición original del campo en el DDS. */
  def: DefinicionDds;
  /** Si es fecha u hora, cómo se ve y cómo se guarda. */
  fechaHora?: FechaHoraCampo;
  /** Cómo se ve el campo en la pantalla. */
  pantalla: { clase: 'A' | 'N'; longitud: number; decimales: number };
  /** Largo de cada fila si el campo se parte en varias (CNTFLD); null si va en una sola fila. */
  cntfld: number | null;
  /** Filas que ocupa en el detalle. */
  filasDetalle: number;
  /** Primera fila que ocupa en el detalle. */
  filaDetalle: number;
}

export interface ValorSql {
  columna: string;
  expresion: string;
}

export interface ColumnaLista {
  campo: CampoCrud;
  /** Posición (desde 1) dentro de la línea completa de la lista. */
  pos: number;
  /** Ancho con que se ve el valor. */
  ancho: number;
  /** Ancho de la columna: el mayor entre el valor y el encabezado. */
  anchoColumna: number;
}

export interface VentanaPlan {
  fila: number;
  columna: number;
  alto: number;
  ancho: number;
}

export type ModoDetalle = 'A' | 'M' | 'C' | 'E';

export interface DisenoCrud {
  ventana: boolean;
  filas: number;
  columnas: number;
  /** Ventana de la lista (WC, FWC y WS), o null en pantalla normal. */
  ventanaLista: VentanaPlan | null;
  /** Ventana del detalle, o null en pantalla normal. */
  ventanaDetalle: VentanaPlan | null;
  /** Ventana de la ayuda. */
  ventanaAyuda: VentanaPlan;
  // --- Lista ---
  filaSubfile: number;
  paginaSubfile: number;
  maxFilas: number;
  columnasLista: ColumnaLista[];
  /** Largo de la línea completa con todas las columnas. */
  totalLinea: number;
  /** Largo que se ve a la vez (campo DETSFL). */
  visible: number;
  /** Hay más columnas de las que caben: se usan las teclas de desplazamiento. */
  desplaza: boolean;
  /** Posiciones (desde 1) de la línea donde empieza lo que se ve en cada paso del desplazamiento. */
  pasos: number[];
  filaPosicion: number;
  filaOpciones: number;
  filaEncabezado: number;
  filaMensajeLista: number;
  leyendaLista: string[];
  // --- Detalle ---
  /** Primera fila de los campos del detalle. */
  filaDetalle: number;
  /** Filas que ocupan en total los campos del detalle. */
  filasDetalleTotal: number;
  colEtiqueta: number;
  colCampo: number;
  filaMensajeDetalle: number;
  filaLeyendaDetalle: number;
  leyendasDetalle: Record<ModoDetalle, string[]>;
  nLineasLeyendaDetalle: number;
  /** Ancho útil de una línea de texto en la lista. */
  anchoTexto: number;
  /** Ancho útil de una línea de texto en el detalle (en ventana es menor). */
  anchoTextoDetalle: number;
}

export interface AyudaPlan {
  campo: CampoCrud;
  /** Párrafo que se genera (en mayúsculas). */
  parrafo: string;
  /** Programa de ayuda en mayúsculas; vacío si no se indicó. */
  programa: string;
}

/** Largo del código que reciben y devuelven los programas de ayuda (primer parámetro). */
export const LARGO_CODIGO_AYUDA = 30;
/** Largo de la descripción que devuelven los programas de ayuda (segundo parámetro). */
export const LARGO_DESCRIPCION_AYUDA = 50;

export interface PlanCrud {
  tabla: string;
  /** Nombre de la tabla en el SQL. */
  tablaSql: string;
  tamano: TamanoPantalla;
  /** Campos del detalle, en el orden de la tabla. */
  detalle: CampoCrud[];
  /** Campos de la llave, en el orden de la llave. */
  llaves: CampoCrud[];
  /** Campos visibles en la lista, en el orden de la tabla. */
  lista: CampoCrud[];
  /** Hay campo para posicionar la lista (la primera llave es ascendente). */
  posicionable: boolean;
  /** Hay campos que no son llave, así que el registro se puede modificar. */
  modificable: boolean;
  teclas: TeclaCrud[];
  /** Campos del detalle con ayuda de campo (F4), en el orden del detalle. */
  ayudas: AyudaPlan[];
  /** Campos del detalle que se validan (llaves, fechas y horas, y los pedidos), en el orden del detalle. */
  validaciones: ValidacionPlan[];
  diseno: DisenoCrud;
  /** Valores de los campos que no están en el detalle al agregar. */
  alAgregar: ValorSql[];
  /** Valores de los campos que no están en el detalle al modificar. */
  alModificar: ValorSql[];
  advertencias: string[];
  opciones: OpcionesCrud;
}

// ---------------------------------------------------------------------------
// Constantes del diseño
// ---------------------------------------------------------------------------

/** Filas del subfile por página: siempre 12. */
export const PAGINA_SUBFILE = 12;
/** Columna de la opción y del primer campo de la lista. */
export const COLUMNA_OPCION = 3;
export const COLUMNA_LISTA = 6;
/** Etiquetas y campos del detalle. */
export const ANCHO_ETIQUETA = 21;
/** Columna del campo del detalle en pantalla normal y dentro de una ventana. */
export const COLUMNA_CAMPO = 26;
export const COLUMNA_ETIQUETA = 3;
export const COLUMNA_POSICION = 18;
/**
 * Largo máximo con que se muestra un campo alfanumérico en la lista. Un campo más largo se
 * desplaza con las teclas de izquierda y derecha hasta ver su final; pasado este tope se corta.
 */
export const MAX_ANCHO_LISTA = 250;
/** Un campo de texto más corto que esto no se parte en filas con CNTFLD. */
const MIN_AJUSTE_CNTFLD = 20;
/** Caracteres que se repiten al avanzar por páginas dentro de una columna muy ancha. */
const SOLAPE_DESPLAZAMIENTO = 10;
/** Encabezado de columna que cabe en `ancho`: quita palabras del final antes de cortar una. */
export function ajustarEncabezado(texto: string, ancho: number): string {
  const palabras = textoSimple(texto).split(' ');
  while (palabras.length > 1 && palabras.join(' ').length > ancho) palabras.pop();
  return palabras.join(' ').slice(0, ancho);
}

/**
 * Registros que carga la lista como máximo (SFLSIZ). Para ver los siguientes se usa el
 * campo de posicionamiento: la lista vuelve a cargar desde la llave indicada.
 */
export const MAX_FILAS_LISTA = 500;

/** Largo máximo de la línea completa de la lista. */
const MAX_TOTAL_LINEA = 1500;
/** Memoria que puede ocupar la tabla con las filas de la lista. */
const MEMORIA_TABLA = 8_000_000;
/** Máximo de dígitos de un campo numérico en COBOL. */
const MAX_DIGITOS = 18;

/** Palabras reservadas de COBOL: no pueden ser nombres de campo. */
const RESERVADAS_COBOL = new Set(
  `ACCEPT ACCESS ADD ADDRESS ADVANCING AFTER ALL ALPHABET ALPHABETIC ALSO ALTER ALTERNATE AND ANY ARE AREA AREAS
ASCENDING ASSIGN AT AUTHOR BEFORE BEGINNING BINARY BLANK BLOCK BOTTOM BY CALL CANCEL CD CF CH CHARACTER CHARACTERS
CLASS CLOSE COBOL CODE COLLATING COLUMN COMMA COMMON COMP COMPUTATIONAL COMPUTE CONFIGURATION CONTAINS CONTENT
CONTINUE CONTROL CONTROLS CONVERTING COPY CORR CORRESPONDING COUNT CURRENCY DATA DATE DAY DE DEBUG DECIMAL-POINT
DECLARATIVES DELETE DELIMITED DELIMITER DEPENDING DESCENDING DESTINATION DETAIL DISABLE DISPLAY DIVIDE DIVISION
DOWN DUPLICATES DYNAMIC ELSE ENABLE END ENTER ENVIRONMENT EOP EQUAL ERROR EVALUATE EVERY EXCEPTION EXIT EXTEND
EXTERNAL FALSE FD FILE FILLER FINAL FIRST FOOTING FOR FROM GENERATE GIVING GLOBAL GO GOBACK GREATER GROUP HEADING
IF IN INDEX INDEXED INDICATE INITIAL INITIALIZE INITIATE INPUT INSPECT INSTALLATION INTO INVALID IS JUST
JUSTIFIED KEY LABEL LAST LEADING LEFT LENGTH LESS LIMIT LIMITS LINAGE LINE LINES LINKAGE LOCK MEMORY MERGE MESSAGE
MODE MODULES MOVE MULTIPLE MULTIPLY NATIVE NEGATIVE NEXT NO NOT NUMBER NUMERIC OBJECT OCCURS OF OFF OMITTED ON
OPEN OPTIONAL OR ORDER ORGANIZATION OTHER OUTPUT OVERFLOW PADDING PAGE PERFORM PIC PICTURE PLUS POINTER POSITION
POSITIVE PRINTING PROCEDURE PROGRAM PURGE QUEUE QUOTE RANDOM RD READ RECEIVE RECORD RECORDS REDEFINES REEL
REFERENCE RELATIVE RELEASE REMAINDER REMOVAL RENAMES REPLACE REPLACING REPORT RERUN RESERVE RESET RETURN
REVERSED REWIND REWRITE RIGHT ROUNDED RUN SAME SD SEARCH SECTION SECURITY SEGMENT SELECT SEND SENTENCE SEPARATE
SEQUENCE SEQUENTIAL SET SIGN SIZE SORT SOURCE SPACE SPACES STANDARD START STATUS STOP STRING SUM SUPPRESS
SYMBOLIC SYNC SYNCHRONIZED TABLE TALLYING TAPE TERMINAL TERMINATE TEST TEXT THAN THEN THROUGH THRU TIME TIMES TO
TOP TRAILING TRUE TYPE UNIT UNSTRING UNTIL UP UPON USAGE USE USING VALUE VALUES VARYING WHEN WITH WORDS WRITE
ZERO ZEROES ZEROS`.split(/\s+/),
);

/** Nombres que usa la propia pantalla del CRUD. */
const NOMBRES_DE_LA_PANTALLA = new Set([
  'OPCION',
  'POSICION',
  'MENSAJE',
  'TITULO',
  'LEYENDA',
  'LEYENDA2',
  'POSCUR',
  'REGREL',
  'DETSFL',
  'ENCAB',
  'PAUSA',
  'RCDNAM',
  'FLDNAM',
]);

const RE_NOMBRE_PROPIO = /^(HK\d\d|[RSCW]\d\d|WS\d\d|WC\d\d|FC\d\d|FWC\d\d)$/;

/** Nombre de campo sin caracteres que COBOL no admita. */
function nombreBase(nombre: string): string {
  const base = nombre
    .toUpperCase()
    .replace(/_/g, '')
    .replace(/#/g, 'N')
    .replace(/@/g, 'A')
    .replace(/\$/g, 'S');
  if (base === '') return 'CAMPO';
  return /^[0-9]/.test(base) ? `C${base}`.slice(0, 10) : base.slice(0, 10);
}

function nombreSeguro(nombre: string, usados: Set<string>): string {
  const base = nombreBase(nombre);
  const libre = (n: string): boolean =>
    !usados.has(n) && !RESERVADAS_COBOL.has(n) && !NOMBRES_DE_LA_PANTALLA.has(n) && !RE_NOMBRE_PROPIO.test(n);
  if (libre(base)) return base;
  for (let i = 1; i < 100; i++) {
    const candidato = `${base.slice(0, 10 - String(i).length)}${i}`;
    if (libre(candidato)) return candidato;
  }
  return base;
}

function textoDe(c: CampoTabla): string {
  const text = parametroDe(c.keywords, 'TEXT');
  if (text !== null) {
    const t = literalesDe(text).join(' ').trim();
    if (t !== '') return t;
  }
  return '';
}

function encabezadoDe(c: CampoTabla): string {
  const colhdg = parametroDe(c.keywords, 'COLHDG');
  if (colhdg !== null) {
    const t = literalesDe(colhdg).join(' ').replace(/\s+/g, ' ').trim();
    if (t !== '') return t;
  }
  return c.nombre;
}

/** Texto sin acentos ni caracteres que den problemas en un literal COBOL o al pasar a EBCDIC. */
export function textoSimple(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/g, 'n')
    .replace(/Ñ/g, 'N')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/['"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Fecha y hora
// ---------------------------------------------------------------------------

/** Fecha u hora que se propone para un campo según su tipo y su nombre; null si no parece serlo. */
export function sugerirFechaHora(def: DefinicionDds, nombre: string): FechaHoraCampo | null {
  const n = nombre.toUpperCase();
  const fecha = almacenamientosPosibles('fecha', def);
  const hora = almacenamientosPosibles('hora', def);
  if (def.tipo === 'L' && fecha.length > 0) return { tipo: 'fecha', formato: 'DD/MM/YYYY', almacenamiento: fecha[0] };
  if (def.tipo === 'T' && hora.length > 0) return { tipo: 'hora', formato: 'HH:MM:SS', almacenamiento: hora[0] };
  if (/(^|[^A-Z])(FEC|FCH|FECHA)|FEC[A-Z]*$|FECHA/.test(n) && fecha.length > 0) {
    return { tipo: 'fecha', formato: 'DD/MM/YYYY', almacenamiento: fecha[0] };
  }
  if (/(^HOR|HORA|HRS|^HR[A-Z]|HOR[A-Z]*$)/.test(n) && hora.length > 0) {
    return { tipo: 'hora', formato: 'HH:MM:SS', almacenamiento: hora[0] };
  }
  return null;
}

/** Cómo es la variable del programa para un almacenamiento de fecha u hora. */
function variableDe(almacenamiento: string): { clase: 'A' | 'N'; longitud: number } {
  switch (almacenamiento) {
    case 'N8':
      return { clase: 'N', longitud: 8 };
    case 'N6':
      return { clase: 'N', longitud: 6 };
    case 'N4':
      return { clase: 'N', longitud: 4 };
    case 'L':
      return { clase: 'A', longitud: 10 };
    case 'T':
      return { clase: 'A', longitud: 8 };
    case 'A8':
      return { clase: 'A', longitud: 8 };
    default:
      return { clase: 'A', longitud: 6 };
  }
}

/** Largo de la variable de un campo N8 de hora (HHMMSSCC) o N6 de fecha: es el del campo en el DDS. */
function definirFechaHora(
  campo: string,
  def: DefinicionDds,
  cfg: FechaHoraCampo,
): { clase: 'A' | 'N'; longitud: number } {
  if (!tokensFormato(cfg.tipo, cfg.formato)) {
    const validos = (cfg.tipo === 'fecha' ? FORMATOS_FECHA : FORMATOS_HORA).join(', ');
    throw new Error(`El campo ${campo}: el formato ${cfg.formato} no es válido (${validos}).`);
  }
  const posibles = almacenamientosPosibles(cfg.tipo, def);
  if (!posibles.includes(cfg.almacenamiento)) {
    const que = cfg.tipo === 'fecha' ? 'una fecha' : 'una hora';
    throw new Error(
      `El campo ${campo} no puede guardar ${que} como ${cfg.almacenamiento}` +
        (posibles.length > 0 ? ` (admite ${posibles.join(', ')}).` : `: su tipo y largo no lo permiten.`),
    );
  }
  return variableDe(cfg.almacenamiento);
}

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------

interface Clasificado {
  clase: 'A' | 'N';
  longitud: number;
  decimales: number;
  def: DefinicionDds;
  fechaHora?: FechaHoraCampo;
  aviso?: string;
}

function clasificar(
  c: CampoTabla,
  tabla: Tabla,
  opciones: OpcionesCrud,
): Clasificado | { error: string } {
  const adv: string[] = [];
  const d = definicionDe(c, tabla, { resolverArchivo: opciones.resolverArchivo }, adv);
  const def: DefinicionDds = { tipo: d.tipo, longitud: d.longitud ?? 1, decimales: d.decimales ?? 0 };
  const n = def.longitud;
  const dec = def.decimales;
  const configurado = opciones.camposFechaHora?.[c.nombre];
  const sugerido = configurado ? null : def.tipo === 'L' || def.tipo === 'T' ? sugerirFechaHora(def, c.nombre) : null;
  const cfg = configurado ?? sugerido ?? undefined;

  if (cfg) {
    const v = definirFechaHora(c.nombre, def, cfg);
    return { ...v, decimales: 0, def, fechaHora: cfg };
  }
  switch (def.tipo) {
    case 'A':
    case '':
      return { clase: 'A', longitud: n, decimales: 0, def };
    case 'S':
    case 'P':
    case 'B':
      if (n > MAX_DIGITOS) return { error: `numérico de ${n} dígitos (máximo ${MAX_DIGITOS})` };
      return { clase: 'N', longitud: n, decimales: dec, def };
    case 'Z':
      return { clase: 'A', longitud: 26, decimales: 0, def, aviso: 'es un timestamp: se edita como texto' };
    default:
      return { error: `tipo ${def.tipo} no soportado` };
  }
}

function pantallaDe(c: { clase: 'A' | 'N'; longitud: number; decimales: number; fechaHora?: FechaHoraCampo }) {
  return c.fechaHora
    ? { clase: 'A' as const, longitud: largoFormato(c.fechaHora.formato), decimales: 0 }
    : { clase: c.clase, longitud: c.longitud, decimales: c.decimales };
}

/** Ancho con que se ve un número en la lista (editado, con signo). */
export function anchoNumericoLista(c: { longitud: number; decimales: number }): number {
  const enteros = Math.max(c.longitud - c.decimales, 1);
  return enteros + 1 + (c.decimales > 0 ? c.decimales + 1 : 0);
}

/** Ancho con que se ve el valor de un campo en la lista. */
export function anchoLista(c: CampoCrud): number {
  if (c.fechaHora) return largoFormato(c.fechaHora.formato);
  return c.clase === 'A' ? Math.min(c.longitud, MAX_ANCHO_LISTA) : anchoNumericoLista(c);
}

/** Ancho de la columna: el campo, o el encabezado si es corto. */
export function anchoColumna(c: CampoCrud): number {
  return Math.max(anchoLista(c), Math.min(textoSimple(c.encabezado).length, 12));
}

// ---------------------------------------------------------------------------
// Teclas y leyendas
// ---------------------------------------------------------------------------

const ACCIONES_TECLA: AccionTecla[] = [
  'salir',
  'ayuda',
  'renovar',
  'insertar',
  'modificar',
  'grabar',
  'volver',
  'izquierda',
  'derecha',
  'eliminar',
  'ayudaCampo',
  'personalizada',
];

function normalizarTeclas(entrada: TeclaCrud[] | undefined): TeclaCrud[] {
  const teclas = (entrada ?? TECLAS_POR_DEFECTO).map((t) => ({ ...t }));
  const vistas = new Set<number>();
  for (const t of teclas) {
    if (!Number.isInteger(t.numero) || t.numero < 1 || t.numero > 24) {
      throw new Error(`La tecla F${t.numero} no es válida (de F1 a F24).`);
    }
    if (vistas.has(t.numero)) throw new Error(`La tecla F${t.numero} está repetida.`);
    vistas.add(t.numero);
    if (!ACCIONES_TECLA.includes(t.accion)) throw new Error(`La tecla F${t.numero} tiene una acción no válida.`);
    t.texto = textoSimple(t.texto).slice(0, 14);
    if (t.texto === '') throw new Error(`La tecla F${t.numero} necesita un texto.`);
  }
  if (!teclas.some((t) => t.accion === 'salir' || t.accion === 'volver')) {
    throw new Error('Falta una tecla para salir (acción «salir» o «volver»): sin ella no se puede cerrar el programa.');
  }
  const acciones = teclas.filter((t) => t.accion !== 'personalizada').map((t) => t.accion);
  const repetida = acciones.find((a, i) => acciones.indexOf(a) !== i);
  if (repetida) throw new Error(`La acción «${repetida}» está en más de una tecla.`);
  return teclas;
}

const entradaLeyenda = (t: TeclaCrud, texto = t.texto): string => `F${t.numero}=${texto}`;

/** Reparte las entradas de la leyenda en líneas de hasta `ancho` caracteres. */
function repartirLeyenda(entradas: string[], ancho: number): string[] {
  const lineas: string[] = [];
  let actual = '';
  for (const e of entradas) {
    const siguiente = actual === '' ? e : `${actual}  ${e}`;
    if (siguiente.length > ancho && actual !== '') {
      lineas.push(actual);
      actual = e;
    } else {
      actual = siguiente;
    }
  }
  if (actual !== '') lineas.push(actual);
  return lineas;
}

/** Acciones de cada modo del detalle, en el orden de la leyenda. */
const ACCIONES_DETALLE: Record<ModoDetalle, AccionTecla[]> = {
  A: ['grabar', 'renovar', 'ayudaCampo', 'ayuda', 'volver', 'salir'],
  M: ['grabar', 'eliminar', 'renovar', 'ayudaCampo', 'ayuda', 'volver', 'salir'],
  C: ['modificar', 'eliminar', 'ayuda', 'volver', 'salir'],
  E: ['eliminar', 'ayuda', 'volver', 'salir'],
};

function leyendaDetalle(teclas: TeclaCrud[], modo: ModoDetalle, ancho: number): string[] {
  const entradas: string[] = [];
  const orden = ACCIONES_DETALLE[modo];
  for (const a of orden) {
    const t = teclas.find((x) => x.accion === a);
    if (t) entradas.push(entradaLeyenda(t, modo === 'E' && a === 'eliminar' ? 'Confirmar' : t.texto));
  }
  for (const t of teclas) {
    if (t.accion === 'personalizada' && t.donde !== 'lista') entradas.push(entradaLeyenda(t));
  }
  return repartirLeyenda(entradas, ancho);
}

function leyendaLista(teclas: TeclaCrud[], desplaza: boolean, modificable: boolean, ancho: number): string[] {
  const entradas: string[] = [];
  const orden: AccionTecla[] = ['salir', 'ayuda', 'renovar', 'insertar', 'modificar', 'volver', 'izquierda', 'derecha', 'eliminar'];
  for (const a of orden) {
    if ((a === 'izquierda' || a === 'derecha') && !desplaza) continue;
    if (a === 'modificar' && !modificable) continue;
    const t = teclas.find((x) => x.accion === a);
    if (t) entradas.push(entradaLeyenda(t));
  }
  for (const t of teclas) {
    if (t.accion === 'personalizada' && t.donde !== 'detalle') entradas.push(entradaLeyenda(t));
  }
  return repartirLeyenda(entradas, ancho);
}

// ---------------------------------------------------------------------------
// Diseño de la pantalla
// ---------------------------------------------------------------------------

/** Largo máximo de un campo en una sola fila del detalle (sin CNTFLD). */
function anchoDisponible(ventana: boolean, t: TamanoPantalla): number {
  // Pantalla normal: el campo empieza en la columna 26 y debe terminar antes del borde.
  // Ventana: la ventana mide como mucho 4 columnas menos que la pantalla.
  return (ventana ? t.columnas - 4 : t.columnas) - COLUMNA_CAMPO - 1;
}

/** Filas que hay para los campos del detalle una vez descontados título, mensaje y teclas. */
function capacidadFilas(ventana: boolean, t: TamanoPantalla, lineasLeyenda: number): number {
  return ventana ? t.filas - lineasLeyenda - 8 : t.filas - lineasLeyenda - 7;
}

/**
 * Largo de cada fila de un campo de texto que no cabe en una sola (CNTFLD): el mayor
 * divisor exacto de su largo que quepa en la pantalla y no sea menor que 20. Si no hay,
 * se usa el ancho disponible y la última fila queda más corta.
 * Con un valor pedido por el usuario se usa ese, si es válido. null = una sola fila.
 */
export function ajusteCntfld(c: CampoCrud, disponible: number, pedido?: number): { ajuste: number | null; exacto: boolean } {
  const textoLargo = c.clase === 'A' && !c.fechaHora;
  if (pedido !== undefined) {
    if (!textoLargo) throw new Error(`El campo ${c.nombre} no es de texto: no se puede partir en filas.`);
    if (!Number.isInteger(pedido) || pedido < 1 || pedido >= c.longitud || pedido > disponible) {
      throw new Error(
        `El ajuste de ${c.nombre} debe ser un número entero menor que su largo (${c.longitud}) y que quepa en la pantalla (máximo ${disponible}).`,
      );
    }
    return { ajuste: pedido, exacto: c.longitud % pedido === 0 };
  }
  if (!textoLargo || c.longitud <= disponible) return { ajuste: null, exacto: true };
  for (let d = Math.min(disponible, c.longitud - 1); d >= MIN_AJUSTE_CNTFLD; d--) {
    if (c.longitud % d === 0) return { ajuste: d, exacto: true };
  }
  return { ajuste: Math.min(disponible, c.longitud - 1), exacto: false };
}

interface Distribucion {
  /** Todos los campos caben en el detalle. */
  cabe: boolean;
  /** Filas que ocupan en total. */
  filas: number;
  capacidad: number;
  ajustes: Map<string, number | null>;
  /** Campos con un ajuste que no divide exacto su largo. */
  inexactos: CampoCrud[];
  /** Un ajuste pedido no sirve para este tamaño de pantalla. */
  error?: string;
}

/** Reparte los campos del detalle en filas para un tamaño de pantalla. */
function distribuir(
  campos: CampoCrud[],
  ventana: boolean,
  t: TamanoPantalla,
  lineasLeyenda: number,
  pedidos: Record<string, number> | undefined,
): Distribucion {
  const disponible = anchoDisponible(ventana, t);
  const ajustes = new Map<string, number | null>();
  const inexactos: CampoCrud[] = [];
  let filas = 0;
  for (const c of campos) {
    const pedido = pedidos?.[c.nombre] ?? pedidos?.[c.nombre.toUpperCase()];
    let calculo: { ajuste: number | null; exacto: boolean };
    try {
      calculo = ajusteCntfld(c, disponible, pedido);
    } catch (e) {
      return { cabe: false, filas, capacidad: capacidadFilas(ventana, t, lineasLeyenda), ajustes, inexactos, error: (e as Error).message };
    }
    const { ajuste, exacto } = calculo;
    ajustes.set(c.nombre, ajuste);
    if (ajuste !== null && !exacto) inexactos.push(c);
    filas += ajuste === null ? 1 : Math.ceil(c.longitud / ajuste);
  }
  const capacidad = capacidadFilas(ventana, t, lineasLeyenda);
  return { cabe: filas <= capacidad, filas, capacidad, ajustes, inexactos };
}

/**
 * Pasos del desplazamiento de la lista: desde qué posición de la línea se muestra en cada
 * uno. Avanza de columna en columna; una columna más ancha que la pantalla se recorre por
 * páginas con un poco de solape, y el último paso deja ver el final de la línea.
 */
export function calcularPasos(columnas: Array<{ pos: number; fin: number }>, total: number, visible: number): number[] {
  const pasos = [1];
  let o = 1;
  for (let guarda = 0; guarda < 1000; guarda++) {
    const ultimoPaso = total - visible + 1;
    if (ultimoPaso <= o) break; // desde aquí ya se ve hasta el final
    const actual = columnas.find((c) => c.pos <= o && o <= c.fin);
    let siguiente: number;
    if (actual && actual.fin > o + visible - 1) {
      // La columna no se ve entera: se avanza una página dentro de ella.
      siguiente = Math.min(o + visible - SOLAPE_DESPLAZAMIENTO, actual.fin - visible + 1);
    } else {
      siguiente = columnas.find((c) => c.pos > o)?.pos ?? ultimoPaso;
    }
    siguiente = Math.min(siguiente, ultimoPaso);
    if (siguiente <= o) siguiente = o + 1;
    pasos.push(siguiente);
    o = siguiente;
  }
  return pasos;
}

/** El primer ajuste pedido que no sirve para ese ancho disponible, o undefined si todos sirven. */
function errorDeAjustesPedidos(
  campos: CampoCrud[],
  disponible: number,
  pedidos: Record<string, number> | undefined,
): string | undefined {
  for (const c of campos) {
    const pedido = pedidos?.[c.nombre] ?? pedidos?.[c.nombre.toUpperCase()];
    if (pedido === undefined) continue;
    try {
      ajusteCntfld(c, disponible, pedido);
    } catch (e) {
      return (e as Error).message;
    }
  }
  return undefined;
}

interface Candidato {
  tamano: TamanoPantalla;
  detalle: CampoCrud[];
  fuera: CampoCrud[];
  dist: Distribucion;
  lineasLeyenda: number;
}

function armarColumnas(lista: CampoCrud[]): { columnas: ColumnaLista[]; total: number } {
  const columnas: ColumnaLista[] = [];
  let pos = 1;
  for (const campo of lista) {
    const ancho = anchoLista(campo);
    const col = anchoColumna(campo);
    columnas.push({ campo, pos, ancho, anchoColumna: col });
    pos += col + 1;
  }
  return { columnas, total: Math.max(pos - 2, 1) };
}

// ---------------------------------------------------------------------------
// Valores de los campos que no se muestran
// ---------------------------------------------------------------------------

function escaparSql(texto: string): string {
  return texto.replace(/'/g, "''");
}

function expresionAuto(c: CampoCrud, v: ValorAuto, cuando: string): string | null {
  switch (v.tipo) {
    case 'defecto':
      return null;
    case 'fechaActual':
    case 'horaActual': {
      const tipo: TipoFechaHora = v.tipo === 'fechaActual' ? 'fecha' : 'hora';
      const almacenamiento = c.fechaHora?.tipo === tipo ? c.fechaHora.almacenamiento : almacenamientosPosibles(tipo, c.def)[0];
      const expresion = almacenamiento ? expresionActual(tipo, almacenamiento) : null;
      if (!expresion) {
        throw new Error(
          `El campo ${c.nombre} no puede recibir la ${tipo === 'fecha' ? 'fecha' : 'hora'} actual ${cuando}: su tipo y largo no lo permiten.`,
        );
      }
      return expresion;
    }
    case 'usuario':
      if (c.clase !== 'A' || c.fechaHora) {
        throw new Error(`El campo ${c.nombre} no puede recibir el usuario ${cuando}: no es de texto.`);
      }
      return c.longitud >= 10 ? 'USER' : `SUBSTR(USER, 1, ${c.longitud})`;
    case 'fijo': {
      const valor = v.valor;
      if (c.clase === 'A') {
        if (c.fechaHora) throw new Error(`El campo ${c.nombre} es una fecha u hora: use fecha u hora actual, o déjelo por defecto.`);
        if (valor.length > c.longitud) {
          throw new Error(`El valor «${valor}» no cabe en el campo ${c.nombre} (${c.longitud} caracteres).`);
        }
        if (/[^\x20-\x7e]/.test(valor)) throw new Error(`El valor de ${c.nombre} solo puede llevar caracteres sin acento.`);
        return `'${escaparSql(valor)}'`;
      }
      if (!/^-?\d+(\.\d+)?$/.test(valor.trim())) {
        throw new Error(`El valor «${valor}» no es un número válido para el campo ${c.nombre}.`);
      }
      const [enteros, decimales = ''] = valor.trim().replace('-', '').split('.');
      if (decimales.length > c.decimales || enteros.replace(/^0+(?=\d)/, '').length > c.longitud - c.decimales) {
        throw new Error(`El valor ${valor} no cabe en el campo ${c.nombre} (${c.longitud} dígitos, ${c.decimales} decimales).`);
      }
      return valor.trim();
    }
  }
}

function resolverValores(
  fuera: CampoCrud[],
  valores: Record<string, ValorAuto> | undefined,
  cuando: string,
  detalle: CampoCrud[],
): ValorSql[] {
  const resultado: ValorSql[] = [];
  for (const nombre of Object.keys(valores ?? {})) {
    if (detalle.some((c) => c.nombre === nombre)) {
      throw new Error(`El campo ${nombre} se muestra en el detalle: su valor ${cuando} lo escribe el usuario.`);
    }
    if (!fuera.some((c) => c.nombre === nombre)) throw new Error(`El campo ${nombre} no existe o no se puede usar.`);
  }
  for (const c of fuera) {
    const v = valores?.[c.nombre];
    if (!v) continue;
    const expresion = expresionAuto(c, v, cuando);
    if (expresion !== null) resultado.push({ columna: c.nombre, expresion });
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

/**
 * Arma el plan del CRUD. Lanza un Error con el motivo si la tabla no sirve
 * (no es un físico, no tiene llave o no hay forma de mostrarla).
 */
export function planificarCrud(tabla: Tabla, opciones: OpcionesCrud): PlanCrud {
  if (tipoDeTabla(tabla) !== 'PF') throw new Error('El CRUD se genera sobre un archivo físico (PF), no sobre un lógico.');
  const registro = tabla.registros[0];
  if (!registro) throw new Error('La tabla no tiene un formato de registro.');
  const advertencias: string[] = [];
  const ventana = (opciones.tipoPantalla ?? 'normal') === 'window';

  const llaveTabla = llavesDe(registro);
  if (llaveTabla.length === 0) {
    throw new Error('La tabla no tiene llave (líneas K): el CRUD necesita una llave para identificar cada registro.');
  }
  const nombresTabla = camposDe(registro);
  const porNombre = new Map(nombresTabla.map((c) => [c.nombre.toUpperCase(), c]));
  for (const k of llaveTabla) {
    if (!porNombre.has(k.nombre.toUpperCase())) throw new Error(`La llave ${k.nombre} no es un campo de la tabla.`);
  }
  for (const nombre of Object.keys(opciones.camposFechaHora ?? {})) {
    if (!porNombre.has(nombre.toUpperCase())) throw new Error(`El campo ${nombre} no existe en la tabla.`);
  }

  // La tecla de ayuda de campo solo existe si algún campo tiene ayuda.
  const hayAyudas = Object.keys(opciones.ayudasCampo ?? {}).length > 0;
  const teclas = normalizarTeclas(opciones.teclas).filter((t) => hayAyudas || t.accion !== 'ayudaCampo');
  if (hayAyudas && !teclas.some((t) => t.accion === 'ayudaCampo')) {
    throw new Error('Hay campos con ayuda pero falta una tecla con la acción «Ayuda de campo».');
  }

  // Campos que el CRUD sabe manejar, con su tipo ya resuelto.
  const usados = new Set<string>();
  const soportados: CampoCrud[] = [];
  for (const c of nombresTabla) {
    const esLlave = llaveTabla.some((k) => k.nombre.toUpperCase() === c.nombre.toUpperCase());
    const clasif = clasificar(c, tabla, opciones);
    if ('error' in clasif) {
      if (esLlave) throw new Error(`La llave ${c.nombre} no se puede usar en el CRUD: ${clasif.error}.`);
      advertencias.push(`El campo ${c.nombre} se deja fuera: ${clasif.error}.`);
      continue;
    }
    if (clasif.aviso) advertencias.push(`El campo ${c.nombre} ${clasif.aviso}.`);
    if (c.keywords.some((k) => k.nombre === 'ALWNULL')) {
      advertencias.push(`El campo ${c.nombre} admite nulos y el programa no usa indicadores de nulo.`);
    }
    const llave = llaveTabla.find((k) => k.nombre.toUpperCase() === c.nombre.toUpperCase());
    const texto = textoSimple(textoDe(c)) || textoSimple(encabezadoDe(c)) || c.nombre;
    const nombrePantalla = nombreSeguro(c.nombre, usados);
    usados.add(nombrePantalla);
    if (nombrePantalla !== c.nombre.toUpperCase()) {
      advertencias.push(`El campo ${c.nombre} se llama ${nombrePantalla} en la pantalla y en el programa.`);
    }
    const base = { clase: clasif.clase, longitud: clasif.longitud, decimales: clasif.decimales, fechaHora: clasif.fechaHora };
    soportados.push({
      nombre: c.nombre,
      nombrePantalla,
      ...base,
      etiqueta: texto.slice(0, ANCHO_ETIQUETA - 2),
      encabezado: textoSimple(encabezadoDe(c)) || c.nombre,
      llave: esLlave,
      descendente: llave ? llave.keywords.some((k) => k.nombre === 'DESCEND') : false,
      def: clasif.def,
      pantalla: pantallaDe(base),
      cntfld: null,
      filasDetalle: 1,
      filaDetalle: 0,
    });
  }

  // Qué campos van al detalle: los elegidos, o todos los que quepan (las llaves siempre).
  const pedidosDetalle = opciones.camposDetalle ? new Set(opciones.camposDetalle.map((n) => n.toUpperCase())) : null;
  if (pedidosDetalle) {
    for (const n of pedidosDetalle) {
      if (!soportados.some((c) => c.nombre.toUpperCase() === n)) {
        throw new Error(`El campo ${n} no se puede incluir en el detalle.`);
      }
    }
    for (const k of soportados.filter((c) => c.llave)) {
      if (!pedidosDetalle.has(k.nombre.toUpperCase())) throw new Error(`La llave ${k.nombre} debe estar en el detalle.`);
    }
  }
  for (const nombre of Object.keys(opciones.ajustesCntfld ?? {})) {
    if (!soportados.some((c) => c.nombre.toUpperCase() === nombre.toUpperCase())) {
      throw new Error(`El campo ${nombre} no existe o no se puede usar.`);
    }
  }

  // Tamaño: el detalle manda. La leyenda del detalle ocupa 1 o 2 líneas según las teclas.
  // En ventana el detalle mide 70 de ancho como mínimo, así que la leyenda tiene 66 caracteres útiles.
  const anchoLeyenda = (columnas: number): number => (ventana ? 66 : columnas - 4);
  const lineasDetalle = (ancho: number): number =>
    Math.max(...(['A', 'M', 'C', 'E'] as ModoDetalle[]).map((m) => leyendaDetalle(teclas, m, ancho).length));
  const intentos: Array<80 | 132> = opciones.ancho === 80 || opciones.ancho === 132 ? [opciones.ancho] : [80, 132];

  const candidatos: Candidato[] = [];
  let errorDeAjuste: string | undefined;
  for (const intento of intentos) {
    const t = intento === 80 ? TAMANO_24X80 : TAMANO_27X132;
    const lineas = lineasDetalle(anchoLeyenda(t.columnas));
    // Un ajuste pedido tiene que servir para este tamaño; si no, se prueba con el otro.
    const errorPedido = errorDeAjustesPedidos(soportados, anchoDisponible(ventana, t), opciones.ajustesCntfld);
    if (errorPedido) {
      errorDeAjuste ??= errorPedido;
      continue;
    }
    if (pedidosDetalle) {
      const elegidos = soportados.filter((c) => pedidosDetalle.has(c.nombre.toUpperCase()));
      const dist = distribuir(elegidos, ventana, t, lineas, opciones.ajustesCntfld);
      errorDeAjuste ??= dist.error;
      if (dist.cabe) candidatos.push({ tamano: t, detalle: elegidos, fuera: [], dist, lineasLeyenda: lineas });
      continue;
    }
    // Sin elección: primero las llaves y después los demás en el orden de la tabla, mientras haya filas.
    const incluidos = new Set<CampoCrud>(soportados.filter((c) => c.llave));
    const soloLlaves = distribuir([...incluidos], ventana, t, lineas, opciones.ajustesCntfld);
    errorDeAjuste ??= soloLlaves.error;
    if (!soloLlaves.cabe) continue;
    for (const c of soportados.filter((x) => !x.llave)) {
      const prueba = soportados.filter((x) => incluidos.has(x) || x === c);
      const intentoDist = distribuir(prueba, ventana, t, lineas, opciones.ajustesCntfld);
      errorDeAjuste ??= intentoDist.error;
      if (intentoDist.cabe) incluidos.add(c);
    }
    const elegidos = soportados.filter((c) => incluidos.has(c));
    candidatos.push({
      tamano: t,
      detalle: elegidos,
      fuera: soportados.filter((c) => !incluidos.has(c)),
      dist: distribuir(elegidos, ventana, t, lineas, opciones.ajustesCntfld),
      lineasLeyenda: lineas,
    });
  }
  if (candidatos.length === 0) {
    if (errorDeAjuste) throw new Error(errorDeAjuste);
    if (!pedidosDetalle) throw new Error('La llave ocupa demasiadas filas para una pantalla.');
    const elegidos = soportados.filter((c) => pedidosDetalle.has(c.nombre.toUpperCase()));
    const t = intentos[intentos.length - 1] === 80 ? TAMANO_24X80 : TAMANO_27X132;
    const dist = distribuir(elegidos, ventana, t, lineasDetalle(anchoLeyenda(t.columnas)), opciones.ajustesCntfld);
    throw new Error(
      `El detalle tiene ${elegidos.length} campos que ocupan ${dist.filas} filas y no cabe en una pantalla ` +
        `(caben ${dist.capacidad})` +
        (opciones.ancho === 80 ? ' de 80 columnas. Elija 132 o quite campos del detalle.' : '. Quite campos del detalle.'),
    );
  }
  // El primer tamaño que deje la mayor cantidad de campos (80 antes que 132 si empatan).
  const elegido = candidatos.reduce((mejor, c) => (c.detalle.length > mejor.detalle.length ? c : mejor), candidatos[0]);
  const tamano = elegido.tamano;
  const detalle = elegido.detalle;
  if (elegido.fuera.length > 0) {
    advertencias.push(
      `No caben todos los campos en una pantalla: quedan fuera del detalle ${elegido.fuera.map((c) => `${c.nombre} (${c.pantalla.longitud})`).join(', ')}.`,
    );
  }

  // Cada campo del detalle: si se parte en filas (CNTFLD) y en qué fila empieza.
  const filaInicial = ventana ? 3 : 4;
  let filaActual = filaInicial;
  for (const c of detalle) {
    const ajuste = elegido.dist.ajustes.get(c.nombre) ?? null;
    c.cntfld = ajuste;
    c.filasDetalle = ajuste === null ? 1 : Math.ceil(c.longitud / ajuste);
    c.filaDetalle = filaActual;
    filaActual += c.filasDetalle;
  }
  const filasDetalleTotal = filaActual - filaInicial;
  for (const c of elegido.dist.inexactos) {
    advertencias.push(
      `El campo ${c.nombre} (${c.longitud}) no se divide exacto en filas de ${c.cntfld}: la última fila queda más corta.`,
    );
  }

  const modificable = detalle.some((c) => !c.llave);
  if (!modificable) {
    advertencias.push('Todos los campos son llave: los registros se pueden agregar, consultar y eliminar, pero no modificar.');
  }

  const llaves = llaveTabla.map((k) => detalle.find((c) => c.nombre.toUpperCase() === k.nombre.toUpperCase()) as CampoCrud);
  const { filas, columnas } = tamano;

  // Lista.
  let lista: CampoCrud[];
  if (opciones.camposLista) {
    const pedidos = new Set(opciones.camposLista.map((n) => n.toUpperCase()));
    lista = detalle.filter((c) => pedidos.has(c.nombre.toUpperCase()));
    if (lista.length !== pedidos.size) throw new Error('Un campo de la lista no está en el detalle.');
    if (lista.length === 0) throw new Error('La lista necesita al menos un campo.');
    if (armarColumnas(lista).total > MAX_TOTAL_LINEA) throw new Error('Los campos de la lista son demasiado largos.');
  } else {
    const elegidos: CampoCrud[] = [];
    // Primero las llaves, después el resto.
    for (const c of [...detalle.filter((x) => x.llave), ...detalle.filter((x) => !x.llave)]) {
      if (armarColumnas([...elegidos, c]).total <= MAX_TOTAL_LINEA) elegidos.push(c);
    }
    lista = detalle.filter((c) => elegidos.includes(c));
  }
  const { columnas: columnasLista, total: totalLinea } = armarColumnas(lista);

  const posicionable =
    !llaves[0].descendente && !llaves[0].fechaHora && llaves[0].pantalla.longitud <= columnas - COLUMNA_POSICION - 3;
  if (!posicionable) {
    advertencias.push(
      `La lista no tiene campo para posicionar: la primera llave (${llaves[0].nombre}) es descendente, es una fecha u hora, o no cabe en la pantalla.`,
    );
  }

  // Ventanas y filas.
  const anchoVentanaLista = columnas - 6;
  const visible = ventana ? anchoVentanaLista - 7 : columnas - 8;
  const desplaza = totalLinea > visible;
  const pasos = desplaza
    ? calcularPasos(columnasLista.map((c) => ({ pos: c.pos, fin: c.pos + c.anchoColumna - 1 })), totalLinea, visible)
    : [1];
  for (const col of columnasLista) {
    if (col.campo.clase === 'A' && !col.campo.fechaHora && col.campo.longitud > MAX_ANCHO_LISTA) {
      advertencias.push(`El campo ${col.campo.nombre} (${col.campo.longitud}) se muestra cortado a ${MAX_ANCHO_LISTA} en la lista; el detalle lo muestra completo.`);
    }
  }
  const anchoTexto = ventana ? anchoVentanaLista - 4 : columnas - 4;
  const teclasUsadas = teclas.filter((t) => desplaza || (t.accion !== 'izquierda' && t.accion !== 'derecha'));
  const leyLista = leyendaLista(teclasUsadas, desplaza, modificable, anchoTexto);
  const leyDetalle: Record<ModoDetalle, string[]> = {
    A: leyendaDetalle(teclas, 'A', anchoLeyenda(columnas)),
    M: leyendaDetalle(teclas, 'M', anchoLeyenda(columnas)),
    C: leyendaDetalle(teclas, 'C', anchoLeyenda(columnas)),
    E: leyendaDetalle(teclas, 'E', anchoLeyenda(columnas)),
  };
  const nLineasDetalle = Math.max(...Object.values(leyDetalle).map((l) => l.length));
  const nLineasLista = leyLista.length;

  let diseno: DisenoCrud;
  // Lista en ventana: posicionar, opciones, encabezado, 12 filas, mensaje y teclas.
  // La última línea de una ventana es la línea de mensajes del sistema (*MSGLIN): no puede tener campos.
  const altoVentanaLista = 3 + PAGINA_SUBFILE + 1 + nLineasLista + 1;
  // Detalle en ventana: título, línea en blanco, campos, mensaje, teclas.
  const altoVentanaDetalle = filasDetalleTotal + 4 + nLineasDetalle + 1;
  const mayorCampo = Math.max(...detalle.map((c) => c.cntfld ?? c.pantalla.longitud));
  // El borde derecho queda en columna + ancho + 3: con la ventana en la columna 2, el ancho llega a columnas - 5.
  const anchoVentanaDetalle = Math.min(columnas - 5, Math.max(70, COLUMNA_CAMPO + mayorCampo + 2));
  const ventanaAyuda = { fila: 3, columna: 4, alto: 0, ancho: Math.min(columnas - 8, 70) };

  if (ventana) {
    diseno = {
      ventana: true,
      filas,
      columnas,
      ventanaLista: { fila: 2, columna: 2, alto: altoVentanaLista, ancho: anchoVentanaLista },
      ventanaDetalle: {
        // Desde la fila 2: el borde inferior (fila + alto + 1) llega como mucho a la última fila.
        fila: 2,
        columna: Math.max(2, Math.min(Math.floor((columnas - anchoVentanaDetalle) / 2), columnas - anchoVentanaDetalle - 3)),
        alto: altoVentanaDetalle,
        ancho: anchoVentanaDetalle,
      },
      ventanaAyuda,
      filaSubfile: 4,
      paginaSubfile: PAGINA_SUBFILE,
      maxFilas: 0,
      columnasLista,
      totalLinea,
      visible,
      desplaza,
      pasos,
      filaPosicion: 1,
      filaOpciones: 2,
      filaEncabezado: 3,
      filaMensajeLista: 3 + PAGINA_SUBFILE + 1,
      leyendaLista: leyLista,
      filaDetalle: 3,
      filasDetalleTotal,
      colEtiqueta: COLUMNA_ETIQUETA,
      colCampo: COLUMNA_CAMPO,
      filaMensajeDetalle: filasDetalleTotal + 4,
      filaLeyendaDetalle: filasDetalleTotal + 5,
      leyendasDetalle: leyDetalle,
      nLineasLeyendaDetalle: nLineasDetalle,
      anchoTexto,
      anchoTextoDetalle: anchoVentanaDetalle - 4,
    };
  } else {
    diseno = {
      ventana: false,
      filas,
      columnas,
      ventanaLista: null,
      ventanaDetalle: null,
      ventanaAyuda,
      filaSubfile: 7,
      paginaSubfile: PAGINA_SUBFILE,
      maxFilas: 0,
      columnasLista,
      totalLinea,
      visible,
      desplaza,
      pasos,
      filaPosicion: 3,
      filaOpciones: 4,
      filaEncabezado: 6,
      filaMensajeLista: filas - nLineasLista - 1,
      leyendaLista: leyLista,
      filaDetalle: 4,
      filasDetalleTotal,
      colEtiqueta: COLUMNA_ETIQUETA,
      colCampo: COLUMNA_CAMPO,
      filaMensajeDetalle: filas - nLineasDetalle - 1,
      filaLeyendaDetalle: filas - nLineasDetalle,
      leyendasDetalle: leyDetalle,
      nLineasLeyendaDetalle: nLineasDetalle,
      anchoTexto,
      anchoTextoDetalle: anchoTexto,
    };
  }
  if (!ventana && diseno.filaMensajeLista <= diseno.filaSubfile + PAGINA_SUBFILE - 1) {
    throw new Error('Las teclas de la lista ocupan demasiadas líneas: quite alguna tecla personalizada.');
  }

  // Memoria de la tabla con las filas de la lista.
  const largoFila = totalLinea + visible + largoLlaves(llaves);
  diseno.maxFilas = Math.max(PAGINA_SUBFILE + 1, Math.min(MAX_FILAS_LISTA, Math.floor(MEMORIA_TABLA / largoFila)));
  if (diseno.maxFilas < MAX_FILAS_LISTA) {
    advertencias.push(`La lista carga como máximo ${diseno.maxFilas} registros (el ancho de la lista usa mucha memoria).`);
  }

  // Valores de los campos que no se muestran.
  const fuera = soportados.filter((c) => !detalle.includes(c));
  const alAgregar = resolverValores(fuera, opciones.valoresAlAgregar, 'al agregar', detalle);
  const alModificar = resolverValores(fuera, opciones.valoresAlModificar, 'al modificar', detalle);
  const sinValor = fuera.filter((c) => !alAgregar.some((v) => v.columna === c.nombre));
  if (sinValor.length > 0) {
    advertencias.push(
      `Al agregar, los campos que no se muestran toman el valor por defecto de la tabla: ${sinValor.map((c) => c.nombre).join(', ')}.`,
    );
  }

  const ayudas = resolverAyudas(opciones.ayudasCampo, detalle);

  const nombreTabla = opciones.nombreTabla.trim().toUpperCase();
  const biblioteca = opciones.bibliotecaTabla.trim().toUpperCase();
  const validaciones = resolverValidaciones(opciones.validacionesCampo, detalle, biblioteca, advertencias);

  return {
    tabla: nombreTabla,
    tablaSql: biblioteca === '' ? nombreTabla : `${biblioteca}/${nombreTabla}`,
    tamano,
    detalle,
    llaves,
    lista,
    posicionable,
    modificable,
    teclas: teclasUsadas,
    ayudas,
    validaciones,
    diseno,
    alAgregar,
    alModificar,
    advertencias,
    opciones,
  };
}

const RE_PARRAFO_AYUDA = /^AYUDA-[A-Z0-9]+(-[A-Z0-9]+)*$/;
const RE_PROGRAMA = /^[A-Z$#@][A-Z0-9$#@_]{0,9}$/;

/** Valida las ayudas de campo pedidas y las deja en el orden del detalle. */
function resolverAyudas(pedidas: Record<string, AyudaCampo> | undefined, detalle: CampoCrud[]): AyudaPlan[] {
  const ayudas: AyudaPlan[] = [];
  const parrafos = new Set<string>();
  for (const [nombre, a] of Object.entries(pedidas ?? {})) {
    const campo = detalle.find((c) => c.nombre.toUpperCase() === nombre.toUpperCase());
    if (!campo) throw new Error(`El campo ${nombre} no está en el detalle: no puede tener ayuda.`);
    if (campo.fechaHora) throw new Error(`El campo ${campo.nombre} es una fecha u hora: no admite ayuda de campo.`);
    if (campo.pantalla.clase === 'N' && campo.pantalla.decimales > 0) {
      throw new Error(`El campo ${campo.nombre} tiene decimales: la ayuda de campo solo admite códigos enteros.`);
    }
    if (campo.pantalla.longitud > LARGO_CODIGO_AYUDA) {
      throw new Error(
        `El campo ${campo.nombre} mide ${campo.pantalla.longitud}: la ayuda de campo admite hasta ${LARGO_CODIGO_AYUDA} caracteres.`,
      );
    }
    const parrafo = (a.parrafo ?? '').trim().toUpperCase();
    if (parrafo.length > 30 || !RE_PARRAFO_AYUDA.test(parrafo)) {
      throw new Error(
        `El párrafo de ayuda de ${campo.nombre} no es válido: debe empezar con AYUDA- y seguir con letras, números y guiones (por ejemplo AYUDA-GENERO), de hasta 30 caracteres.`,
      );
    }
    if (parrafos.has(parrafo)) throw new Error(`El párrafo ${parrafo} está repetido: cada campo necesita el suyo.`);
    parrafos.add(parrafo);
    const programa = (a.programa ?? '').trim().toUpperCase();
    if (programa !== '' && !RE_PROGRAMA.test(programa)) {
      throw new Error(
        `El programa de ayuda de ${campo.nombre} no es válido: máximo 10 caracteres (A-Z, 0-9, $ # @ _), sin guiones.`,
      );
    }
    ayudas.push({ campo, parrafo, programa });
  }
  return detalle.flatMap((c) => ayudas.filter((a) => a.campo === c));
}

function largoLlaves(llaves: CampoCrud[]): number {
  return llaves.reduce((s, c) => s + c.longitud, 0);
}

/** Lo que el diálogo necesita saber de cada campo para ofrecer fecha, hora y valores automáticos. */
export interface InfoCampoCrud {
  nombre: string;
  def: DefinicionDds;
  llave: boolean;
  /** El CRUD puede manejar el campo (no es un flotante ni un numérico demasiado largo). */
  soportado: boolean;
  /** Cómo puede estar guardada una fecha o una hora en este campo, según su tipo y largo. */
  almacenamientosFecha: string[];
  almacenamientosHora: string[];
  /** Fecha u hora que se propone según el tipo y el nombre del campo. */
  sugerido: FechaHoraCampo | null;
  /** Un campo de tipo fecha (L) u hora (T) siempre se edita como tal. */
  esFechaHoraNativa: boolean;
  /** Es de texto y puede partirse en filas (CNTFLD) cuando no cabe en una. */
  esTexto: boolean;
  /** Largo del campo en el archivo. */
  longitud: number;
}

/** Describe los campos de la primera definición de registro de la tabla. */
export function describirCampos(tabla: Tabla, resolverArchivo?: OpcionesCrud['resolverArchivo']): InfoCampoCrud[] {
  const registro = tabla.registros[0];
  if (!registro) return [];
  const llaves = new Set(llavesDe(registro).map((k) => k.nombre.toUpperCase()));
  const opciones = { resolverArchivo } as OpcionesCrud;
  return camposDe(registro).map((c) => {
    const clasif = clasificar(c, tabla, { ...opciones, camposFechaHora: undefined });
    const adv: string[] = [];
    const d = definicionDe(c, tabla, { resolverArchivo }, adv);
    const def: DefinicionDds = { tipo: d.tipo, longitud: d.longitud ?? 1, decimales: d.decimales ?? 0 };
    return {
      nombre: c.nombre,
      def,
      llave: llaves.has(c.nombre.toUpperCase()),
      soportado: !('error' in clasif),
      almacenamientosFecha: almacenamientosPosibles('fecha', def),
      almacenamientosHora: almacenamientosPosibles('hora', def),
      sugerido: sugerirFechaHora(def, c.nombre),
      esFechaHoraNativa: def.tipo === 'L' || def.tipo === 'T',
      esTexto: def.tipo === 'A' || def.tipo === '',
      longitud: def.longitud,
    };
  });
}

/** Texto de ayuda de cada acción de tecla. */
export const NOMBRE_ACCION: Record<AccionTecla, string> = {
  salir: 'Salir',
  ayuda: 'Ayuda',
  renovar: 'Renovar',
  insertar: 'Insertar',
  modificar: 'Modificar',
  grabar: 'Grabar',
  volver: 'Volver',
  izquierda: 'Desplazar a la izquierda',
  derecha: 'Desplazar a la derecha',
  eliminar: 'Eliminar',
  ayudaCampo: 'Ayuda de campo',
  personalizada: 'Personalizada (la programa usted)',
};

export const DESCRIPCION_ACCION: Record<AccionTecla, string> = {
  salir: 'Salir del programa',
  ayuda: 'Mostrar esta ayuda',
  renovar: 'Volver a leer los datos',
  insertar: 'Agregar un registro nuevo',
  modificar: 'Modificar el registro donde esta el cursor',
  grabar: 'Grabar el registro',
  volver: 'Volver a la pantalla anterior',
  izquierda: 'Mostrar las columnas de la izquierda',
  derecha: 'Mostrar las columnas de la derecha',
  eliminar: 'Eliminar el registro donde esta el cursor',
  ayudaCampo: 'Ayuda del campo donde esta el cursor',
  personalizada: 'Accion definida en el programa',
};
