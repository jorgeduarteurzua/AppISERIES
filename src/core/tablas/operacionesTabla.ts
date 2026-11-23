/**
 * Operaciones de edición sobre el modelo `Tabla`.
 *
 * Todas son puras e inmutables: reciben una tabla y devuelven una nueva sin
 * modificar la original, igual que las de pantallas. Así el deshacer/rehacer
 * solo guarda versiones anteriores y las pruebas son directas.
 */

import type { Keyword } from '../modelo/pantalla';
import { nuevoId } from '../modelo/ids';
import { nombreLibre, normalizarNombre } from '../edicion/operaciones';
import {
  camposDe,
  literalesDe,
  parametroDe,
  type CampoTabla,
  type ElementoTabla,
  type LlaveTabla,
  type RegistroTabla,
  type SeleccionTabla,
  type Tabla,
  type TipoArchivo,
} from './modelo';

export { normalizarNombre, nombreLibre };

function clonar<T>(x: T): T {
  return structuredClone(x);
}

function kw(nombre: string, parametros = ''): Keyword {
  return { nombre: nombre.toUpperCase(), parametros, indicadores: [] };
}

function buscarRegistro(t: Tabla, regId: string): RegistroTabla {
  const r = t.registros.find((x) => x.id === regId);
  if (!r) throw new Error(`No existe el registro con id ${regId}.`);
  return r;
}

function buscarElemento(r: RegistroTabla, elId: string): ElementoTabla {
  const e = r.elementos.find((x) => x.id === elId);
  if (!e) throw new Error(`No existe el elemento con id ${elId} en ${r.nombre}.`);
  return e;
}

function buscarCampo(r: RegistroTabla, elId: string): CampoTabla {
  const e = buscarElemento(r, elId);
  if (e.tipo !== 'campo') throw new Error('El elemento no es un campo.');
  return e;
}

// ---------------------------------------------------------------------------
// Tipos de dato
// ---------------------------------------------------------------------------

/** Tipos que llevan decimales (la columna 36-37 se rellena). */
export const TIPOS_CON_DECIMALES = new Set(['S', 'P', 'B', 'F']);
/** Tipos que no usan longitud. */
export const TIPOS_SIN_LONGITUD = new Set(['L', 'T', 'Z']);
/** Tipos que el editor ofrece. */
export const TIPOS_TABLA: { valor: string; texto: string }[] = [
  { valor: 'A', texto: 'A · Carácter' },
  { valor: 'S', texto: 'S · Numérico (zoned)' },
  { valor: 'P', texto: 'P · Empaquetado' },
  { valor: 'B', texto: 'B · Binario' },
  { valor: 'F', texto: 'F · Coma flotante' },
  { valor: 'L', texto: 'L · Fecha' },
  { valor: 'T', texto: 'T · Hora' },
  { valor: 'Z', texto: 'Z · Marca de tiempo' },
  { valor: 'H', texto: 'H · Hexadecimal' },
  { valor: '', texto: '(en blanco / heredado)' },
];

// ---------------------------------------------------------------------------
// Tabla nueva
// ---------------------------------------------------------------------------

/**
 * Crea una tabla nueva. Un físico empieza con un campo de ejemplo; un lógico
 * apunta a un físico con PFILE y hereda todos sus campos.
 */
export function crearTabla(nombre: string, tipo: TipoArchivo = 'PF', fisico = ''): Tabla {
  const n = normalizarNombre(nombre).slice(0, 10) || 'ARCHIVO';
  const registro: RegistroTabla = {
    id: nuevoId('reg'),
    nombre: `R${n}`.slice(0, 10),
    keywords: tipo === 'LF' ? [kw('PFILE', normalizarNombre(fisico) || 'FISICO')] : [],
    elementos: [],
    comentarios: [],
  };
  if (tipo === 'PF') {
    registro.elementos.push({
      tipo: 'campo',
      id: nuevoId('campo'),
      nombre: 'CAMPO01',
      longitud: 10,
      tipoDato: 'A',
      decimales: null,
      referencia: false,
      uso: '',
      keywords: [],
      comentarios: [],
    });
  }
  return {
    nombre: n,
    keywords: [],
    registros: [registro],
    comentariosArchivo: [],
    comentariosFinales: [],
    advertencias: [],
  };
}

