/**
 * Operaciones de edición sobre el modelo `PantallaDSPF`.
 *
 * Todas son puras e inmutables: reciben una pantalla y devuelven una pantalla
 * nueva sin modificar la original. Eso permite deshacer/rehacer guardando
 * versiones anteriores y facilita las pruebas. Los ids de registros y
 * elementos se conservan entre versiones.
 */

import type {
  Campo,
  Constante,
  Elemento,
  IndicadorCond,
  Keyword,
  PantallaDSPF,
  Registro,
  TamanoPantalla,
  TeclaFuncion,
} from '../modelo/pantalla';
import { TAMANO_24X80 } from '../modelo/pantalla';
import { nuevoId } from '../modelo/ids';

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------

function clonar<T>(x: T): T {
  return structuredClone(x);
}

function kw(nombre: string, parametros = '', indicadores: IndicadorCond[] = []): Keyword {
  return { nombre: nombre.toUpperCase(), parametros, indicadores };
}

function buscarRegistro(p: PantallaDSPF, regId: string): Registro {
  const r = p.registros.find((x) => x.id === regId);
  if (!r) throw new Error(`No existe el registro con id ${regId}.`);
  return r;
}

function buscarElemento(r: Registro, elId: string): Elemento {
  const e = r.elementos.find((x) => x.id === elId);
  if (!e) throw new Error(`No existe el elemento con id ${elId} en ${r.nombre}.`);
  return e;
}

/** Nombre en mayúsculas, sin espacios en los extremos y con '_' en vez de espacios. */
export function normalizarNombre(texto: string): string {
  return texto.trim().toUpperCase().replace(/\s+/g, '_');
}

/** Primer nombre libre de la forma BASE01, BASE02... (máximo 10 caracteres). */
export function nombreLibre(existentes: string[], base: string): string {
  const usados = new Set(existentes.map((n) => n.toUpperCase()));
  const raiz = base.slice(0, 8);
  for (let i = 1; i < 100; i++) {
    const candidato = `${raiz}${String(i).padStart(2, '0')}`;
    if (!usados.has(candidato)) return candidato;
  }
  return `${raiz}99`;
}

