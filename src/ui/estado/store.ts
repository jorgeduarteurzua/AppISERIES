import { create } from 'zustand';
import type { PantallaDSPF, Registro, TamanoPantalla } from '@core/modelo/pantalla';
import { parsearDspf } from '@core/parser/parserDspf';
import { ID_TODOS } from '@core/render/lienzo';
import { asegurarTeclasYAyuda, crearPantalla } from '@core/edicion/operaciones';
import { confirmarDescarte } from './descartar';
import { vigilarCarpeta } from './vigilancia';
import {
  deshacer as deshacerHistorial,
  historialVacio,
  rehacer as rehacerHistorial,
  registrarCambio,
  type Historial,
} from '@core/edicion/historial';

export interface ArchivoFuente {
  nombre: string;
  ruta: string;
}

export type Herramienta = 'texto' | 'campo' | null;

/** Opciones al aplicar un cambio al modelo. */
export interface OpcionesCambio {
  /** Fusiona cambios seguidos con la misma clave en un solo paso de deshacer. */
  clave?: string;
  /** Elemento a seleccionar tras el cambio (null = ninguno; undefined = no tocar). */
  seleccionar?: string | null;
  /** Registro a mostrar tras el cambio. */
  registro?: string;
}

interface EstadoApp {
  // Navegación de fuentes
  carpeta: string | null;
  archivos: ArchivoFuente[];

  // Pantalla actualmente cargada
  pantalla: PantallaDSPF | null;
  nombreArchivoActual: string | null;
  /** Ruta del archivo del que salió la pantalla (null = pantalla nueva sin guardar). «Guardar» escribe aquí. */
  rutaActual: string | null;
  registroSeleccionado: string | null; // id del registro a visualizar
  textoFuente: string | null;
  vista: 'pantalla' | 'dds'; // pestaña activa del área central

  // Edición
  modoEdicion: boolean;
  seleccionElemento: string | null; // id del elemento seleccionado en el registro actual
  herramienta: Herramienta;
  historial: Historial;
  modificado: boolean;

  error: string | null;

  // Acciones
  cambiarVista: (vista: 'pantalla' | 'dds') => void;
  abrirCarpeta: () => Promise<void>;
  /** Abre una carpeta ya conocida (p.ej. donde se acaban de traer fuentes del AS400). */
  abrirCarpetaEn: (ruta: string) => Promise<void>;
  cargarArchivo: (ruta: string, nombre: string) => Promise<void>;
  importarArchivos: () => Promise<void>;
  seleccionarRegistro: (id: string) => void;

  alternarEdicion: () => void;
  seleccionarElemento: (id: string | null) => void;
  elegirHerramienta: (h: Herramienta) => void;
  /** Reemplaza la pantalla por una versión nueva, registrando el cambio en el historial. */
  aplicar: (nueva: PantallaDSPF, opciones?: OpcionesCambio) => void;
  /** Como `aplicar`, pero calcula la versión nueva y captura los errores de las operaciones. */
  modificar: (
    operacion: (p: PantallaDSPF) => PantallaDSPF,
    opciones?: OpcionesCambio,
  ) => void;
  deshacer: () => void;
  rehacer: () => void;
  nuevaPantalla: (nombre: string, tamano?: TamanoPantalla) => void;
  /** Abre una pantalla ya armada (p.ej. la del CRUD) como si fuera nueva, sin archivo. */
  abrirPantallaGenerada: (pantalla: PantallaDSPF, nombre: string) => boolean;
  marcarGuardado: () => void;
  /** Tras «Guardar como…»: el archivo actual pasa a ser el nuevo. */
  establecerRuta: (ruta: string) => void;
  limpiarError: () => void;
}

/** Primer registro que no es subfile (el subfile se muestra a través de su control). */
function registroInicial(p: PantallaDSPF): string {
  return (p.registros.find((r) => r.clase !== 'subfile') ?? p.registros[0])?.id ?? ID_TODOS;
}

/** Busca el registro seleccionado (null si es "Todos" o no existe). */
export function registroDe(
  pantalla: PantallaDSPF | null,
  registroSeleccionado: string | null,
): Registro | null {
  if (!pantalla || registroSeleccionado === null || registroSeleccionado === ID_TODOS) return null;
  return pantalla.registros.find((r) => r.id === registroSeleccionado) ?? null;
}

