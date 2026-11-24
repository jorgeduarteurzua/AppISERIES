/**
 * Validación del modelo de pantalla antes de generar el DDS.
 *
 * Detecta lo que el generador no puede resolver solo (nombres inválidos,
 * longitudes, posiciones fuera de la pantalla o de la ventana, subfiles sin
 * control, indicadores de más) y avisos que no impiden compilar pero suelen
 * ser un descuido (elementos superpuestos, textos que se salen).
 */

import type { Campo, IndicadorCond, Keyword, PantallaDSPF, Registro } from '../modelo/pantalla';
import { cajasElementos, dimensionElemento, marcoDe, type Caja } from '../render/geometria';
import { ventanaDe } from '../render/lienzo';
import { NOMBRE_AYUDA, TECLAS_BASICAS, formatoDeAyuda, textoDeTecla } from './operaciones';

export interface Problema {
  nivel: 'error' | 'aviso';
  mensaje: string;
  regId?: string;
  elId?: string;
}

const RE_NOMBRE = /^[A-Z#$@][A-Z0-9#$@_]*$/i;
const MAX_INDICADORES = 3;
const TIPOS_NUMERICOS = new Set(['S', 'P', 'Y', 'B', 'F', 'I']);
const TIPOS_DIGITOS_MAX_31 = new Set(['S', 'P', 'Y']);

export function hayErrores(problemas: Problema[]): boolean {
  return problemas.some((p) => p.nivel === 'error');
}

function etiqueta(e: { tipo: 'campo'; nombre: string } | { tipo: 'constante'; texto: string }): string {
  if (e.tipo === 'campo') return e.nombre || '(campo sin nombre)';
  const t = e.texto.length > 18 ? `${e.texto.slice(0, 18)}…` : e.texto;
  return `"${t}"`;
}

/** Motivo de que un elemento quede fuera: en una ventana, la última línea es la de mensajes (CPD7830). */
function fueraDe(marco: ReturnType<typeof marcoDe>, fila: number): string {
  if (marco.ventana && !marco.ventana.sinLineaMensaje && fila === marco.ventana.alto) {
    return `está en la última línea de la ventana, que es la línea de mensajes (agrande la ventana o use WINDOW(... *NOMSGLIN))`;
  }
  return `fuera de ${marco.ventana ? 'la ventana' : 'la pantalla'}`;
}

function validarNombre(nombre: string, que: string): string | null {
  if (nombre.trim() === '') return `${que} sin nombre.`;
  if (nombre.length > 10) return `${que} «${nombre}»: el nombre supera los 10 caracteres.`;
  if (!RE_NOMBRE.test(nombre)) {
    return `${que} «${nombre}»: el nombre solo admite letras, números, #, $, @ y _, y no puede empezar con número.`;
  }
  return null;
}

function indicadoresDeMas(inds: IndicadorCond[], alternativas?: IndicadorCond[][]): boolean {
  return inds.length > MAX_INDICADORES || (alternativas ?? []).some((g) => g.length > MAX_INDICADORES);
}

/**
 * Un mismo atributo DSPATR solo se puede indicar una vez por campo, aunque sea
 * con indicadores distintos: para «40 o 41» hay que usar una condición con OR
 * (`A 40` y `AO 41 DSPATR(PR)`), no dos líneas DSPATR(PR).
 */
function validarAtributosRepetidos(
  keywords: Keyword[],
  donde: string,
  base: Pick<Problema, 'regId' | 'elId'>,
  salida: Problema[],
): void {
  const vistos = new Set<string>();
  const repetidos = new Set<string>();
  for (const k of keywords) {
    if (k.nombre !== 'DSPATR') continue;
    for (const atributo of k.parametros.trim().toUpperCase().split(/\s+/)) {
      if (atributo === '') continue;
      if (vistos.has(atributo)) repetidos.add(atributo);
      vistos.add(atributo);
    }
  }
  for (const atributo of repetidos) {
    salida.push({
      nivel: 'error',
      mensaje:
        `${donde}: el atributo DSPATR(${atributo}) está más de una vez. ` +
        `Para activarlo con distintos indicadores use una condición con OR (p.ej. 40 | 41).`,
      ...base,
    });
  }
}

/**
 * CNTFLD(n) parte un campo largo en filas de n caracteres. Solo vale en campos de texto con
 * entrada, fuera de un subfile, con n menor que el largo del campo y que quepa en la pantalla
 * o la ventana, y no admite varias opciones de CHECK ni de AUTO.
 */
function validarCntfld(
  c: Campo,
  r: Registro,
  marco: ReturnType<typeof marcoDe>,
  donde: string,
  b: Pick<Problema, 'regId' | 'elId'>,
  salida: Problema[],
): void {
  const cnt = c.keywords.find((k) => k.nombre === 'CNTFLD');
  if (!cnt) return;
  const nombre = c.nombre || '(campo sin nombre)';
  const error = (mensaje: string): void => {
    salida.push({ nivel: 'error', mensaje: `${donde}, campo ${nombre}: ${mensaje}`, ...b });
  };
  const n = parseInt(cnt.parametros.trim(), 10);
  if (Number.isNaN(n) || n < 1) {
    error('CNTFLD necesita el largo de cada fila, por ejemplo CNTFLD(070).');
  } else {
    if (c.longitud > 0 && n >= c.longitud) error(`CNTFLD(${n}) debe ser menor que el largo del campo (${c.longitud}).`);
    if (c.columna !== null && c.columna + n - 1 > marco.columnas) {
      error(`CNTFLD(${n}) no cabe desde la columna ${c.columna} en ${marco.ventana ? 'la ventana' : 'la pantalla'}.`);
    }
  }
  if (c.tipoDato !== 'A' && c.tipoDato !== '') error('CNTFLD solo se puede usar en campos de tipo A.');
  if (c.uso !== 'entrada' && c.uso !== 'ambos') error('CNTFLD necesita un campo de entrada (uso I o B).');
  if (r.clase === 'subfile') error('CNTFLD no se puede usar en un registro de subfile.');
  for (const k of c.keywords) {
    const opciones = k.parametros.toUpperCase().split(/[\s()]+/).filter((x) => x !== '');
    if (k.nombre === 'CHECK' && opciones.some((x) => ['AB', 'MF', 'RB', 'RZ', 'RLTB'].includes(x))) {
      error(`CNTFLD no se puede combinar con CHECK(${k.parametros.trim()}).`);
    }
    if (k.nombre === 'AUTO' && opciones.some((x) => ['RAB', 'RAZ'].includes(x))) {
      error(`CNTFLD no se puede combinar con AUTO(${k.parametros.trim()}).`);
    }
    if (k.nombre === 'CHOICE') error('CNTFLD no se puede combinar con CHOICE.');
  }
  if (cnt.indicadores.length > 0 || (cnt.alternativas ?? []).length > 0) {
    error('CNTFLD no admite indicadores de opción.');
  }
}

/**
 * El control de un subfile no puede tener elementos en las filas que ocupa la
 * página del subfile (CPD7812). El mensaje y las teclas de función van en otro registro.
 */
function validarSuperposicionControl(
  p: PantallaDSPF,
  r: Registro,
  donde: string,
  salida: Problema[],
): void {
  const sfl = p.registros.find((x) => x.clase === 'subfile' && x.nombre === r.subfileControlado);
  const pagina = parseInt(r.keywords.find((k) => k.nombre === 'SFLPAG')?.parametros.trim() ?? '', 10);
  if (!sfl || Number.isNaN(pagina)) return;
  const filas = sfl.elementos.flatMap((e) => (e.fila !== null && e.tipo === 'campo' && e.uso !== 'oculto' ? [e.fila] : []));
  if (filas.length === 0) return;
  const primera = Math.min(...filas);
  const lineasPorRegistro = Math.max(...filas) - primera + 1;
  const ultima = primera + pagina * lineasPorRegistro - 1;
  for (const el of r.elementos) {
    if (el.indicadores.length > 0 || el.fila === null) continue;
    if (el.fila > ultima) {
      salida.push({
        nivel: 'error',
        mensaje:
          `${donde}, ${etiqueta(el)}: está en la fila ${el.fila}, debajo de la página del subfile ` +
          `${sfl.nombre} (filas ${primera} a ${ultima}). Póngalo en otro registro con OVERLAY (CPD7812).`,
        regId: r.id,
        elId: el.id,
      });
    } else if (el.fila >= primera) {
      salida.push({
        nivel: 'error',
        mensaje:
          `${donde}, ${etiqueta(el)}: está en la fila ${el.fila}, que ocupa la página del subfile ` +
          `${sfl.nombre} (filas ${primera} a ${ultima}). Es el error CPD7812.`,
        regId: r.id,
        elId: el.id,
      });
    }
  }
}

function cruzan(a: Caja, b: Caja): boolean {
  return (
    a.fila < b.fila + b.alto &&
    b.fila < a.fila + a.alto &&
    a.columna < b.columna + b.ancho &&
    b.columna < a.columna + a.ancho
  );
}

function validarKeywords(
  keywords: Keyword[],
  donde: string,
  base: Pick<Problema, 'regId' | 'elId'>,
  salida: Problema[],
): void {
  for (const k of keywords) {
    if (indicadoresDeMas(k.indicadores, k.alternativas)) {
      salida.push({
        nivel: 'error',
        mensaje: `${donde}: la keyword ${k.nombre} tiene más de ${MAX_INDICADORES} indicadores.`,
        ...base,
      });
    }
  }
}

function validarRegistro(p: PantallaDSPF, r: Registro, salida: Problema[]): void {
  const base = { regId: r.id };
  const donde = `Registro ${r.nombre}`;

  const errNombre = validarNombre(r.nombre, 'Registro');
  if (errNombre) salida.push({ nivel: 'error', mensaje: errNombre, ...base });

  if (indicadoresDeMas(r.indicadores, r.alternativas)) {
    salida.push({ nivel: 'error', mensaje: `${donde}: más de ${MAX_INDICADORES} indicadores.`, ...base });
  }
  validarKeywords(r.keywords, donde, base, salida);

  // Subfiles y controles.
  if (r.clase === 'subfile') {
    const hayControl = p.registros.some(
      (x) => x.clase === 'control-subfile' && x.subfileControlado === r.nombre,
    );
    if (!hayControl) {
      salida.push({
        nivel: 'error',
        mensaje: `${donde}: el subfile no tiene registro de control (SFLCTL).`,
        ...base,
      });
    }
  }
  if (r.clase === 'control-subfile') {
    const sfl = p.registros.find((x) => x.clase === 'subfile' && x.nombre === r.subfileControlado);
    if (!sfl) {
      salida.push({
        nivel: 'error',
        mensaje: `${donde}: SFLCTL apunta a un subfile que no existe (${r.subfileControlado ?? 'sin nombre'}).`,
        ...base,
      });
    }
    if (!r.keywords.some((k) => k.nombre === 'SFLPAG')) {
      salida.push({ nivel: 'error', mensaje: `${donde}: falta SFLPAG.`, ...base });
    }
    validarSuperposicionControl(p, r, donde, salida);
    if (!r.keywords.some((k) => k.nombre === 'SFLDSP')) {
      salida.push({ nivel: 'aviso', mensaje: `${donde}: sin SFLDSP el subfile no se mostrará.`, ...base });
    }
  }

  // Ventana: el marco (borde) debe caber en la pantalla.
  if (r.keywords.some((k) => k.nombre === 'WINDOW')) {
    const v = ventanaDe(p, r);
    if (!v) {
      salida.push({ nivel: 'aviso', mensaje: `${donde}: no se pudo interpretar WINDOW.`, ...base });
    } else if (
      v.fila < 2 ||
      v.columna < 2 ||
      v.alto < 1 ||
      v.ancho < 1 ||
      // Borde inferior en fila + alto + 1 y borde derecho en columna + ancho + 3 (manual de WINDOW).
      v.fila + v.alto + 1 > p.tamano.filas ||
      v.columna + v.ancho + 3 > p.tamano.columnas
    ) {
      salida.push({
        nivel: 'error',
        mensaje:
          `${donde}: la ventana (${v.fila},${v.columna} de ${v.alto}x${v.ancho}) no cabe en la pantalla ` +
          `de ${p.tamano.filas}x${p.tamano.columnas}: el borde inferior queda en la fila ${v.fila + v.alto + 1} ` +
          `y el derecho en la columna ${v.columna + v.ancho + 3}.`,
        ...base,
      });
    }
  }

  const marco = marcoDe(p, r);
  const nombresCampos = new Map<string, number>();

  for (const el of r.elementos) {
    const b = { regId: r.id, elId: el.id };

    if (indicadoresDeMas(el.indicadores, el.alternativas)) {
      salida.push({
        nivel: 'error',
        mensaje: `${donde}, ${etiqueta(el)}: más de ${MAX_INDICADORES} indicadores.`,
        ...b,
      });
    }
    validarKeywords(el.keywords, `${donde}, ${etiqueta(el)}`, b, salida);
    validarAtributosRepetidos(el.keywords, `${donde}, ${etiqueta(el)}`, b, salida);
    if (el.tipo === 'campo') validarCntfld(el, r, marco, donde, b, salida);

    if (el.tipo === 'constante') {
      if (el.texto === '') {
        salida.push({ nivel: 'aviso', mensaje: `${donde}: hay un texto vacío.`, ...b });
      }
      if (el.fila < 1 || el.fila > marco.filas || el.columna < 1 || el.columna > marco.columnas) {
        salida.push({
          nivel: 'error',
          mensaje: `${donde}, ${etiqueta(el)}: ${fueraDe(marco, el.fila)} (fila ${el.fila}, columna ${el.columna}).`,
          ...b,
        });
      } else if (el.columna + el.texto.length - 1 > marco.columnas) {
        salida.push({
          nivel: 'error',
          mensaje: `${donde}, ${etiqueta(el)}: el texto se sale por el borde derecho.`,
          ...b,
        });
      }
      continue;
    }

    validarCampo(el, marco, donde, b, nombresCampos, salida);
  }

  // Con SFLEND(*SCRBAR) la barra de desplazamiento ocupa el borde derecho: ningún elemento del
  // subfile puede llegar hasta ahí (CPD8186). Solo se avisa: el desarrollador decide cómo acomodarlo.
  if (r.clase === 'subfile') {
    const control = p.registros.find((x) => x.clase === 'control-subfile' && x.subfileControlado === r.nombre);
    const barra = control?.keywords.some((k) => k.nombre === 'SFLEND' && /\*SCRBAR/i.test(k.parametros));
    if (barra) {
      const limite = ultimaColumnaConBarra(marco);
      for (const el of r.elementos) {
        if (el.fila === null || el.columna === null) continue;
        if (el.tipo === 'campo' && (el.uso === 'oculto' || el.uso === 'programa')) continue;
        if (el.columna === 1) {
          salida.push({
            nivel: 'error',
            mensaje:
              `${donde}, ${etiqueta(el)}: empieza en la columna 1 y su atributo cae en la última columna de la fila `+
              `anterior, donde va la barra de desplazamiento de SFLEND(*SCRBAR); debe empezar en la columna 2 o después (CPD8186).`,
            regId: r.id,
            elId: el.id,
          });
        }
        const fin = el.columna + dimensionElemento(el, marco).ancho - 1;
        if (fin > limite) {
          salida.push({
            nivel: 'error',
            mensaje:
              `${donde}, ${etiqueta(el)}: termina en la columna ${fin} y con SFLEND(*SCRBAR) la barra de desplazamiento ` +
              `usa el borde derecho; debe terminar en la columna ${limite} o antes (CPD8186). Muévalo o acórtelo, o quite *SCRBAR.`,
            regId: r.id,
            elId: el.id,
          });
        }
      }
    }
  }

  // Elementos superpuestos (se ignoran los condicionados por indicadores).
  const cajas = cajasElementos(p, r);
  const porId = new Map(r.elementos.map((e) => [e.id, e]));
  for (let i = 0; i < cajas.length; i++) {
    for (let j = i + 1; j < cajas.length; j++) {
      const a = porId.get(cajas[i].elementoId);
      const c = porId.get(cajas[j].elementoId);
      if (!a || !c || a.indicadores.length > 0 || c.indicadores.length > 0) continue;
      if (cruzan(cajas[i], cajas[j])) {
        salida.push({
          nivel: 'aviso',
          mensaje: `${donde}: ${etiqueta(a)} se superpone con ${etiqueta(c)}.`,
          regId: r.id,
          elId: a.id,
        });
      }
    }
  }
}

function validarCampo(
  c: Campo,
  marco: ReturnType<typeof marcoDe>,
  donde: string,
  b: Pick<Problema, 'regId' | 'elId'>,
  nombres: Map<string, number>,
  salida: Problema[],
): void {
  const visible = c.uso === 'entrada' || c.uso === 'salida' || c.uso === 'ambos';
  const nombreMostrado = c.sistema ? c.nombre : c.nombre || '(campo sin nombre)';

  if (!c.sistema) {
    const errNombre = validarNombre(c.nombre, `${donde}, campo`);
    if (errNombre) salida.push({ nivel: 'error', mensaje: errNombre, ...b });

    const clave = c.nombre.toUpperCase();
    if (clave !== '') {
      if (nombres.has(clave)) {
        salida.push({
          nivel: 'error',
          mensaje: `${donde}: el campo ${c.nombre} está repetido en el registro.`,
          ...b,
        });
      }
      nombres.set(clave, (nombres.get(clave) ?? 0) + 1);
    }

    if (!c.referencia && c.longitud <= 0) {
      salida.push({ nivel: 'error', mensaje: `${donde}, campo ${nombreMostrado}: falta la longitud.`, ...b });
    }
    if (c.longitud > 32767) {
      salida.push({
        nivel: 'error',
        mensaje: `${donde}, campo ${nombreMostrado}: la longitud máxima es 32767.`,
        ...b,
      });
    }
    if (TIPOS_NUMERICOS.has(c.tipoDato)) {
      if (c.longitud > 0 && c.decimales > c.longitud) {
        salida.push({
          nivel: 'error',
          mensaje: `${donde}, campo ${nombreMostrado}: los decimales (${c.decimales}) superan la longitud (${c.longitud}).`,
          ...b,
        });
      }
      if (TIPOS_DIGITOS_MAX_31.has(c.tipoDato) && c.longitud > 31) {
        salida.push({
          nivel: 'error',
          mensaje: `${donde}, campo ${nombreMostrado}: un campo numérico admite como máximo 31 dígitos.`,
          ...b,
        });
      }
    }
  }

  if (visible) {
    if (c.fila === null || c.columna === null) {
      salida.push({
        nivel: 'error',
        mensaje: `${donde}, campo ${nombreMostrado}: un campo ${c.uso} necesita fila y columna.`,
        ...b,
      });
      return;
    }
    if (c.fila < 1 || c.fila > marco.filas || c.columna < 1 || c.columna > marco.columnas) {
      salida.push({
        nivel: 'error',
        mensaje: `${donde}, campo ${nombreMostrado}: ${fueraDe(marco, c.fila)} (fila ${c.fila}, columna ${c.columna}).`,
        ...b,
      });
      return;
    }
    const dim = dimensionElemento(c, marco);
    if (c.fila + dim.alto - 1 > marco.filas) {
      salida.push({
        nivel: 'error',
        mensaje: `${donde}, campo ${nombreMostrado}: no cabe verticalmente (necesita ${dim.alto} filas).`,
        ...b,
      });
    } else if (dim.alto > 1 && !c.keywords.some((k) => k.nombre === 'CNTFLD')) {
      salida.push({
        nivel: 'aviso',
        mensaje: `${donde}, campo ${nombreMostrado}: pasa del borde derecho y continúa en las filas siguientes.`,
        ...b,
      });
    }
  } else if (c.fila !== null || c.columna !== null) {
    salida.push({
      nivel: 'aviso',
      mensaje: `${donde}, campo ${nombreMostrado}: un campo ${c.uso} no debe tener posición en pantalla.`,
      ...b,
    });
  }
}

/** Valida toda la pantalla. */
export function validar(p: PantallaDSPF): Problema[] {
  const salida: Problema[] = [];

  if (p.registros.length === 0) {
    salida.push({ nivel: 'error', mensaje: 'La pantalla no tiene ningún registro.' });
  }

  validarKeywords(p.keywordsArchivo, 'Archivo', {}, salida);

  const vistas = new Map<number, number>();
  for (const t of p.teclasFuncion) {
    const etiquetaTecla = `${t.tipo}${String(t.numero).padStart(2, '0')}`;
    if (!Number.isInteger(t.numero) || t.numero < 1 || t.numero > 24) {
      salida.push({ nivel: 'error', mensaje: `Tecla ${etiquetaTecla}: el número debe estar entre 1 y 24.` });
    }
    vistas.set(t.numero, (vistas.get(t.numero) ?? 0) + 1);
  }
  for (const [numero, veces] of vistas) {
    if (veces > 1) {
      salida.push({
        nivel: 'aviso',
        mensaje: `La tecla de función ${String(numero).padStart(2, '0')} está definida ${veces} veces.`,
      });
    }
  }

  // F1 (ayuda), F3 (salir) y F12 (volver) en toda pantalla, y la ayuda con todas las teclas.
  if (p.registros.length > 0) {
    const faltan = TECLAS_BASICAS.filter((b) => !p.teclasFuncion.some((t) => t.numero === b.numero));
    if (faltan.length > 0) {
      salida.push({
        nivel: 'aviso',
        mensaje: `Faltan las teclas ${faltan.map((b) => `F${b.numero} (${b.texto})`).join(', ')}: use «Teclas y ayuda».`,
      });
    }
    const ayuda = formatoDeAyuda(p);
    if (p.teclasFuncion.some((t) => t.numero === 1) && !ayuda) {
      salida.push({ nivel: 'aviso', mensaje: 'Hay F1 (ayuda) pero no el formato AYUDA que la muestra: use «Teclas y ayuda».' });
    }
    if (ayuda && ayuda.nombre.toUpperCase() === NOMBRE_AYUDA) {
      const textos = ayuda.elementos.flatMap((e) => (e.tipo === 'constante' ? [e.texto] : [])).join(' ');
      const sinAyuda = p.teclasFuncion.filter((t) => !textos.includes(`${textoDeTecla(t).split('=')[0]}=`));
      if (sinAyuda.length > 0) {
        salida.push({
          nivel: 'aviso',
          mensaje: `La ayuda AYUDA no lista ${sinAyuda.map((t) => `F${t.numero}`).join(', ')}: use «Teclas y ayuda» para actualizarla.`,
          regId: ayuda.id,
        });
      }
    }
  }

  const nombresRegistros = new Map<string, number>();
  for (const r of p.registros) {
    const clave = r.nombre.toUpperCase();
    if (clave !== '' && nombresRegistros.has(clave)) {
      salida.push({
        nivel: 'error',
        mensaje: `El registro ${r.nombre} está repetido.`,
        regId: r.id,
      });
    }
    nombresRegistros.set(clave, (nombresRegistros.get(clave) ?? 0) + 1);
    validarRegistro(p, r, salida);
  }

  return salida;
}

/**
 * Última columna (del marco) donde puede terminar un elemento de un subfile con SFLEND(*SCRBAR).
 * A pantalla completa la barra y los bytes de atributo usan las 3 últimas columnas (el CRUD termina
 * en la 77 de 80 y compila); en una ventana, las 2 últimas.
 */
export function ultimaColumnaConBarra(marco: ReturnType<typeof marcoDe>): number {
  return marco.ventana ? marco.columnas - 2 : marco.columnas - 3;
}