function hayRegistroConNombre(p: PantallaDSPF, nombre: string, exceptoId?: string): boolean {
  return p.registros.some(
    (r) => r.id !== exceptoId && r.nombre.toUpperCase() === nombre.toUpperCase(),
  );
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

export interface VentanaDef {
  fila: number;
  columna: number;
  alto: number;
  ancho: number;
}

/** Ventana por defecto: la habitual de 74 x 20 en (2,2), ajustada al tamaño de pantalla. */
export function ventanaPorDefecto(p: PantallaDSPF): VentanaDef {
  return {
    fila: 2,
    columna: 2,
    alto: Math.max(1, Math.min(20, p.tamano.filas - 4)),
    ancho: Math.max(1, Math.min(74, p.tamano.columnas - 6)),
  };
}

/** Crea una pantalla nueva con DSPSIZ, INDARA y un registro vacío REG01. */
export function crearPantalla(
  nombre: string,
  tamano: TamanoPantalla = TAMANO_24X80,
): PantallaDSPF {
  const p: PantallaDSPF = {
    nombre,
    tamano: { ...tamano },
    keywordsArchivo: [
      kw('DSPSIZ', `${tamano.filas} ${tamano.columnas} ${tamano.codigo}`),
      kw('INDARA'),
    ],
    teclasFuncion: [],
    registros: [],
    advertencias: [],
  };
  return agregarRegistro(p, { tipo: 'normal', nombre: 'REG01' }).pantalla;
}

/** Cambia el tamaño de pantalla y mantiene sincronizado DSPSIZ. */
export function cambiarTamano(p: PantallaDSPF, tamano: TamanoPantalla): PantallaDSPF {
  const n = clonar(p);
  n.tamano = { ...tamano };
  const parametros = `${tamano.filas} ${tamano.columnas} ${tamano.codigo}`;
  const existente = n.keywordsArchivo.find((k) => k.nombre === 'DSPSIZ');
  if (existente) existente.parametros = parametros;
  else n.keywordsArchivo.unshift(kw('DSPSIZ', parametros));
  return n;
}

// ---------------------------------------------------------------------------
// Registros
// ---------------------------------------------------------------------------

export type OpcionesRegistro =
  | {
      tipo: 'normal';
      nombre: string;
      ventana?: VentanaDef;
      tituloArriba?: string;
      tituloAbajo?: string;
    }
  | {
      tipo: 'subfile';
      nombre: string;
      nombreControl: string;
      ventana?: VentanaDef;
      tamanoSubfile?: number;
      paginaSubfile?: number;
      tituloArriba?: string;
      tituloAbajo?: string;
      /**
       * Como el subfile del CRUD (por defecto): OVERLAY, el registro relativo del cursor (SFLCSRRRN),
       * la página donde quedó (SFLRCDNBR), el campo de opción y las opciones 2, 4 y 5.
       */
      completo?: boolean;
    };

function keywordsVentana(v: VentanaDef): Keyword[] {
  return [
    kw('WINDOW', `${v.fila} ${v.columna} ${v.alto} ${v.ancho}`),
    kw('WDWBORDER', "(*COLOR BLU) (*DSPATR RI) (*CHAR '        ')"),
    kw('USRRSTDSP'),
  ];
}

function registroVacio(nombre: string, keywords: Keyword[]): Registro {
  return {
    id: nuevoId('reg'),
    nombre,
    clase: 'normal',
    keywords,
    elementos: [],
    indicadores: [],
  };
}

/**
 * Agrega un registro. Para 'subfile' crea el par SFL + SFLCTL con las
 * keywords habituales; el id devuelto es el del control (el que se muestra).
 */
export function agregarRegistro(
  p: PantallaDSPF,
  opciones: OpcionesRegistro,
): { pantalla: PantallaDSPF; registroId: string } {
  const nombre = normalizarNombre(opciones.nombre);
  if (nombre === '') throw new Error('El registro necesita un nombre.');
  if (hayRegistroConNombre(p, nombre)) throw new Error(`Ya existe el registro ${nombre}.`);

  const n = clonar(p);

  if (opciones.tipo === 'normal') {
    const reg = registroVacio(nombre, opciones.ventana ? keywordsVentana(opciones.ventana) : []);
    if (opciones.ventana) {
      ponerTitulo(reg, 'arriba', opciones.tituloArriba ?? null);
      ponerTitulo(reg, 'abajo', opciones.tituloAbajo ?? null);
    }
    n.registros.push(reg);
    return { pantalla: n, registroId: reg.id };
  }

  const nombreControl = normalizarNombre(opciones.nombreControl);
  if (nombreControl === '') throw new Error('El control del subfile necesita un nombre.');
  if (nombreControl === nombre) throw new Error('El subfile y su control deben tener nombres distintos.');
  if (hayRegistroConNombre(p, nombreControl)) throw new Error(`Ya existe el registro ${nombreControl}.`);

  const tamano = opciones.tamanoSubfile ?? 100;
  const pagina = opciones.paginaSubfile ?? 10;
  const ancho = opciones.ventana ? opciones.ventana.ancho : n.tamano.columnas;
  const filaDetalle = 5;
  const completo = opciones.completo !== false;
  // Con el campo de opción en la columna 2, el detalle empieza en la 5.
  const columnaDetalle = completo ? 5 : 2;

  // Registro SFL: una línea de detalle de salida.
  const sfl = registroVacio(nombre, [kw('SFL')]);
  sfl.clase = 'subfile';
  sfl.elementos.push(
    crearCampo({
      nombre: 'DETSFL',
      longitud: Math.max(1, Math.min(60, ancho - columnaDetalle - (opciones.ventana ? 1 : 2))),
      uso: 'salida',
      fila: filaDetalle,
      columna: columnaDetalle,
    }),
  );

  // Registro de control del subfile.
  const ctl = registroVacio(nombreControl, [
    kw('SFLCTL', nombre),
    kw('SFLSIZ', String(tamano).padStart(4, '0')),
    kw('SFLPAG', String(pagina).padStart(4, '0')),
    kw('SFLDSP', '', [{ numero: 30, negado: false }]),
    kw('SFLDSPCTL', '', [{ numero: 31, negado: false }]),
    kw('SFLCLR', '', [{ numero: 32, negado: false }]),
    kw('SFLEND', '*SCRBAR *SCRBAR', [{ numero: 30, negado: false }]),
    ...(opciones.ventana ? keywordsVentana(opciones.ventana) : []),
  ]);
  ctl.clase = 'control-subfile';
  ctl.subfileControlado = nombre;
  if (opciones.ventana) {
    ponerTitulo(ctl, 'arriba', opciones.tituloArriba ?? null);
    ponerTitulo(ctl, 'abajo', opciones.tituloAbajo ?? null);
  }
  ctl.elementos.push({
    tipo: 'constante',
    id: nuevoId('cte'),
    fila: filaDetalle - 1,
    columna: columnaDetalle,
    texto: 'Descripción',
    keywords: [kw('DSPATR', 'HI')],
    indicadores: [],
  });

  n.registros.push(sfl, ctl);
  if (completo) return { pantalla: completarSubfile(n, ctl.id).pantalla, registroId: ctl.id };
  return { pantalla: n, registroId: ctl.id };
}

/** Elimina un registro. Un subfile y su control se eliminan juntos. */
export function eliminarRegistro(p: PantallaDSPF, regId: string): PantallaDSPF {
  const objetivo = buscarRegistro(p, regId);
  const n = clonar(p);
  const quitar = new Set<string>([regId]);

  if (objetivo.clase === 'subfile') {
    for (const r of n.registros) {
      if (r.clase === 'control-subfile' && r.subfileControlado === objetivo.nombre) quitar.add(r.id);
    }
  } else if (objetivo.clase === 'control-subfile' && objetivo.subfileControlado) {
    const sfl = n.registros.find(
      (r) => r.clase === 'subfile' && r.nombre === objetivo.subfileControlado,
    );
    const otrosControles = n.registros.some(
      (r) =>
        r.id !== regId &&
        r.clase === 'control-subfile' &&
        r.subfileControlado === objetivo.subfileControlado,
    );
    if (sfl && !otrosControles) quitar.add(sfl.id);
  }

  n.registros = n.registros.filter((r) => !quitar.has(r.id));
  return n;
}

/** Renombra un registro y actualiza las referencias (SFLCTL, ERASE, WINDOW). */
export function renombrarRegistro(p: PantallaDSPF, regId: string, nuevoNombre: string): PantallaDSPF {
  const nombre = normalizarNombre(nuevoNombre);
  if (nombre === '') throw new Error('El registro necesita un nombre.');
  if (hayRegistroConNombre(p, nombre, regId)) throw new Error(`Ya existe el registro ${nombre}.`);

  const n = clonar(p);
  const reg = buscarRegistro(n, regId);
  const anterior = reg.nombre;
  reg.nombre = nombre;

  for (const r of n.registros) {
    if (r.subfileControlado === anterior) r.subfileControlado = nombre;
    for (const k of r.keywords) {
      if (['SFLCTL', 'ERASE', 'WINDOW'].includes(k.nombre) && k.parametros.trim() === anterior) {
        k.parametros = nombre;
      }
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Elementos (constantes y campos)
// ---------------------------------------------------------------------------

export interface DatosCampo {
  nombre: string;
  longitud?: number;
  decimales?: number;
  tipoDato?: Campo['tipoDato'];
  uso?: Campo['uso'];
  fila: number | null;
  columna: number | null;
}

function crearCampo(d: DatosCampo): Campo {
  return {
    tipo: 'campo',
    id: nuevoId('campo'),
    nombre: d.nombre,
    longitud: d.longitud ?? 10,
    decimales: d.decimales ?? 0,
    tipoDato: d.tipoDato ?? 'A',
    uso: d.uso ?? 'ambos',
    fila: d.fila,
    columna: d.columna,
    keywords: [],
    indicadores: [],
    referencia: false,
  };
}

export function agregarConstante(
  p: PantallaDSPF,
  regId: string,
  fila: number,
  columna: number,
  texto = 'Texto',
): { pantalla: PantallaDSPF; elementoId: string } {
  const n = clonar(p);
  const reg = buscarRegistro(n, regId);
  const c: Constante = {
    tipo: 'constante',
    id: nuevoId('cte'),
    fila,
    columna,
    texto,
    keywords: [],
    indicadores: [],
  };
  reg.elementos.push(c);
  return { pantalla: n, elementoId: c.id };
}

export function agregarCampo(
  p: PantallaDSPF,
  regId: string,
  datos: Omit<DatosCampo, 'nombre'> & { nombre?: string },
): { pantalla: PantallaDSPF; elementoId: string } {
  const n = clonar(p);
  const reg = buscarRegistro(n, regId);
  const existentes = reg.elementos.flatMap((e) => (e.tipo === 'campo' ? [e.nombre] : []));
  const nombre = datos.nombre ? normalizarNombre(datos.nombre) : nombreLibre(existentes, 'CAMPO');
  const campo = crearCampo({ ...datos, nombre });
  reg.elementos.push(campo);
  return { pantalla: n, elementoId: campo.id };
}

export function moverElemento(
  p: PantallaDSPF,
  regId: string,
  elId: string,
  fila: number,
  columna: number,
): PantallaDSPF {
  const n = clonar(p);
  const e = buscarElemento(buscarRegistro(n, regId), elId);
  e.fila = fila;
  e.columna = columna;
  return n;
}

export type ParcheElemento = Partial<Omit<Campo, 'id' | 'tipo' | 'fila' | 'columna'>> &
  Partial<Omit<Constante, 'id' | 'tipo' | 'fila' | 'columna'>> & {
    // Un campo oculto no tiene posición: fila/columna pueden ser null.
    fila?: number | null;
    columna?: number | null;
  };

/**
 * Cambia propiedades de un elemento. El nombre de un campo se normaliza. Si
 * el uso pasa a oculto/programa, el campo pierde su posición (en DDS un campo
 * oculto no se ubica en pantalla).
 */
export function actualizarElemento(
  p: PantallaDSPF,
  regId: string,
  elId: string,
  parche: ParcheElemento,
): PantallaDSPF {
  const n = clonar(p);
  const e = buscarElemento(buscarRegistro(n, regId), elId);
  const cambios: ParcheElemento = { ...parche };
  if (e.tipo === 'campo' && typeof cambios.nombre === 'string') {
    cambios.nombre = normalizarNombre(cambios.nombre);
  }
  Object.assign(e, cambios);
  if (e.tipo === 'campo' && (e.uso === 'oculto' || e.uso === 'programa')) {
    e.fila = null;
    e.columna = null;
  }
  return n;
}

export function eliminarElemento(p: PantallaDSPF, regId: string, elId: string): PantallaDSPF {
  const n = clonar(p);
  const reg = buscarRegistro(n, regId);
  buscarElemento(reg, elId); // valida que existe
  reg.elementos = reg.elementos.filter((e) => e.id !== elId);
  return n;
}

// ---------------------------------------------------------------------------
// Atributos de display y color
// ---------------------------------------------------------------------------

export type AtributoDisplay = 'HI' | 'UL' | 'RI' | 'BL' | 'ND' | 'PR';
export const ATRIBUTOS_DISPLAY: AtributoDisplay[] = ['HI', 'UL', 'RI', 'BL', 'ND', 'PR'];
export const COLORES = ['GRN', 'WHT', 'RED', 'TRQ', 'YLW', 'PNK', 'BLU'] as const;

function dspatrIncondicionales(e: Elemento): Keyword[] {
  return e.keywords.filter((k) => k.nombre === 'DSPATR' && k.indicadores.length === 0);
}

function valoresDspatr(k: Keyword): string[] {
  return k.parametros.trim().split(/\s+/).filter((v) => v.length > 0);
}

export function tieneAtributo(e: Elemento, a: AtributoDisplay): boolean {
  return dspatrIncondicionales(e).some((k) => valoresDspatr(k).includes(a));
}

/** Color fijo (keyword COLOR sin indicadores) o null si no tiene. */
export function colorDe(e: Elemento): string | null {
  const k = e.keywords.find((x) => x.nombre === 'COLOR' && x.indicadores.length === 0);
  return k ? k.parametros.trim().toUpperCase() : null;
}

/** Activa o desactiva un atributo DSPATR (sin indicadores). Sin `activar`, lo alterna. */
export function alternarAtributo(
  p: PantallaDSPF,
  regId: string,
  elId: string,
  atributo: AtributoDisplay,
  activar?: boolean,
): PantallaDSPF {
  const n = clonar(p);
  const e = buscarElemento(buscarRegistro(n, regId), elId);
  const presente = tieneAtributo(e, atributo);
  const quiere = activar ?? !presente;
  if (quiere === presente) return n;

  const kws = dspatrIncondicionales(e);
  if (!quiere) {
    for (const k of kws) {
      const restantes = valoresDspatr(k).filter((v) => v !== atributo);
      if (restantes.length === 0) e.keywords = e.keywords.filter((x) => x !== k);
      else k.parametros = restantes.join(' ');
    }
  } else if (kws.length > 0) {
    kws[0].parametros = [...valoresDspatr(kws[0]), atributo].join(' ');
  } else {
    e.keywords.push(kw('DSPATR', atributo));
  }
  return n;
}

/** Fija el color (GRN, WHT...) o lo quita con null. */
export function establecerColor(
  p: PantallaDSPF,
  regId: string,
  elId: string,
  color: string | null,
): PantallaDSPF {
  const n = clonar(p);
  const e = buscarElemento(buscarRegistro(n, regId), elId);
  e.keywords = e.keywords.filter((k) => !(k.nombre === 'COLOR' && k.indicadores.length === 0));
  if (color) e.keywords.push(kw('COLOR', color));
  return n;
}

// ---------------------------------------------------------------------------
// Keywords genéricas
// ---------------------------------------------------------------------------

export type Destino =
  | { tipo: 'archivo' }
  | { tipo: 'registro'; regId: string }
  | { tipo: 'elemento'; regId: string; elId: string };

function listaKeywords(p: PantallaDSPF, d: Destino): Keyword[] {
  if (d.tipo === 'archivo') return p.keywordsArchivo;
  const reg = buscarRegistro(p, d.regId);
  if (d.tipo === 'registro') return reg.keywords;
  return buscarElemento(reg, d.elId).keywords;
}

export function agregarKeyword(
  p: PantallaDSPF,
  destino: Destino,
  k: { nombre: string; parametros?: string; indicadores?: IndicadorCond[] },
): PantallaDSPF {
  const n = clonar(p);
  listaKeywords(n, destino).push(kw(k.nombre, k.parametros ?? '', k.indicadores ?? []));
  return n;
}

export function quitarKeyword(p: PantallaDSPF, destino: Destino, indice: number): PantallaDSPF {
  const n = clonar(p);
  const lista = listaKeywords(n, destino);
  if (indice < 0 || indice >= lista.length) throw new Error('La keyword indicada no existe.');
  lista.splice(indice, 1);
  return n;
}

export function actualizarKeyword(
  p: PantallaDSPF,
  destino: Destino,
  indice: number,
  parche: Partial<Keyword>,
): PantallaDSPF {
  const n = clonar(p);
  const lista = listaKeywords(n, destino);
  if (indice < 0 || indice >= lista.length) throw new Error('La keyword indicada no existe.');
  const nuevo = { ...lista[indice], ...parche };
  if (typeof parche.nombre === 'string') nuevo.nombre = parche.nombre.trim().toUpperCase();
  lista[indice] = nuevo;
  return n;
}

// ---------------------------------------------------------------------------
// Ventana y títulos
// ---------------------------------------------------------------------------

/** Lee WINDOW(f c alto ancho) si está en forma numérica. */
export function leerVentana(r: Registro): VentanaDef | null {
  const k = r.keywords.find((x) => x.nombre === 'WINDOW');
  if (!k) return null;
  const nums = k.parametros.trim().split(/\s+/).map((v) => parseInt(v, 10));
  if (nums.length < 4 || nums.slice(0, 4).some((v) => Number.isNaN(v))) return null;
  return { fila: nums[0], columna: nums[1], alto: nums[2], ancho: nums[3] };
}

/** Define (o quita con null) la ventana de un registro. */
export function establecerVentana(
  p: PantallaDSPF,
  regId: string,
  v: VentanaDef | null,
): PantallaDSPF {
  const n = clonar(p);
  const reg = buscarRegistro(n, regId);
  if (v === null) {
    reg.keywords = reg.keywords.filter(
      (k) => !['WINDOW', 'WDWBORDER', 'WDWTITLE', 'USRRSTDSP'].includes(k.nombre),
    );
    return n;
  }
  const parametros = `${v.fila} ${v.columna} ${v.alto} ${v.ancho}`;
  const existente = reg.keywords.find((k) => k.nombre === 'WINDOW');
  if (existente) {
    existente.parametros = parametros;
  } else {
    reg.keywords.push(...keywordsVentana(v));
  }
  return n;
}

function esTituloAbajo(k: Keyword): boolean {
  return /\*BOTTOM\b/.test(k.parametros);
}

/** Texto del título de la ventana (arriba o abajo), o '' si no tiene. */
export function leerTituloVentana(r: Registro, posicion: 'arriba' | 'abajo'): string {
  const k = r.keywords.find(
    (x) => x.nombre === 'WDWTITLE' && esTituloAbajo(x) === (posicion === 'abajo'),
  );
  if (!k) return '';
  const m = /\*TEXT\s+'((?:[^']|'')*)'/.exec(k.parametros);
  return m ? m[1].replace(/''/g, "'") : '';
}

function ponerTitulo(r: Registro, posicion: 'arriba' | 'abajo', texto: string | null): void {
  const abajo = posicion === 'abajo';
  const indice = r.keywords.findIndex((x) => x.nombre === 'WDWTITLE' && esTituloAbajo(x) === abajo);
  if (texto === null || texto.trim() === '') {
    if (indice >= 0) r.keywords.splice(indice, 1);
    return;
  }
  const color = indice >= 0 ? (/\*COLOR\s+([A-Z]{3})/.exec(r.keywords[indice].parametros)?.[1] ?? 'WHT') : 'WHT';
  const parametros =
    `(*TEXT '${texto.replace(/'/g, "''")}') (*COLOR ${color})` + (abajo ? ' *BOTTOM' : '');
  if (indice >= 0) r.keywords[indice].parametros = parametros;
  else r.keywords.push(kw('WDWTITLE', parametros));
}

/** Define o quita (texto vacío/null) el título de arriba o de abajo de la ventana. */
export function establecerTituloVentana(
  p: PantallaDSPF,
  regId: string,
  posicion: 'arriba' | 'abajo',
  texto: string | null,
): PantallaDSPF {
  const n = clonar(p);
  ponerTitulo(buscarRegistro(n, regId), posicion, texto);
  return n;
}

// ---------------------------------------------------------------------------
// Teclas de función
// ---------------------------------------------------------------------------

/** Texto de una tecla tal como se ve (con las comillas dobles ya resueltas). */
export function textoLegibleTecla(t: TeclaFuncion): string {
  return (t.texto ?? '').replace(/''/g, "'");
}

/** Agrega CFnn/CAnn. Por convención el indicador de respuesta es el número de la tecla. */
export function agregarTecla(
  p: PantallaDSPF,
  t: { tipo: 'CF' | 'CA'; numero: number; texto?: string },
): PantallaDSPF {
  const n = clonar(p);
  n.teclasFuncion.push({
    tipo: t.tipo,
    numero: t.numero,
    respuestaInd: t.numero,
    texto: t.texto !== undefined && t.texto !== '' ? t.texto.replace(/'/g, "''") : undefined,
  });
  return n;
}

export function quitarTecla(p: PantallaDSPF, indice: number): PantallaDSPF {
  const n = clonar(p);
  if (indice < 0 || indice >= n.teclasFuncion.length) throw new Error('La tecla indicada no existe.');
  n.teclasFuncion.splice(indice, 1);
  return n;
}

export function actualizarTecla(
  p: PantallaDSPF,
  indice: number,
  parche: { tipo?: 'CF' | 'CA'; numero?: number; texto?: string },
): PantallaDSPF {
  const n = clonar(p);
  const t = n.teclasFuncion[indice];
  if (!t) throw new Error('La tecla indicada no existe.');
  if (parche.tipo !== undefined) t.tipo = parche.tipo;
  if (parche.numero !== undefined) {
    // Si el indicador de respuesta seguía la convención, acompaña al número.
    if (t.respuestaInd === t.numero) t.respuestaInd = parche.numero;
    t.numero = parche.numero;
  }
  if (parche.texto !== undefined) {
    t.texto = parche.texto === '' ? undefined : parche.texto.replace(/'/g, "''");
  }
  return n;
}

/** Opciones del subfile, como en el CRUD. */
export const TEXTO_OPCIONES_SUBFILE = 'Opciones: 2=Modificar   4=Eliminar   5=Consultar';

export interface ResultadoCompletarSubfile {
  pantalla: PantallaDSPF;
  /** Lo que se agregó, para mostrarlo. */
  agregados: string[];
  /** Lo que no se pudo agregar y hay que hacer a mano. */
  avisos: string[];
}

const esOpcion = (e: Elemento): boolean =>
  e.tipo === 'campo' && /^OPC(ION)?$/i.test(e.nombre) && (e.uso === 'entrada' || e.uso === 'ambos');

/**
 * Agrega a un subfile lo que tiene el del CRUD y le falte: OVERLAY en el control, el registro
 * relativo del cursor (REGREL con SFLCSRRRN), la página donde quedó (POSCUR con SFLRCDNBR(CURSOR)),
 * el campo OPCION al inicio de la línea, su encabezado y la línea de opciones. Lo que no cabe se
 * avisa (no se mueve nada de lo que ya está).
 */
export function completarSubfile(p: PantallaDSPF, regId: string): ResultadoCompletarSubfile {
  const elegido = buscarRegistro(p, regId);
  const n = clonar(p);
  const ctl =
    elegido.clase === 'control-subfile'
      ? buscarRegistro(n, regId)
      : n.registros.find((r) => r.clase === 'control-subfile' && r.subfileControlado === elegido.nombre);
  if (!ctl || ctl.clase !== 'control-subfile') throw new Error('Elija un subfile o su control.');
  const sfl = n.registros.find((r) => r.clase === 'subfile' && r.nombre === ctl.subfileControlado);
  if (!sfl) throw new Error(`El subfile ${ctl.subfileControlado ?? ''} no está en la pantalla.`);
  const agregados: string[] = [];
  const avisos: string[] = [];
  const nombres = (r: Registro) => r.elementos.flatMap((e) => (e.tipo === 'campo' ? [e.nombre] : []));
  const tiene = (r: Registro, k: string) => r.keywords.some((x) => x.nombre === k);
  // Las keywords nuevas van después de SFLPAG, como en el CRUD.
  const insertarKeyword = (k: Keyword) => {
    const i = ctl.keywords.findIndex((x) => x.nombre === 'SFLPAG');
    ctl.keywords.splice(i >= 0 ? i + 1 : ctl.keywords.length, 0, k);
  };
  const ocultos: Campo[] = [];

  if (!ctl.elementos.some((e) => e.tipo === 'campo' && e.keywords.some((k) => k.nombre === 'SFLRCDNBR'))) {
    const nombre = nombreLibre(nombres(ctl), 'POSCUR');
    const c = crearCampo({ nombre: nombres(ctl).includes('POSCUR') ? nombre : 'POSCUR', longitud: 4, tipoDato: 'S', uso: 'oculto', fila: null, columna: null });
    c.keywords.push(kw('SFLRCDNBR', 'CURSOR'));
    ocultos.push(c);
    agregados.push(`${c.nombre} con SFLRCDNBR(CURSOR) (vuelve a la página donde quedó)`);
  }
  if (!tiene(ctl, 'SFLCSRRRN')) {
    const nombre = nombres(ctl).includes('REGREL') ? nombreLibre(nombres(ctl), 'REGREL') : 'REGREL';
    ocultos.push(crearCampo({ nombre, longitud: 5, tipoDato: 'S', uso: 'oculto', fila: null, columna: null }));
    insertarKeyword(kw('SFLCSRRRN', `&${nombre}`));
    agregados.push(`${nombre} con SFLCSRRRN (registro relativo del cursor)`);
  }
  if (!tiene(ctl, 'OVERLAY')) {
    insertarKeyword(kw('OVERLAY'));
    agregados.push('OVERLAY en el control');
  }
  // Los campos ocultos van primero en el control, como en el CRUD.
  ctl.elementos.unshift(...ocultos);

  // Campo de opción en la columna 2 de la primera línea del subfile.
  const filas = sfl.elementos.flatMap((e) => (e.fila !== null ? [e.fila] : []));
  const primera = filas.length > 0 ? Math.min(...filas) : null;
  if (!sfl.elementos.some(esOpcion)) {
    if (primera === null) {
      avisos.push(`${sfl.nombre} no tiene campos ubicados: agregue el campo OPCION a mano.`);
    } else if (sfl.elementos.some((e) => e.fila === primera && e.columna !== null && e.columna <= 4)) {
      avisos.push(`En ${sfl.nombre} no hay lugar para OPCION en las columnas 2 a 4 de la fila ${primera}: hágale espacio y vuelva a completar.`);
    } else {
      const c = crearCampo({ nombre: 'OPCION', longitud: 1, tipoDato: 'A', uso: 'ambos', fila: primera, columna: 2 });
      sfl.elementos.unshift(c);
      agregados.push(`OPCION en ${sfl.nombre} (fila ${primera}, columna 2)`);
      // Encabezado «Opc» en la fila de arriba, si está libre al inicio.
      const filaTitulo = primera - 1;
      if (filaTitulo >= 1 && !ctl.elementos.some((e) => e.fila === filaTitulo && e.columna !== null && e.columna <= 4)) {
        ctl.elementos.push({ tipo: 'constante', id: nuevoId('cte'), fila: filaTitulo, columna: 2, texto: 'Opc', keywords: [kw('DSPATR', 'HI')], indicadores: [] });
      }
    }
  }
  // Línea de opciones, dos filas arriba del subfile, si esa fila del control está libre.
  const yaHayOpciones = ctl.elementos.some((e) => e.tipo === 'constante' && /\b\d=/.test(e.texto));
  if (!yaHayOpciones && primera !== null) {
    const fila = primera - 2;
    if (fila >= 1 && !ctl.elementos.some((e) => e.fila === fila)) {
      ctl.elementos.push({ tipo: 'constante', id: nuevoId('cte'), fila, columna: 2, texto: TEXTO_OPCIONES_SUBFILE, keywords: [], indicadores: [] });
      agregados.push(`la línea de opciones en la fila ${fila}`);
    } else {
      avisos.push(`No se agregó la línea de opciones (2=Modificar 4=Eliminar 5=Consultar): la fila ${Math.max(1, fila)} del control no está libre.`);
    }
  }
  return { pantalla: n, agregados, avisos };
}
// ---------------------------------------------------------------------------
// Teclas básicas (F1, F3, F12), ayuda de teclas y pie
// ---------------------------------------------------------------------------

/** Formato con la ayuda de teclas (F1) y formato con el pie de teclas. */
export const NOMBRE_AYUDA = 'AYUDA';
export const NOMBRE_PIE = 'PIE';

/** Teclas que toda pantalla debe tener: F1 muestra la ayuda, F3 sale del programa y F12 vuelve. */
export const TECLAS_BASICAS: ReadonlyArray<{ numero: number; texto: string }> = [
  { numero: 1, texto: 'Ayuda' },
  { numero: 3, texto: 'Salir' },
  { numero: 12, texto: 'Volver' },
];

/** «F3=Salir»: como se ve una tecla en la ayuda y en el pie. */
export function textoDeTecla(t: TeclaFuncion): string {
  const texto = textoLegibleTecla(t).trim() || TECLAS_BASICAS.find((b) => b.numero === t.numero)?.texto || 'Tecla';
  return `F${t.numero}=${texto}`;
}

/** Ayuda de teclas en una ventana: una línea por tecla (en dos columnas si son muchas) y PAUSA. */
function formatoAyuda(p: PantallaDSPF, teclas: TeclaFuncion[]): Registro {
  const textos = teclas.map(textoDeTecla);
  const maxFilasTeclas = Math.max(1, p.tamano.filas - 9);
  const dosColumnas = textos.length > maxFilasTeclas;
  const filasTeclas = dosColumnas ? Math.ceil(textos.length / 2) : textos.length;
  const anchoTexto = Math.max(...textos.map((x) => x.length), 1);
  const segundaColumna = 2 + anchoTexto + 3;
  const pie = 'Presione Enter para volver';
  const ancho = Math.min(p.tamano.columnas - 6, Math.max(34, pie.length + 6, dosColumnas ? segundaColumna + anchoTexto + 2 : anchoTexto + 4));
  // Título en la fila 1, teclas desde la 3, el aviso después de una fila libre y la línea de mensajes al final.
  const filaPie = 3 + filasTeclas + 1;
  const alto = filaPie + 1;
  const fila = Math.max(2, Math.floor((p.tamano.filas - alto - 2) / 2));
  const columna = Math.max(2, Math.floor((p.tamano.columnas - ancho - 4) / 2));
  const reg = registroVacio(NOMBRE_AYUDA, keywordsVentana({ fila, columna, alto, ancho }));
  ponerTitulo(reg, 'arriba', 'Ayuda');
  const cte = (f: number, c: number, texto: string, keywords: Keyword[] = []): Constante => ({
    tipo: 'constante',
    id: nuevoId('cte'),
    fila: f,
    columna: c,
    texto,
    keywords,
    indicadores: [],
  });
  reg.elementos.push(cte(1, 2, 'Teclas de funcion', [kw('DSPATR', 'HI')]));
  textos.forEach((x, i) => {
    const enSegunda = dosColumnas && i >= filasTeclas;
    reg.elementos.push(cte(3 + (enSegunda ? i - filasTeclas : i), enSegunda ? segundaColumna : 2, x));
  });
  reg.elementos.push(cte(filaPie, 2, pie));
  const pausa = crearCampo({ nombre: 'PAUSA', longitud: 1, uso: 'ambos', fila: filaPie, columna: pie.length + 4 });
  pausa.keywords.push(kw('DSPATR', 'ND'));
  reg.elementos.push(pausa);
  return reg;
}

/** Pie de teclas (OVERLAY), en las últimas filas antes de la de mensajes. */
function formatoPie(p: PantallaDSPF, teclas: TeclaFuncion[]): Registro {
  const ancho = p.tamano.columnas - 3;
  const lineas: string[] = [];
  for (const x of teclas.map(textoDeTecla)) {
    const ultima = lineas[lineas.length - 1];
    if (ultima !== undefined && ultima.length + 2 + x.length <= ancho) lineas[lineas.length - 1] = `${ultima}  ${x}`;
    else lineas.push(x);
  }
  const reg = registroVacio(NOMBRE_PIE, [kw('OVERLAY')]);
  const ultimaFila = p.tamano.filas - 1;
  lineas.forEach((l, i) => {
    reg.elementos.push({
      tipo: 'constante',
      id: nuevoId('cte'),
      fila: ultimaFila - (lineas.length - 1) + i,
      columna: 2,
      texto: l,
      keywords: [kw('COLOR', 'BLU')],
      indicadores: [],
    });
  });
  return reg;
}

export interface ResultadoTeclasYAyuda {
  pantalla: PantallaDSPF;
  agregados: string[];
}

/**
 * Deja la pantalla con F1, F3 y F12 (CF) y arma de nuevo, con las teclas que tenga, el formato
 * AYUDA (lo que muestra F1) y el pie de teclas PIE. Se puede repetir después de cambiar las teclas.
 */
export function asegurarTeclasYAyuda(p: PantallaDSPF): ResultadoTeclasYAyuda {
  const n = clonar(p);
  const agregados: string[] = [];
  for (const b of TECLAS_BASICAS) {
    if (!n.teclasFuncion.some((t) => t.numero === b.numero)) {
      n.teclasFuncion.push({ tipo: 'CF', numero: b.numero, respuestaInd: b.numero, texto: b.texto });
      agregados.push(`CF${String(b.numero).padStart(2, '0')} (${b.texto})`);
    }
  }
  const teclas = [...n.teclasFuncion].sort((a, b) => a.numero - b.numero);
  const reemplazar = (nombre: string, nuevo: Registro, descripcion: string) => {
    const i = n.registros.findIndex((r) => r.nombre.toUpperCase() === nombre);
    if (i >= 0) {
      nuevo.id = n.registros[i].id;
      n.registros[i] = nuevo;
      agregados.push(`${descripcion} actualizado`);
    } else {
      n.registros.push(nuevo);
      agregados.push(`${descripcion} agregado`);
    }
  };
  reemplazar(NOMBRE_AYUDA, formatoAyuda(n, teclas), 'formato AYUDA (F1)');
  reemplazar(NOMBRE_PIE, formatoPie(n, teclas), 'pie de teclas PIE');
  return { pantalla: n, agregados };
}
/**
 * El formato que muestra la ayuda de teclas: AYUDA, o (en pantallas del CRUD) el que tiene el campo
 * PAUSA para esperar el Enter. null si no hay.
 */
export function formatoDeAyuda(p: PantallaDSPF): Registro | null {
  return (
    p.registros.find((r) => r.nombre.toUpperCase() === NOMBRE_AYUDA) ??
    p.registros.find((r) => r.clase === 'normal' && r.elementos.some((e) => e.tipo === 'campo' && e.nombre.toUpperCase() === 'PAUSA')) ??
    null
  );
}