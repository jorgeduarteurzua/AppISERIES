/**
 * Validaciones de los campos del detalle del CRUD, al agregar y al modificar.
 *
 * Cada campo tiene dos partes:
 * - Obligatorio: texto distinto de espacios, número mayor a 0 o distinto de 0, fecha u hora no vacía.
 *   Las llaves siempre lo son (texto y fecha no vacíos, número mayor a 0).
 * - Una regla: email, rango, valores permitidos o que exista en otra tabla. La regla se revisa solo si
 *   el campo tiene valor (texto no vacío, número distinto de 0).
 *
 * Los campos con error se marcan en la pantalla con DSPATR(RI PC), condicionado por un indicador
 * (del 50 al 99, uno por campo validado).
 */
import type { CampoCrud } from './planCrud';

export type RequeridoCampo = 'no' | 'si' | 'mayorCero' | 'distintoCero';

export type ReglaCampo =
  | { tipo: 'email' }
  | { tipo: 'rango'; minimo: string; maximo: string }
  /** Valores separados por comas, por ejemplo «S,N». */
  | { tipo: 'valores'; valores: string }
  /** La tabla puede ir calificada (BIBLIOTECA/TABLA). */
  | { tipo: 'existe'; tabla: string; columna: string };

export interface ValidacionCampo {
  requerido?: RequeridoCampo;
  regla?: ReglaCampo | null;
}

export type ReglaPlan =
  | { tipo: 'email' }
  | { tipo: 'rango'; minimo: string; maximo: string }
  | { tipo: 'valores'; valores: string[] }
  | { tipo: 'existe'; tablaSql: string; tabla: string; columna: string };

export interface ValidacionPlan {
  campo: CampoCrud;
  /** Lo que se exige al campo; en las llaves lo fija el CRUD. */
  requerido: RequeridoCampo;
  regla: ReglaPlan | null;
  /** Indicador que marca el campo con error (DSPATR RI PC); null si no quedan indicadores. */
  indicador: number | null;
}

/** Primer y último indicador para marcar campos con error. */
export const PRIMER_INDICADOR_ERROR = 50;
export const ULTIMO_INDICADOR_ERROR = 99;
/** Largo mínimo de un campo email (a@b.c). */
export const LARGO_MINIMO_EMAIL = 5;
const MAX_VALORES = 20;

