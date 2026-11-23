/**
 * Conversión de formatos de registro en una matriz de celdas de caracteres lista
 * para dibujar en el visor tipo SDA.
 *
 * - Respeta ventanas (WINDOW): las posiciones de los elementos son relativas al
 *   interior de la ventana y se dibuja el borde y el título.
 * - Los campos se dibujan con un marcador (X/9 para salida, _ para entrada).
 * - TIME/DATE y los botones (PSHBTNFLD) se dibujan con un texto de ejemplo.
 * - Los atributos condicionados por indicador se ignoran (se muestra el estado base).
 */

import type {
  Campo,
  Constante,
  Elemento,
  Keyword,
  PantallaDSPF,
  Registro,
} from '../modelo/pantalla';

export interface AtributosCelda {
  color: string; // GRN, WHT, RED, TRQ, YLW, PNK, BLU
  altaIntensidad: boolean; // DSPATR(HI)
  subrayado: boolean; // DSPATR(UL)
  inverso: boolean; // DSPATR(RI)
  parpadeo: boolean; // DSPATR(BL)
  noVisible: boolean; // DSPATR(ND)
  esEntrada: boolean;
  esProtegido: boolean; // DSPATR(PR)
}

export interface Celda {
  caracter: string;
  attr: AtributosCelda;
}

export interface MatrizLienzo {
  filas: number;
  columnas: number;
  celdas: Celda[][]; // [fila][columna], 0-indexado
}

/** Ventana DDS: esquina superior izquierda del interior y tamaño interior. */
export interface Ventana {
  fila: number;
  columna: number;
  alto: number;
  ancho: number;
  /** WINDOW(... *NOMSGLIN): la última línea no se reserva para los mensajes del sistema. */
  sinLineaMensaje?: boolean;
}

/** Identificador especial para ver todos los formatos superpuestos. */
export const ID_TODOS = '__todos__';

function atributosBase(): AtributosCelda {
  return {
    color: 'GRN',
    altaIntensidad: false,
    subrayado: false,
    inverso: false,
    parpadeo: false,
    noVisible: false,
    esEntrada: false,
    esProtegido: false,
  };
}

function celdaVacia(): Celda {
  return { caracter: ' ', attr: atributosBase() };
}

export function matrizVacia(filas: number, columnas: number): MatrizLienzo {
  const celdas: Celda[][] = [];
  for (let f = 0; f < filas; f++) {
    const fila: Celda[] = [];
    for (let c = 0; c < columnas; c++) fila.push(celdaVacia());
    celdas.push(fila);
  }
  return { filas, columnas, celdas };
}

/** Contexto de dibujo: desplazamiento por ventana y área de recorte. */
interface Ctx {
  m: MatrizLienzo;
  offF: number; // se suma a (fila-1)
  offC: number; // se suma a (col-1)
  clip: { f0: number; f1: number; c0: number; c1: number }; // 0-indexado, inclusivo
}

function ctxPantalla(m: MatrizLienzo): Ctx {
  return {
    m,
    offF: 0,
    offC: 0,
    clip: { f0: 0, f1: m.filas - 1, c0: 0, c1: m.columnas - 1 },
  };
}

function ctxVentana(m: MatrizLienzo, v: Ventana): Ctx {
  return {
    m,
    offF: v.fila - 1,
    offC: v.columna - 1,
    clip: {
      f0: Math.max(0, v.fila - 1),
      f1: Math.min(m.filas - 1, v.fila - 1 + v.alto - 1),
      c0: Math.max(0, v.columna - 1),
      c1: Math.min(m.columnas - 1, v.columna - 1 + v.ancho - 1),
    },
  };
}

/** Atributos a partir de keywords sin indicador (DSPATR y COLOR). */
function interpretarAtributos(
  keywords: Keyword[],
  base: AtributosCelda,
): AtributosCelda {
  const attr = { ...base };
  for (const k of keywords) {
    if (k.indicadores.length > 0) continue; // estado condicional: se ignora
    if (k.nombre === 'DSPATR') {
      for (const v of k.parametros.trim().split(/\s+/)) {
        switch (v.toUpperCase()) {
          case 'HI':
            attr.altaIntensidad = true;
            break;
          case 'UL':
            attr.subrayado = true;
            break;
          case 'RI':
            attr.inverso = true;
            break;
          case 'BL':
            attr.parpadeo = true;
            break;
          case 'ND':
            attr.noVisible = true;
            break;
          case 'PR':
            attr.esProtegido = true;
            break;
          case 'RI/UL':
            break;
        }
      }
    } else if (k.nombre === 'COLOR') {
      const c = k.parametros.trim().toUpperCase();
      if (c) attr.color = c;
    }
  }
  return attr;
}