export function renombrarRegistro(t: Tabla, regId: string, nombre: string): Tabla {
  const n = clonar(t);
  buscarRegistro(n, regId).nombre = normalizarNombre(nombre);
  return n;
}

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------

export type ParcheCampo = Partial<Omit<CampoTabla, 'id' | 'tipo'>>;

/** Índice donde insertar un campo nuevo: tras `despuesDe`, o tras el último campo. */
function posicionNuevoCampo(r: RegistroTabla, despuesDe?: string): number {
  if (despuesDe) {
    const i = r.elementos.findIndex((e) => e.id === despuesDe);
    if (i >= 0) return i + 1;
  }
  let ultimo = -1;
  r.elementos.forEach((e, i) => {
    if (e.tipo === 'campo') ultimo = i;
  });
  return ultimo + 1;
}

export function agregarCampo(
  t: Tabla,
  regId: string,
  datos: ParcheCampo & { despuesDe?: string } = {},
): { tabla: Tabla; elementoId: string } {
  const n = clonar(t);
  const r = buscarRegistro(n, regId);
  const { despuesDe, ...resto } = datos;
  const nombre = resto.nombre
    ? normalizarNombre(resto.nombre)
    : nombreLibre(camposDe(r).map((c) => c.nombre), 'CAMPO');
  const campo: CampoTabla = {
    tipo: 'campo',
    id: nuevoId('campo'),
    longitud: 10,
    tipoDato: 'A',
    decimales: null,
    referencia: false,
    uso: '',
    keywords: [],
    comentarios: [],
    ...resto,
    nombre,
  };
  r.elementos.splice(posicionNuevoCampo(r, despuesDe), 0, campo);
  return { tabla: n, elementoId: campo.id };
}

/** Ajusta longitud y decimales cuando cambia el tipo. */
function ajustarPorTipo(c: CampoTabla, tipoAnterior: string, parche: ParcheCampo): void {
  if (c.tipoDato === tipoAnterior) return;
  if (TIPOS_SIN_LONGITUD.has(c.tipoDato)) {
    if (parche.longitud === undefined) c.longitud = null;
    if (parche.decimales === undefined) c.decimales = null;
    return;
  }
  if (TIPOS_CON_DECIMALES.has(c.tipoDato)) {
    if (parche.decimales === undefined && c.decimales === null) c.decimales = 0;
  } else if (parche.decimales === undefined) {
    c.decimales = null;
  }
  if (c.longitud === null && parche.longitud === undefined) c.longitud = 10;
}

/** Cambia los nombres de campo usados por llaves y selecciones. */
function propagarRenombre(t: Tabla, anterior: string, nuevo: string): void {
  for (const r of t.registros) {
    for (const e of r.elementos) {
      if ((e.tipo === 'llave' || e.tipo === 'seleccion' || e.tipo === 'omision') && e.nombre === anterior) {
        e.nombre = nuevo;
      }
    }
  }
}

/**
 * Cambia propiedades de un campo. Normaliza el nombre y lo propaga a las
 * llaves y selecciones que lo usan; al cambiar el tipo ajusta decimales y longitud.
 */
export function actualizarCampo(t: Tabla, regId: string, elId: string, parche: ParcheCampo): Tabla {
  const n = clonar(t);
  const c = buscarCampo(buscarRegistro(n, regId), elId);
  const anterior = c.nombre;
  const tipoAnterior = c.tipoDato;

  const cambios: ParcheCampo = { ...parche };
  if (typeof cambios.nombre === 'string') cambios.nombre = normalizarNombre(cambios.nombre);
  if (typeof cambios.tipoDato === 'string') cambios.tipoDato = cambios.tipoDato.trim().toUpperCase().slice(0, 1);
  Object.assign(c, cambios);

  ajustarPorTipo(c, tipoAnterior, parche);
  if (c.nombre !== anterior && c.nombre !== '') propagarRenombre(n, anterior, c.nombre);
  return n;
}

