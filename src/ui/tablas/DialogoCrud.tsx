import { useEffect, useMemo, useState } from 'react';
import { generarCrud, reglasPosibles, requeridoDeLlave, requeridosPosibles } from '@core/crud/crud';
import type {
  AccionTecla,
  AnchoPantallaCrud,
  DondeTecla,
  OpcionesCrud,
  ResultadoCrud,
  TeclaCrud,
  TipoCobolCrud,
  TipoPantallaCrud,
  ReglaCampo,
  RequeridoCampo,
  ValidacionCampo,
  ValorAuto,
} from '@core/crud/crud';
import { ETIQUETA_ALMACENAMIENTO, FORMATOS_FECHA, FORMATOS_HORA } from '@core/crud/fechaHora';
import type { FechaHoraCampo } from '@core/crud/fechaHora';
import { NOMBRE_ACCION, TECLAS_POR_DEFECTO, describirCampos } from '@core/crud/planCrud';
import type { InfoCampoCrud } from '@core/crud/planCrud';
import { generarTabla } from '@core/tablas/generadorTabla';
import { tipoDeTabla } from '@core/tablas/modelo';
import type { Tabla } from '@core/tablas/modelo';
import { useAs400 } from '../estado/as400';
import type { FuenteEnvio } from '../estado/as400';
import { pantallaDelConjunto, useConjuntoCrud } from '../estado/conjuntoCrud';
import { guardarDialogo, leerCrudGuardado } from '../estado/crudGuardado';
import type { CampoGuardado, DialogoGuardado, TipoReglaUi } from '../estado/crudGuardado';
import { parsearDspf } from '@core/parser/parserDspf';
import { guardarFuentesLocal } from '../estado/guardadoLocal';
import { useNavegacion } from '../estado/navegacion';
import { useStore } from '../estado/store';
import { resolverDesde, useTablas } from '../estado/storeTablas';

const CLAVE_AUTOR = 'appiseries.autor';
const CLAVE_TECLAS = 'appiseries.teclasCrud';

function leerGuardado(clave: string): string {
  try {
    return window.localStorage.getItem(clave) ?? '';
  } catch {
    return '';
  }
}

function escribirGuardado(clave: string, valor: string): void {
  try {
    window.localStorage.setItem(clave, valor);
  } catch {
    // Sin almacenamiento: no se recuerda y nada más.
  }
}

/**
 * Teclas guardadas por una versión anterior: F4 era la ayuda general. Ahora la ayuda general es F1
 * y F4 es la ayuda de campo; si no se agrega esa tecla, no habría forma de pedirla.
 */
export function migrarTeclas(entrada: TeclaCrud[]): TeclaCrud[] {
  const teclas = entrada.map((t) => ({ ...t }));
  if (teclas.some((t) => t.accion === 'ayudaCampo')) return teclas;
  const ayuda = teclas.find((t) => t.accion === 'ayuda');
  if (ayuda && ayuda.numero === 4 && !teclas.some((t) => t.numero === 1)) ayuda.numero = 1;
  if (!teclas.some((t) => t.numero === 4)) {
    teclas.push({ numero: 4, texto: 'Ayuda campo', accion: 'ayudaCampo', donde: 'detalle' });
  }
  return teclas;
}

/** Las teclas que se usaron la última vez, si siguen siendo válidas; si no, las de siempre. */
function teclasIniciales(): TeclaCrud[] {
  try {
    const guardadas = JSON.parse(leerGuardado(CLAVE_TECLAS)) as TeclaCrud[];
    if (
      Array.isArray(guardadas) &&
      guardadas.length > 0 &&
      guardadas.every((t) => Number.isInteger(t.numero) && typeof t.texto === 'string' && typeof t.accion === 'string')
    ) {
      return migrarTeclas(guardadas);
    }
  } catch {
    // Sin teclas guardadas o dañadas.
  }
  return TECLAS_POR_DEFECTO.map((t) => ({ ...t }));
}

/** Nombres que se proponen: ASQRY03F pasa a ASQRY03D (pantalla) y ASQRY03P (programa). */
export function sugerirNombres(tabla: string): { pantalla: string; programa: string } {
  const base = tabla.replace(/F$/, '').slice(0, 9);
  return { pantalla: `${base}D`, programa: `${base}P` };
}

function mensajeDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

interface AutoUi {
  tipo: ValorAuto['tipo'];
  valor: string;
}

/**
 * Un campo en el diálogo: lo que se sabe de él (info) y lo que se marcó (se guarda por tabla).
 * ajuste: largo de cada fila si el texto se parte en varias (CNTFLD); vacío = el mejor divisor exacto.
 * ayudaParrafo / ayudaPrograma: ayuda de campo (F4); párrafo vacío = sin ayuda.
 * requerido / regla*: validación al agregar y al modificar.
 */
type FilaCampo = { info: InfoCampoCrud } & CampoGuardado;

const SIN_VALOR: AutoUi = { tipo: 'defecto', valor: '' };

const NOMBRE_REQUERIDO: Record<RequeridoCampo, string> = {
  no: 'No',
  si: 'Sí',
  mayorCero: 'Mayor a 0',
  distintoCero: 'Distinto de 0',
};
const NOMBRE_REGLA: Record<ReglaCampo['tipo'], string> = {
  email: 'Email',
  rango: 'Rango',
  valores: 'Valores permitidos',
  existe: 'Existe en tabla',
};

/** Cómo es el campo para validar: número (sin ser fecha u hora), fecha u hora, o texto. */
function claseValidacion(f: FilaCampo): { numerico: boolean; fechaHora: boolean; longitud: number } {
  return {
    numerico: ['S', 'P', 'B'].includes(f.info.def.tipo) && f.fh === null,
    fechaHora: f.fh !== null,
    longitud: f.info.longitud,
  };
}