/** Escribe texto en (fila, col) 1-indexadas relativas al contexto, con recorte. */
function escribirTexto(
  ctx: Ctx,
  fila1: number,
  col1: number,
  texto: string,
  attr: AtributosCelda,
): void {
  const f = fila1 - 1 + ctx.offF;
  if (f < ctx.clip.f0 || f > ctx.clip.f1) return;
  for (let i = 0; i < texto.length; i++) {
    const c = col1 - 1 + ctx.offC + i;
    if (c < ctx.clip.c0 || c > ctx.clip.c1) continue;
    ctx.m.celdas[f][c] = { caracter: texto[i], attr: { ...attr } };
  }
}

function dibujarConstante(ctx: Ctx, cte: Constante): void {
  const attr = interpretarAtributos(cte.keywords, atributosBase());
  escribirTexto(ctx, cte.fila, cte.columna, cte.texto, attr);
}

/** Textos de las opciones de un campo PSHBTNFLD. */
function textosBotones(campo: Campo): string[] {
  const textos: string[] = [];
  for (const k of campo.keywords) {
    if (k.nombre !== 'PSHBTNCHC') continue;
    const m = /'([^']*)'/.exec(k.parametros);
    if (m) textos.push(m[1]);
  }
  return textos;
}

/** Tipos de dato (col 35) que se consideran numéricos. */
const TIPOS_NUMERICOS = new Set(['S', 'Y', 'P', 'B', 'F', 'I']);

/** Carácter con el que se dibuja un campo según su tipo de dato y su uso. */
export function marcadorCampo(campo: Campo): string {
  const numerico = TIPOS_NUMERICOS.has(campo.tipoDato);
  switch (campo.uso) {
    case 'ambos':
      return numerico ? '9' : 'B';
    case 'entrada':
      return numerico ? '3' : 'I';
    default:
      return numerico ? '6' : 'O';
  }
}

function dibujarCampo(ctx: Ctx, campo: Campo, filaExtra = 0): void {
  if (campo.fila === null || campo.columna === null) return; // oculto / de programa
  if (campo.uso === 'oculto' || campo.uso === 'programa') return;
  const fila = campo.fila + filaExtra;

  const base = atributosBase();
  base.esEntrada = campo.uso === 'entrada' || campo.uso === 'ambos';
  const attr = interpretarAtributos(campo.keywords, base);

  // Botones: [F3-Salir] [F9-Grabar] ...
  if (campo.keywords.some((k) => k.nombre === 'PSHBTNFLD')) {
    const textos = textosBotones(campo);
    if (textos.length > 0) {
      const a = { ...attr, color: 'TRQ', altaIntensidad: true };
      escribirTexto(ctx, fila, campo.columna, textos.map((t) => `[${t}]`).join(' '), a);
      return;
    }
  }

  // Hora y fecha del sistema.
  if (campo.keywords.some((k) => k.nombre === 'TIME')) {
    escribirTexto(ctx, fila, campo.columna, '12:00:00', attr);
    return;
  }
  if (campo.keywords.some((k) => k.nombre === 'DATE')) {
    escribirTexto(ctx, fila, campo.columna, '01/01/26', attr);
    return;
  }
  if (campo.keywords.some((k) => k.nombre === 'SYSNAME')) {
    escribirTexto(ctx, fila, campo.columna, 'SISTEMA ', attr);
    return;
  }
  if (campo.keywords.some((k) => k.nombre === 'USER')) {
    escribirTexto(ctx, fila, campo.columna, 'USUARIO   ', attr);
    return;
  }

  // Campo normal: se rellena con un carácter que indica tipo y uso, como en SDA.
  //   alfanumérico: B = ambos, I = entrada, O = salida
  //   numérico:     9 = ambos, 3 = entrada, 6 = salida
  const cadena = marcadorCampo(campo).repeat(Math.max(1, campo.longitud));

  // CNTFLD(n): campo continuado, en segmentos de n caracteres por fila, todos
  // desde la misma columna.
  const cnt = campo.keywords.find((k) => k.nombre === 'CNTFLD');
  const segmento = cnt ? parseInt(cnt.parametros.trim(), 10) : NaN;
  if (!Number.isNaN(segmento) && segmento > 0) {
    for (let i = 0; i * segmento < cadena.length; i++) {
      escribirTexto(ctx, fila + i, campo.columna, cadena.slice(i * segmento, (i + 1) * segmento), attr);
    }
    return;
  }

  // Sin CNTFLD, un campo que pasa del borde derecho continúa en la fila
  // siguiente desde la primera columna (de la ventana o de la pantalla).
  escribirEnvuelto(ctx, fila, campo.columna, cadena, attr);
}

