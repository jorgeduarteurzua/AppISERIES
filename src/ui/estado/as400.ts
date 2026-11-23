import { create } from 'zustand';
import type { ConexionPublica, ResultadoEnvio, TipoFuente } from '@core/as400/tipos';

/** Un fuente que se puede enviar al AS400. */
export interface FuenteEnvio {
  clave: string;
  /** Texto corto para la lista: «Pantalla», «Programa». */
  etiqueta: string;
  tipo: TipoFuente;
  miembro: string;
  texto: string;
  descripcion: string;
  /** Si hay varios, el usuario puede elegir (p.ej. COBOL OPM o ILE). */
  tiposPermitidos?: TipoFuente[];
  /** Viene marcado para enviarse. */
  incluido: boolean;
  /** Recibe el resultado del envío (por ejemplo, el editor de programas toma el listado). */
  alTerminar?: (r: ResultadoEnvio) => void;
}

interface EstadoAs400 {
  conexion: ConexionPublica | null;
  errorConexion: string | null;
  conexionAbierta: boolean;
  /** Fuentes del diálogo de envío; null = diálogo cerrado. */
  envio: FuenteEnvio[] | null;
  /** Diálogo para traer fuentes del AS400; null = cerrado. */
  traer: { archivoSugerido: string } | null;
  cargar: () => Promise<void>;
  establecerConexion: (c: ConexionPublica) => void;
  abrirConexion: () => void;
  cerrarConexion: () => void;
  abrirEnvio: (fuentes: FuenteEnvio[]) => void;
  cerrarEnvio: () => void;
  abrirTraer: (archivoSugerido: string) => void;
  cerrarTraer: () => void;
}

export const useAs400 = create<EstadoAs400>((set) => ({
  conexion: null,
  errorConexion: null,
  conexionAbierta: false,
  envio: null,
  traer: null,
  cargar: async () => {
    try {
      const r = await window.api.as400.leer();
      set({ conexion: r.conexion, errorConexion: r.error });
    } catch (e) {
      set({ errorConexion: e instanceof Error ? e.message : String(e) });
    }
  },
  establecerConexion: (conexion) => set({ conexion, errorConexion: null }),
  abrirConexion: () => set({ conexionAbierta: true }),
  cerrarConexion: () => set({ conexionAbierta: false }),
  abrirEnvio: (fuentes) => set({ envio: fuentes }),
  cerrarEnvio: () => set({ envio: null }),
  abrirTraer: (archivoSugerido) => set({ traer: { archivoSugerido } }),
  cerrarTraer: () => set({ traer: null }),
}));

/** Hay servidor y usuario configurados, y una contraseña. */
export function conexionLista(c: ConexionPublica | null): boolean {
  return c !== null && c.host !== '' && c.usuario !== '' && c.tienePassword;
}