/** Lo obligatorio que vale para el campo: el de la llave, o el elegido si sigue siendo posible. */
function requeridoEfectivo(f: FilaCampo): RequeridoCampo {
  const clase = claseValidacion(f);
  if (f.info.llave) return requeridoDeLlave({ clase: clase.numerico ? 'N' : 'A', fechaHora: clase.fechaHora ? f.fh! : undefined });
  return requeridosPosibles(clase).includes(f.requerido) ? f.requerido : 'no';
}

/** La regla elegida si el campo la admite (al cambiar a fecha, por ejemplo, deja de valer). */
function reglaEfectiva(f: FilaCampo): TipoReglaUi {
  return f.regla !== '' && reglasPosibles(claseValidacion(f)).includes(f.regla) ? f.regla : '';
}

function validacionDe(f: FilaCampo): ValidacionCampo | null {
  const requerido = f.info.llave ? 'no' : requeridoEfectivo(f);
  const tipo = reglaEfectiva(f);
  const regla: ReglaCampo | null =
    tipo === 'email'
      ? { tipo: 'email' }
      : tipo === 'rango'
        ? { tipo: 'rango', minimo: f.reglaMinimo, maximo: f.reglaMaximo }
        : tipo === 'valores'
          ? { tipo: 'valores', valores: f.reglaValores }
          : tipo === 'existe'
            ? { tipo: 'existe', tabla: f.reglaTabla, columna: f.reglaColumna }
            : null;
  if (requerido === 'no' && !regla) return null;
  return { requerido, regla };
}

/** Lo que se marca de un campo nuevo: lo que el CRUD elige solo. */
function campoPorDefecto(info: InfoCampoCrud, lista: boolean, detalle: boolean): CampoGuardado {
  return {
    lista,
    detalle,
    fh: info.sugerido,
    agregar: SIN_VALOR,
    modificar: SIN_VALOR,
    ajuste: '',
    ayudaParrafo: '',
    ayudaPrograma: '',
    requerido: 'no',
    regla: '',
    reglaMinimo: '',
    reglaMaximo: '',
    reglaValores: '',
    reglaTabla: '',
    reglaColumna: '',
  };
}

/** Datos generales del CRUD (todo menos los campos). */
interface BaseCrud {
  nombreTabla: string;
  nombrePantalla: string;
  nombrePrograma: string;
  tipoCobol: TipoCobolCrud;
  titulo: string;
  autor: string;
  bibliotecaTabla: string;
  tipoPantalla: TipoPantallaCrud;
  ancho: AnchoPantallaCrud;
  teclas: TeclaCrud[];
  resolverArchivo: OpcionesCrud['resolverArchivo'];
}

/** Las opciones del CRUD a partir de lo marcado en el diálogo. */
function opcionesDe(base: BaseCrud, filas: FilaCampo[]): OpcionesCrud {
  const enDetalle = filas.filter((f) => f.detalle);
  const fuera = filas.filter((f) => !f.detalle && f.info.soportado);
  const valores = (cual: 'agregar' | 'modificar') =>
    Object.fromEntries(fuera.filter((f) => f[cual].tipo !== 'defecto').map((f) => [f.info.nombre, aValorAuto(f[cual])]));
  return {
    ...base,
    camposDetalle: enDetalle.map((f) => f.info.nombre),
    camposLista: enDetalle.filter((f) => f.lista).map((f) => f.info.nombre),
    camposFechaHora: Object.fromEntries(filas.flatMap((f) => (f.fh ? [[f.info.nombre, f.fh]] : []))),
    ajustesCntfld: Object.fromEntries(
      enDetalle.filter((f) => f.ajuste.trim() !== '').map((f) => [f.info.nombre, Number(f.ajuste)]),
    ),
    ayudasCampo: Object.fromEntries(
      enDetalle
        .filter((f) => f.ayudaParrafo.trim() !== '')
        .map((f) => [f.info.nombre, { parrafo: f.ayudaParrafo, programa: f.ayudaPrograma }]),
    ),
    validacionesCampo: Object.fromEntries(
      enDetalle.flatMap((f) => {
        const v = validacionDe(f);
        return v ? [[f.info.nombre, v]] : [];
      }),
    ),
    valoresAlAgregar: valores('agregar'),
    valoresAlModificar: valores('modificar'),
  };
}

function aValorAuto(a: AutoUi): ValorAuto {
  return a.tipo === 'fijo' ? { tipo: 'fijo', valor: a.valor } : ({ tipo: a.tipo } as ValorAuto);
}

const ACCIONES = Object.keys(NOMBRE_ACCION) as AccionTecla[];

type PestanaCrud = 'general' | 'campos' | 'validaciones' | 'ayudas' | 'teclas' | 'resultado';
const PESTANAS_CRUD: Array<{ id: PestanaCrud; texto: string }> = [
  { id: 'general', texto: 'General' },
  { id: 'campos', texto: 'Campos' },
  { id: 'validaciones', texto: 'Validaciones' },
  { id: 'ayudas', texto: 'Ayudas y valores' },
  { id: 'teclas', texto: 'Teclas' },
  { id: 'resultado', texto: 'Resultado' },
];

/** Definición del campo en el archivo, como en DSPFFD: 40A, 9,0S, 8L. */
function definicionCampo(i: InfoCampoCrud): string {
  const t = i.def.tipo || 'A';
  if (t === 'A' || t === 'L' || t === 'T' || t === 'Z') return `${i.longitud}${t}`;
  return `${i.longitud},${i.def.decimales ?? 0}${t}`;
}

/** La ayuda de campo (F4) se puede dar a un campo del detalle que no sea fecha, hora ni decimal y que quepa en el código (30). */
function ayudaPosible(f: FilaCampo): boolean {
  const i = f.info;
  return f.detalle && i.soportado && f.fh === null && i.longitud <= 30 && !(i.def.decimales !== undefined && i.def.decimales > 0 && !i.esTexto);
}

