/**
 * Modelo de datos para una pantalla DSPF (DDS de display file) de IBM i.
 *
 * El modelo es independiente del texto DDS: el parser produce este modelo a
 * partir de una fuente, el visor lo dibuja, y (en una fase posterior) un
 * generador lo convierte de nuevo a DDS. Debe ser capaz de representar
 * subfiles, ventanas, botones, teclas de función, indicadores y validaciones,
 * que son las construcciones vistas en las fuentes reales de QDSPSRC.
 */

/** Uso del campo según la columna 38 del DDS. */
export type UsoCampo =
  | 'entrada' // I
  | 'salida' // O
  | 'ambos' // B
  | 'oculto' // H
  | 'programa'; // P (field de programa, sin posición en pantalla)

/** Tipo de dato del campo según la columna 35 del DDS ('' = en blanco). */
export type TipoCampo =
  | '' // en blanco (p.ej. campo que hereda el tipo con REFFLD)
  | 'A' // alfanumérico
  | 'S' // numérico con signo (zoned)
  | 'Y' // numérico editado (numeric)
  | 'N' // numérico (campo numérico de solo dígitos)
  | 'F' // coma flotante
  | 'P' // empaquetado (packed)
  | 'B' // binario
  | 'L' // fecha
  | 'T' // hora
  | 'Z' // timestamp
  | 'I' // entero
  | 'J' // DBCS
  | 'G'; // gráfico

/**
 * Un indicador condicional asociado a una keyword o a un campo
 * (p.ej. "N30" = indicador 30 negado, "99" = indicador 99 activo).
 */
export interface IndicadorCond {
  numero: number; // 1..99
  negado: boolean; // true si viene con N delante
}

/**
 * Condición de una keyword o de un elemento: indicadores se cumplen todos (AND, hasta 3 por
 * línea). Cada grupo de lternativas es otra condición posible (OR): en el DDS son líneas
 * con AO en las columnas 6-7.
 */
export type GruposAlternativos = IndicadorCond[][];

/** Una keyword DDS con sus parámetros en bruto y los indicadores que la condicionan. */
export interface Keyword {
  nombre: string; // p.ej. "DSPATR", "VALUES", "WINDOW"
  parametros: string; // texto entre paréntesis, sin interpretar: "HI", "'S' 'N'", "2 2 20 74"
  indicadores: IndicadorCond[];
  /** Otras condiciones (OR) además de indicadores. */
  alternativas?: GruposAlternativos;
}

/** Una constante de texto fija ubicada en una posición de la pantalla. */
export interface Constante {
  tipo: 'constante';
  id: string;
  fila: number;
  columna: number;
  texto: string;
  keywords: Keyword[]; // p.ej. DSPATR(HI)
  indicadores: IndicadorCond[];
  alternativas?: GruposAlternativos;
}

/** Un campo (de datos) ubicado o no en la pantalla. */
export interface Campo {
  tipo: 'campo';
  id: string;
  nombre: string;
  longitud: number;
  decimales: number;
  tipoDato: TipoCampo;
  uso: UsoCampo;
  fila: number | null; // null para campos ocultos / de programa
  columna: number | null;
  keywords: Keyword[];
  indicadores: IndicadorCond[];
  alternativas?: GruposAlternativos;
  /** 'R' en la columna 29: la definición se toma de un archivo (REFFLD). */
  referencia: boolean;
  /**
   * Con referencia: el largo, el tipo y los decimales no se escriben en el DDS (los da el archivo).
   * Los valores de arriba sirven para dibujarlo. Hace falta en las fechas y horas (L, T, Z).
   */
  heredada?: boolean;
  /**
   * Campo de sistema sin nombre en el DDS (TIME, DATE, SYSNAME, USER): en el
   * fuente es una línea con posición y la keyword, sin nombre ni longitud.
   */
  sistema?: boolean;
}

/** Elemento de pantalla: constante o campo. */
export type Elemento = Constante | Campo;

/** Clasificación de un formato de registro respecto a subfiles. */
export type ClaseRegistro =
  | 'normal'
  | 'subfile' // tiene keyword SFL
  | 'control-subfile'; // tiene keyword SFLCTL(xxx)

/** Un formato de registro (R xxxx) dentro de la pantalla. */
export interface Registro {
  id: string;
  nombre: string;
  clase: ClaseRegistro;
  subfileControlado?: string; // para control-subfile: nombre del SFL asociado
  keywords: Keyword[]; // keywords a nivel de registro (SFLSIZ, WINDOW, OVERLAY...)
  elementos: Elemento[];
  indicadores: IndicadorCond[]; // indicadores que condicionan el propio registro
  alternativas?: GruposAlternativos;
}

/** Tecla de función declarada a nivel de archivo (CFnn / CAnn). */
export interface TeclaFuncion {
  tipo: 'CF' | 'CA'; // CF devuelve datos, CA no
  numero: number; // 1..24
  respuestaInd?: number; // indicador de respuesta opcional
  texto?: string; // descripción entre comillas
  /**
   * Cuántas keywords de `keywordsArchivo` la preceden en el fuente. Permite
   * regenerar el mismo orden. Si falta, la tecla se emite al final.
   */
  posicion?: number;
}

/** Tamaño de pantalla. */
export interface TamanoPantalla {
  filas: number; // 24 o 27
  columnas: number; // 80 o 132
  codigo: string; // *DS3, *DS4...
}

/** Pantalla DSPF completa. */
export interface PantallaDSPF {
  nombre: string; // nombre lógico (del archivo o importado)
  tamano: TamanoPantalla;
  keywordsArchivo: Keyword[]; // INDARA, PRINT, etc.
  teclasFuncion: TeclaFuncion[];
  registros: Registro[];
  /** Diagnósticos del parser: líneas que no se pudieron interpretar. */
  advertencias: string[];
}

/** Tamaño por defecto (24x80). */
export const TAMANO_24X80: TamanoPantalla = {
  filas: 24,
  columnas: 80,
  codigo: '*DS3',
};

/** Tamaño ancho (27x132). */
export const TAMANO_27X132: TamanoPantalla = {
  filas: 27,
  columnas: 132,
  codigo: '*DS4',
};
