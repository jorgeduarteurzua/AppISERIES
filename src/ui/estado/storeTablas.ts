import { create } from 'zustand';
import {
  nombreArchivoTabla,
  tipoDeTabla,
  type Tabla,
  type TipoArchivo,
} from '@core/tablas/modelo';
import { parsearTabla } from '@core/tablas/parserTabla';
import { crearTabla } from '@core/tablas/operacionesTabla';
import {
  deshacer as deshacerHistorial,
  historialVacio,
  rehacer as rehacerHistorial,
  registrarCambio,
  type Historial,
} from '@core/edicion/historial';
import { confirmarDescarte } from './descartar';
import { vigilarCarpeta } from './vigilancia';

export interface ArchivoTabla {
  nombre: string;
  ruta: string;
  /** Nombre del archivo de base de datos (sin prefijo de exportación ni extensión). */
  clave: string;
  tipo: TipoArchivo;
}

export type VistaTabla = 'campos' | 'dds' | 'sql';

export interface OpcionesCambioTabla {
  /** Fusiona cambios seguidos con la misma clave en un solo paso de deshacer. */
  clave?: string;
  /** Elemento a seleccionar tras el cambio (null = ninguno; undefined = no tocar). */
  seleccionar?: string | null;
}

interface EstadoTablas {
  carpeta: string | null;
  archivos: ArchivoTabla[];
  /** Todas las tablas de la carpeta, por nombre de archivo: sirve para resolver el físico de un lógico. */
  catalogo: Record<string, Tabla>;

  tabla: Tabla | null;
  nombreArchivoActual: string | null;
  /** Ruta del archivo del que salió la tabla (null = tabla nueva sin guardar). «Guardar» escribe aquí. */
  rutaActual: string | null;
  registroId: string | null;
  /** Id del campo, llave o selección elegidos. */
  seleccion: string | null;
  vista: VistaTabla;
  historial: Historial<Tabla>;
  modificado: boolean;
  /** Biblioteca con la que se califican los nombres en el SQL generado. */
  biblioteca: string;
  error: string | null;

  abrirCarpeta: () => Promise<void>;
  /** Abre una carpeta ya conocida (p.ej. donde se acaban de traer fuentes del AS400). */
  abrirCarpetaEn: (ruta: string) => Promise<void>;
  cargarArchivo: (a: ArchivoTabla) => Promise<void>;
  nuevaTabla: (nombre: string, tipo: TipoArchivo, fisico?: string) => void;
  /** Abre como nueva (sin guardar) una tabla ya armada, por ejemplo un índice del físico. */
  abrirTablaNueva: (tabla: Tabla) => boolean;
  seleccionar: (id: string | null) => void;
  seleccionarRegistro: (id: string) => void;
  cambiarVista: (vista: VistaTabla) => void;
  establecerBiblioteca: (biblioteca: string) => void;
  aplicar: (nueva: Tabla, opciones?: OpcionesCambioTabla) => void;
  modificar: (operacion: (t: Tabla) => Tabla, opciones?: OpcionesCambioTabla) => void;
  deshacer: () => void;
  rehacer: () => void;
  marcarGuardado: () => void;
  /** Tras «Guardar como…»: el archivo actual pasa a ser el nuevo. */
  establecerRuta: (ruta: string) => void;
  limpiarError: () => void;
}

/** Un fuente de pantalla (DSPF) o de otra cosa no es un archivo de base de datos. */
export function pareceArchivoDeBaseDeDatos(t: Tabla): boolean {
  if (t.registros.length === 0) return false;
  if (t.keywords.some((k) => k.nombre === 'DSPSIZ' || k.nombre === 'INDARA')) return false;
  const propias = ['SFL', 'SFLCTL', 'WINDOW', 'OVERLAY'];
  return !t.registros.some((r) => r.keywords.some((k) => propias.includes(k.nombre)));
}

/** Función para buscar otra tabla de la carpeta por su nombre. */
export function resolverDesde(catalogo: Record<string, Tabla>): (nombre: string) => Tabla | null {
  return (nombre) => catalogo[nombre.toUpperCase()] ?? null;
}

const CLAVE_BIBLIOTECA = 'appiseries.tablas.biblioteca';

function bibliotecaGuardada(): string {
  try {
    return typeof localStorage === 'undefined' ? '' : (localStorage.getItem(CLAVE_BIBLIOTECA) ?? '');
  } catch {
    return '';
  }
}