/** Genera una pantalla y un programa COBOL con SQL para mantener la tabla abierta. */
export function DialogoCrud({ tabla, nombre, onCerrar }: { tabla: Tabla; nombre: string; onCerrar: () => void }) {
  const catalogo = useTablas((s) => s.catalogo);
  const biblioteca = useTablas((s) => s.biblioteca);
  const abrirEnvio = useAs400((s) => s.abrirEnvio);
  const abrirPantallaGenerada = useStore((s) => s.abrirPantallaGenerada);
  const irA = useNavegacion((s) => s.irA);

  // Lo último que se marcó para esta tabla (se guarda en el equipo y sobrevive al cierre).
  const [guardado] = useState(() => leerCrudGuardado(nombre));
  const previo: DialogoGuardado | null = guardado?.dialogo ?? null;
  const sugeridos = sugerirNombres(nombre);
  const [nombrePantalla, setNombrePantalla] = useState(previo?.nombrePantalla ?? sugeridos.pantalla);
  const [nombrePrograma, setNombrePrograma] = useState(previo?.nombrePrograma ?? sugeridos.programa);
  const [titulo, setTitulo] = useState(previo?.titulo ?? `Mantencion de ${nombre}`);
  const [autor, setAutor] = useState(() => leerGuardado(CLAVE_AUTOR));
  const [tipoCobol, setTipoCobol] = useState<TipoCobolCrud>(previo?.tipoCobol ?? 'SQLCBL');
  const [bibliotecaTabla, setBibliotecaTabla] = useState(previo?.bibliotecaTabla ?? biblioteca);
  const [tipoPantalla, setTipoPantalla] = useState<TipoPantallaCrud>(previo?.tipoPantalla ?? 'normal');
  const [ancho, setAncho] = useState<AnchoPantallaCrud>(previo?.ancho ?? 'auto');
  const [teclas, setTeclas] = useState<TeclaCrud[]>(() =>
    previo?.teclas && previo.teclas.length > 0 ? migrarTeclas(previo.teclas) : teclasIniciales(),
  );
  const resolver = useMemo(() => resolverDesde(catalogo), [catalogo]);

  const base = (): BaseCrud => ({
    nombreTabla: nombre,
    nombrePantalla,
    nombrePrograma,
    tipoCobol,
    titulo,
    autor,
    bibliotecaTabla,
    tipoPantalla,
    ancho,
    teclas,
    resolverArchivo: resolver,
  });

  // Punto de partida: los campos que el CRUD elige solo, con las fechas y horas que reconoce.
  const inicial = useMemo(() => {
    const infos = describirCampos(tabla, resolver);
    const fh = Object.fromEntries(infos.flatMap((i) => (i.sugerido ? [[i.nombre, i.sugerido]] : [])));
    let error: string | null = null;
    let detalle = new Set(infos.filter((i) => i.soportado).map((i) => i.nombre));
    let lista = new Set(detalle);
    try {
      const r = generarCrud(tabla, {
        nombreTabla: nombre,
        nombrePantalla: 'PANTALLAD',
        nombrePrograma: 'PROGRAMAP',
        tipoCobol: 'SQLCBL',
        titulo: '',
        autor: '',
        bibliotecaTabla: '',
        camposFechaHora: fh,
        resolverArchivo: resolver,
      });
      detalle = new Set(r.plan.detalle.map((c) => c.nombre));
      lista = new Set(r.plan.lista.map((c) => c.nombre));
    } catch (e) {
      error = mensajeDe(e);
    }
    // Lo guardado manda; los campos nuevos de la tabla entran con lo que el CRUD elige solo.
    const filas: FilaCampo[] = infos.map((info) => {
      const porDefecto = campoPorDefecto(info, lista.has(info.nombre), detalle.has(info.nombre));
      const anterior = previo?.campos?.[info.nombre];
      if (!anterior) return { info, ...porDefecto };
      const fila: FilaCampo = { info, ...porDefecto, ...anterior };
      if (!info.soportado) fila.detalle = false;
      if (info.esFechaHoraNativa && !fila.fh) fila.fh = info.sugerido;
      return fila;
    });
    return { filas, error };
    // La tabla no cambia mientras el diálogo está abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [filas, setFilas] = useState<FilaCampo[]>(inicial.filas);
  // Si ya se había generado, se vuelve a mostrar (se genera de nuevo con lo mismo, sin tocar el CRUD guardado).
  const [restaurado] = useState<{ r: ResultadoCrud | null; error: string | null }>(() => {
    if (!guardado?.conjunto) return { r: null, error: null };
    try {
      return { r: generarCrud(tabla, opcionesDe(base(), inicial.filas)), error: null };
    } catch (e) {
      return { r: null, error: mensajeDe(e) };
    }
  });
  const [resultado, setResultado] = useState<ResultadoCrud | null>(restaurado.r);
  /** 'dds', 'cobol' o 'ayuda:PROGRAMA'. */
  const [vista, setVista] = useState('dds');
  // Si ya había un CRUD generado, se abre en el resultado.
  const [pestana, setPestana] = useState<PestanaCrud>(() => (restaurado.r ? 'resultado' : 'general'));
  const [error, setError] = useState<string | null>(inicial.error ?? restaurado.error);

  // Todo lo marcado se guarda en el equipo, para esta tabla.
  useEffect(() => {
    guardarDialogo(nombre, {
      nombrePantalla,
      nombrePrograma,
      titulo,
      tipoCobol,
      bibliotecaTabla,
      tipoPantalla,
      ancho,
      teclas,
      campos: Object.fromEntries(filas.map(({ info, ...resto }) => [info.nombre, resto])),
    });
  }, [nombre, nombrePantalla, nombrePrograma, titulo, tipoCobol, bibliotecaTabla, tipoPantalla, ancho, teclas, filas]);

  // La pantalla de este CRUD editada en el editor (ahora o en otra sesión), si cambió respecto de la generada.
  const conjunto = useConjuntoCrud((s) => s.conjunto);
  const conjuntoPropio =
    conjunto && resultado && conjunto.tabla.toUpperCase() === nombre.toUpperCase() && conjunto.nombrePantalla === resultado.plan.opciones.nombrePantalla
      ? conjunto
      : null;
  let ddsEditada: string | null = null;
  if (conjuntoPropio) {
    try {
      const p = pantallaDelConjunto(conjuntoPropio);
      if (p.delEditor && p.texto !== conjuntoPropio.ddsPantalla) ddsEditada = p.texto;
    } catch {
      ddsEditada = null;
    }
  }
  const ddsVigente = ddsEditada ?? resultado?.dds ?? '';
  // El programa de este CRUD editado en la sección Programas.
  const cobolEditado = conjuntoPropio?.cobolEditado ?? null;
  const cobolVigente = cobolEditado ?? resultado?.cobol ?? '';
  const [aviso, setAviso] = useState<string | null>(null);

  const cambiarFila = (nombreCampo: string, cambio: Partial<FilaCampo>) => {
    setFilas((fs) => fs.map((f) => (f.info.nombre === nombreCampo ? { ...f, ...cambio } : f)));
    setResultado(null);
  };

  const cambiarTecla = (indice: number, cambio: Partial<TeclaCrud>) => {
    setTeclas((ts) => ts.map((t, i) => (i === indice ? { ...t, ...cambio } : t)));
    setResultado(null);
  };

  const agregarTecla = () => {
    const usadas = new Set(teclas.map((t) => t.numero));
    const libre = [10, 11, 13, 14, 15, 16, 17, 18, 21, 22, 24, 1, 2, 7].find((n) => !usadas.has(n));
    if (libre === undefined) return;
    setTeclas((ts) => [...ts, { numero: libre, texto: 'Accion', accion: 'personalizada', donde: 'ambas' }]);
    setResultado(null);
  };

  const cambiarTipoFechaHora = (f: FilaCampo, valor: string) => {
    if (valor === 'fecha') {
      cambiarFila(f.info.nombre, {
        fh: { tipo: 'fecha', formato: FORMATOS_FECHA[0], almacenamiento: f.info.almacenamientosFecha[0] },
      });
    } else if (valor === 'hora') {
      cambiarFila(f.info.nombre, {
        fh: { tipo: 'hora', formato: FORMATOS_HORA[0], almacenamiento: f.info.almacenamientosHora[0] },
      });
    } else {
      cambiarFila(f.info.nombre, { fh: null });
    }
  };

  const opcionesFinales = (): OpcionesCrud => opcionesDe(base(), filas);

  const generar = (e?: React.FormEvent) => {
    e?.preventDefault();
    setAviso(null);
    const editados = [
      ...(ddsEditada !== null ? [`la pantalla ${conjuntoPropio?.nombrePantalla ?? ''} se editó en el editor`] : []),
      ...(cobolEditado !== null ? [`el programa ${conjuntoPropio?.nombrePrograma ?? ''} se editó en Programas`] : []),
    ];
    if (
      editados.length > 0 &&
      !window.confirm(
        `${editados.join(' y ').replace(/^./, (c) => c.toUpperCase())}. Si genera de nuevo, se reemplaza por lo generado y se pierden esos cambios. ¿Generar de todos modos?`,
      )
    ) {
      return;
    }
    try {
      const r = generarCrud(tabla, opcionesFinales());
      const o = r.plan.opciones;
      useConjuntoCrud.getState().definir({
        tabla: nombre.toUpperCase(),
        tipoTabla: tipoDeTabla(tabla),
        ddsTabla: generarTabla(tabla),
        nombrePantalla: o.nombrePantalla,
        nombrePrograma: o.nombrePrograma,
        tipoCobol: o.tipoCobol,
        ddsPantalla: r.dds,
        cobol: r.cobol,
        ayudas: r.ayudas,
      });
      escribirGuardado(CLAVE_AUTOR, autor);
      escribirGuardado(CLAVE_TECLAS, JSON.stringify(teclas));
      setResultado(r);
      setPestana('resultado');
      setError(null);
    } catch (err) {
      setResultado(null);
      setError(mensajeDe(err));
    }
  };

  const guardarDos = async () => {
    if (!resultado) return;
    const o = resultado.plan.opciones;
    const r = await guardarFuentesLocal([
      { nombre: `${o.nombrePantalla}.dspf`, texto: ddsVigente },
      { nombre: `${o.nombrePrograma}.${o.tipoCobol === 'SQLCBLLE' ? 'sqlcblle' : 'sqlcbl'}`, texto: cobolVigente },
      ...resultado.ayudas.map((a) => ({ nombre: `${a.programa}.${a.tipo === 'CBLLE' ? 'cblle' : 'cbl'}`, texto: a.texto })),
    ]);
    setAviso(r.mensaje);
  };

  const guardarUno = async (texto: string, sugerido: string) => {
    try {
      const ruta = await window.api.guardarFuente(texto, sugerido);
      if (ruta) setAviso(`Guardado en ${ruta}`);
    } catch (err) {
      setAviso(`No se pudo guardar: ${mensajeDe(err)}`);
    }
  };

  /** Envía la pantalla, el programa o los dos: cada uno pide su archivo fuente según el tipo. */
  const enviar = (cual: 'pantalla' | 'programa' | 'ambos') => {
    if (!resultado) return;
    const descripcion = `Mantenedor ${nombre}`.replace(/[^A-Za-z0-9 .,\-_/()]/g, '').slice(0, 50);
    const fuentes: FuenteEnvio[] = [
      {
        clave: 'dspf',
        etiqueta: ddsEditada ? 'Pantalla (editada)' : 'Pantalla',
        tipo: 'DSPF',
        miembro: resultado.plan.opciones.nombrePantalla,
        texto: ddsVigente,
        descripcion,
        incluido: true,
      },
      {
        clave: 'cobol',
        etiqueta: cobolEditado ? 'Programa (editado)' : 'Programa',
        tipo: resultado.plan.opciones.tipoCobol,
        tiposPermitidos: ['SQLCBL', 'SQLCBLLE'],
        miembro: resultado.plan.opciones.nombrePrograma,
        texto: cobolVigente,
        descripcion,
        incluido: true,
      },
    ];
    // Los esqueletos de ayuda vienen sin marcar: enviarlos reemplazaría un programa de ayuda que ya exista.
    const ayudas: FuenteEnvio[] = resultado.ayudas.map((a) => ({
      clave: `ayuda-${a.programa}`,
      etiqueta: `Ayuda ${a.programa} (esqueleto)`,
      tipo: a.tipo,
      tiposPermitidos: ['CBL', 'CBLLE'],
      miembro: a.programa,
      texto: a.texto,
      descripcion: `Ayuda de campo ${a.campos.join(' ')}`.slice(0, 50),
      incluido: false,
    }));
    const elegidos = fuentes.filter((f) => cual === 'ambos' || (cual === 'pantalla' ? f.clave === 'dspf' : f.clave === 'cobol'));
    abrirEnvio(cual === 'pantalla' ? elegidos : [...elegidos, ...ayudas]);
  };

  const abrirEnEditor = () => {
    if (!resultado) return;
    const nombreDspf = resultado.plan.opciones.nombrePantalla;
    const st = useStore.getState();
    // Ya está en el editor: se vuelve a ella, con sus cambios.
    if (
      conjuntoPropio?.vinculadaAlEditor &&
      st.pantalla &&
      st.nombreArchivoActual?.toUpperCase() === nombreDspf.toUpperCase()
    ) {
      irA('pantallas');
      onCerrar();
      return;
    }
    // Editada en otra sesión: se abre como quedó.
    let pantalla = resultado.pantalla;
    if (ddsEditada) {
      try {
        pantalla = parsearDspf(ddsEditada, nombreDspf);
      } catch {
        pantalla = resultado.pantalla;
      }
    }
    if (abrirPantallaGenerada(pantalla, nombreDspf)) {
      // Desde aquí, el CRUD envía y guarda la pantalla que se edite en el editor.
      useConjuntoCrud.getState().vincularEditor();
      irA('pantallas');
      onCerrar();
    }
  };

  const noEsFisico = tipoDeTabla(tabla) !== 'PF';
  const ayudaVista = resultado?.ayudas.find((a) => vista === `ayuda:${a.programa}`);
  const etiquetaVista = ayudaVista
    ? `Esqueleto de ${ayudaVista.programa}`
    : vista === 'dds'
      ? ddsEditada
        ? 'Fuente DDS (pantalla editada en el editor)'
        : 'Fuente DDS generado'
      : cobolEditado
        ? 'Fuente COBOL (editado en Programas)'
        : 'Fuente COBOL generado';
  const textoVista = ayudaVista ? ayudaVista.texto : resultado ? (vista === 'dds' ? ddsVigente : cobolVigente) : undefined;

  const celdaRequerido = (f: FilaCampo) => {
    if (!f.detalle || !f.info.soportado) return <span className="tenue">—</span>;
    const n = f.info.nombre;
    if (f.info.llave) {
      return <span title="Las llaves siempre son obligatorias">{NOMBRE_REQUERIDO[requeridoEfectivo(f)]} (llave)</span>;
    }
    return (
      <select
        className="form-entrada"
        aria-label={`Obligatorio ${n}`}
        value={requeridoEfectivo(f)}
        onChange={(e) => cambiarFila(n, { requerido: e.target.value as RequeridoCampo })}
      >
        {requeridosPosibles(claseValidacion(f)).map((r) => (
          <option key={r} value={r}>
            {NOMBRE_REQUERIDO[r]}
          </option>
        ))}
      </select>
    );
  };

  const celdaRegla = (f: FilaCampo) => {
    if (!f.detalle || !f.info.soportado) return <span className="tenue">—</span>;
    const n = f.info.nombre;
    const posibles = reglasPosibles(claseValidacion(f));
    if (posibles.length === 0) return <span className="tenue" title="Se valida el formato de la fecha u hora">Formato</span>;
    const regla = reglaEfectiva(f);
    const entrada = (etiqueta: string, campo: keyof CampoGuardado, valor: string, extra: { placeholder?: string; maxLength?: number } = {}) => (
      <input
        type="text"
        className="form-entrada crud-ayuda"
        aria-label={`${etiqueta} de ${n}`}
        value={valor}
        placeholder={extra.placeholder}
        maxLength={extra.maxLength}
        onChange={(e) => cambiarFila(n, { [campo]: e.target.value } as Partial<FilaCampo>)}
      />
    );
    return (
      <span className="crud-auto">
        <select
          className="form-entrada"
          aria-label={`Validación de ${n}`}
          value={regla}
          onChange={(e) => cambiarFila(n, { regla: e.target.value as TipoReglaUi })}
        >
          <option value="">Ninguna</option>
          {posibles.map((r) => (
            <option key={r} value={r}>
              {NOMBRE_REGLA[r]}
            </option>
          ))}
        </select>
        {regla === 'rango' && (
          <>
            {entrada('Mínimo', 'reglaMinimo', f.reglaMinimo, { placeholder: 'mín.', maxLength: 20 })}
            {entrada('Máximo', 'reglaMaximo', f.reglaMaximo, { placeholder: 'máx.', maxLength: 20 })}
          </>
        )}
        {regla === 'valores' && entrada('Valores permitidos', 'reglaValores', f.reglaValores, { placeholder: 'S,N' })}
        {regla === 'existe' && (
          <>
            {entrada('Tabla', 'reglaTabla', f.reglaTabla, { placeholder: 'TABLA o BIB/TABLA', maxLength: 21 })}
            {entrada('Columna', 'reglaColumna', f.reglaColumna, { placeholder: 'COLUMNA', maxLength: 10 })}
          </>
        )}
      </span>
    );
  };

  const celdaAuto = (f: FilaCampo, cual: 'agregar' | 'modificar') => {
    if (f.detalle || !f.info.soportado) return <span className="tenue">—</span>;
    const a = f[cual];
    const alfa = f.info.def.tipo === 'A' || f.info.def.tipo === '';
    const hayFecha = f.info.almacenamientosFecha.length > 0;
    const hayHora = f.info.almacenamientosHora.length > 0;
    return (
      <span className="crud-auto">
        <select
          className="form-entrada"
          aria-label={`Valor de ${f.info.nombre} ${cual === 'agregar' ? 'al agregar' : 'al modificar'}`}
          value={a.tipo}
          onChange={(e) => cambiarFila(f.info.nombre, { [cual]: { tipo: e.target.value as ValorAuto['tipo'], valor: a.valor } })}
        >
          <option value="defecto">Por defecto</option>
          {hayFecha && <option value="fechaActual">Fecha actual</option>}
          {hayHora && <option value="horaActual">Hora actual</option>}
          {alfa && <option value="usuario">Usuario</option>}
          <option value="fijo">Valor fijo</option>
        </select>
        {a.tipo === 'fijo' && (
          <input
            type="text"
            className="form-entrada"
            aria-label={`Valor fijo de ${f.info.nombre} ${cual === 'agregar' ? 'al agregar' : 'al modificar'}`}
            value={a.valor}
            onChange={(e) => cambiarFila(f.info.nombre, { [cual]: { tipo: 'fijo', valor: e.target.value } })}
          />
        )}
      </span>
    );
  };

  const enDetalle = filas.filter((f) => f.detalle && f.info.soportado);

  return (
    <form className="formulario-flotante as400-dialogo as400-envio crud-dialogo" role="dialog" aria-label="Generar CRUD" onSubmit={generar}>
      <div className="crud-encabezado">
        <h3>Generar CRUD de {nombre}</h3>
        <p className="tenue">
          Crea una pantalla con lista, alta, modificación, consulta y baja, y un programa COBOL con SQL que la atiende.
        </p>
      </div>

      <div className="pestanas crud-pestanas" role="tablist" aria-label="Partes del CRUD">
        {PESTANAS_CRUD.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={pestana === p.id}
            className={pestana === p.id ? 'pestana activa' : 'pestana'}
            disabled={p.id === 'resultado' && !resultado}
            title={p.id === 'resultado' && !resultado ? 'Pulse «Generar» para ver la pantalla y el programa' : undefined}
            onClick={() => setPestana(p.id)}
          >
            {p.texto}
            {p.id === 'validaciones' && enDetalle.some((f) => f.regla !== '' || f.requerido !== 'no') ? ' ●' : ''}
          </button>
        ))}
      </div>

      <div className="crud-cuerpo">
        {/* --- General --- */}
        <div role="tabpanel" aria-label="General" hidden={pestana !== 'general'} className="crud-general">
          <label className="form-fila as400-fila-form">
            <span className="form-etiqueta">Pantalla (DSPF)</span>
            <input type="text" className="form-entrada" maxLength={10} value={nombrePantalla} onChange={(e) => setNombrePantalla(e.target.value)} />
          </label>
          <label className="form-fila as400-fila-form">
            <span className="form-etiqueta">Programa</span>
            <input type="text" className="form-entrada" maxLength={10} value={nombrePrograma} onChange={(e) => setNombrePrograma(e.target.value)} />
          </label>
          <label className="form-fila as400-fila-form">
            <span className="form-etiqueta">Compilar como</span>
            <select className="form-entrada" value={tipoCobol} onChange={(e) => setTipoCobol(e.target.value as TipoCobolCrud)}>
              <option value="SQLCBL">COBOL con SQL, OPM (CRTSQLCBL)</option>
              <option value="SQLCBLLE">COBOL ILE con SQL (CRTSQLCBLI)</option>
            </select>
          </label>
          <label className="form-fila as400-fila-form">
            <span className="form-etiqueta">Tipo de pantalla</span>
            <select
              className="form-entrada"
              value={tipoPantalla}
              onChange={(e) => {
                setTipoPantalla(e.target.value as TipoPantallaCrud);
                setResultado(null);
              }}
            >
              <option value="normal">Normal (pantalla completa)</option>
              <option value="window">Window (ventanas)</option>
            </select>
          </label>
          <label className="form-fila as400-fila-form">
            <span className="form-etiqueta">Tamaño</span>
            <select
              className="form-entrada"
              value={String(ancho)}
              onChange={(e) => {
                setAncho(e.target.value === 'auto' ? 'auto' : (Number(e.target.value) as 80 | 132));
                setResultado(null);
              }}
            >
              <option value="auto">Automático (80 si caben los campos)</option>
              <option value="80">80 columnas</option>
              <option value="132">132 columnas</option>
            </select>
          </label>
          <label className="form-fila as400-fila-form">
            <span className="form-etiqueta">Título de pantalla</span>
            <input type="text" className="form-entrada" maxLength={40} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </label>
          <label className="form-fila as400-fila-form">
            <span className="form-etiqueta">Autor</span>
            <input type="text" className="form-entrada" maxLength={30} value={autor} onChange={(e) => setAutor(e.target.value)} />
          </label>
          <label className="form-fila as400-fila-form">
            <span className="form-etiqueta">Biblioteca de la tabla</span>
            <input
              type="text"
              className="form-entrada"
              maxLength={10}
              placeholder="Opcional: si no, se usa la lista de bibliotecas"
              value={bibliotecaTabla}
              onChange={(e) => setBibliotecaTabla(e.target.value)}
            />
          </label>
        </div>

        {/* --- Campos: qué se muestra y cómo --- */}
        <div role="tabpanel" aria-label="Campos" hidden={pestana !== 'campos'}>
          <div className="crud-tabla-scroll">
            <table className="crud-campos">
              <thead>
                <tr>
                  <th>Campo</th>
                  <th title="Largo y tipo en el archivo">Definición</th>
                  <th>Llave</th>
                  <th title="Se muestra en la lista">Lista</th>
                  <th title="Se edita en el detalle">Detalle</th>
                  <th title="Fecha u hora: se ve con el formato y se guarda según el tipo del campo">Tipo</th>
                  <th>Formato</th>
                  <th>Guardado como</th>
                  <th title="Texto largo: largo de cada fila cuando no cabe en una (CNTFLD). Vacío = automático">Ajuste</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const n = f.info.nombre;
                  const tipo = f.fh?.tipo ?? '';
                  const almacenamientos = f.fh?.tipo === 'fecha' ? f.info.almacenamientosFecha : f.info.almacenamientosHora;
                  return (
                    <tr key={n} className={f.info.soportado ? undefined : 'crud-no-soportado'}>
                      <td title={f.info.soportado ? undefined : 'El CRUD no maneja este campo'}>{n}</td>
                      <td className="crud-definicion">{definicionCampo(f.info)}</td>
                      <td>{f.info.llave ? 'Sí' : ''}</td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${n} en la lista`}
                          checked={f.lista && f.detalle}
                          disabled={!f.detalle}
                          onChange={(e) => cambiarFila(n, { lista: e.target.checked })}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${n} en el detalle`}
                          checked={f.detalle}
                          disabled={!f.info.soportado}
                          onChange={(e) => cambiarFila(n, { detalle: e.target.checked, lista: e.target.checked ? f.lista : false })}
                        />
                      </td>
                      <td>
                        <select
                          className="form-entrada"
                          aria-label={`Tipo de ${n}`}
                          value={tipo}
                          disabled={!f.info.soportado}
                          onChange={(e) => cambiarTipoFechaHora(f, e.target.value)}
                        >
                          {!f.info.esFechaHoraNativa && <option value="">Texto o número</option>}
                          {f.info.almacenamientosFecha.length > 0 && <option value="fecha">Fecha</option>}
                          {f.info.almacenamientosHora.length > 0 && <option value="hora">Hora</option>}
                        </select>
                      </td>
                      <td>
                        {f.fh && (
                          <select
                            className="form-entrada"
                            aria-label={`Formato de ${n}`}
                            value={f.fh.formato}
                            onChange={(e) => cambiarFila(n, { fh: { ...(f.fh as FechaHoraCampo), formato: e.target.value } })}
                          >
                            {(f.fh.tipo === 'fecha' ? FORMATOS_FECHA : FORMATOS_HORA).map((x) => (
                              <option key={x} value={x}>
                                {x}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td>
                        {f.fh && (
                          <select
                            className="form-entrada"
                            aria-label={`Guardado de ${n}`}
                            value={f.fh.almacenamiento}
                            onChange={(e) => cambiarFila(n, { fh: { ...(f.fh as FechaHoraCampo), almacenamiento: e.target.value } })}
                          >
                            {almacenamientos.map((x) => (
                              <option key={x} value={x}>
                                {ETIQUETA_ALMACENAMIENTO[f.fh?.tipo ?? 'fecha'][x]}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          className="form-entrada crud-numero"
                          aria-label={`Ajuste de ${n}`}
                          placeholder="auto"
                          value={f.ajuste}
                          disabled={!f.detalle || !f.info.esTexto || f.fh !== null || f.info.longitud < 2}
                          onChange={(e) => cambiarFila(n, { ajuste: e.target.value })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="tenue">
            Detalle: el campo se edita en la pantalla de alta y modificación. Lista: además se ve como columna del subfile.
          </p>
        </div>

        {/* --- Validaciones al grabar --- */}
        <div role="tabpanel" aria-label="Validaciones" hidden={pestana !== 'validaciones'}>
          {enDetalle.length === 0 ? (
            <p className="tenue">No hay campos en el detalle.</p>
          ) : (
            <div className="crud-tabla-scroll">
              <table className="crud-campos">
                <thead>
                  <tr>
                    <th>Campo</th>
                    <th title="Largo y tipo en el archivo">Definición</th>
                    <th title="Al agregar y al modificar: texto no vacío, número mayor a 0 o distinto de 0, fecha u hora no vacía. Las llaves siempre lo son">
                      Obligatorio
                    </th>
                    <th title="Se revisa si el campo tiene valor: email, rango, valores permitidos o que exista en otra tabla">Validación</th>
                  </tr>
                </thead>
                <tbody>
                  {enDetalle.map((f) => (
                    <tr key={f.info.nombre}>
                      <td>{f.info.nombre}</td>
                      <td className="crud-definicion">{definicionCampo(f.info)}</td>
                      <td>{celdaRequerido(f)}</td>
                      <td>{celdaRegla(f)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="tenue">
            Al grabar, el programa revisa lo obligatorio y las validaciones; los campos con error se marcan en video inverso y
            el cursor queda en el primero. Las llaves siempre son obligatorias (las numéricas, mayores a 0).
          </p>
        </div>

        {/* --- Ayudas (F4) y valores de los campos que no se muestran --- */}
        <div role="tabpanel" aria-label="Ayudas y valores" hidden={pestana !== 'ayudas'}>
          <div className="crud-tabla-scroll">
            <table className="crud-campos">
              <thead>
                <tr>
                  <th>Campo</th>
                  <th title="Largo y tipo en el archivo">Definición</th>
                  <th title="Ayuda de campo (F4): párrafo que se genera, por ejemplo AYUDA-GENERO">Ayuda (párrafo)</th>
                  <th title="Programa de ayuda que llama ese párrafo; recibe y devuelve código y descripción">Ayuda (programa)</th>
                  <th title="Si no está en el detalle: valor al agregar un registro">Al agregar</th>
                  <th title="Si no está en el detalle: valor al modificar un registro">Al modificar</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const n = f.info.nombre;
                  return (
                    <tr key={n} className={f.info.soportado ? undefined : 'crud-no-soportado'}>
                      <td>{n}</td>
                      <td className="crud-definicion">{definicionCampo(f.info)}</td>
                      <td>
                        <input
                          type="text"
                          className="form-entrada crud-ayuda"
                          aria-label={`Párrafo de ayuda de ${n}`}
                          placeholder={`AYUDA-${f.info.nombre.replace(/[^A-Za-z0-9]/g, '')}`}
                          maxLength={30}
                          value={f.ayudaParrafo}
                          disabled={!ayudaPosible(f)}
                          onChange={(e) => cambiarFila(n, { ayudaParrafo: e.target.value.toUpperCase() })}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="form-entrada crud-ayuda"
                          aria-label={`Programa de ayuda de ${n}`}
                          maxLength={10}
                          value={f.ayudaPrograma}
                          disabled={!ayudaPosible(f) || f.ayudaParrafo.trim() === ''}
                          onChange={(e) => cambiarFila(n, { ayudaPrograma: e.target.value.toUpperCase() })}
                        />
                      </td>
                      <td>{celdaAuto(f, 'agregar')}</td>
                      <td>{celdaAuto(f, 'modificar')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="tenue">
            La ayuda (F4) es para los campos del detalle. Los campos fuera del detalle no se muestran: al agregar toman el valor
            por defecto de la tabla, o el que indique aquí (fecha, hora, usuario o un valor fijo).
          </p>
        </div>

        {/* --- Teclas de función --- */}
        <div role="tabpanel" aria-label="Teclas" hidden={pestana !== 'teclas'}>
          <table className="crud-campos">
            <thead>
              <tr>
                <th>Tecla</th>
                <th>Texto</th>
                <th>Acción</th>
                <th>Dónde</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {teclas.map((t, i) => (
                <tr key={i}>
                  <td>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      className="form-entrada crud-numero"
                      aria-label={`Número de la tecla ${i + 1}`}
                      value={t.numero}
                      onChange={(e) => cambiarTecla(i, { numero: Number(e.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      maxLength={14}
                      className="form-entrada"
                      aria-label={`Texto de la tecla F${t.numero}`}
                      value={t.texto}
                      onChange={(e) => cambiarTecla(i, { texto: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className="form-entrada"
                      aria-label={`Acción de la tecla F${t.numero}`}
                      value={t.accion}
                      onChange={(e) => cambiarTecla(i, { accion: e.target.value as AccionTecla })}
                    >
                      {ACCIONES.map((a) => (
                        <option key={a} value={a}>
                          {NOMBRE_ACCION[a]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="form-entrada"
                      aria-label={`Dónde actúa la tecla F${t.numero}`}
                      value={t.accion === 'personalizada' ? t.donde : 'ambas'}
                      disabled={t.accion !== 'personalizada'}
                      onChange={(e) => cambiarTecla(i, { donde: e.target.value as DondeTecla })}
                    >
                      <option value="ambas">Lista y detalle</option>
                      <option value="lista">Solo la lista</option>
                      <option value="detalle">Solo el detalle</option>
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="boton-icono"
                      aria-label={`Quitar la tecla F${t.numero}`}
                      onClick={() => {
                        setTeclas((ts) => ts.filter((_, j) => j !== i));
                        setResultado(null);
                      }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="form-acciones">
            <button type="button" className="boton-secundario" onClick={agregarTecla}>
              + Tecla
            </button>
            <button
              type="button"
              className="boton-secundario"
              onClick={() => {
                setTeclas(TECLAS_POR_DEFECTO.map((t) => ({ ...t })));
                setResultado(null);
              }}
            >
              Teclas por defecto
            </button>
          </div>
          <p className="tenue">
            Una tecla personalizada deja en el programa un párrafo ACCION-Fnn vacío para que usted escriba lo que debe hacer.
          </p>
        </div>

        {/* --- Resultado --- */}
        <div role="tabpanel" aria-label="Resultado" hidden={pestana !== 'resultado'} className="crud-resultado">
          {resultado && (
            <section className="as400-resultado">
              {resultado.advertencias.length > 0 && (
                <details>
                  <summary>
                    {resultado.advertencias.length} {resultado.advertencias.length === 1 ? 'aviso' : 'avisos'}
                  </summary>
                  <ul className="lista-compacta">
                    {resultado.advertencias.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="pestanas" role="tablist">
                <button type="button" role="tab" aria-selected={vista === 'dds'} className={vista === 'dds' ? 'pestana activa' : 'pestana'} onClick={() => setVista('dds')}>
                  Pantalla (DDS)
                </button>
                <button type="button" role="tab" aria-selected={vista === 'cobol'} className={vista === 'cobol' ? 'pestana activa' : 'pestana'} onClick={() => setVista('cobol')}>
                  Programa (COBOL)
                </button>
                {resultado.ayudas.map((a) => (
                  <button
                    key={a.programa}
                    type="button"
                    role="tab"
                    aria-selected={vista === `ayuda:${a.programa}`}
                    className={vista === `ayuda:${a.programa}` ? 'pestana activa' : 'pestana'}
                    onClick={() => setVista(`ayuda:${a.programa}`)}
                  >
                    Ayuda {a.programa}
                  </button>
                ))}
              </div>
              <pre className="as400-listado crud-fuente" aria-label={etiquetaVista}>
                {textoVista}
              </pre>
              <div className="form-acciones">
                <button type="button" onClick={() => void guardarDos()}>
                  {resultado.ayudas.length > 0 ? 'Guardar todo…' : 'Guardar los dos…'}
                </button>
                <button type="button" onClick={() => enviar('pantalla')}>
                  Enviar pantalla…
                </button>
                <button type="button" onClick={() => enviar('programa')}>
                  Enviar programa…
                </button>
                <button type="button" onClick={() => enviar('ambos')}>
                  Enviar los dos…
                </button>
                <button
                  type="button"
                  className="boton-secundario"
                  onClick={() => void guardarUno(resultado.dds, `${resultado.plan.opciones.nombrePantalla}.dspf`)}
                >
                  Guardar pantalla…
                </button>
                <button
                  type="button"
                  className="boton-secundario"
                  onClick={() => void guardarUno(cobolVigente, `${resultado.plan.opciones.nombrePrograma}.sqlcbl`)}
                >
                  Guardar programa…
                </button>
                <button type="button" className="boton-secundario" onClick={abrirEnEditor}>
                  Abrir pantalla en el editor
                </button>
              </div>
              {aviso && <p className="tenue">{aviso}</p>}
            </section>
          )}
        </div>
      </div>

      {error && (
        <p className="form-error as400-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-acciones crud-pie">
        <button type="submit" disabled={noEsFisico || inicial.error !== null}>
          {resultado ? 'Generar de nuevo' : 'Generar'}
        </button>
        <button type="button" className="boton-secundario" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    </form>
  );
}