/** Escribe un texto que, al llegar al borde derecho, sigue en la fila siguiente desde la col 1. */
function escribirEnvuelto(
  ctx: Ctx,
  fila1: number,
  col1: number,
  texto: string,
  attr: AtributosCelda,
): void {
  const anchoUtil = ctx.clip.c1 - ctx.clip.c0 + 1;
  let restante = texto;
  let fila = fila1;
  let col = col1;
  while (restante.length > 0) {
    const disponible = Math.max(1, ctx.clip.c1 - (col - 1 + ctx.offC) + 1);
    const trozo = restante.slice(0, disponible);
    escribirTexto(ctx, fila, col, trozo, attr);
    restante = restante.slice(trozo.length);
    fila += 1;
    col = 1;
    if (anchoUtil <= 0) break;
    if (fila - 1 + ctx.offF > ctx.clip.f1) break;
  }
}

function dibujarElemento(ctx: Ctx, el: Elemento): void {
  if (el.tipo === 'constante') dibujarConstante(ctx, el);
  else dibujarCampo(ctx, el);
}

function leerNumeroKeyword(reg: Registro, nombre: string): number | null {
  const k = reg.keywords.find((x) => x.nombre === nombre);
  if (!k) return null;
  const n = parseInt(k.parametros.trim(), 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Obtiene la ventana de un registro. WINDOW(f c alto ancho) la define; si el
 * parámetro es el nombre de otro registro (WINDOW(W01)) se hereda de ese.
 */
export function ventanaDe(
  pantalla: PantallaDSPF,
  registro: Registro,
  profundidad = 0,
): Ventana | null {
  const k = registro.keywords.find((x) => x.nombre === 'WINDOW');
  if (!k) return null;
  const partes = k.parametros.trim().split(/\s+/);
  const nums = partes.map((p) => parseInt(p, 10));
  if (partes.length >= 4 && nums.slice(0, 4).every((n) => !Number.isNaN(n))) {
    const v: Ventana = { fila: nums[0], columna: nums[1], alto: nums[2], ancho: nums[3] };
    if (partes.some((p) => p.toUpperCase() === '*NOMSGLIN')) v.sinLineaMensaje = true;
    return v;
  }
  if (profundidad < 3) {
    const ref = pantalla.registros.find(
      (r) => r.nombre.toUpperCase() === partes[0].toUpperCase() && r !== registro,
    );
    if (ref) return ventanaDe(pantalla, ref, profundidad + 1);
  }
  return null;
}

interface TituloVentana {
  texto: string;
  color: string;
  abajo: boolean; // *BOTTOM; si no aparece, va arriba (*TOP)
  alineacion: 'izquierda' | 'centro' | 'derecha';
  inverso: boolean;
}

/**
 * Títulos de la ventana. Puede haber varios WDWTITLE (uno arriba y otro con
 * *BOTTOM abajo): WDWTITLE((*TEXT 'xxx') (*COLOR WHT) (*DSPATR RI) *BOTTOM).
 */
function titulosVentana(registro: Registro): TituloVentana[] {
  const titulos: TituloVentana[] = [];
  for (const k of registro.keywords) {
    if (k.nombre !== 'WDWTITLE') continue;
    const t = /\*TEXT\s+'((?:[^']|'')*)'/.exec(k.parametros);
    if (!t) continue;
    const c = /\*COLOR\s+([A-Z]{3})/.exec(k.parametros);
    const dsp = /\*DSPATR\s+([A-Z\s]+?)\)/.exec(k.parametros);
    const abajo = /\*BOTTOM\b/.test(k.parametros);
    // Arriba se centra por defecto; abajo (*BOTTOM) va alineado a la izquierda.
    // Un *LEFT, *CENTER o *RIGHT explícito siempre manda.
    let alineacion: TituloVentana['alineacion'] = abajo ? 'izquierda' : 'centro';
    if (/\*LEFT\b/.test(k.parametros)) alineacion = 'izquierda';
    else if (/\*RIGHT\b/.test(k.parametros)) alineacion = 'derecha';
    else if (/\*CENTER\b/.test(k.parametros)) alineacion = 'centro';
    titulos.push({
      texto: t[1].replace(/''/g, "'"),
      color: c ? c[1] : 'WHT',
      abajo,
      alineacion,
      inverso: dsp ? /\bRI\b/.test(dsp[1]) : false,
    });
  }
  return titulos;
}