export const useStore = create<EstadoApp>((set, get) => ({
  carpeta: null,
  archivos: [],
  pantalla: null,
  nombreArchivoActual: null,
  rutaActual: null,
  registroSeleccionado: null,
  textoFuente: null,
  vista: 'pantalla',
  modoEdicion: false,
  seleccionElemento: null,
  herramienta: null,
  historial: historialVacio(),
  modificado: false,
  error: null,

  cambiarVista: (vista) => set({ vista }),

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
      const archivos = entradas
        .filter((e) => /\.(txt|dspf|dds)$/i.test(e.nombre))
        .map((e) => ({ nombre: e.nombre, ruta: e.ruta }));
      set({ carpeta: ruta, archivos, error: null });
      vigilarCarpeta(ruta);
    } catch (e) {
      set({ error: `No se pudo abrir la carpeta: ${String(e)}` });
    }
  },

  cargarArchivo: async (ruta, nombre) => {
    if (!confirmarDescarte(get().modificado)) return;
    try {
      // Las fuentes exportadas vienen en ANSI (Windows-1252): 0xF3 = "ó".
      const texto = await window.api.leerFuente(ruta, 'windows-1252');
      const pantalla = parsearDspf(texto, nombre);
      set({
        pantalla,
        nombreArchivoActual: nombre,
        rutaActual: ruta,
        // Vista inicial: el primer formato que no sea subfile. "Todos" queda
        // como opción en la lista.
        registroSeleccionado: registroInicial(pantalla),
        textoFuente: texto,
        seleccionElemento: null,
        herramienta: null,
        historial: historialVacio(),
        modificado: false,
        error: null,
      });
    } catch (e) {
      set({ error: `No se pudo cargar la fuente: ${String(e)}` });
    }
  },

  importarArchivos: async () => {
    try {
      const rutas = await window.api.abrirArchivos();
      if (!rutas || rutas.length === 0) return;
      const archivos = rutas.map((ruta) => ({
        nombre: ruta.split(/[\\/]/).pop() ?? ruta,
        ruta,
      }));
      set({ archivos, carpeta: null, error: null });
      // Cargar automáticamente el primero.
      await get().cargarArchivo(archivos[0].ruta, archivos[0].nombre);
    } catch (e) {
      set({ error: `No se pudieron importar los archivos: ${String(e)}` });
    }
  },

  seleccionarRegistro: (id) => set({ registroSeleccionado: id, seleccionElemento: null, herramienta: null }),

  alternarEdicion: () => {
    const { modoEdicion, pantalla, registroSeleccionado } = get();
    if (!pantalla) return;
    if (modoEdicion) {
      set({ modoEdicion: false, seleccionElemento: null, herramienta: null });
      return;
    }
    // Al editar se necesita un registro concreto (no la vista "Todos").
    const valido = registroDe(pantalla, registroSeleccionado) !== null;
    set({
      modoEdicion: true,
      vista: 'pantalla',
      registroSeleccionado: valido ? registroSeleccionado : registroInicial(pantalla),
    });
  },

  seleccionarElemento: (id) => set({ seleccionElemento: id }),

  elegirHerramienta: (h) => set({ herramienta: h, seleccionElemento: h ? null : get().seleccionElemento }),

  aplicar: (nueva, opciones = {}) => {
    const { pantalla, historial } = get();
    if (!pantalla) return;
    const cambios: Partial<EstadoApp> = {
      pantalla: nueva,
      historial: registrarCambio(historial, pantalla, opciones.clave, Date.now()),
      modificado: true,
      error: null,
    };
    if (opciones.seleccionar !== undefined) cambios.seleccionElemento = opciones.seleccionar;
    if (opciones.registro !== undefined) cambios.registroSeleccionado = opciones.registro;
    set(cambios);
  },

  modificar: (operacion, opciones) => {
    const { pantalla } = get();
    if (!pantalla) return;
    try {
      get().aplicar(operacion(pantalla), opciones);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  deshacer: () => {
    const { pantalla, historial, registroSeleccionado, seleccionElemento } = get();
    if (!pantalla) return;
    const r = deshacerHistorial(historial, pantalla);
    if (!r) return;
    set(restaurar(r.valor, r.historial, registroSeleccionado, seleccionElemento));
  },

  rehacer: () => {
    const { pantalla, historial, registroSeleccionado, seleccionElemento } = get();
    if (!pantalla) return;
    const r = rehacerHistorial(historial, pantalla);
    if (!r) return;
    set(restaurar(r.valor, r.historial, registroSeleccionado, seleccionElemento));
  },

  nuevaPantalla: (nombre, tamano) => {
    if (!confirmarDescarte(get().modificado)) return;
    // Toda pantalla nueva nace con F1 (ayuda), F3 (salir), F12 (volver), su ayuda AYUDA y el pie PIE.
    const pantalla = asegurarTeclasYAyuda(crearPantalla(nombre, tamano)).pantalla;
    set({
      pantalla,
      nombreArchivoActual: nombre,
      rutaActual: null,
      registroSeleccionado: registroInicial(pantalla),
      textoFuente: null,
      vista: 'pantalla',
      modoEdicion: true,
      seleccionElemento: null,
      herramienta: null,
      historial: historialVacio(),
      modificado: true,
      error: null,
    });
  },

  abrirPantallaGenerada: (pantalla, nombre) => {
    if (!confirmarDescarte(get().modificado)) return false;
    set({
      pantalla,
      nombreArchivoActual: nombre,
      rutaActual: null,
      registroSeleccionado: registroInicial(pantalla),
      textoFuente: null,
      vista: 'pantalla',
      modoEdicion: false,
      seleccionElemento: null,
      herramienta: null,
      historial: historialVacio(),
      modificado: true,
      error: null,
    });
    return true;
  },

  marcarGuardado: () => set({ modificado: false }),

  establecerRuta: (ruta) => set({ rutaActual: ruta, nombreArchivoActual: ruta.split(/[\\/]/).pop() ?? ruta }),

  limpiarError: () => set({ error: null }),
}));

/** Estado tras deshacer/rehacer: conserva registro y selección solo si siguen existiendo. */
function restaurar(
  pantalla: PantallaDSPF,
  historial: Historial,
  registroSeleccionado: string | null,
  seleccionElemento: string | null,
): Partial<EstadoApp> {
  const registro = pantalla.registros.find((r) => r.id === registroSeleccionado);
  const existeElemento = registro?.elementos.some((e) => e.id === seleccionElemento) ?? false;
  return {
    pantalla,
    historial,
    modificado: true,
    registroSeleccionado: registro ? registroSeleccionado : registroInicial(pantalla),
    seleccionElemento: existeElemento ? seleccionElemento : null,
    error: null,
  };
}