/** Elimina un elemento. Si es un campo, también se quitan las llaves y selecciones que lo usaban. */
export function eliminarElemento(t: Tabla, regId: string, elId: string): Tabla {
  const n = clonar(t);
  const r = buscarRegistro(n, regId);
  const e = buscarElemento(r, elId);
  r.elementos = r.elementos.filter((x) => x.id !== elId);
  if (e.tipo === 'campo') {
    r.elementos = r.elementos.filter(
      (x) => !((x.tipo === 'llave' || x.tipo === 'seleccion' || x.tipo === 'omision') && x.nombre === e.nombre),
    );
  }
  return n;
}

/** Sube (-1) o baja (+1) un campo respecto a los demás campos. */
export function moverCampo(t: Tabla, regId: string, elId: string, delta: -1 | 1): Tabla {
  const n = clonar(t);
  const r = buscarRegistro(n, regId);
  const indices = r.elementos.flatMap((e, i) => (e.tipo === 'campo' ? [i] : []));
  const pos = indices.findIndex((i) => r.elementos[i].id === elId);
  if (pos < 0) throw new Error('El elemento no es un campo.');
  const destino = pos + delta;
  if (destino < 0 || destino >= indices.length) return n;
  const a = indices[pos];
  const b = indices[destino];
  [r.elementos[a], r.elementos[b]] = [r.elementos[b], r.elementos[a]];
  return n;
}

export function duplicarCampo(t: Tabla, regId: string, elId: string): { tabla: Tabla; elementoId: string } {
  const n = clonar(t);
  const r = buscarRegistro(n, regId);
  const origen = buscarCampo(r, elId);
  const copia: CampoTabla = {
    ...clonar(origen),
    id: nuevoId('campo'),
    nombre: nombreLibre(camposDe(r).map((c) => c.nombre), origen.nombre.slice(0, 8)),
    comentarios: [],
  };
  const i = r.elementos.findIndex((e) => e.id === elId);
  r.elementos.splice(i + 1, 0, copia);
  return { tabla: n, elementoId: copia.id };
}

// ---------------------------------------------------------------------------
// Llaves
// ---------------------------------------------------------------------------

export function agregarLlave(
  t: Tabla,
  regId: string,
  nombreCampo: string,
  descendente = false,
): { tabla: Tabla; elementoId: string } {
  const n = clonar(t);
  const r = buscarRegistro(n, regId);
  const nombre = normalizarNombre(nombreCampo);
  if (r.elementos.some((e) => e.tipo === 'llave' && e.nombre === nombre)) {
    throw new Error(`${nombre} ya es parte de la llave.`);
  }
  const llave: LlaveTabla = {
    tipo: 'llave',
    id: nuevoId('llave'),
    nombre,
    keywords: descendente ? [kw('DESCEND')] : [],
    comentarios: [],
  };
  // Después de la última llave; si no hay, antes de la primera selección/omisión/unión o al final.
  let indice = r.elementos.length;
  const ultima = r.elementos.map((e) => e.tipo).lastIndexOf('llave');
  if (ultima >= 0) indice = ultima + 1;
  else {
    const primeraSel = r.elementos.findIndex((e) => e.tipo === 'seleccion' || e.tipo === 'omision');
    if (primeraSel >= 0) indice = primeraSel;
  }
  r.elementos.splice(indice, 0, llave);
  return { tabla: n, elementoId: llave.id };
}

export function alternarDescendente(t: Tabla, regId: string, llaveId: string): Tabla {
  const n = clonar(t);
  const e = buscarElemento(buscarRegistro(n, regId), llaveId);
  if (e.tipo !== 'llave') throw new Error('El elemento no es una llave.');
  const hay = e.keywords.some((k) => k.nombre === 'DESCEND');
  e.keywords = hay ? e.keywords.filter((k) => k.nombre !== 'DESCEND') : [kw('DESCEND'), ...e.keywords];
  return n;
}

