import { contextBridge, ipcRenderer } from 'electron';
import type { DestinoGuardado, EntradaConexion, PasoEnvio, PeticionEnvio, ResultadoEnvio } from '../../src/core/as400/tipos';
import type { PeticionTraer, ResultadoListado, ResultadoTraer } from '../../src/core/as400/miembros';
import type { RespuestaConexion } from '../main/as400/ipc';

/**
 * Puente seguro entre el renderer (React) y el proceso principal.
 * Solo se exponen funciones concretas, nunca ipcRenderer completo.
 */
const api = {
  abrirCarpeta: (): Promise<string | null> =>
    ipcRenderer.invoke('dialogo:abrirCarpeta'),

  abrirArchivos: (): Promise<string[] | null> =>
    ipcRenderer.invoke('dialogo:abrirArchivos'),

  listarCarpeta: (
    ruta: string,
  ): Promise<Array<{ nombre: string; ruta: string }>> =>
    ipcRenderer.invoke('fs:listarCarpeta', ruta),

  leerFuente: (ruta: string, codificacion?: string): Promise<string> =>
    ipcRenderer.invoke('fs:leerFuente', ruta, codificacion),

  /** Vigila una carpeta ya listada; los cambios llegan por alCambiarCarpeta. */
  vigilarCarpeta: (ruta: string): Promise<boolean> => ipcRenderer.invoke('fs:vigilarCarpeta', ruta),

  /** Avisa cuando cambia un archivo de una carpeta vigilada. Devuelve la función para dejar de escuchar. */
  alCambiarCarpeta: (cb: (ruta: string) => void): (() => void) => {
    const oyente = (_e: unknown, ruta: string) => cb(ruta);
    ipcRenderer.on('fs:carpetaCambio', oyente);
    return () => ipcRenderer.removeListener('fs:carpetaCambio', oyente);
  },

  /** Versión de la aplicación. */
  version: (): Promise<string> => ipcRenderer.invoke('app:version'),

  /** Abre en el navegador un enlace del menú Ayuda (el proceso principal solo abre los conocidos). */
  abrirEnlace: (url: string): Promise<void> => ipcRenderer.invoke('app:abrirEnlace', url),

  /** Opciones del menú Ayuda que abren un diálogo. Devuelve la función para dejar de escuchar. */
  alAyuda: (cb: (seccion: 'acerca' | 'autor' | 'referencias') => void): (() => void) => {
    const oyente = (_e: unknown, s: 'acerca' | 'autor' | 'referencias') => cb(s);
    ipcRenderer.on('menu:ayuda', oyente);
    return () => ipcRenderer.removeListener('menu:ayuda', oyente);
  },

  /** Avisa al proceso principal si hay cambios sin guardar (para preguntar al cerrar). */
  notificarModificado: (modificado: boolean): void =>
    ipcRenderer.send('estado:modificado', modificado),

  /**
   * Sobrescribe un fuente ya abierto («Guardar»). Rechaza rutas que no se
   * abrieron desde la aplicación. Devuelve la ruta de la copia `.bak` si se creó.
   */
  escribirFuente: (ruta: string, texto: string, codificacion?: string): Promise<string | null> =>
    ipcRenderer.invoke('fs:escribirFuente', ruta, texto, codificacion),

  /** Conexión al AS400 (FTP). La contraseña entra pero nunca vuelve. */
  as400: {
    leer: (): Promise<RespuestaConexion> => ipcRenderer.invoke('as400:leer'),
    guardar: (entrada: EntradaConexion): Promise<RespuestaConexion> => ipcRenderer.invoke('as400:guardar', entrada),
    olvidarPassword: (): Promise<RespuestaConexion> => ipcRenderer.invoke('as400:olvidarPassword'),
    guardarDestino: (destino: DestinoGuardado): Promise<RespuestaConexion> =>
      ipcRenderer.invoke('as400:guardarDestino', destino),
    probar: (): Promise<PasoEnvio[]> => ipcRenderer.invoke('as400:probar'),
    listarMiembros: (biblioteca: string, archivoFuente: string): Promise<ResultadoListado> =>
      ipcRenderer.invoke('as400:listarMiembros', biblioteca, archivoFuente),
    /** Trae los miembros a una carpeta que se elige en un diálogo. */
    traer: (peticion: PeticionTraer): Promise<ResultadoTraer> => ipcRenderer.invoke('as400:traer', peticion),
    enviar: (peticion: PeticionEnvio): Promise<ResultadoEnvio> => ipcRenderer.invoke('as400:enviar', peticion),
  },

  /**
   * Guarda varios fuentes en una carpeta que se elige en un diálogo. Devuelve la
   * carpeta y las rutas escritas, o null si se cancela.
   */
  guardarEnCarpeta: (
    archivos: Array<{ nombre: string; texto: string }>,
    carpetaSugerida?: string,
  ): Promise<{ carpeta: string; rutas: string[]; copias: string[] } | null> =>
    ipcRenderer.invoke('fs:guardarEnCarpeta', archivos, carpetaSugerida),

  /** Devuelve la ruta guardada, o null si se cancela el diálogo. */
  guardarFuente: (
    texto: string,
    nombreSugerido: string,
    codificacion?: string,
  ): Promise<string | null> =>
    ipcRenderer.invoke('fs:guardarFuente', texto, nombreSugerido, codificacion),
};

contextBridge.exposeInMainWorld('api', api);

export type ApiPuente = typeof api;