function colorBorde(registro: Registro): string {
  const k = registro.keywords.find((x) => x.nombre === 'WDWBORDER');
  const c = k ? /\*COLOR\s+([A-Z]{3})/.exec(k.parametros) : null;
  return c ? c[1] : 'BLU';
}

/** Limpia el interior de la ventana y dibuja su borde y título. */
function dibujarVentana(
  m: MatrizLienzo,
  v: Ventana,
  registro: Registro,
): void {
  const f0 = v.fila - 1;
  const c0 = v.columna - 1;
  const attrBorde: AtributosCelda = { ...atributosBase(), color: colorBorde(registro) };

  const poner = (f: number, c: number, ch: string, a: AtributosCelda) => {
    if (f < 0 || f >= m.filas || c < 0 || c >= m.columnas) return;
    m.celdas[f][c] = { caracter: ch, attr: { ...a } };
  };

  // Interior en blanco.
  for (let f = f0; f < f0 + v.alto; f++) {
    for (let c = c0; c < c0 + v.ancho; c++) poner(f, c, ' ', atributosBase());
  }
  // Borde.
  const fTop = f0 - 1;
  const fBot = f0 + v.alto;
  const cIzq = c0 - 1;
  const cDer = c0 + v.ancho;
  for (let c = cIzq + 1; c < cDer; c++) {
    poner(fTop, c, '─', attrBorde);
    poner(fBot, c, '─', attrBorde);
  }
  for (let f = fTop + 1; f < fBot; f++) {
    poner(f, cIzq, '│', attrBorde);
    poner(f, cDer, '│', attrBorde);
  }
  poner(fTop, cIzq, '┌', attrBorde);
  poner(fTop, cDer, '┐', attrBorde);
  poner(fBot, cIzq, '└', attrBorde);
  poner(fBot, cDer, '┘', attrBorde);

  // Títulos: *BOTTOM va en el borde inferior; sin *BOTTOM, en el superior.
  for (const titulo of titulosVentana(registro)) {
    const texto = ` ${titulo.texto.trim()} `.slice(0, Math.max(0, v.ancho));
    let inicio = c0 + Math.floor((v.ancho - texto.length) / 2);
    if (titulo.alineacion === 'izquierda') inicio = c0;
    else if (titulo.alineacion === 'derecha') inicio = c0 + v.ancho - texto.length;
    const aT: AtributosCelda = {
      ...atributosBase(),
      color: titulo.color,
      altaIntensidad: true,
      inverso: titulo.inverso,
    };
    const filaTitulo = titulo.abajo ? fBot : fTop;
    for (let i = 0; i < texto.length; i++) poner(filaTitulo, inicio + i, texto[i], aT);
  }
}

