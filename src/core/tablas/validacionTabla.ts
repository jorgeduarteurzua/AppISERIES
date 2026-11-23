/**
 * Validación del modelo de tabla (PF/LF) antes de generar DDS o SQL.
 *
 * Detecta lo que el compilador rechazaría (nombres, longitudes por tipo, tamaño
 * del registro, llaves que no existen, keywords mal formadas) y avisos que no
 * impiden compilar pero suelen ser un descuido.
 */

import {
  camposDe,
  literalesDe,
  llavesDe,
  parametroDe,
  seleccionesDe,
  tipoDeTabla,
  type CampoTabla,
  type RegistroTabla,
  type Tabla,
} from './modelo';

export interface ProblemaTabla {
  nivel: 'error' | 'aviso';
  mensaje: string;
  regId?: string;
  elId?: string;
}

export interface OpcionesValidacionTabla {
  /** Busca otro archivo (el físico de un lógico). Si no se da, esas comprobaciones se omiten. */
  resolverArchivo?: (nombre: string) => Tabla | null;
}

const RE_NOMBRE = /^[A-Z#$@][A-Z0-9#$@_]*$/i;
const RE_ALIAS = /^[A-Z][A-Z0-9_#@$]*$/i;
const TIPOS_VALIDOS = new Set(['', 'A', 'S', 'P', 'B', 'F', 'H', 'L', 'T', 'Z', 'J', 'O', 'E', 'G', '5']);
const TIPOS_SIN_LONGITUD = new Set(['L', 'T', 'Z']);
const TIPOS_NUMERICOS = new Set(['S', 'P', 'B', 'F']);
const OPERADORES = new Set(['EQ', 'NE', 'LT', 'NL', 'GT', 'NG', 'LE', 'GE']);
const LIMITE_REGISTRO = 32766;
const LIMITE_LLAVE_BYTES = 2000;
const LIMITE_LLAVE_CAMPOS = 120;

export function hayErroresTabla(problemas: ProblemaTabla[]): boolean {
  return problemas.some((p) => p.nivel === 'error');
}

/** Bytes que ocupa un campo en el registro (0 si se hereda y no se conoce). */
export function bytesDeCampo(c: CampoTabla): number {
  const n = c.longitud ?? 0;
  switch (c.tipoDato) {
    case 'P':
      return Math.ceil((n + 1) / 2);
    case 'B':
      return n <= 4 ? 2 : n <= 9 ? 4 : 8;
    case 'F':
      return n <= 9 ? 4 : 8;
    case 'L':
      return 10;
    case 'T':
      return 8;
    case 'Z':
      return 26;
    default:
      return n;
  }
}

function elementosDe(parametros: string): string[] {
  return parametros.match(/'(?:[^']|'')*'|[^\s]+/g) ?? [];
}

function validarNombre(nombre: string, que: string): string | null {
  if (nombre.trim() === '') return `${que} sin nombre.`;
  if (nombre.length > 10) return `${que} «${nombre}»: el nombre supera los 10 caracteres.`;
  if (!RE_NOMBRE.test(nombre)) {
    return `${que} «${nombre}»: solo admite letras, números, #, $, @ y _, y no puede empezar con número.`;
  }
  return null;
}

/** Comprueba las keywords de un campo (COLHDG, TEXT, VALUES, RANGE, COMP, ALIAS). */
function validarKeywordsCampo(c: CampoTabla, r: RegistroTabla, salida: ProblemaTabla[]): void {
  const base = { regId: r.id, elId: c.id };
  const donde = `Campo ${c.nombre}`;

  const colhdg = parametroDe(c.keywords, 'COLHDG');
  if (colhdg !== null) {
    const lineas = literalesDe(colhdg);
    if (lineas.length === 0) salida.push({ nivel: 'error', mensaje: `${donde}: COLHDG sin texto.`, ...base });
    if (lineas.length > 3) salida.push({ nivel: 'error', mensaje: `${donde}: COLHDG admite como máximo 3 líneas.`, ...base });
    for (const l of lineas) {
      if (l.length > 20) {
        salida.push({ nivel: 'error', mensaje: `${donde}: la línea de COLHDG «${l}» supera los 20 caracteres.`, ...base });
      }
    }
  }

  const texto = parametroDe(c.keywords, 'TEXT');
  if (texto !== null) {
    const t = literalesDe(texto)[0] ?? '';
    if (t.length > 50) salida.push({ nivel: 'error', mensaje: `${donde}: TEXT supera los 50 caracteres (${t.length}).`, ...base });
  }

  const alias = parametroDe(c.keywords, 'ALIAS');
  if (alias !== null && (!RE_ALIAS.test(alias.trim()) || alias.trim().length > 128)) {
    salida.push({ nivel: 'error', mensaje: `${donde}: el ALIAS «${alias}» no es un nombre válido (hasta 128 caracteres, sin espacios).`, ...base });
  }

  for (const k of c.keywords) {
    const e = elementosDe(k.parametros);
    if (k.nombre === 'VALUES' && e.length === 0) {
      salida.push({ nivel: 'error', mensaje: `${donde}: VALUES no tiene valores.`, ...base });
    }
    if (k.nombre === 'RANGE' && e.length !== 2) {
      salida.push({ nivel: 'error', mensaje: `${donde}: RANGE necesita dos valores (desde y hasta).`, ...base });
    }
    if (k.nombre === 'COMP') {
      if (!OPERADORES.has((e[0] ?? '').toUpperCase())) {
        salida.push({ nivel: 'error', mensaje: `${donde}: COMP necesita un operador válido (EQ, NE, LT, NL, GT, NG, LE, GE).`, ...base });
      } else if (e.length < 2) {
        salida.push({ nivel: 'error', mensaje: `${donde}: COMP necesita un valor de comparación.`, ...base });
      }
    }
  }

  // Un valor entre comillas en un campo numérico (o al revés) casi seguro es un descuido.
  const numerico = TIPOS_NUMERICOS.has(c.tipoDato);
  for (const k of c.keywords) {
    if (!['VALUES', 'RANGE', 'COMP', 'DFT'].includes(k.nombre)) continue;
    const e = k.nombre === 'COMP' ? elementosDe(k.parametros).slice(1) : elementosDe(k.parametros);
    if (c.tipoDato === '' || c.tipoDato === 'H') continue;
    if (numerico && e.some((v) => v.startsWith("'"))) {
      salida.push({ nivel: 'aviso', mensaje: `${donde}: ${k.nombre} usa texto entre comillas en un campo numérico.`, ...base });
    }
    if (c.tipoDato === 'A' && e.some((v) => /^-?\d/.test(v))) {
      salida.push({ nivel: 'aviso', mensaje: `${donde}: ${k.nombre} usa números sin comillas en un campo de carácter.`, ...base });
    }
  }
}

function validarCampo(c: CampoTabla, r: RegistroTabla, t: Tabla, salida: ProblemaTabla[]): void {
  const base = { regId: r.id, elId: c.id };
  const donde = `Campo ${c.nombre || '(sin nombre)'}`;

  const errNombre = validarNombre(c.nombre, 'Campo');
  if (errNombre) salida.push({ nivel: 'error', mensaje: errNombre, ...base });

  if (!TIPOS_VALIDOS.has(c.tipoDato)) {
    salida.push({ nivel: 'error', mensaje: `${donde}: el tipo «${c.tipoDato}» no es válido.`, ...base });
  }

  const heredado = c.referencia || parametroDe(c.keywords, 'REFFLD') !== null;
  if (c.referencia && parametroDe(c.keywords, 'REFFLD') === null && parametroDe(t.keywords, 'REF') === null) {
    salida.push({ nivel: 'error', mensaje: `${donde}: es de referencia (R) pero no hay REFFLD en el campo ni REF en el archivo.`, ...base });
  }

  const sinLongitud = TIPOS_SIN_LONGITUD.has(c.tipoDato);
  if (!heredado && !sinLongitud && (c.longitud === null || c.longitud <= 0)) {
    salida.push({ nivel: 'error', mensaje: `${donde}: falta la longitud.`, ...base });
  }

  if (c.longitud !== null) {
    const n = c.longitud;
    const limite: Record<string, number> = { A: 32766, H: 32766, S: 31, P: 31, B: 18, F: 17 };
    if (c.tipoDato in limite && n > limite[c.tipoDato]) {
      salida.push({ nivel: 'error', mensaje: `${donde}: la longitud máxima para el tipo ${c.tipoDato} es ${limite[c.tipoDato]}.`, ...base });
    }
    if (sinLongitud) {
      salida.push({ nivel: 'aviso', mensaje: `${donde}: un campo de tipo ${c.tipoDato} no usa longitud.`, ...base });
    }
  }

  if (TIPOS_NUMERICOS.has(c.tipoDato)) {
    if (c.decimales === null) {
      salida.push({ nivel: 'aviso', mensaje: `${donde}: sin decimales declarados (se asumen 0).`, ...base });
    } else if (c.longitud !== null && c.decimales > c.longitud) {
      salida.push({ nivel: 'error', mensaje: `${donde}: los decimales (${c.decimales}) superan la longitud (${c.longitud}).`, ...base });
    }
  } else if (c.decimales !== null && c.tipoDato !== '') {
    salida.push({ nivel: 'aviso', mensaje: `${donde}: un campo de tipo ${c.tipoDato} no usa decimales.`, ...base });
  }

  validarKeywordsCampo(c, r, salida);
}

function validarFisico(t: Tabla, r: RegistroTabla, salida: ProblemaTabla[]): void {
  const campos = camposDe(r);
  if (campos.length === 0) {
    salida.push({ nivel: 'error', mensaje: `El registro ${r.nombre} no tiene campos.`, regId: r.id });
  }

  const vistos = new Map<string, number>();
  for (const c of campos) {
    validarCampo(c, r, t, salida);
    const clave = c.nombre.toUpperCase();
    if (clave !== '') {
      if (vistos.has(clave)) {
        salida.push({ nivel: 'error', mensaje: `El campo ${c.nombre} está repetido.`, regId: r.id, elId: c.id });
      }
      vistos.set(clave, (vistos.get(clave) ?? 0) + 1);
    }
  }

  const total = campos.reduce((s, c) => s + bytesDeCampo(c), 0);
  if (total > LIMITE_REGISTRO) {
    salida.push({
      nivel: 'error',
      mensaje: `El registro ocupa ${total} bytes y el máximo es ${LIMITE_REGISTRO}.`,
      regId: r.id,
    });
  }

  const llaves = llavesDe(r);
  if (llaves.length > LIMITE_LLAVE_CAMPOS) {
    salida.push({ nivel: 'error', mensaje: `La llave tiene ${llaves.length} campos y el máximo es ${LIMITE_LLAVE_CAMPOS}.`, regId: r.id });
  }
  const llavesVistas = new Set<string>();
  let bytesLlave = 0;
  for (const k of llaves) {
    const campo = campos.find((c) => c.nombre.toUpperCase() === k.nombre.toUpperCase());
    if (!campo) {
      salida.push({ nivel: 'error', mensaje: `La llave ${k.nombre} no es un campo del registro.`, regId: r.id, elId: k.id });
    } else {
      bytesLlave += bytesDeCampo(campo);
    }
    if (llavesVistas.has(k.nombre.toUpperCase())) {
      salida.push({ nivel: 'error', mensaje: `La llave ${k.nombre} está repetida.`, regId: r.id, elId: k.id });
    }
    llavesVistas.add(k.nombre.toUpperCase());
  }
  if (bytesLlave > LIMITE_LLAVE_BYTES) {
    salida.push({ nivel: 'error', mensaje: `La llave ocupa ${bytesLlave} bytes y el máximo es ${LIMITE_LLAVE_BYTES}.`, regId: r.id });
  }

  if (t.keywords.some((k) => k.nombre === 'UNIQUE') && llaves.length === 0) {
    salida.push({ nivel: 'aviso', mensaje: 'El archivo es UNIQUE pero no tiene llaves.' });
  }
}

function validarLogico(r: RegistroTabla, op: OpcionesValidacionTabla, salida: ProblemaTabla[]): void {
  const pfile = parametroDe(r.keywords, 'PFILE');
  const jfile = parametroDe(r.keywords, 'JFILE');
  if ((pfile ?? jfile ?? '').trim() === '') {
    salida.push({ nivel: 'error', mensaje: `El registro ${r.nombre}: ${pfile !== null ? 'PFILE' : 'JFILE'} no indica ningún archivo.`, regId: r.id });
    return;
  }

  const campos = camposDe(r);
  const nombresPropios = new Set(campos.map((c) => c.nombre.toUpperCase()));

  // Campos del físico, si se pueden conocer.
  let delFisico: Set<string> | null = null;
  if (pfile !== null && op.resolverArchivo) {
    const nombreFisico = pfile.trim().split(/\s+/)[0].replace(/^.*\//, '');
    const fisico = op.resolverArchivo(nombreFisico);
    if (fisico) delFisico = new Set(fisico.registros.flatMap(camposDe).map((c) => c.nombre.toUpperCase()));
  }

  const vistos = new Set<string>();
  for (const c of campos) {
    const err = validarNombre(c.nombre, 'Campo');
    if (err) salida.push({ nivel: 'error', mensaje: err, regId: r.id, elId: c.id });
    if (vistos.has(c.nombre.toUpperCase())) {
      salida.push({ nivel: 'error', mensaje: `El campo ${c.nombre} está repetido.`, regId: r.id, elId: c.id });
    }
    vistos.add(c.nombre.toUpperCase());
    if (delFisico) {
      const origen = (parametroDe(c.keywords, 'RENAME') ?? c.nombre).trim().toUpperCase();
      if (!delFisico.has(origen)) {
        salida.push({ nivel: 'error', mensaje: `El campo ${origen} no existe en el físico.`, regId: r.id, elId: c.id });
      }
    }
    validarKeywordsCampo(c, r, salida);
  }

  /** ¿Existe el campo en el lógico? Solo se sabe si hay lista de campos o se conoce el físico. */
  const existe = (nombre: string): boolean | null => {
    const n = nombre.toUpperCase();
    if (campos.length > 0) return nombresPropios.has(n) || (delFisico?.has(n) ?? false);
    if (delFisico) return delFisico.has(n);
    return null;
  };

  const llavesVistas = new Set<string>();
  for (const k of llavesDe(r)) {
    if (existe(k.nombre) === false) {
      salida.push({ nivel: 'error', mensaje: `La llave ${k.nombre} no es un campo del lógico.`, regId: r.id, elId: k.id });
    }
    if (llavesVistas.has(k.nombre.toUpperCase())) {
      salida.push({ nivel: 'error', mensaje: `La llave ${k.nombre} está repetida.`, regId: r.id, elId: k.id });
    }
    llavesVistas.add(k.nombre.toUpperCase());
  }

  for (const s of seleccionesDe(r)) {
    const marca = s.tipo === 'seleccion' ? 'S' : 'O';
    if (s.nombre.toUpperCase() === 'ALL') {
      if (s.tipo === 'seleccion') {
        salida.push({ nivel: 'error', mensaje: 'ALL solo se puede usar con O (omitir).', regId: r.id, elId: s.id });
      }
      continue;
    }
    if (existe(s.nombre) === false) {
      salida.push({ nivel: 'error', mensaje: `${marca} ${s.nombre}: el campo no existe.`, regId: r.id, elId: s.id });
    }
    if (!s.keywords.some((k) => ['COMP', 'VALUES', 'RANGE'].includes(k.nombre))) {
      salida.push({ nivel: 'aviso', mensaje: `${marca} ${s.nombre}: no tiene COMP, VALUES ni RANGE.`, regId: r.id, elId: s.id });
    }
    for (const k of s.keywords) {
      const e = elementosDe(k.parametros);
      if (k.nombre === 'RANGE' && e.length !== 2) {
        salida.push({ nivel: 'error', mensaje: `${marca} ${s.nombre}: RANGE necesita dos valores.`, regId: r.id, elId: s.id });
      }
      if (k.nombre === 'COMP' && (!OPERADORES.has((e[0] ?? '').toUpperCase()) || e.length < 2)) {
        salida.push({ nivel: 'error', mensaje: `${marca} ${s.nombre}: COMP necesita un operador válido y un valor.`, regId: r.id, elId: s.id });
      }
    }
  }
}

/** Valida toda la tabla. */
export function validarTabla(t: Tabla, op: OpcionesValidacionTabla = {}): ProblemaTabla[] {
  const salida: ProblemaTabla[] = [];

  if (t.registros.length === 0) {
    salida.push({ nivel: 'error', mensaje: 'El archivo no tiene ningún registro.' });
    return salida;
  }
  if (t.registros.length > 1 && tipoDeTabla(t) === 'PF') {
    salida.push({ nivel: 'error', mensaje: 'Un archivo físico solo puede tener un formato de registro.' });
  }

  const logico = tipoDeTabla(t) === 'LF';
  const nombres = new Set<string>();
  for (const r of t.registros) {
    const err = validarNombre(r.nombre, 'Registro');
    if (err) salida.push({ nivel: 'error', mensaje: err, regId: r.id });
    if (nombres.has(r.nombre.toUpperCase())) {
      salida.push({ nivel: 'error', mensaje: `El registro ${r.nombre} está repetido.`, regId: r.id });
    }
    nombres.add(r.nombre.toUpperCase());

    const texto = parametroDe(r.keywords, 'TEXT');
    if (texto !== null && (literalesDe(texto)[0] ?? '').length > 50) {
      salida.push({ nivel: 'error', mensaje: `Registro ${r.nombre}: TEXT supera los 50 caracteres.`, regId: r.id });
    }

    if (logico) validarLogico(r, op, salida);
    else validarFisico(t, r, salida);
  }

  for (const a of t.advertencias) salida.push({ nivel: 'aviso', mensaje: a });
  return salida;
}
