/**
 * Índices de un archivo físico: los lógicos (LF) que lo usan con PFILE, y la creación de uno nuevo.
 * El índice es un LF en DDS; su SQL (CREATE INDEX) sale del generador SQL como el de cualquier lógico.
 */
import type { Keyword } from '../modelo/pantalla';
import { nuevoId } from '../modelo/ids';
import { camposDe, llavesDe, nombreArchivoTabla, parametroDe, tipoDeTabla } from './modelo';
import type { RegistroTabla, Tabla } from './modelo';

const kw = (nombre: string, parametros = ''): Keyword => ({ nombre, parametros, indicadores: [] });
const RE_NOMBRE = /^[A-Z$#@][A-Z0-9$#@_]{0,9}$/;

export interface LlaveIndice {
  nombre: string;
  descendente: boolean;
}

export interface IndiceDe {
  /** Nombre del lógico (clave del catálogo). */
  nombre: string;
  unico: boolean;
  llaves: LlaveIndice[];
  /** Tiene condiciones de selección u omisión. */
  conSeleccion: boolean;
  texto: string;
}

/** Físicos que nombra el PFILE de un registro (sin biblioteca). */
function fisicosDe(r: RegistroTabla): string[] {
  const p = parametroDe(r.keywords, 'PFILE');
  if (!p) return [];
  return p
    .trim()
    .split(/\s+/)
    .map((x) => x.replace(/^.*\//, '').toUpperCase())
    .filter(Boolean);
}

function textoDe(keywords: Keyword[]): string {
  const t = parametroDe(keywords, 'TEXT');
  return t ? t.trim().replace(/^'|'$/g, '').replace(/''/g, "'") : '';
}

/** Los lógicos del catálogo que usan este físico, ordenados por nombre. */
export function indicesDe(fisico: string, catalogo: Record<string, Tabla>): IndiceDe[] {
  const f = fisico.toUpperCase();
  const salida: IndiceDe[] = [];
  for (const [nombre, t] of Object.entries(catalogo)) {
    if (tipoDeTabla(t) !== 'LF') continue;
    const registros = t.registros.filter((r) => fisicosDe(r).includes(f));
    if (registros.length === 0) continue;
    const r = registros[0];
    salida.push({
      nombre,
      unico: t.keywords.some((k) => k.nombre === 'UNIQUE'),
      llaves: llavesDe(r).map((k) => ({ nombre: k.nombre, descendente: k.keywords.some((x) => x.nombre === 'DESCEND') })),
      conSeleccion: r.elementos.some((e) => e.tipo === 'seleccion' || e.tipo === 'omision'),
      texto: textoDe(r.keywords) || textoDe(t.keywords),
    });
  }
  return salida.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Nombre que se propone: CLIENTES → CLIENTESL1, el primero libre. */
export function sugerirNombreIndice(fisico: string, existentes: Iterable<string>): string {
  const usados = new Set([...existentes].map((n) => n.toUpperCase()));
  const base = fisico.toUpperCase().replace(/F$/, '');
  for (let i = 1; i < 100; i++) {
    const sufijo = `L${i}`;
    const nombre = `${base.slice(0, 10 - sufijo.length)}${sufijo}`;
    if (!usados.has(nombre)) return nombre;
  }
  return `${base.slice(0, 8)}LX`;
}

export interface OpcionesIndice {
  nombre: string;
  llaves: LlaveIndice[];
  unico: boolean;
  /** Campos del lógico; null = todos (comparte el formato del físico). */
  campos: string[] | null;
  texto: string;
}

/** Crea el lógico de un índice sobre el físico. Lanza un Error con el motivo si no se puede. */
export function crearIndice(fisico: Tabla, nombreFisico: string, op: OpcionesIndice): Tabla {
  if (tipoDeTabla(fisico) !== 'PF') throw new Error('Los índices se crean sobre un archivo físico.');
  const registroPf = fisico.registros[0];
  if (!registroPf) throw new Error('El físico no tiene formato de registro.');
  const nombre = op.nombre.trim().toUpperCase();
  const pf = nombreArchivoTabla(nombreFisico);
  if (!RE_NOMBRE.test(nombre)) throw new Error('El nombre del índice no es válido (máximo 10 caracteres: A-Z, 0-9, $ # @ _).');
  if (nombre === pf) throw new Error('El índice necesita un nombre distinto al del físico.');
  const disponibles = new Map(camposDe(registroPf).map((c) => [c.nombre.toUpperCase(), c.nombre]));
  if (op.llaves.length === 0) throw new Error('Elija al menos un campo para la llave del índice.');
  const vistas = new Set<string>();
  for (const k of op.llaves) {
    const n = k.nombre.toUpperCase();
    if (!disponibles.has(n)) throw new Error(`El campo ${k.nombre} no está en el físico ${pf}.`);
    if (vistas.has(n)) throw new Error(`El campo ${k.nombre} está dos veces en la llave.`);
    vistas.add(n);
  }
  const campos = op.campos?.map((c) => c.toUpperCase()) ?? null;
  if (campos) {
    if (campos.length === 0) throw new Error('Elija los campos del índice, o «todos».');
    for (const c of campos) if (!disponibles.has(c)) throw new Error(`El campo ${c} no está en el físico ${pf}.`);
    const faltan = [...vistas].filter((k) => !campos.includes(k));
    if (faltan.length > 0) throw new Error(`Los campos de la llave deben estar en el índice: falta ${faltan.join(', ')}.`);
  }
  const texto = op.texto.trim().replace(/'/g, "''").slice(0, 50);

  // Con todos los campos, el lógico usa el formato del físico (mismo nombre, sin listar campos).
  // Con algunos, es un formato propio con esos campos.
  const registro: RegistroTabla = {
    id: nuevoId('reg'),
    nombre: campos ? `R${nombre}`.slice(0, 10) : registroPf.nombre,
    keywords: [kw('PFILE', pf), ...(texto ? [kw('TEXT', `'${texto}'`)] : [])],
    elementos: [
      ...(campos ?? []).map((c) => ({
        tipo: 'campo' as const,
        id: nuevoId('campo'),
        nombre: disponibles.get(c)!,
        longitud: null,
        tipoDato: '',
        decimales: null,
        referencia: false,
        uso: '',
        keywords: [],
        comentarios: [],
      })),
      ...op.llaves.map((k) => ({
        tipo: 'llave' as const,
        id: nuevoId('llave'),
        nombre: disponibles.get(k.nombre.toUpperCase())!,
        keywords: k.descendente ? [kw('DESCEND')] : [],
        comentarios: [],
      })),
    ],
    comentarios: [],
  };
  return {
    nombre,
    keywords: op.unico ? [kw('UNIQUE')] : [],
    registros: [registro],
    comentariosArchivo: [],
    comentariosFinales: [],
    advertencias: [],
  };
}
