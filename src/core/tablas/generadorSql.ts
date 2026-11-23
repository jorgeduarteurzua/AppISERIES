/**
 * Generador de SQL (IBM i) a partir del modelo de un archivo DDS.
 *
 *  PF               -> CREATE TABLE (+ CREATE INDEX si la llave no es única) + LABEL ON
 *  LF sin S/O       -> CREATE INDEX
 *  LF con S/O o sin llaves -> CREATE VIEW
 *
 * Lo que no tiene equivalente en SQL no se inventa: se devuelve en
 * `advertencias` para que el usuario lo revise.
 */

import type { Keyword } from '../modelo/pantalla';
import {
  camposDe,
  llavesDe,
  literalesDe,
  nombreArchivoTabla,
  parametroDe,
  seleccionesDe,
  tipoDeTabla,
  type CampoTabla,
  type RegistroTabla,
  type SeleccionTabla,
  type Tabla,
} from './modelo';

export interface OpcionesSql {
  /** Biblioteca con la que se califican los nombres (BIB.TABLA). */
  biblioteca?: string;
  /** Nombre del objeto; por defecto sale del nombre del fuente. */
  nombre?: string;
  /** Usa CREATE OR REPLACE en vez de CREATE. */
  reemplazar?: boolean;
  /** Busca otro archivo (para REFFLD y para las columnas de un lógico sin lista de campos). */
  resolverArchivo?: (nombre: string) => Tabla | null;
}

export interface ResultadoSql {
  sql: string;
  advertencias: string[];
}

const RESERVADAS = new Set([
  'ALL', 'AND', 'AS', 'BETWEEN', 'BY', 'CASE', 'CHECK', 'COLUMN', 'CONSTRAINT', 'CREATE', 'CURRENT',
  'DATE', 'DEFAULT', 'DELETE', 'DESC', 'DISTINCT', 'DROP', 'FOR', 'FROM', 'GROUP', 'HAVING', 'IN',
  'INDEX', 'INSERT', 'INTO', 'IS', 'JOIN', 'KEY', 'LIKE', 'NOT', 'NULL', 'ON', 'OR', 'ORDER',
  'PRIMARY', 'SELECT', 'SET', 'TABLE', 'TIME', 'TIMESTAMP', 'UNION', 'UNIQUE', 'UPDATE', 'USER',
  'VALUES', 'VIEW', 'WHERE', 'WITH',
]);

