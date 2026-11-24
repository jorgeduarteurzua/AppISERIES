/**
 * Incorporar campos de un archivo de base de datos (PF o LF) a un formato de pantalla, como SDA:
 * cada campo queda con referencia al archivo (R en la columna 29 y REFFLD(CAMPO ARCHIVO)), con
 * su largo y tipo a la vista y, si se pide, su etiqueta (TEXT o COLHDG) a la izquierda.
 * El generador de programas usa esa referencia para saber de qué archivo viene cada campo.
 */
import { nuevoId } from '../modelo/ids';
import type { Campo, Constante, Keyword, PantallaDSPF, TipoCampo } from '../modelo/pantalla';
import { definicionDe } from '../tablas/generadorSql';
import { camposDe, llavesDe, nombreArchivoTabla, parametroDe, tipoDeTabla } from '../tablas/modelo';
import type { CampoTabla, Tabla } from '../tablas/modelo';
import { encabezadosDe, textoDe } from '../tablas/operacionesTabla';
import { dimensionElemento, marcoDe } from '../render/geometria';
import { ultimaColumnaConBarra } from './validacion';

export type ResolverArchivo = (nombre: string) => Tabla | null;

export interface CampoDeArchivo {
  nombre: string;
  /** Definición efectiva (resuelve REFFLD dentro del archivo). */
  longitud: number;
  decimales: number;
  tipo: string;
  texto: string;
  encabezado: string;
  llave: boolean;
}

