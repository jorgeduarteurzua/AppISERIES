/**
 * Sección Programas: fuentes COBOL, CL (y RPG, solo edición) abiertos desde una carpeta,
 * nuevos o el programa del último CRUD. Guarda el texto tal cual (Windows-1252, como el resto).
 */
import { create } from 'zustand';
import { leerListado } from '@core/as400/listado';
import type { MensajeListado } from '@core/as400/listado';
import { EXTENSIONES_PROGRAMA, infoDeArchivo, infoDeTipo, miembroDeArchivo } from '@core/fuentes/lenguaje';
import type { InfoTipoPrograma } from '@core/fuentes/lenguaje';
import { confirmarDescarte } from './descartar';
import { useConjuntoCrud } from './conjuntoCrud';
import { vigilarCarpeta } from './vigilancia';

const CODIFICACION = 'windows-1252';
const RE_EXTENSIONES = new RegExp(`\\.(${EXTENSIONES_PROGRAMA.join('|')})$`, 'i');

export interface ArchivoPrograma {
  nombre: string;
  ruta: string;
  miembro: string;
  info: InfoTipoPrograma;
}

/** De dónde salió el programa abierto. */
export type OrigenPrograma = 'archivo' | 'nuevo' | 'crud';

interface EstadoProgramas {
  carpeta: string | null;
  archivos: ArchivoPrograma[];
  error: string | null;

  /** Texto del programa abierto; null si no hay ninguno. */
  texto: string | null;
  /** Tipo del miembro (SQLCBL, CLP, ...). */
  info: InfoTipoPrograma | null;
  miembro: string;
  nombreArchivo: string | null;
  /** Archivo del que salió («Guardar» escribe aquí); null si es nuevo o del CRUD. */
  ruta: string | null;
  origen: OrigenPrograma;
  modificado: boolean;

  /** Mensajes de la última compilación y su listado. */
  mensajes: MensajeListado[];
  listado: string | null;
  /** Para que el editor vaya a una línea: cambia el contador en cada pedido. */
  irA: { linea: number; columna: number; n: number } | null;

  abrirCarpeta: () => Promise<void>;
  abrirCarpetaEn: (ruta: string) => Promise<void>;
  cargarArchivo: (a: ArchivoPrograma) => Promise<void>;
  nuevo: (tipo: string, miembro: string) => void;
  /** Abre como nuevo (sin guardar) un programa ya generado, por ejemplo desde una pantalla. */
  abrirGenerado: (texto: string, tipo: string, miembro: string) => boolean;
  /** Abre el programa del último CRUD generado (con lo que se haya editado). */
  abrirDelCrud: () => boolean;
  cambiarTexto: (texto: string) => void;
  cambiarTipo: (tipo: string) => void;
  cambiarMiembro: (miembro: string) => void;
  registrarCompilacion: (listado: string | null) => void;
  irALinea: (linea: number, columna?: number) => void;
  marcarGuardado: () => void;
  establecerRuta: (ruta: string) => void;
  limpiarError: () => void;
}

const sinPrograma = {
  texto: null,
  info: null,
  miembro: '',
  nombreArchivo: null,
  ruta: null,
  origen: 'nuevo' as OrigenPrograma,
  modificado: false,
  mensajes: [],
  listado: null,
};

/** Esqueleto de un programa nuevo. */
export function esqueletoPrograma(info: InfoTipoPrograma, miembro: string): string {
  if (info.lenguaje === 'cl') {
    return ['             PGM', '', `/* ${miembro} */`, '', '             ENDPGM', ''].join('\n');
  }
  if (info.lenguaje === 'cobol') {
    return [
      '       IDENTIFICATION DIVISION.',
      `       PROGRAM-ID.  ${miembro}.`,
      '       ENVIRONMENT DIVISION.',
      '       CONFIGURATION SECTION.',
      '       SOURCE-COMPUTER.  IBM-AS400.',
      '       OBJECT-COMPUTER.  IBM-AS400.',
      '       DATA DIVISION.',
      '       WORKING-STORAGE SECTION.',
      '       PROCEDURE DIVISION.',
      '       PRINCIPAL.',
      '           GOBACK.',
      '',
    ].join('\n');
  }
  return '';
}