export function moverLlave(t: Tabla, regId: string, llaveId: string, delta: -1 | 1): Tabla {
  const n = clonar(t);
  const r = buscarRegistro(n, regId);
  const indices = r.elementos.flatMap((e, i) => (e.tipo === 'llave' ? [i] : []));
  const pos = indices.findIndex((i) => r.elementos[i].id === llaveId);
  if (pos < 0) throw new Error('El elemento no es una llave.');
  const destino = pos + delta;
  if (destino < 0 || destino >= indices.length) return n;
  const a = indices[pos];
  const b = indices[destino];
  [r.elementos[a], r.elementos[b]] = [r.elementos[b], r.elementos[a]];
  return n;
}

/** Activa o desactiva UNIQUE a nivel de archivo. */
export function establecerUnico(t: Tabla, unico: boolean): Tabla {
  const n = clonar(t);
  const hay = n.keywords.some((k) => k.nombre === 'UNIQUE');
  if (unico && !hay) n.keywords.unshift(kw('UNIQUE'));
  if (!unico) n.keywords = n.keywords.filter((k) => k.nombre !== 'UNIQUE');
  return n;
}

// ---------------------------------------------------------------------------
// Selección y omisión (lógicos)
// ---------------------------------------------------------------------------

export function agregarSeleccion(
  t: Tabla,
  regId: string,
  tipo: 'seleccion' | 'omision',
  nombreCampo: string,
  keywords: Keyword[] = [],
): { tabla: Tabla; elementoId: string } {
  const n = clonar(t);
  const r = buscarRegistro(n, regId);
  const sel: SeleccionTabla = {
    tipo,
    id: nuevoId('sel'),
    nombre: normalizarNombre(nombreCampo),
    keywords: clonar(keywords),
    comentarios: [],
  };
  r.elementos.push(sel);
  return { tabla: n, elementoId: sel.id };
}

export function actualizarSeleccion(
  t: Tabla,
  regId: string,
  elId: string,
  parche: Partial<Pick<SeleccionTabla, 'tipo' | 'nombre' | 'keywords'>>,
): Tabla {
  const n = clonar(t);
  const e = buscarElemento(buscarRegistro(n, regId), elId);
  if (e.tipo !== 'seleccion' && e.tipo !== 'omision') throw new Error('El elemento no es una selección.');
  if (parche.tipo) e.tipo = parche.tipo;
  if (parche.nombre !== undefined) e.nombre = normalizarNombre(parche.nombre);
  if (parche.keywords) e.keywords = clonar(parche.keywords);
  return n;
}

/** Cambia el físico (PFILE) de un registro de un lógico. */
export function establecerFisico(t: Tabla, regId: string, fisico: string): Tabla {
  return establecerKeyword(t, { tipo: 'registro', regId }, 'PFILE', normalizarNombre(fisico));
}

// ---------------------------------------------------------------------------
// Keywords genéricas
// ---------------------------------------------------------------------------

export type DestinoTabla =
  | { tipo: 'archivo' }
  | { tipo: 'registro'; regId: string }
  | { tipo: 'elemento'; regId: string; elId: string };

function listaKeywords(t: Tabla, d: DestinoTabla): Keyword[] {
  if (d.tipo === 'archivo') return t.keywords;
  const r = buscarRegistro(t, d.regId);
  if (d.tipo === 'registro') return r.keywords;
  return buscarElemento(r, d.elId).keywords;
}

export function agregarKeyword(t: Tabla, d: DestinoTabla, nombre: string, parametros = ''): Tabla {
  const n = clonar(t);
  listaKeywords(n, d).push(kw(nombre, parametros));
  return n;
}

export function quitarKeyword(t: Tabla, d: DestinoTabla, indice: number): Tabla {
  const n = clonar(t);
  const lista = listaKeywords(n, d);
  if (indice < 0 || indice >= lista.length) throw new Error('La keyword indicada no existe.');
  lista.splice(indice, 1);
  return n;
}

export function actualizarKeyword(
  t: Tabla,
  d: DestinoTabla,
  indice: number,
  parche: { nombre?: string; parametros?: string },
): Tabla {
  const n = clonar(t);
  const lista = listaKeywords(n, d);
  if (indice < 0 || indice >= lista.length) throw new Error('La keyword indicada no existe.');
  if (parche.nombre !== undefined) lista[indice].nombre = parche.nombre.trim().toUpperCase();
  if (parche.parametros !== undefined) lista[indice].parametros = parche.parametros;
  return n;
}