export const useTablas = create<EstadoTablas>((set, get) => ({
  carpeta: null,
  archivos: [],
  catalogo: {},
  tabla: null,
  nombreArchivoActual: null,
  rutaActual: null,
  registroId: null,
  seleccion: null,
  vista: 'campos',
  historial: historialVacio<Tabla>(),
  modificado: false,
  biblioteca: bibliotecaGuardada(),
  error: null,

  abrirCarpeta: async () => {
    try {
      const ruta = await window.api.abrirCarpeta();
      if (ruta) await get().abrirCarpetaEn(ruta);
    } catch (e) {
      set({ error: `No se pudo abrir la carpeta: ${String(e)}` });
    }
  },

  abrirCarpetaEn: async (ruta) => {
    try {
      const entradas = await window.api.listarCarpeta(ruta);
      const catalogo: Record<string, Tabla> = {};
      const archivos: ArchivoTabla[] = [];
      for (const e of entradas.filter((x) => /\.(txt|pf|lf|dds)$/i.test(x.nombre))) {
        try {
          const texto = await window.api.leerFuente(e.ruta, 'windows-1252');
          const t = parsearTabla(texto, e.nombre);
          if (!pareceArchivoDeBaseDeDatos(t)) continue;
          const clave = nombreArchivoTabla(e.nombre);
          catalogo[clave] = t;
          archivos.push({ nombre: e.nombre, ruta: e.ruta, clave, tipo: tipoDeTabla(t) });
        } catch {
          // Un archivo ilegible no impide abrir los demás.
        }
      }
      archivos.sort((a, b) => a.clave.localeCompare(b.clave));
      // La tabla que se está editando manda sobre la del disco (puede tener cambios sin guardar).
      const { tabla, nombreArchivoActual } = get();
      if (tabla) catalogo[nombreArchivoActual ? nombreArchivoTabla(nombreArchivoActual) : tabla.nombre] = tabla;
      vigilarCarpeta(ruta);
      set({
        carpeta: ruta,
        archivos,
        catalogo: { ...get().catalogo, ...catalogo },
        error: archivos.length === 0 ? 'La carpeta no tiene fuentes de archivos (PF/LF).' : null,
      });
    } catch (e) {
      set({ error: `No se pudo abrir la carpeta: ${String(e)}` });
    }
  },

  cargarArchivo: async (a) => {
    if (!confirmarDescarte(get().modificado, 'la tabla actual')) return;
    try {
      // Siempre se lee del disco: así se descartan de verdad los cambios sin guardar.
      const texto = await window.api.leerFuente(a.ruta, 'windows-1252');
      const tabla = parsearTabla(texto, a.nombre);
      set({
        tabla,
        nombreArchivoActual: a.nombre,
        rutaActual: a.ruta,
        registroId: tabla.registros[0]?.id ?? null,
        seleccion: null,
        vista: 'campos',
        historial: historialVacio<Tabla>(),
        modificado: false,
        catalogo: { ...get().catalogo, [a.clave]: tabla },
        error: null,
      });
    } catch (e) {
      set({ error: `No se pudo cargar la fuente: ${String(e)}` });
    }
  },

  nuevaTabla: (nombre, tipo, fisico) => {
    if (!confirmarDescarte(get().modificado, 'la tabla actual')) return;
    const tabla = crearTabla(nombre, tipo, fisico);
    set({
      tabla,
      nombreArchivoActual: null,
      rutaActual: null,
      registroId: tabla.registros[0].id,
      seleccion: null,
      vista: 'campos',
      historial: historialVacio<Tabla>(),
      modificado: true,
      catalogo: { ...get().catalogo, [tabla.nombre]: tabla },
      error: null,
    });
  },

  abrirTablaNueva: (tabla) => {
    if (!confirmarDescarte(get().modificado, 'la tabla actual')) return false;
    set({
      tabla,
      nombreArchivoActual: null,
      rutaActual: null,
      registroId: tabla.registros[0]?.id ?? null,
      seleccion: null,
      vista: 'campos',
      historial: historialVacio<Tabla>(),
      modificado: true,
      catalogo: { ...get().catalogo, [tabla.nombre]: tabla },
      error: null,
    });
    return true;
  },

  seleccionar: (id) => set({ seleccion: id }),
  seleccionarRegistro: (id) => set({ registroId: id, seleccion: null }),
  cambiarVista: (vista) => set({ vista }),

  establecerBiblioteca: (biblioteca) => {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(CLAVE_BIBLIOTECA, biblioteca);
    } catch {
      // Si no se puede guardar, solo se pierde la comodidad de recordarla.
    }
    set({ biblioteca });
  },

  aplicar: (nueva, opciones = {}) => {
    const { tabla, historial, nombreArchivoActual, catalogo } = get();
    if (!tabla) return;
    const clave = nombreArchivoActual ? nombreArchivoTabla(nombreArchivoActual) : tabla.nombre;
    const cambios: Partial<EstadoTablas> = {
      tabla: nueva,
      historial: registrarCambio(historial, tabla, opciones.clave, Date.now()),
      modificado: true,
      catalogo: { ...catalogo, [clave]: nueva },
      error: null,
    };
    if (opciones.seleccionar !== undefined) cambios.seleccion = opciones.seleccionar;
    set(cambios);
  },

  modificar: (operacion, opciones) => {
    const { tabla } = get();
    if (!tabla) return;
    try {
      get().aplicar(operacion(tabla), opciones);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  deshacer: () => {
    const { tabla, historial, seleccion } = get();
    if (!tabla) return;
    const r = deshacerHistorial(historial, tabla);
    if (!r) return;
    set(restaurar(r.valor, r.historial, seleccion));
  },

  rehacer: () => {
    const { tabla, historial, seleccion } = get();
    if (!tabla) return;
    const r = rehacerHistorial(historial, tabla);
    if (!r) return;
    set(restaurar(r.valor, r.historial, seleccion));
  },

  marcarGuardado: () => set({ modificado: false }),
  establecerRuta: (ruta) =>
    set({ rutaActual: ruta, nombreArchivoActual: ruta.split(/[\\/]/).pop() ?? ruta }),
  limpiarError: () => set({ error: null }),
}));

/** Estado tras deshacer/rehacer: conserva el registro y la selección solo si siguen existiendo. */
function restaurar(tabla: Tabla, historial: Historial<Tabla>, seleccion: string | null): Partial<EstadoTablas> {
  const estado = useTablas.getState();
  const registroId = tabla.registros.some((r) => r.id === estado.registroId)
    ? estado.registroId
    : (tabla.registros[0]?.id ?? null);
  const existe = tabla.registros.some((r) => r.elementos.some((e) => e.id === seleccion));
  const clave = estado.nombreArchivoActual ? nombreArchivoTabla(estado.nombreArchivoActual) : tabla.nombre;
  return {
    tabla,
    historial,
    modificado: true,
    registroId,
    seleccion: existe ? seleccion : null,
    catalogo: { ...estado.catalogo, [clave]: tabla },
    error: null,
  };
}
