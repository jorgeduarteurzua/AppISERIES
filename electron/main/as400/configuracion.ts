import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DESTINO_VACIO } from '../../../src/core/as400/tipos';
import type { ConexionPublica, DestinoGuardado, EntradaConexion } from '../../../src/core/as400/tipos';
import { esNombreValido, validarConexion } from '../../../src/core/as400/validacion';

/** Cifrado de la contraseña. En la aplicación lo da `safeStorage` de Electron. */
export interface Cifrador {
  disponible(): boolean;
  /** Devuelve el texto cifrado en base64. */
  cifrar(texto: string): string;
  descifrar(base64: string): string;
}

interface ArchivoConfig {
  host: string;
  puerto: number;
  usuario: string;
  seguro: boolean;
  /** Contraseña cifrada, en base64. Nunca en claro. */
  passwordCifrada?: string;
  destino: DestinoGuardado;
}

export interface Credenciales {
  host: string;
  puerto: number;
  usuario: string;
  password: string;
  seguro: boolean;
}

const CONFIG_INICIAL: ArchivoConfig = {
  host: '',
  puerto: 21,
  usuario: '',
  seguro: false,
  destino: DESTINO_VACIO,
};

/**
 * Guarda la conexión al AS400 en un JSON. La contraseña se cifra con el
 * sistema (DPAPI en Windows); si no hay cifrado disponible solo se conserva en
 * memoria durante la sesión, nunca en disco.
 */
export class AlmacenConexion {
  private config: ArchivoConfig = { ...CONFIG_INICIAL, destino: { ...DESTINO_VACIO } };
  private passwordSesion: string | null = null;
  private cargado = false;

  constructor(
    private readonly rutaArchivo: string,
    private readonly cifrador: Cifrador,
  ) {}

  private async cargar(): Promise<void> {
    if (this.cargado) return;
    try {
      const datos = JSON.parse(await readFile(this.rutaArchivo, 'utf-8')) as Partial<ArchivoConfig>;
      this.config = {
        host: typeof datos.host === 'string' ? datos.host : '',
        puerto: Number.isInteger(datos.puerto) ? (datos.puerto as number) : 21,
        usuario: typeof datos.usuario === 'string' ? datos.usuario : '',
        seguro: datos.seguro === true,
        passwordCifrada: typeof datos.passwordCifrada === 'string' ? datos.passwordCifrada : undefined,
        destino: normalizarDestino(datos.destino),
      };
    } catch {
      // Sin archivo o dañado: se parte de cero.
    }
    this.cargado = true;
  }

  private async persistir(): Promise<void> {
    await mkdir(dirname(this.rutaArchivo), { recursive: true });
    await writeFile(this.rutaArchivo, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  async leer(): Promise<ConexionPublica> {
    await this.cargar();
    const c = this.config;
    return {
      host: c.host,
      puerto: c.puerto,
      usuario: c.usuario,
      seguro: c.seguro,
      tienePassword: this.passwordSesion !== null || c.passwordCifrada !== undefined,
      passwordSoloSesion: this.passwordSesion !== null && c.passwordCifrada === undefined,
      cifradoDisponible: this.cifrador.disponible(),
      destino: c.destino,
    };
  }

  /** Guarda los datos de conexión. Lanza un Error con el motivo si no son válidos. */
  async guardar(entrada: EntradaConexion): Promise<ConexionPublica> {
    const errores = validarConexion(entrada);
    if (errores.length > 0) throw new Error(errores.join(' '));
    await this.cargar();
    this.config.host = entrada.host.trim();
    this.config.puerto = entrada.puerto;
    this.config.usuario = entrada.usuario.trim();
    this.config.seguro = entrada.seguro === true;
    if (entrada.password !== undefined && entrada.password !== '') {
      if (this.cifrador.disponible()) {
        this.config.passwordCifrada = this.cifrador.cifrar(entrada.password);
        this.passwordSesion = null;
      } else {
        this.config.passwordCifrada = undefined;
        this.passwordSesion = entrada.password;
      }
    }
    await this.persistir();
    return this.leer();
  }

  /** Borra la contraseña guardada y la de la sesión. */
  async olvidarPassword(): Promise<ConexionPublica> {
    await this.cargar();
    this.config.passwordCifrada = undefined;
    this.passwordSesion = null;
    await this.persistir();
    return this.leer();
  }

  async guardarDestino(destino: unknown): Promise<ConexionPublica> {
    await this.cargar();
    this.config.destino = normalizarDestino(destino);
    await this.persistir();
    return this.leer();
  }

  /** Datos para conectar. Lanza un Error si falta algo. */
  async credenciales(): Promise<Credenciales> {
    await this.cargar();
    const c = this.config;
    if (c.host === '' || c.usuario === '') {
      throw new Error('Falta configurar la conexión al AS400 (servidor y usuario).');
    }
    let password = this.passwordSesion;
    if (password === null && c.passwordCifrada !== undefined) {
      try {
        password = this.cifrador.descifrar(c.passwordCifrada);
      } catch {
        throw new Error('No se pudo leer la contraseña guardada. Escríbela de nuevo.');
      }
    }
    if (password === null) throw new Error('Falta la contraseña del AS400.');
    return { host: c.host, puerto: c.puerto, usuario: c.usuario, password, seguro: c.seguro };
  }
}

/** Deja el destino con la forma esperada, descartando lo que no sea válido. */
export function normalizarDestino(valor: unknown): DestinoGuardado {
  const v = (valor ?? {}) as Partial<DestinoGuardado>;
  const nombre = (x: unknown): string =>
    typeof x === 'string' && esNombreValido(x.trim().toUpperCase()) ? x.trim().toUpperCase() : '';
  const archivos: DestinoGuardado['archivoFuente'] = {};
  if (v.archivoFuente && typeof v.archivoFuente === 'object') {
    for (const [tipo, archivo] of Object.entries(v.archivoFuente)) {
      const n = nombre(archivo);
      if (n !== '') archivos[tipo as keyof typeof archivos] = n;
    }
  }
  return {
    bibliotecaFuente: nombre(v.bibliotecaFuente),
    bibliotecaObjeto: nombre(v.bibliotecaObjeto),
    archivoFuente: archivos,
    bibliotecasExtra: Array.isArray(v.bibliotecasExtra)
      ? v.bibliotecasExtra.map(nombre).filter((n) => n !== '')
      : [],
  };
}