/**
 * Pone la keyword con ese nombre (la primera, si hay varias) o la quita si
 * `parametros` es null. Sin parámetros ('' ) queda como bandera (ALWNULL).
 */
export function establecerKeyword(t: Tabla, d: DestinoTabla, nombre: string, parametros: string | null): Tabla {
  const n = clonar(t);
  const lista = listaKeywords(n, d);
  const N = nombre.toUpperCase();
  const i = lista.findIndex((k) => k.nombre === N);
  if (parametros === null) {
    if (i >= 0) lista.splice(i, 1);
  } else if (i >= 0) {
    lista[i].parametros = parametros;
  } else {
    lista.push(kw(N, parametros));
  }
  return n;
}

/** Quita todas las keywords con ese nombre (p.ej. varios COMP). */
function quitarTodas(lista: Keyword[], ...nombres: string[]): Keyword[] {
  return lista.filter((k) => !nombres.includes(k.nombre));
}

// ---------------------------------------------------------------------------
// Propiedades de campo: encabezado, texto, alias, valor por defecto, nulos
// ---------------------------------------------------------------------------

const comillas = (texto: string) => `'${texto.replace(/'/g, "''")}'`;

function destinoCampo(regId: string, elId: string): DestinoTabla {
  return { tipo: 'elemento', regId, elId };
}

/** Líneas del encabezado de columna (COLHDG): hasta 3 de 20 caracteres. */
export function encabezadosDe(c: CampoTabla): string[] {
  const p = parametroDe(c.keywords, 'COLHDG');
  return p === null ? [] : literalesDe(p);
}

export function establecerEncabezados(t: Tabla, regId: string, elId: string, lineas: string[]): Tabla {
  const utiles = lineas.slice(0, 3).map((l) => l);
  // Se quitan las líneas vacías del final, pero no las de en medio.
  while (utiles.length > 0 && utiles[utiles.length - 1] === '') utiles.pop();
  return establecerKeyword(
    t,
    destinoCampo(regId, elId),
    'COLHDG',
    utiles.length === 0 ? null : utiles.map(comillas).join(' '),
  );
}

export function textoDe(c: CampoTabla): string {
  const p = parametroDe(c.keywords, 'TEXT');
  return p === null ? '' : (literalesDe(p)[0] ?? '');
}

export function establecerTexto(t: Tabla, regId: string, elId: string, texto: string): Tabla {
  return establecerKeyword(t, destinoCampo(regId, elId), 'TEXT', texto === '' ? null : comillas(texto));
}

/** Texto de la descripción del registro (se usa como etiqueta de la tabla en SQL). */
export function establecerTextoRegistro(t: Tabla, regId: string, texto: string): Tabla {
  return establecerKeyword(t, { tipo: 'registro', regId }, 'TEXT', texto === '' ? null : comillas(texto));
}

export function aliasDe(c: CampoTabla): string {
  return parametroDe(c.keywords, 'ALIAS') ?? '';
}

export function establecerAlias(t: Tabla, regId: string, elId: string, alias: string): Tabla {
  const limpio = alias.trim();
  return establecerKeyword(t, destinoCampo(regId, elId), 'ALIAS', limpio === '' ? null : limpio);
}

/** Valor de DFT tal como se escribe en el DDS ('A', 0...), o '' si no hay. */
export function porDefectoDe(c: CampoTabla): string {
  return parametroDe(c.keywords, 'DFT') ?? '';
}

export function establecerPorDefecto(t: Tabla, regId: string, elId: string, valorDds: string): Tabla {
  const v = valorDds.trim();
  return establecerKeyword(t, destinoCampo(regId, elId), 'DFT', v === '' ? null : v);
}

export function permiteNulos(c: CampoTabla): boolean {
  return c.keywords.some((k) => k.nombre === 'ALWNULL');
}

export function establecerNulos(t: Tabla, regId: string, elId: string, permitir: boolean): Tabla {
  return establecerKeyword(t, destinoCampo(regId, elId), 'ALWNULL', permitir ? '' : null);
}

// ---------------------------------------------------------------------------
// Condiciones de validez: VALUES, RANGE, COMP
// ---------------------------------------------------------------------------

