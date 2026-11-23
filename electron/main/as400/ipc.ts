import type { ConexionPublica, EntradaConexion, PasoEnvio, PeticionEnvio, ResultadoEnvio } from '../../../src/core/as400/tipos';
import type { AbrirSesion } from './clienteFtp';
import type { AlmacenConexion } from './configuracion';
import type { PeticionTraer, ResultadoListado, ResultadoTraer } from '../../../src/core/as400/miembros';
import { ejecutarEnvio, listarMiembros, probarConexion, traerMiembros } from './servicio';
import type { DestinoLocal } from './servicio';

/** Lo que el proceso principal aporta para guardar en el equipo (diálogo de carpeta y escritura). */
export interface ApoyoLocal {
  /** Pide una carpeta. null si se cancela. */
  elegirCarpeta(): Promise<string | null>;
  /** Destino para escribir dentro de esa carpeta. */
  destino(carpeta: string): DestinoLocal;
}

/** Respuesta de las operaciones sobre la conexión guardada. */
export interface RespuestaConexion {
  conexion: ConexionPublica | null;
  error: string | null;
}

/** Lo mínimo que se usa de `ipcMain`, para poder probar el cableado sin Electron. */
export interface RegistroIpc {
  handle(canal: string, funcion: (evento: unknown, ...args: unknown[]) => unknown): void;
}

function mensaje(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resultadoConError(nombre: string, error: unknown): ResultadoEnvio {
  return { ok: false, pasos: [{ nombre, ok: false, mensaje: mensaje(error) }], listado: null, rutaMiembro: '' };
}

/**
 * Canales de la conexión al AS400. La contraseña entra por `as400:guardar` y
 * no vuelve nunca a la interfaz: solo se informa si hay una guardada.
 */
export function registrarIpcAs400(
  ipc: RegistroIpc,
  almacen: AlmacenConexion,
  abrir: AbrirSesion,
  local?: ApoyoLocal,
): void {
  // Solo una operación contra el AS400 a la vez.
  let ocupado = false;
  async function exclusivo<T>(ocupadoSalida: T, trabajo: () => Promise<T>): Promise<T> {
    if (ocupado) return ocupadoSalida;
    ocupado = true;
    try {
      return await trabajo();
    } finally {
      ocupado = false;
    }
  }

  const conexion = async (accion: () => Promise<ConexionPublica>): Promise<RespuestaConexion> => {
    try {
      return { conexion: await accion(), error: null };
    } catch (error) {
      return { conexion: null, error: mensaje(error) };
    }
  };

  ipc.handle('as400:leer', () => conexion(() => almacen.leer()));

  ipc.handle('as400:guardar', (_e, entrada) => {
    const e = entrada as EntradaConexion;
    if (!e || typeof e !== 'object') return { conexion: null, error: 'Datos no válidos.' };
    return conexion(() =>
      almacen.guardar({
        host: String(e.host ?? ''),
        puerto: Number(e.puerto),
        usuario: String(e.usuario ?? ''),
        seguro: e.seguro === true,
        password: typeof e.password === 'string' ? e.password : undefined,
      }),
    );
  });

  ipc.handle('as400:olvidarPassword', () => conexion(() => almacen.olvidarPassword()));

  ipc.handle('as400:guardarDestino', (_e, destino) => conexion(() => almacen.guardarDestino(destino)));

  ipc.handle('as400:probar', () =>
    exclusivo(
      [{ nombre: 'Conexión', ok: false, mensaje: 'Hay otra operación en curso.' }] as PasoEnvio[],
      async () => {
        try {
          return await probarConexion(abrir, await almacen.credenciales());
        } catch (error) {
          return [{ nombre: 'Conexión', ok: false, mensaje: mensaje(error) }];
        }
      },
    ),
  );

  const listadoConError = (nombre: string, error: unknown): ResultadoListado => ({
    ok: false,
    miembros: [],
    pasos: [{ nombre, ok: false, mensaje: mensaje(error) }],
  });

  ipc.handle('as400:listarMiembros', (_e, biblioteca, archivoFuente) =>
    exclusivo(listadoConError('Listado', 'Hay otra operación en curso.'), async () => {
      try {
        return await listarMiembros(abrir, await almacen.credenciales(), String(biblioteca ?? ''), String(archivoFuente ?? ''));
      } catch (error) {
        return listadoConError('Listado', error);
      }
    }),
  );

  const traerConError = (error: unknown): ResultadoTraer => ({
    carpeta: null,
    ok: false,
    pasos: [{ nombre: 'Traer', ok: false, mensaje: mensaje(error) }],
    resultados: [],
  });

  ipc.handle('as400:traer', (_e, peticion) =>
    exclusivo(traerConError('Hay otra operación en curso.'), async () => {
      try {
        if (!local) throw new Error('No se puede guardar en el equipo.');
        const p = peticion as PeticionTraer;
        if (!p || typeof p !== 'object' || !Array.isArray(p.miembros)) throw new Error('Datos no válidos.');
        const credenciales = await almacen.credenciales();
        const carpeta = await local.elegirCarpeta();
        if (carpeta === null) return { carpeta: null, ok: true, pasos: [], resultados: [] };
        return await traerMiembros(
          abrir,
          credenciales,
          {
            biblioteca: String(p.biblioteca ?? ''),
            archivoFuente: String(p.archivoFuente ?? ''),
            miembros: p.miembros.map(String),
            sobrescribir: p.sobrescribir === true,
          },
          local.destino(carpeta),
        );
      } catch (error) {
        return traerConError(error);
      }
    }),
  );

  ipc.handle('as400:enviar', (_e, peticion) =>
    exclusivo(resultadoConError('Envío', 'Hay otra operación en curso.'), async () => {
      try {
        return await ejecutarEnvio(abrir, await almacen.credenciales(), peticion as PeticionEnvio);
      } catch (error) {
        return resultadoConError('Envío', error);
      }
    }),
  );
}