const RE_NOMBRE = /^[A-Z$#@][A-Z0-9$#@_]{0,9}$/;
const RE_NUMERO = /^-?\d+(\.\d+)?$/;

/** Lo obligatorio que se aplica a una llave, según su tipo. */
export function requeridoDeLlave(c: Pick<CampoCrud, 'clase' | 'fechaHora'>): RequeridoCampo {
  return c.clase === 'N' && !c.fechaHora ? 'mayorCero' : 'si';
}

/** Qué opciones de obligatorio admite un campo. */
export function requeridosPosibles(c: { numerico: boolean; fechaHora: boolean }): RequeridoCampo[] {
  if (c.fechaHora) return ['no', 'si'];
  return c.numerico ? ['no', 'mayorCero', 'distintoCero'] : ['no', 'si'];
}

/** Qué reglas admite un campo. */
export function reglasPosibles(c: { numerico: boolean; fechaHora: boolean; longitud: number }): ReglaCampo['tipo'][] {
  if (c.fechaHora) return [];
  if (c.numerico) return ['rango', 'valores', 'existe'];
  return [...(c.longitud >= LARGO_MINIMO_EMAIL ? (['email'] as const) : []), 'valores', 'existe'];
}

/** Normaliza un número escrito con coma o punto decimal. Devuelve null si no es un número. */
function numero(texto: string): string | null {
  const t = texto.trim().replace(',', '.');
  if (!RE_NUMERO.test(t)) return null;
  // Sin ceros de más a la izquierda (COBOL los acepta, pero así se lee mejor).
  const negativo = t.startsWith('-');
  const [ent, dec] = (negativo ? t.slice(1) : t).split('.');
  const entero = ent.replace(/^0+(?=\d)/, '');
  return `${negativo ? '-' : ''}${entero}${dec !== undefined ? `.${dec}` : ''}`;
}

function cabeEnCampo(n: string, c: CampoCrud): boolean {
  const [ent, dec = ''] = n.replace('-', '').split('.');
  const enteros = c.longitud - c.decimales;
  return (ent === '0' || ent.length <= enteros) && dec.replace(/0+$/, '').length <= c.decimales;
}

function resolverRegla(c: CampoCrud, regla: ReglaCampo, biblioteca: string): ReglaPlan {
  const numerico = c.clase === 'N';
  const nombre = c.nombre;
  if (c.fechaHora) throw new Error(`El campo ${nombre} es una fecha u hora: ya se valida su formato y no admite otra regla.`);
  switch (regla.tipo) {
    case 'email':
      if (numerico) throw new Error(`El campo ${nombre} es numérico: no puede ser un email.`);
      if (c.longitud < LARGO_MINIMO_EMAIL) throw new Error(`El campo ${nombre} mide ${c.longitud}: un email necesita al menos ${LARGO_MINIMO_EMAIL}.`);
      return { tipo: 'email' };
    case 'rango': {
      if (!numerico) throw new Error(`El campo ${nombre} no es numérico: el rango es para números.`);
      const minimo = numero(regla.minimo ?? '');
      const maximo = numero(regla.maximo ?? '');
      if (minimo === null || maximo === null) throw new Error(`El rango de ${nombre} necesita un mínimo y un máximo numéricos.`);
      if (Number(minimo) > Number(maximo)) throw new Error(`En el rango de ${nombre} el mínimo (${minimo}) es mayor que el máximo (${maximo}).`);
      for (const n of [minimo, maximo]) {
        if (!cabeEnCampo(n, c)) throw new Error(`El valor ${n} del rango no cabe en el campo ${nombre} (${c.longitud} dígitos, ${c.decimales} decimales).`);
      }
      return { tipo: 'rango', minimo, maximo };
    }
    case 'valores': {
      // La pantalla pasa el texto a mayúsculas (no lleva CHECK(LC)): los valores también.
      const lista = (regla.valores ?? '')
        .split(',')
        .map((v) => (numerico ? v.trim() : v.trim().toUpperCase()))
        .filter((v) => v !== '');
      if (lista.length === 0) throw new Error(`Indique los valores permitidos de ${nombre}, separados por comas (por ejemplo S,N).`);
      if (lista.length > MAX_VALORES) throw new Error(`El campo ${nombre} tiene más de ${MAX_VALORES} valores permitidos.`);
      const valores = lista.map((v) => {
        if (numerico) {
          const n = numero(v);
          if (n === null) throw new Error(`El valor permitido «${v}» de ${nombre} no es un número.`);
          if (!cabeEnCampo(n, c)) throw new Error(`El valor permitido ${n} no cabe en el campo ${nombre}.`);
          return n;
        }
        if (v.length > c.longitud) throw new Error(`El valor permitido «${v}» no cabe en el campo ${nombre} (${c.longitud} caracteres).`);
        if (/[^\x20-\x7e]|"/.test(v)) throw new Error(`El valor permitido «${v}» de ${nombre} solo puede llevar caracteres sin acento ni comillas.`);
        return v;
      });
      if (new Set(valores).size !== valores.length) throw new Error(`Los valores permitidos de ${nombre} tienen repetidos.`);
      return { tipo: 'valores', valores };
    }
    case 'existe': {
      const tablaPedida = (regla.tabla ?? '').trim().toUpperCase();
      const columna = (regla.columna ?? '').trim().toUpperCase();
      const partes = tablaPedida.split('/');
      if (partes.length > 2 || partes.some((p) => !RE_NOMBRE.test(p))) {
        throw new Error(`La tabla donde debe existir ${nombre} no es válida (TABLA o BIBLIOTECA/TABLA).`);
      }
      if (!RE_NOMBRE.test(columna)) throw new Error(`La columna donde debe existir ${nombre} no es válida.`);
      const tabla = partes[partes.length - 1];
      const tablaSql = partes.length === 2 || biblioteca === '' ? tablaPedida : `${biblioteca}/${tablaPedida}`;
      return { tipo: 'existe', tablaSql, tabla, columna };
    }
    default:
      throw new Error(`La regla del campo ${nombre} no es válida.`);
  }
}

/**
 * Valida las validaciones pedidas y arma las del plan, en el orden del detalle. Se incluyen las
 * llaves (siempre obligatorias) y las fechas y horas (su formato ya se valida al leer la pantalla).
 */
export function resolverValidaciones(
  pedidas: Record<string, ValidacionCampo> | undefined,
  detalle: CampoCrud[],
  biblioteca: string,
  advertencias: string[],
): ValidacionPlan[] {
  const porNombre = new Map(Object.entries(pedidas ?? {}).map(([k, v]) => [k.toUpperCase(), v]));
  for (const nombre of porNombre.keys()) {
    if (!detalle.some((c) => c.nombre.toUpperCase() === nombre)) {
      throw new Error(`El campo ${nombre} no está en el detalle: no se puede validar.`);
    }
  }
  const salida: ValidacionPlan[] = [];
  for (const c of detalle) {
    const pedida = porNombre.get(c.nombre.toUpperCase()) ?? {};
    const numerico = c.clase === 'N' && !c.fechaHora;
    let requerido: RequeridoCampo = pedida.requerido ?? 'no';
    if (!requeridosPosibles({ numerico, fechaHora: !!c.fechaHora }).includes(requerido)) {
      throw new Error(
        numerico
          ? `El campo ${c.nombre} es numérico: como obligatorio use «mayor a 0» o «distinto de 0».`
          : `El campo ${c.nombre} no es numérico: como obligatorio use «sí» (no vacío).`,
      );
    }
    if (c.llave) requerido = requeridoDeLlave(c);
    const regla = pedida.regla ? resolverRegla(c, pedida.regla, biblioteca) : null;
    if (requerido === 'no' && !regla && !c.fechaHora) continue;
    salida.push({ campo: c, requerido, regla, indicador: null });
  }
  const sinIndicador: string[] = [];
  salida.forEach((v, i) => {
    const n = PRIMER_INDICADOR_ERROR + i;
    if (n <= ULTIMO_INDICADOR_ERROR) v.indicador = n;
    else sinIndicador.push(v.campo.nombre);
  });
  if (sinIndicador.length > 0) {
    advertencias.push(
      `Se validan, pero no se marcan en la pantalla por falta de indicadores (50 a 99): ${sinIndicador.join(', ')}.`,
    );
  }
  return salida;
}

/** Sugerencia de validación para el diálogo: los campos que parecen email. */
export function pareceEmail(nombre: string, texto = ''): boolean {
  return /MAIL|CORREO/i.test(nombre) || /\b(e-?mail|correo)\b/i.test(texto);
}