/** Nombre de objeto o columna; va entre comillas si es una palabra reservada o tiene caracteres raros. */
function ident(nombre: string): string {
  if (/^[A-Z][A-Z0-9_#@$]*$/i.test(nombre) && !RESERVADAS.has(nombre.toUpperCase())) return nombre;
  return `"${nombre.replace(/"/g, '""')}"`;
}

function literalSql(texto: string): string {
  return `'${texto.replace(/'/g, "''")}'`;
}

/** Separa en elementos por espacios, respetando lo que está entre comillas. */
function tokens(parametros: string): string[] {
  return parametros.match(/'(?:[^']|'')*'|[^\s]+/g) ?? [];
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface Definicion {
  longitud: number | null;
  tipo: string;
  decimales: number | null;
}

/** Definición efectiva de un campo, resolviendo REFFLD cuando hace falta. */
export function definicionDe(
  c: CampoTabla,
  tabla: Tabla,
  op: OpcionesSql,
  adv: string[],
  profundidad = 0,
): Definicion {
  if (c.longitud !== null || c.tipoDato !== '') {
    // En DDS, tipo en blanco con decimales es numérico (zoned).
    const tipo = c.tipoDato === '' && c.decimales !== null ? 'S' : c.tipoDato;
    return { longitud: c.longitud, tipo, decimales: c.decimales };
  }
  if (c.decimales !== null) return { longitud: c.longitud, tipo: 'S', decimales: c.decimales };

  const reffld = parametroDe(c.keywords, 'REFFLD');
  if ((c.referencia || reffld !== null) && profundidad < 5) {
    let campoRef = c.nombre;
    let archivoRef = parametroDe(tabla.keywords, 'REF');
    if (reffld !== null) {
      const t = tokens(reffld);
      if (t[0]) campoRef = t[0].includes('/') ? t[0].split('/')[1] : t[0];
      if (t[1]) archivoRef = t[1];
    }
    const destino =
      archivoRef === '*SRC' || archivoRef === null
        ? tabla
        : (op.resolverArchivo?.(archivoRef.replace(/^.*\//, '')) ?? null);
    const hallado = destino
      ? destino.registros.flatMap(camposDe).find((x) => x.nombre === campoRef && x !== c)
      : undefined;
    if (destino && hallado) return definicionDe(hallado, destino, op, adv, profundidad + 1);
    adv.push(
      `El campo ${c.nombre} toma su definición de ${campoRef}${archivoRef ? ` en ${archivoRef}` : ''}, ` +
        'que no está disponible: se genera como CHAR(10).',
    );
    return { longitud: 10, tipo: 'A', decimales: null };
  }

  adv.push(`El campo ${c.nombre} no tiene longitud ni tipo: se genera como CHAR(1).`);
  return { longitud: 1, tipo: 'A', decimales: null };
}

function tipoSql(d: Definicion, c: CampoTabla, adv: string[]): string {
  const n = d.longitud ?? 1;
  const dec = d.decimales ?? 0;
  const variable = c.keywords.some((k) => k.nombre === 'VARLEN');

  switch (d.tipo) {
    case 'A':
    case '':
      return `${variable ? 'VARCHAR' : 'CHAR'}(${n})`;
    case 'S':
      return `NUMERIC(${n}, ${dec})`;
    case 'P':
      return `DECIMAL(${n}, ${dec})`;
    case 'B':
      if (dec > 0) {
        adv.push(`El campo ${c.nombre} es binario con decimales: se genera como DECIMAL(${n}, ${dec}).`);
        return `DECIMAL(${n}, ${dec})`;
      }
      return n <= 4 ? 'SMALLINT' : n <= 9 ? 'INTEGER' : 'BIGINT';
    case 'F': {
      // En DDS la longitud de un flotante son dígitos: hasta 9 es simple precisión y
      // hasta 17 doble. FLTPCN(*SINGLE | *DOUBLE) fija la precisión explícitamente.
      const fltpcn = parametroDe(c.keywords, 'FLTPCN')?.trim().toUpperCase();
      if (fltpcn === '*DOUBLE') return 'DOUBLE';
      if (fltpcn === '*SINGLE') return 'REAL';
      return n <= 9 ? 'REAL' : 'DOUBLE';
    }
    case 'L':
      return 'DATE';
    case 'T':
      return 'TIME';
    case 'Z':
      return 'TIMESTAMP';
    case 'H':
      return `BINARY(${n})`;
    case 'O':
    case 'J':
    case 'E':
    case 'G':
      adv.push(`El campo ${c.nombre} es de tipo ${d.tipo} (DBCS/gráfico): se genera como GRAPHIC(${n}).`);
      return `GRAPHIC(${n})`;
    default:
      adv.push(`El campo ${c.nombre} tiene el tipo «${d.tipo}», que no se reconoce: se genera como CHAR(${n}).`);
      return `CHAR(${n})`;
  }
}

// ---------------------------------------------------------------------------
// Condiciones (VALUES, RANGE, COMP)
// ---------------------------------------------------------------------------

const OPERADOR_COMP: Record<string, string> = {
  EQ: '=',
  NE: '<>',
  LT: '<',
  NL: '>=',
  GT: '>',
  NG: '<=',
  LE: '<=',
  GE: '>=',
};

/** Condiciones SQL de las keywords COMP, VALUES y RANGE sobre una columna. */
function condicionesDe(columna: string, keywords: Keyword[], adv: string[]): string[] {
  const res: string[] = [];
  for (const k of keywords) {
    const t = tokens(k.parametros);
    if (k.nombre === 'COMP') {
      const op = OPERADOR_COMP[(t[0] ?? '').toUpperCase()];
      if (!op || t.length < 2) adv.push(`COMP(${k.parametros}) en ${columna} no se pudo traducir.`);
      else res.push(`${columna} ${op} ${t.slice(1).join(' ')}`);
    } else if (k.nombre === 'VALUES') {
      if (t.length === 0) adv.push(`VALUES() en ${columna} está vacío.`);
      else res.push(`${columna} IN (${t.join(', ')})`);
    } else if (k.nombre === 'RANGE') {
      if (t.length !== 2) adv.push(`RANGE(${k.parametros}) en ${columna} no se pudo traducir.`);
      else res.push(`${columna} BETWEEN ${t[0]} AND ${t[1]}`);
    }
  }
  return res;
}

// ---------------------------------------------------------------------------
// Etiquetas
// ---------------------------------------------------------------------------

/** Encabezado de columna SQL: tres líneas de 20 caracteres. */
function encabezado(c: CampoTabla, adv: string[]): string | null {
  const colhdg = parametroDe(c.keywords, 'COLHDG');
  if (colhdg === null) return null;
  const lineas = literalesDe(colhdg);
  if (lineas.length === 0) return null;
  const partidas = lineas.slice(0, 3).map((l) => {
    if (l.length > 20) adv.push(`COLHDG de ${c.nombre}: «${l}» supera los 20 caracteres y se recorta.`);
    return l.slice(0, 20);
  });
  return partidas
    .map((l, i) => (i < partidas.length - 1 ? l.padEnd(20) : l.trimEnd()))
    .join('');
}

function textoCampo(c: CampoTabla): string | null {
  const t = parametroDe(c.keywords, 'TEXT');
  if (t === null) return null;
  return literalesDe(t)[0] ?? null;
}

// ---------------------------------------------------------------------------
// Tabla física
// ---------------------------------------------------------------------------

function valorPorDefecto(c: CampoTabla, adv: string[]): string | null {
  const dft = parametroDe(c.keywords, 'DFT');
  if (dft === null) return null;
  const v = dft.trim();
  if (v === '*NULL') return 'NULL';
  if (v.startsWith('*')) {
    adv.push(`DFT(${v}) en ${c.nombre} no tiene equivalente directo y se omite.`);
    return null;
  }
  return v;
}

function generarTablaFisica(
  tabla: Tabla,
  r: RegistroTabla,
  nombre: string,
  calificado: string,
  op: OpcionesSql,
  adv: string[],
): string[] {
  const campos = camposDe(r);
  const sentencias: string[] = [];
  const columnas: string[] = [];
  const restricciones: string[] = [];
  const conteoChecks = new Map<string, number>();
  const nullables = new Set<string>();

  for (const c of campos) {
    const d = definicionDe(c, tabla, op, adv);
    const alias = parametroDe(c.keywords, 'ALIAS');
    const permiteNulos = c.keywords.some((k) => k.nombre === 'ALWNULL');
    if (permiteNulos) nullables.add(c.nombre);
    const porDefecto = valorPorDefecto(c, adv);

    const partes = [alias ? `${ident(alias.trim())} FOR COLUMN ${ident(c.nombre)}` : ident(c.nombre), tipoSql(d, c, adv)];
    if (permiteNulos) {
      if (porDefecto !== null) partes.push(`DEFAULT ${porDefecto}`);
    } else {
      partes.push(porDefecto !== null ? `NOT NULL DEFAULT ${porDefecto}` : 'NOT NULL WITH DEFAULT');
    }
    columnas.push(partes.join(' '));

    for (const k of c.keywords) {
      if (k.nombre === 'CHECK') adv.push(`CHECK(${k.parametros}) de ${c.nombre} es una validación de pantalla y no tiene equivalente en SQL.`);
    }
    for (const cond of condicionesDe(ident(c.nombre), c.keywords, adv)) {
      const n = (conteoChecks.get(c.nombre) ?? 0) + 1;
      conteoChecks.set(c.nombre, n);
      restricciones.push(`CONSTRAINT CK_${nombre}_${c.nombre}${n > 1 ? `_${n}` : ''} CHECK (${cond})`);
    }
  }

  const llaves = llavesDe(r);
  const unico = tabla.keywords.some((k) => k.nombre === 'UNIQUE');
  const listaLlaves = llaves.map(
    (k) => ident(k.nombre) + (k.keywords.some((x) => x.nombre === 'DESCEND') ? ' DESC' : ''),
  );
  for (const k of llaves) {
    for (const x of k.keywords) {
      if (!['DESCEND', 'ASCEND'].includes(x.nombre)) {
        adv.push(`La llave ${k.nombre} usa ${x.nombre}, que no tiene equivalente en SQL y se omite.`);
      }
    }
  }

  const sePuedePk =
    unico &&
    llaves.length > 0 &&
    !llaves.some((k) => nullables.has(k.nombre) || k.keywords.some((x) => x.nombre === 'DESCEND'));
  if (sePuedePk) restricciones.push(`PRIMARY KEY (${llaves.map((k) => ident(k.nombre)).join(', ')})`);

  const prefijo = op.reemplazar ? 'CREATE OR REPLACE TABLE' : 'CREATE TABLE';
  const cuerpo = [...columnas, ...restricciones].map((l) => `  ${l}`).join(',\n');
  const formato = r.nombre && r.nombre !== nombre ? ` RCDFMT ${ident(r.nombre)}` : '';
  sentencias.push(`${prefijo} ${calificado} (\n${cuerpo}\n)${formato};`);

  if (llaves.length > 0 && !sePuedePk) {
    const calificadoIdx = op.biblioteca ? `${ident(op.biblioteca)}.IX_${nombre}` : `IX_${nombre}`;
    sentencias.push(
      `CREATE${unico ? ' UNIQUE' : ''} INDEX ${calificadoIdx} ON ${calificado} (${listaLlaves.join(', ')});`,
    );
  } else if (unico && llaves.length === 0) {
    adv.push('El archivo tiene UNIQUE pero no tiene llaves: UNIQUE se omite.');
  }

  // Etiquetas
  const textoTabla = parametroDe(r.keywords, 'TEXT');
  const etiquetaTabla = textoTabla !== null ? (literalesDe(textoTabla)[0] ?? null) : null;
  if (etiquetaTabla) sentencias.push(`LABEL ON TABLE ${calificado} IS ${literalSql(etiquetaTabla)};`);

  const encabezados = campos
    .map((c) => ({ c, h: encabezado(c, adv) }))
    .filter((x): x is { c: CampoTabla; h: string } => x.h !== null);
  if (encabezados.length > 0) {
    sentencias.push(
      `LABEL ON COLUMN ${calificado} (\n` +
        encabezados.map((x) => `  ${ident(x.c.nombre)} IS ${literalSql(x.h)}`).join(',\n') +
        '\n);',
    );
  }
  const textos = campos
    .map((c) => ({ c, t: textoCampo(c) }))
    .filter((x): x is { c: CampoTabla; t: string } => x.t !== null);
  if (textos.length > 0) {
    sentencias.push(
      `LABEL ON COLUMN ${calificado} (\n` +
        textos.map((x) => `  ${ident(x.c.nombre)} TEXT IS ${literalSql(x.t)}`).join(',\n') +
        '\n);',
    );
  }
  return sentencias;
}

// ---------------------------------------------------------------------------
// Lógico: índice o vista
// ---------------------------------------------------------------------------

interface Bloque {
  tipo: 'seleccion' | 'omision';
  expr: string;
}

/** Condición de una sentencia S u O. */
function condicionSentencia(s: SeleccionTabla, adv: string[]): string {
  if (s.nombre.toUpperCase() === 'ALL') return '1 = 1';
  const condiciones = condicionesDe(ident(s.nombre), s.keywords, adv);
  if (condiciones.length === 0) {
    adv.push(`La sentencia ${s.tipo === 'seleccion' ? 'S' : 'O'} de ${s.nombre} no tiene COMP, VALUES ni RANGE.`);
    return '1 = 1';
  }
  return condiciones.length === 1 ? condiciones[0] : condiciones.map((c) => `(${c})`).join(' AND ');
}

/**
 * Junta las sentencias S/O seguidas del mismo tipo en bloques (mismo campo: OR;
 * campos distintos: AND), como evalúa el DDS.
 */
function bloquesDe(selecciones: SeleccionTabla[], adv: string[]): Bloque[] {
  const bloques: Bloque[] = [];
  let i = 0;
  while (i < selecciones.length) {
    const tipo = selecciones[i].tipo;
    const porCampo = new Map<string, string[]>();
    while (i < selecciones.length && selecciones[i].tipo === tipo) {
      const s = selecciones[i];
      const lista = porCampo.get(s.nombre) ?? [];
      lista.push(condicionSentencia(s, adv));
      porCampo.set(s.nombre, lista);
      i++;
    }
    const partes = [...porCampo.values()].map((l) => (l.length > 1 ? `(${l.join(' OR ')})` : l[0]));
    bloques.push({ tipo: tipo as 'seleccion' | 'omision', expr: partes.join(' AND ') });
  }
  return bloques;
}

/** Pone paréntesis a una expresión salvo que ya esté toda entre un solo par. */
function entreParentesis(expr: string): string {
  if (expr.startsWith('(') && expr.endsWith(')')) {
    let nivel = 0;
    let envuelta = true;
    for (let i = 0; i < expr.length; i++) {
      if (expr[i] === "'") {
        // salta el literal
        i++;
        while (i < expr.length && !(expr[i] === "'" && expr[i + 1] !== "'")) i += expr[i] === "'" ? 2 : 1;
        continue;
      }
      if (expr[i] === '(') nivel++;
      else if (expr[i] === ')') {
        nivel--;
        if (nivel === 0 && i < expr.length - 1) {
          envuelta = false;
          break;
        }
      }
    }
    if (envuelta) return expr;
  }
  return `(${expr})`;
}

/** Expresión de «el registro entra en la vista»: la primera sentencia que se cumple decide. */
function incluir(bloques: Bloque[], i: number): string {
  if (i === bloques.length) return bloques[bloques.length - 1].tipo === 'omision' ? '1 = 1' : '1 = 0';
  const b = bloques[i];
  const resto = incluir(bloques, i + 1);
  if (b.tipo === 'seleccion') {
    // AND se evalúa antes que OR y los OR internos de b.expr ya van entre paréntesis.
    return resto === '1 = 0' ? b.expr : `(${b.expr} OR ${resto})`;
  }
  if (b.expr === '1 = 1') return '1 = 0'; // «O ALL»: lo que sigue ya no cuenta
  const no = `NOT ${entreParentesis(b.expr)}`;
  return resto === '1 = 1' ? no : `(${no} AND ${resto})`;
}

function origenDe(r: RegistroTabla, op: OpcionesSql, adv: string[]): string | null {
  const pfile = parametroDe(r.keywords, 'PFILE');
  if (pfile === null) return null;
  const primero = tokens(pfile)[0];
  if (!primero) return null;
  if (tokens(pfile).length > 1) adv.push('PFILE tiene varios archivos: solo se usa el primero.');
  const [bib, archivo] = primero.includes('/') ? primero.split('/') : [op.biblioteca ?? '', primero];
  return bib ? `${ident(bib)}.${ident(archivo)}` : ident(archivo);
}

function columnasDeVista(
  r: RegistroTabla,
  fisico: Tabla | null,
): { select: string[]; nombres: string[] } | null {
  const campos = camposDe(r);
  if (campos.length > 0) {
    const select: string[] = [];
    const nombres: string[] = [];
    for (const c of campos) {
      const rename = parametroDe(c.keywords, 'RENAME');
      select.push(rename ? `${ident(rename.trim())} AS ${ident(c.nombre)}` : ident(c.nombre));
      nombres.push(ident(c.nombre));
    }
    return { select, nombres };
  }
  if (fisico) {
    const todos = fisico.registros.flatMap(camposDe);
    if (todos.length > 0) {
      const n = todos.map((c) => ident(c.nombre));
      return { select: n, nombres: n };
    }
  }
  return null;
}

function generarLogico(
  tabla: Tabla,
  r: RegistroTabla,
  nombre: string,
  calificado: string,
  op: OpcionesSql,
  adv: string[],
): string[] {
  if (r.elementos.some((e) => e.tipo === 'union') || r.keywords.some((k) => k.nombre === 'JFILE')) {
    adv.push('Los archivos lógicos con unión (JFILE/JOIN) todavía no se traducen a SQL.');
    return [`-- ${nombre}: archivo lógico de unión (JFILE/JOIN). Sin traducción automática.`];
  }

  const origen = origenDe(r, op, adv);
  if (origen === null) return [`-- El registro ${r.nombre} no tiene PFILE ni JFILE.`];

  const selecciones = seleccionesDe(r);
  const llaves = llavesDe(r);
  const unico = tabla.keywords.some((k) => k.nombre === 'UNIQUE');
  const sentencias: string[] = [];

  if (selecciones.length === 0 && llaves.length > 0) {
    const lista = llaves.map((k) => ident(k.nombre) + (k.keywords.some((x) => x.nombre === 'DESCEND') ? ' DESC' : ''));
    const formato = r.nombre && r.nombre !== nombre ? ` RCDFMT ${ident(r.nombre)}` : '';
    sentencias.push(`CREATE${unico ? ' UNIQUE' : ''} INDEX ${calificado} ON ${origen} (${lista.join(', ')})${formato};`);
    if (camposDe(r).length > 0) {
      adv.push('El lógico define una lista de campos: un índice SQL no la restringe. Usa una vista si la necesitas.');
    }
    return sentencias;
  }

  const fisicoNombre = (parametroDe(r.keywords, 'PFILE') ?? '').split(/\s+/)[0].replace(/^.*\//, '');
  const fisico = fisicoNombre ? (op.resolverArchivo?.(fisicoNombre) ?? null) : null;
  const columnas = columnasDeVista(r, fisico);
  if (columnas === null && camposDe(r).length === 0) {
    adv.push(`El lógico ${nombre} hereda todos los campos de ${fisicoNombre}: se usa SELECT *.`);
  }

  const prefijo = op.reemplazar ? 'CREATE OR REPLACE VIEW' : 'CREATE VIEW';
  const lista = columnas ? ` (${columnas.nombres.join(', ')})` : '';
  const select = columnas ? columnas.select.join(', ') : '*';
  let donde = '';
  if (selecciones.length > 0) {
    const bloques = bloquesDe(selecciones, adv);
    donde = `\nWHERE ${incluir(bloques, 0)}`;
  }
  const orden = llaves.length > 0 ? `\nORDER BY ${llaves.map((k) => ident(k.nombre) + (k.keywords.some((x) => x.nombre === 'DESCEND') ? ' DESC' : '')).join(', ')}` : '';
  if (llaves.length > 0) {
    adv.push('La llave del lógico se traduce a ORDER BY en la vista; para un acceso por llave crea además un índice.');
  }
  sentencias.push(`${prefijo} ${calificado}${lista} AS\nSELECT ${select}\nFROM ${origen}${donde}${orden};`);
  return sentencias;
}

// ---------------------------------------------------------------------------

/** Genera el SQL de un archivo (PF o LF). */
export function generarSql(tabla: Tabla, op: OpcionesSql = {}): ResultadoSql {
  const adv: string[] = [];
  const nombre = (op.nombre ?? nombreArchivoTabla(tabla.nombre)) || 'ARCHIVO';
  const calificado = op.biblioteca ? `${ident(op.biblioteca)}.${ident(nombre)}` : ident(nombre);

  const partes: string[] = [`-- ${nombre} (${tipoDeTabla(tabla)}) generado por AppISERIES`];
  if (tabla.registros.length === 0) {
    adv.push('El archivo no tiene registros.');
    return { sql: partes.join('\n') + '\n', advertencias: adv };
  }
  if (tabla.registros.length > 1) {
    adv.push('El archivo tiene varios formatos de registro: solo se traduce el primero.');
  }
  const r = tabla.registros[0];

  const sentencias =
    tipoDeTabla(tabla) === 'PF'
      ? generarTablaFisica(tabla, r, nombre, calificado, op, adv)
      : generarLogico(tabla, r, nombre, calificado, op, adv);

  partes.push(...sentencias.map((s) => `\n${s}`));
  return { sql: partes.join('\n') + '\n', advertencias: adv };
}