/** Dibuja un subfile repitiendo sus elementos según SFLPAG del control. */
function dibujarFilasSubfile(
  ctx: Ctx,
  sfl: Registro,
  control: Registro | null,
  edicion = false,
): void {
  const posicionados = sfl.elementos.filter(
    (e) => e.tipo === 'constante' || (e.tipo === 'campo' && e.fila !== null),
  );
  if (posicionados.length === 0) return;
  // Al editar se muestra una sola fila de detalle, tal como se define en el DDS.
  const pag = edicion ? 1 : (control && leerNumeroKeyword(control, 'SFLPAG')) || 8;

  // Alto de cada registro del subfile (filas que ocupa) para repetir sin solapar.
  const filas = posicionados.map((e) => (e.tipo === 'constante' ? e.fila : (e as Campo).fila!));
  const alto = Math.max(...filas) - Math.min(...filas) + 1;

  for (let i = 0; i < pag; i++) {
    for (const el of posicionados) {
      const extra = i * alto;
      if (el.tipo === 'constante') dibujarConstante(ctx, { ...el, fila: el.fila + extra });
      else dibujarCampo(ctx, el, extra);
    }
  }
}

/** Dibuja un registro completo (con su ventana y, si aplica, su subfile). */
function dibujarRegistro(
  m: MatrizLienzo,
  pantalla: PantallaDSPF,
  registro: Registro,
  ventanasDibujadas?: Set<string>,
  edicion = false,
): void {
  const ventana = ventanaDe(pantalla, registro);
  // En la vista "todos", los formatos que comparten ventana se superponen: solo
  // el primero limpia y dibuja el marco; los demás dibujan encima.
  let limpiarVentana = true;
  if (ventana && ventanasDibujadas) {
    const clave = `${ventana.fila},${ventana.columna},${ventana.alto},${ventana.ancho}`;
    limpiarVentana = !ventanasDibujadas.has(clave);
    ventanasDibujadas.add(clave);
  }

  if (registro.clase === 'subfile') {
    // Un subfile se dibuja con la ventana y SFLPAG de su control.
    const control = pantalla.registros.find(
      (r) => r.clase === 'control-subfile' && r.subfileControlado === registro.nombre,
    ) ?? null;
    const v = control ? ventanaDe(pantalla, control) : null;
    if (control && v) dibujarVentana(m, v, control);
    dibujarFilasSubfile(v ? ctxVentana(m, v) : ctxPantalla(m), registro, control, edicion);
    return;
  }

  if (ventana && limpiarVentana) dibujarVentana(m, ventana, registro);
  const ctx = ventana ? ctxVentana(m, ventana) : ctxPantalla(m);

  if (registro.clase === 'control-subfile' && registro.subfileControlado) {
    const sfl = pantalla.registros.find((r) => r.nombre === registro.subfileControlado);
    if (sfl) dibujarFilasSubfile(ctx, sfl, registro, edicion);
  }
  for (const el of registro.elementos) dibujarElemento(ctx, el);
}

export interface OpcionesLienzo {
  /** Vista de edición: el subfile se dibuja con una sola fila de detalle. */
  edicion?: boolean;
}

/**
 * Construye el lienzo de un registro. Con ID_TODOS (o registro = null) se
 * superponen todos los formatos, en el orden del fuente.
 */
export function construirLienzo(
  pantalla: PantallaDSPF,
  registro: Registro | null,
  opciones: OpcionesLienzo = {},
): MatrizLienzo {
  const m = matrizVacia(pantalla.tamano.filas, pantalla.tamano.columnas);
  if (registro) {
    dibujarRegistro(m, pantalla, registro, undefined, opciones.edicion ?? false);
  } else {
    const ventanasDibujadas = new Set<string>();
    for (const r of pantalla.registros) {
      // Los subfiles se dibujan a través de su control.
      if (r.clase === 'subfile') continue;
      dibujarRegistro(m, pantalla, r, ventanasDibujadas);
    }
  }
  return m;
}

/** Mapea un color 5250 a un color CSS (variables del tema). */
export function colorCss(attr: AtributosCelda): string {
  if (attr.noVisible) return 'transparent';
  const mapa: Record<string, string> = {
    GRN: 'var(--t-verde)',
    WHT: 'var(--t-blanco)',
    RED: 'var(--t-rojo)',
    TRQ: 'var(--t-turquesa)',
    YLW: 'var(--t-amarillo)',
    PNK: 'var(--t-rosa)',
    BLU: 'var(--t-azul)',
  };
  return mapa[attr.color] ?? 'var(--t-verde)';
}