export const useProgramas = create<EstadoProgramas>((set, get) => ({
  carpeta: null,
  archivos: [],
  error: null,
  ...sinPrograma,
  irA: null,

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
        .filter((e) => RE_EXTENSIONES.test(e.nombre))
        .map((e) => ({ nombre: e.nombre, ruta: e.ruta, miembro: miembroDeArchivo(e.nombre), info: infoDeArchivo(e.nombre)! }))
        .sort((a, b) => a.miembro.localeCompare(b.miembro));
      vigilarCarpeta(ruta);
      set({
        carpeta: ruta,
        archivos,
        error: archivos.length === 0 ? 'La carpeta no tiene programas (COBOL, CL o RPG).' : null,
      });
    } catch (e) {
      set({ error: `No se pudo abrir la carpeta: ${String(e)}` });
    }
  },

  cargarArchivo: async (a) => {
    if (!confirmarDescarte(get().modificado, 'el programa actual')) return;
    try {
      const texto = (await window.api.leerFuente(a.ruta, CODIFICACION)).replace(/\r\n?/g, '\n');
      set({
        ...sinPrograma,
        texto,
        info: a.info,
        miembro: a.miembro,
        nombreArchivo: a.nombre,
        ruta: a.ruta,
        origen: 'archivo',
        error: null,
      });
    } catch (e) {
      set({ error: `No se pudo abrir el programa: ${String(e)}` });
    }
  },

  nuevo: (tipo, miembro) => {
    const info = infoDeTipo(tipo);
    if (!info) return;
    if (!confirmarDescarte(get().modificado, 'el programa actual')) return;
    const nombre = miembro.trim().toUpperCase();
    set({
      ...sinPrograma,
      texto: esqueletoPrograma(info, nombre),
      info,
      miembro: nombre,
      origen: 'nuevo',
      modificado: true,
      error: null,
    });
  },

  abrirGenerado: (texto, tipo, miembro) => {
    const info = infoDeTipo(tipo);
    if (!info) return false;
    if (!confirmarDescarte(get().modificado, 'el programa actual')) return false;
    set({ ...sinPrograma, texto, info, miembro: miembro.trim().toUpperCase(), origen: 'nuevo', modificado: true, error: null });
    return true;
  },

  abrirDelCrud: () => {
    const c = useConjuntoCrud.getState().conjunto;
    if (!c) return false;
    if (!confirmarDescarte(get().modificado, 'el programa actual')) return false;
    set({
      ...sinPrograma,
      texto: c.cobolEditado ?? c.cobol,
      info: infoDeTipo(c.tipoCobol),
      miembro: c.nombrePrograma,
      origen: 'crud',
      error: null,
    });
    return true;
  },

  cambiarTexto: (texto) => {
    const s = get();
    if (s.texto === null || texto === s.texto) return;
    // El programa del CRUD queda guardado con el CRUD (para enviarlo y para la próxima vez).
    if (s.origen === 'crud') useConjuntoCrud.getState().editarCobol(texto);
    set({ texto, modificado: s.origen !== 'crud' });
  },

  cambiarTipo: (tipo) => {
    const info = infoDeTipo(tipo);
    if (info) set({ info });
  },

  cambiarMiembro: (miembro) => set({ miembro: miembro.trim().toUpperCase().slice(0, 10) }),

  registrarCompilacion: (listado) => set({ listado, mensajes: listado ? leerListado(listado) : [] }),

  irALinea: (linea, columna = 1) => set((s) => ({ irA: { linea, columna, n: (s.irA?.n ?? 0) + 1 } })),

  marcarGuardado: () => set({ modificado: false }),
  establecerRuta: (ruta) => {
    const nombre = ruta.replace(/^.*[\\/]/, '');
    set({ ruta, nombreArchivo: nombre, origen: 'archivo' });
  },
  limpiarError: () => set({ error: null }),
}));
