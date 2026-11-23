/**
 * Fechas y horas del CRUD: cómo se ven en la pantalla (formato) y cómo se
 * guardan en el archivo (almacenamiento, según el tipo del campo). El archivo
 * guarda siempre según su tipo; el formato solo cambia lo que se muestra.
 *
 * Letras de los formatos (en inglés): Y año, M mes (o minutos en una hora),
 * D día, H hora, S segundos.
 */

export type TipoFechaHora = 'fecha' | 'hora';

export const FORMATOS_FECHA = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'DD/MM/YY'] as const;
export const FORMATOS_HORA = ['HH:MM:SS', 'HH:MM'] as const;

/**
 * Cómo está guardado en el archivo.
 *  fecha: N8 numérico YYYYMMDD · N6 numérico YYMMDD · L tipo DATE · A8 texto YYYYMMDD
 *  hora:  N6 numérico HHMMSS · N4 numérico HHMM · N8 numérico HHMMSSCC · T tipo TIME · A6 texto HHMMSS
 */
export type AlmacenamientoFecha = 'N8' | 'N6' | 'L' | 'A8';
export type AlmacenamientoHora = 'N6' | 'N4' | 'N8' | 'T' | 'A6';

export interface FechaHoraCampo {
  tipo: TipoFechaHora;
  formato: string;
  almacenamiento: string;
}

/** Datos del campo en el archivo, tal como los define el DDS. */
export interface DefinicionDds {
  tipo: string;
  longitud: number;
  decimales: number;
}

export const ETIQUETA_ALMACENAMIENTO: Record<TipoFechaHora, Record<string, string>> = {
  fecha: {
    N8: 'numérico AAAAMMDD (YYYYMMDD)',
    N6: 'numérico AAMMDD (YYMMDD)',
    L: 'tipo DATE',
    A8: 'texto AAAAMMDD (YYYYMMDD)',
  },
  hora: {
    N6: 'numérico HHMMSS',
    N4: 'numérico HHMM',
    N8: 'numérico HHMMSSCC',
    T: 'tipo TIME',
    A6: 'texto HHMMSS',
  },
};

/** Año de 2 dígitos: de 51 a 99 es 19xx y de 00 a 50 es 20xx. */
export const PIVOTE_ANIO = 50;

const esNumerico = (d: DefinicionDds): boolean => ['S', 'P', 'B', ''].includes(d.tipo) && d.decimales === 0;

/** Almacenamientos que admite un campo según su tipo y largo; el primero es el que se propone. */
export function almacenamientosPosibles(tipo: TipoFechaHora, d: DefinicionDds): string[] {
  const posibles: string[] = [];
  if (tipo === 'fecha') {
    if (d.tipo === 'L') posibles.push('L');
    if (d.tipo === 'A' || d.tipo === '') {
      if (d.longitud === 8) posibles.push('A8');
    } else if (esNumerico(d)) {
      if (d.longitud === 8) posibles.push('N8');
      if (d.longitud === 6) posibles.push('N6');
    }
  } else {
    if (d.tipo === 'T') posibles.push('T');
    if (d.tipo === 'A' || d.tipo === '') {
      if (d.longitud === 6) posibles.push('A6');
    } else if (esNumerico(d)) {
      if (d.longitud === 6) posibles.push('N6');
      if (d.longitud === 4) posibles.push('N4');
      if (d.longitud === 8) posibles.push('N8');
    }
  }
  return posibles;
}

export interface TokenFormato {
  /** DD, MM, YYYY, YY (fecha); HH, MI, SS (hora); LIT para un separador. */
  clave: 'DD' | 'MM' | 'YYYY' | 'YY' | 'HH' | 'MI' | 'SS' | 'LIT';
  texto: string;
  /** Posición (desde 1) dentro del texto que se ve en pantalla. */
  inicio: number;
  largo: number;
}

/** Parte un formato en sus componentes. Devuelve null si no es un formato válido. */
export function tokensFormato(tipo: TipoFechaHora, formato: string): TokenFormato[] | null {
  const lista: readonly string[] = tipo === 'fecha' ? FORMATOS_FECHA : FORMATOS_HORA;
  if (!lista.includes(formato)) return null;
  const re = tipo === 'fecha' ? /YYYY|YY|MM|DD|./g : /HH|MM|SS|./g;
  const tokens: TokenFormato[] = [];
  let inicio = 1;
  for (const m of formato.matchAll(re)) {
    const t = m[0];
    const clave: TokenFormato['clave'] =
      t === 'MM' && tipo === 'hora' ? 'MI' : ['DD', 'MM', 'YYYY', 'YY', 'HH', 'SS'].includes(t) ? (t as TokenFormato['clave']) : 'LIT';
    tokens.push({ clave, texto: t, inicio, largo: t.length });
    inicio += t.length;
  }
  return tokens;
}

/** Largo con que se ve el campo en la pantalla. */
export function largoFormato(formato: string): number {
  return formato.length;
}

/** Texto SQL para leer la columna: las fechas y horas se piden en formato ISO. */
export function expresionLeer(columna: string, almacenamiento: string | null): string {
  return almacenamiento === 'L' || almacenamiento === 'T' ? `CHAR(${columna}, ISO)` : columna;
}

/** Texto SQL para asignar una variable a la columna. */
export function expresionAsignar(variable: string, almacenamiento: string | null, tipo: TipoFechaHora | null): string {
  if (tipo === 'fecha' && almacenamiento === 'L') return `DATE(${variable})`;
  if (tipo === 'hora' && almacenamiento === 'T') return `TIME(${variable})`;
  return variable;
}

const FECHA_N8 = 'YEAR(CURRENT DATE)*10000+MONTH(CURRENT DATE)*100+DAY(CURRENT DATE)';
const FECHA_N6 = 'MOD(YEAR(CURRENT DATE),100)*10000+MONTH(CURRENT DATE)*100+DAY(CURRENT DATE)';
const HORA_N6 = 'HOUR(CURRENT TIME)*10000+MINUTE(CURRENT TIME)*100+SECOND(CURRENT TIME)';

/** Expresión SQL de la fecha o la hora actual con el almacenamiento del campo. null si no se puede. */
export function expresionActual(tipo: TipoFechaHora, almacenamiento: string): string | null {
  if (tipo === 'fecha') {
    switch (almacenamiento) {
      case 'N8':
        return FECHA_N8;
      case 'N6':
        return FECHA_N6;
      case 'L':
        return 'CURRENT DATE';
      case 'A8':
        return "REPLACE(CHAR(CURRENT DATE, ISO), '-', '')";
    }
    return null;
  }
  switch (almacenamiento) {
    case 'N6':
      return HORA_N6;
    case 'N4':
      return 'HOUR(CURRENT TIME)*100+MINUTE(CURRENT TIME)';
    case 'N8':
      return `(${HORA_N6})*100`;
    case 'T':
      return 'CURRENT TIME';
    case 'A6':
      return "REPLACE(CHAR(CURRENT TIME, ISO), '.', '')";
  }
  return null;
}
