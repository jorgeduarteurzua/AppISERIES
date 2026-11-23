import { Client, FTPError } from 'basic-ftp';
import { Readable, Writable } from 'node:stream';
import type { Credenciales } from './configuracion';

export interface RespuestaFtp {
  codigo: number;
  mensaje: string;
}

/** Sesión FTP abierta contra el AS400. Lo que usa el servicio de envío. */
export interface SesionFtp {
  /** Envía un comando FTP. Un error del servidor (4xx/5xx) se devuelve, no se lanza. */
  enviar(comando: string): Promise<RespuestaFtp>;
  /** Sube texto en modo ASCII (el AS400 lo convierte a EBCDIC). Lanza si falla. */
  subir(contenido: Buffer, rutaRemota: string): Promise<void>;
  /** Baja un archivo en modo ASCII. Lanza si falla. */
  descargar(rutaRemota: string): Promise<Buffer>;
  /**
   * Ejecuta NLST o LIST y devuelve el texto tal cual llega por la conexión de
   * datos, sin interpretarlo. Lanza si el servidor responde con un error.
   */
  listar(comando: string): Promise<string>;
  cerrar(): void;
}

export type AbrirSesion = (credenciales: Credenciales) => Promise<SesionFtp>;

const TIEMPO_MAXIMO_MS = 30_000;

/** Sesión real con la librería basic-ftp. */
export const abrirSesionBasicFtp: AbrirSesion = async (cred) => {
  const cliente = new Client(TIEMPO_MAXIMO_MS);
  try {
    await cliente.access({
      host: cred.host,
      port: cred.puerto,
      user: cred.usuario,
      password: cred.password,
      secure: cred.seguro,
    });
  } catch (error) {
    cliente.close();
    throw error;
  }

  const enviar = async (comando: string): Promise<RespuestaFtp> => {
    try {
      const r = await cliente.send(comando);
      return { codigo: r.code, mensaje: r.message };
    } catch (error) {
      if (error instanceof FTPError) return { codigo: error.code, mensaje: error.message };
      throw error;
    }
  };

  return {
    enviar,
    async subir(contenido, rutaRemota) {
      // `access` deja el modo binario; el fuente se sube en ASCII.
      await cliente.send('TYPE A');
      await cliente.uploadFrom(Readable.from([contenido]), rutaRemota);
    },
    async descargar(rutaRemota) {
      await cliente.send('TYPE A');
      const trozos: Buffer[] = [];
      const destino = new Writable({
        write(trozo: Buffer, _codificacion, listo) {
          trozos.push(Buffer.from(trozo));
          listo();
        },
      });
      await cliente.downloadTo(destino, rutaRemota);
      return Buffer.concat(trozos);
    },
    async listar(comando) {
      if (!/^(NLST|LIST)(\s|$)/.test(comando)) throw new Error('Solo se pueden listar con NLST o LIST.');
      // La respuesta del AS400 no tiene el formato que espera el intérprete de listas
      // de la librería: se pide el texto crudo y se interpreta en `miembros.ts`.
      let crudo = '';
      cliente.parseList = (texto: string) => {
        crudo = texto;
        return [];
      };
      await cliente.prepareTransfer(cliente.ftp);
      await (cliente as unknown as { _requestListWithCommand(c: string): Promise<unknown> })._requestListWithCommand(comando);
      return crudo;
    },
    cerrar() {
      cliente.close();
    },
  };
};