export const OPERADORES_COMP = [
  { valor: 'EQ', texto: 'igual a' },
  { valor: 'NE', texto: 'distinto de' },
  { valor: 'LT', texto: 'menor que' },
  { valor: 'NL', texto: 'no menor que' },
  { valor: 'GT', texto: 'mayor que' },
  { valor: 'NG', texto: 'no mayor que' },
  { valor: 'LE', texto: 'menor o igual a' },
  { valor: 'GE', texto: 'mayor o igual a' },
] as const;

export interface Comparacion {
  operador: string;
  valor: string;
}

/** Separa en elementos por espacios, respetando lo que está entre comillas. */
function elementos(parametros: string): string[] {
  return parametros.match(/'(?:[^']|'')*'|[^\s]+/g) ?? [];
}

/** Valores permitidos (VALUES), tal como se escriben en DDS: `'A'`, `'B'`, `5`. */
export function valoresDe(c: CampoTabla): string[] {
  const p = parametroDe(c.keywords, 'VALUES');
  return p === null ? [] : elementos(p);
}

export function rangoDe(c: CampoTabla): { desde: string; hasta: string } | null {
  const p = parametroDe(c.keywords, 'RANGE');
  if (p === null) return null;
  const e = elementos(p);
  return e.length === 2 ? { desde: e[0], hasta: e[1] } : null;
}

export function comparacionesDe(c: CampoTabla): Comparacion[] {
  return c.keywords
    .filter((k) => k.nombre === 'COMP')
    .map((k) => {
      const e = elementos(k.parametros);
      return { operador: (e[0] ?? '').toUpperCase(), valor: e.slice(1).join(' ') };
    });
}

/** Convierte lo que escribe el usuario a un literal DDS: carácter entre comillas, numérico tal cual. */
export function literalDds(valor: string, numerico: boolean): string {
  const v = valor.trim();
  if (numerico) return v;
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) return v;
  return comillas(v);
}

/** Fija VALUES con la lista indicada (vacía la quita). Reemplaza RANGE y COMP: son excluyentes. */
export function establecerValores(t: Tabla, regId: string, elId: string, valoresDds: string[]): Tabla {
  const n = clonar(t);
  const c = buscarCampo(buscarRegistro(n, regId), elId);
  c.keywords = quitarTodas(c.keywords, 'VALUES', 'RANGE', 'COMP');
  if (valoresDds.length > 0) c.keywords.push(kw('VALUES', valoresDds.join(' ')));
  return n;
}

/** Fija RANGE (null lo quita). Reemplaza VALUES y COMP: son excluyentes. */
export function establecerRango(
  t: Tabla,
  regId: string,
  elId: string,
  rango: { desde: string; hasta: string } | null,
): Tabla {
  const n = clonar(t);
  const c = buscarCampo(buscarRegistro(n, regId), elId);
  c.keywords = quitarTodas(c.keywords, 'VALUES', 'RANGE', 'COMP');
  if (rango) c.keywords.push(kw('RANGE', `${rango.desde} ${rango.hasta}`));
  return n;
}

/** Fija las comparaciones COMP. Reemplaza VALUES y RANGE: son excluyentes. */
export function establecerComparaciones(t: Tabla, regId: string, elId: string, lista: Comparacion[]): Tabla {
  const n = clonar(t);
  const c = buscarCampo(buscarRegistro(n, regId), elId);
  c.keywords = quitarTodas(c.keywords, 'VALUES', 'RANGE', 'COMP');
  for (const comp of lista) c.keywords.push(kw('COMP', `${comp.operador} ${comp.valor}`.trim()));
  return n;
}

/** Cuál de las tres condiciones tiene el campo. */
export function tipoCondicion(c: CampoTabla): 'ninguna' | 'valores' | 'rango' | 'comparacion' {
  if (c.keywords.some((k) => k.nombre === 'VALUES')) return 'valores';
  if (c.keywords.some((k) => k.nombre === 'RANGE')) return 'rango';
  if (c.keywords.some((k) => k.nombre === 'COMP')) return 'comparacion';
  return 'ninguna';
}