/** El físico de un lógico (primer PFILE), sin biblioteca. */
export function fisicoDe(t: Tabla): string | null {
  for (const r of t.registros) {
    const p = parametroDe(r.keywords, 'PFILE');
    if (p) return p.trim().split(/\s+/)[0].replace(/^.*\//, '').toUpperCase();
  }
  return null;
}

/**
 * Campos de un archivo con su definición. Un lógico sin lista de campos usa los de su físico.
 * Las llaves son las del propio archivo (las de un lógico, si es lógico).
 */
export function camposDelArchivo(tabla: Tabla, resolver?: ResolverArchivo): CampoDeArchivo[] {
  const registro = tabla.registros[0];
  if (!registro) return [];
  let origen = tabla;
  let campos: CampoTabla[] = camposDe(registro);
  if (campos.length === 0 && tipoDeTabla(tabla) === 'LF') {
    const pf = fisicoDe(tabla);
    const fisico = pf ? resolver?.(pf) : null;
    if (fisico?.registros[0]) {
      origen = fisico;
      campos = camposDe(fisico.registros[0]);
    }
  }
  const llaves = new Set(llavesDe(registro).map((k) => k.nombre.toUpperCase()));
  const adv: string[] = [];
  return campos.map((c) => {
    // En un lógico con lista de campos, la definición puede venir del físico.
    let d = definicionDe(c, origen, { resolverArchivo: resolver }, adv);
    if (origen === tabla && tipoDeTabla(tabla) === 'LF' && c.longitud === null && c.tipoDato === '') {
      const fisico = fisicoDe(tabla) ? resolver?.(fisicoDe(tabla)!) : null;
      const enFisico = fisico?.registros[0] ? camposDe(fisico.registros[0]).find((x) => x.nombre === c.nombre) : undefined;
      if (fisico && enFisico) d = definicionDe(enFisico, fisico, { resolverArchivo: resolver }, adv);
    }
    return {
      nombre: c.nombre.toUpperCase(),
      longitud: d.longitud ?? 1,
      decimales: d.decimales ?? 0,
      tipo: d.tipo || 'A',
      texto: textoDe(c),
      encabezado: encabezadosDe(c).join(' ').replace(/\s+/g, ' ').trim(),
      llave: llaves.has(c.nombre.toUpperCase()),
    };
  });
}

export type EtiquetaCampo = 'texto' | 'encabezado' | 'nombre' | 'ninguna';

export interface OpcionesIncorporar {
  /** Nombre del archivo (miembro), sin biblioteca. */
  archivo: string;
  tabla: Tabla;
  resolver?: ResolverArchivo;
  regId: string;
  /** Campos a incorporar, en el orden en que se ubican (uno por fila). */
  campos: string[];
  uso: 'entrada' | 'salida' | 'ambos';
  etiqueta: EtiquetaCampo;
  /** Posición de la primera etiqueta (o del primer campo, sin etiquetas). */
  fila: number;
  columna: number;
  /**
   * En un subfile: agrega como ocultos (HKnn, con REFFLD) los campos de la llave del archivo, para
   * saber a qué registro corresponde la fila elegida. Por defecto sí.
   */
  llavesOcultas?: boolean;
}

/** Tipo de dato con que el campo se ve en la pantalla. Los numéricos de la base se ven como zoned. */
function tipoPantalla(tipo: string): TipoCampo {
  if (tipo === 'P' || tipo === 'B' || tipo === 'S' || tipo === 'F') return 'S';
  if (tipo === 'L' || tipo === 'T' || tipo === 'Z') return tipo as TipoCampo;
  return 'A';
}

function textoEtiqueta(c: CampoDeArchivo, modo: EtiquetaCampo): string {
  const base = modo === 'texto' ? c.texto || c.encabezado : modo === 'encabezado' ? c.encabezado || c.texto : c.nombre;
  return (base || c.nombre).replace(/'/g, '').trim();
}

const kw = (nombre: string, parametros = ''): Keyword => ({ nombre, parametros, indicadores: [] });

/** Agrega los campos al formato. Lanza un Error con el motivo si no se puede. */
export function incorporarCampos(
  p: PantallaDSPF,
  op: OpcionesIncorporar,
): { pantalla: PantallaDSPF; agregados: string[]; avisos: string[] } {
  const registro = p.registros.find((r) => r.id === op.regId);
  if (!registro) throw new Error('El formato elegido no existe.');
  if (op.campos.length === 0) throw new Error('Elija al menos un campo.');
  const archivo = nombreArchivoTabla(op.archivo);
  const disponibles = new Map(camposDelArchivo(op.tabla, op.resolver).map((c) => [c.nombre, c]));
  const elegidos = op.campos.map((n) => {
    const c = disponibles.get(n.toUpperCase());
    if (!c) throw new Error(`El campo ${n} no está en ${archivo}.`);
    return c;
  });
  const existentes = new Set(registro.elementos.flatMap((e) => (e.tipo === 'campo' ? [e.nombre.toUpperCase()] : [])));
  const repetidos = elegidos.filter((c) => existentes.has(c.nombre)).map((c) => c.nombre);
  if (repetidos.length > 0) throw new Error(`El formato ${registro.nombre} ya tiene ${repetidos.join(', ')}.`);

  const etiquetas = elegidos.map((c) => (op.etiqueta === 'ninguna' ? '' : `${textoEtiqueta(c, op.etiqueta)} :`));
  const anchoEtiqueta = Math.max(0, ...etiquetas.map((e) => e.length));
  const columnaCampo = op.etiqueta === 'ninguna' ? op.columna : op.columna + anchoEtiqueta + 1;
  const { filas, columnas } = p.tamano;
  if (op.fila < 1 || op.columna < 1) throw new Error('La fila y la columna empiezan en 1.');
  const ultimaFila = op.fila + elegidos.length - 1;
  if (ultimaFila > filas) throw new Error(`No caben: los ${elegidos.length} campos llegan a la fila ${ultimaFila} y la pantalla tiene ${filas}.`);

  const nueva: PantallaDSPF = structuredClone(p);
  const destino = nueva.registros.find((r) => r.id === op.regId)!;
  const agregados: string[] = [];
  elegidos.forEach((c, i) => {
    const fila = op.fila + i;
    const tipo = tipoPantalla(c.tipo);
    const fecha = tipo === 'L' || tipo === 'T' || tipo === 'Z';
    const largo = fecha ? (tipo === 'L' ? 10 : tipo === 'T' ? 8 : 26) : c.longitud;
    if (columnaCampo + largo - 1 > columnas) {
      throw new Error(`El campo ${c.nombre} (${largo}) no cabe desde la columna ${columnaCampo} en ${columnas} columnas.`);
    }
    if (etiquetas[i]) {
      const cte: Constante = { tipo: 'constante', id: nuevoId('cte'), fila, columna: op.columna, texto: etiquetas[i], keywords: [], indicadores: [] };
      destino.elementos.push(cte);
    }
    const campo: Campo = {
      tipo: 'campo',
      id: nuevoId('campo'),
      nombre: c.nombre,
      longitud: largo,
      decimales: tipo === 'S' ? c.decimales : 0,
      tipoDato: tipo,
      uso: op.uso,
      fila,
      columna: columnaCampo,
      keywords: [kw('REFFLD', `${c.nombre} ${archivo}`), ...(op.uso === 'salida' ? [] : [kw('DSPATR', 'UL')])],
      indicadores: [],
      referencia: true,
      // Fechas y horas: el largo y el tipo no se escriben en el DDS (los da el archivo).
      heredada: fecha,
    };
    destino.elementos.push(campo);
    agregados.push(c.nombre);
  });

  // Subfile: la llave del archivo como campos ocultos (HK01, HK02...), como en el CRUD.
  if (destino.clase === 'subfile' && op.llavesOcultas !== false) {
    const usados = new Set(destino.elementos.flatMap((e) => (e.tipo === 'campo' ? [e.nombre.toUpperCase()] : [])));
    const yaOculta = (campo: string) =>
      destino.elementos.some((e) => e.tipo === 'campo' && e.uso === 'oculto' && archivoDeReferencia(e)?.campo === campo && archivoDeReferencia(e)?.archivo === archivo);
    let n = 1;
    for (const k of [...disponibles.values()].filter((x) => x.llave)) {
      if (yaOculta(k.nombre)) continue;
      while (usados.has(`HK${String(n).padStart(2, '0')}`)) n++;
      const nombre = `HK${String(n).padStart(2, '0')}`;
      usados.add(nombre);
      const tipo = tipoPantalla(k.tipo);
      const fecha = tipo === 'L' || tipo === 'T' || tipo === 'Z';
      destino.elementos.push({
        tipo: 'campo',
        id: nuevoId('campo'),
        nombre,
        longitud: fecha ? (tipo === 'L' ? 10 : tipo === 'T' ? 8 : 26) : k.longitud,
        decimales: tipo === 'S' ? k.decimales : 0,
        tipoDato: tipo,
        uso: 'oculto',
        fila: null,
        columna: null,
        keywords: [kw('REFFLD', `${k.nombre} ${archivo}`)],
        indicadores: [],
        referencia: true,
        heredada: fecha,
      });
      agregados.push(`${nombre} (llave ${k.nombre}, oculto)`);
    }
  }

  // Con SFLEND(*SCRBAR) se avisa (no se acomoda) si algún campo llega a la barra de desplazamiento.
  const avisos: string[] = [];
  if (destino.clase === 'subfile') {
    const control = nueva.registros.find((r) => r.clase === 'control-subfile' && r.subfileControlado === destino.nombre);
    if (control?.keywords.some((k) => k.nombre === 'SFLEND' && /\*SCRBAR/i.test(k.parametros))) {
      const marco = marcoDe(nueva, destino);
      const limite = ultimaColumnaConBarra(marco);
      for (const e of destino.elementos) {
        if (e.fila === null || e.columna === null || !agregados.includes(e.tipo === 'campo' ? e.nombre : '')) continue;
        const fin = e.columna + dimensionElemento(e, marco).ancho - 1;
        if (fin > limite) {
          avisos.push(`${e.tipo === 'campo' ? e.nombre : 'Un texto'} termina en la columna ${fin}: con SFLEND(*SCRBAR) debe terminar en la ${limite} o antes (CPD8186).`);
        }
      }
    }
  }
  return { pantalla: nueva, agregados, avisos };
}

/** De qué archivo viene un campo de pantalla (su REFFLD), o null. */
export function archivoDeReferencia(c: Campo): { campo: string; archivo: string } | null {
  if (!c.referencia) return null;
  const p = parametroDe(c.keywords, 'REFFLD');
  if (!p) return null;
  const [campo, archivo] = p.trim().split(/\s+/);
  if (!campo || !archivo || archivo === '*SRC') return null;
  return { campo: campo.replace(/^.*\//, '').toUpperCase(), archivo: archivo.replace(/^.*\//, '').toUpperCase() };
}
