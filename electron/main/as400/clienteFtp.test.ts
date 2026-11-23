import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { abrirSesionBasicFtp } from './clienteFtp';
import type { Credenciales } from './configuracion';

/**
 * Servidor FTP mínimo para probar el cliente real (basic-ftp) por socket:
 * registra los comandos y el modo (TYPE) vigente al subir o bajar.
 */
interface ServidorFalso {
  puerto: number;
  comandos: string[];
  tipoAlTransferir: string[];
  subido: Buffer[];
  contenidoParaBajar: Buffer;
  rechazarClave: boolean;
  cerrar(): Promise<void>;
}

async function crearServidor(): Promise<ServidorFalso> {
  const estado = {
    comandos: [] as string[],
    tipoAlTransferir: [] as string[],
    subido: [] as Buffer[],
    contenidoParaBajar: Buffer.from('LISTADO\r\n') as Buffer,
    rechazarClave: false,
  };
  const sockets = new Set<net.Socket>();
  const servidoresDatos = new Set<net.Server>();

  const servidor = net.createServer((ctl) => {
    sockets.add(ctl);
    let tipo = 'A';
    let pendiente: Promise<net.Socket> | null = null;
    let cola: Promise<void> = Promise.resolve();
    let resto = '';
    const responder = (codigo: number, mensaje: string): void => {
      ctl.write(`${codigo} ${mensaje}\r\n`);
    };

    const abrirDatos = async (): Promise<number> => {
      const datos = net.createServer();
      servidoresDatos.add(datos);
      pendiente = new Promise<net.Socket>((resolver) => {
        datos.once('connection', (s) => {
          sockets.add(s);
          resolver(s);
        });
      });
      await new Promise<void>((ok) => datos.listen(0, '127.0.0.1', ok));
      return (datos.address() as net.AddressInfo).port;
    };

    const atender = async (linea: string): Promise<void> => {
      estado.comandos.push(linea);
      const [orden, ...args] = linea.split(' ');
      const argumento = args.join(' ');
      switch (orden.toUpperCase()) {
        case 'USER':
          return responder(331, 'Clave');
        case 'PASS':
          return estado.rechazarClave ? responder(530, 'Login incorrect') : responder(230, 'Conectado');
        case 'TYPE':
          tipo = argumento;
          return responder(200, `Tipo ${argumento}`);
        case 'STRU':
        case 'OPTS':
        case 'SITE':
          return responder(200, 'ok');
        case 'SYST':
          return responder(215, 'OS/400 is the remote operating system');
        case 'RCMD':
          return argumento.includes('FALLA') ? responder(550, 'CPF9801 fallo') : responder(250, 'Comando correcto');
        case 'PWD':
          return responder(257, '"/" es el directorio actual');
        case 'EPSV': {
          const puerto = await abrirDatos();
          return responder(229, `Entering Extended Passive Mode (|||${puerto}|)`);
        }
        case 'PASV': {
          const puerto = await abrirDatos();
          return responder(227, `Entering Passive Mode (127,0,0,1,${puerto >> 8},${puerto & 255})`);
        }
        case 'STOR': {
          estado.tipoAlTransferir.push(`STOR ${argumento} en ${tipo}`);
          responder(150, 'Subiendo');
          const socket = await (pendiente as Promise<net.Socket>);
          const trozos: Buffer[] = [];
          await new Promise<void>((ok) => {
            socket.on('data', (t) => trozos.push(t));
            socket.on('end', () => ok());
            socket.on('close', () => ok());
          });
          estado.subido.push(Buffer.concat(trozos));
          return responder(226, 'Transferencia completa');
        }
        case 'RETR': {
          estado.tipoAlTransferir.push(`RETR ${argumento} en ${tipo}`);
          responder(150, 'Bajando');
          const socket = await (pendiente as Promise<net.Socket>);
          await new Promise<void>((ok) => socket.end(estado.contenidoParaBajar, () => ok()));
          return responder(226, 'Transferencia completa');
        }
        case 'NLST':
        case 'LIST': {
          if (argumento.includes('NOEXISTE')) return responder(550, 'File not found.');
          responder(150, 'Lista');
          const socket = await (pendiente as Promise<net.Socket>);
          const texto = orden.toUpperCase() === 'NLST' ? 'ANCALCIO.MBR\r\nPGMREF.MBR\r\n' : '-rwx---rwx   1 PRSIAS   0          99552 Jun 25 2025  PGMREF.MBR\r\n';
          await new Promise<void>((ok) => socket.end(texto, () => ok()));
          return responder(226, 'Transferencia completa');
        }
        case 'QUIT':
          responder(221, 'Adiós');
          return void ctl.end();
        default:
          return responder(500, 'Comando desconocido');
      }
    };

    ctl.on('data', (trozo) => {
      resto += trozo.toString('latin1');
      const lineas = resto.split('\r\n');
      resto = lineas.pop() ?? '';
      for (const linea of lineas) cola = cola.then(() => atender(linea));
    });
    ctl.on('error', () => undefined);
    ctl.on('close', () => sockets.delete(ctl));
    responder(220, 'Servidor de prueba');
  });

  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  const puerto = (servidor.address() as net.AddressInfo).port;

  return {
    puerto,
    comandos: estado.comandos,
    tipoAlTransferir: estado.tipoAlTransferir,
    subido: estado.subido,
    get contenidoParaBajar() {
      return estado.contenidoParaBajar;
    },
    set contenidoParaBajar(v: Buffer) {
      estado.contenidoParaBajar = v;
    },
    get rechazarClave() {
      return estado.rechazarClave;
    },
    set rechazarClave(v: boolean) {
      estado.rechazarClave = v;
    },
    async cerrar() {
      sockets.forEach((s) => s.destroy());
      servidoresDatos.forEach((s) => s.close());
      await new Promise<void>((ok) => servidor.close(() => ok()));
    },
  };
}

let servidor: ServidorFalso | null = null;
afterEach(async () => {
  await servidor?.cerrar();
  servidor = null;
});

function credenciales(puerto: number): Credenciales {
  return { host: '127.0.0.1', puerto, usuario: 'JDUARTE', password: 'secreta', seguro: false };
}

describe('abrirSesionBasicFtp (servidor FTP de prueba)', () => {
  it('conecta, envía comandos y devuelve los errores del servidor sin lanzar', async () => {
    servidor = await crearServidor();
    const sesion = await abrirSesionBasicFtp(credenciales(servidor.puerto));
    try {
      expect(await sesion.enviar('SITE NAMEFMT 1')).toMatchObject({ codigo: 200 });
      expect(await sesion.enviar('RCMD CRTDSPF FILE(A/B)')).toMatchObject({ codigo: 250 });
      expect(await sesion.enviar('RCMD FALLA')).toMatchObject({ codigo: 550 });
      expect(servidor.comandos).toContain('USER JDUARTE');
    } finally {
      sesion.cerrar();
    }
  });

  it('sube el fuente en modo ASCII (TYPE A) a la ruta del miembro', async () => {
    servidor = await crearServidor();
    const sesion = await abrirSesionBasicFtp(credenciales(servidor.puerto));
    try {
      const contenido = Buffer.from('     A          R REG1\r\n', 'latin1');
      await sesion.subir(contenido, '/QSYS.LIB/MIBIB.LIB/QDSPSRC.FILE/CLIENTED.MBR');
      expect(servidor.tipoAlTransferir).toEqual(['STOR /QSYS.LIB/MIBIB.LIB/QDSPSRC.FILE/CLIENTED.MBR en A']);
      expect(servidor.subido[0].equals(contenido)).toBe(true);
    } finally {
      sesion.cerrar();
    }
  });

  it('baja un archivo en modo ASCII', async () => {
    servidor = await crearServidor();
    servidor.contenidoParaBajar = Buffer.from('ERROR SQL0204\r\n', 'latin1');
    const sesion = await abrirSesionBasicFtp(credenciales(servidor.puerto));
    try {
      const bytes = await sesion.descargar('/QSYS.LIB/QTEMP.LIB/APPLISTADO.FILE/APPLISTADO.MBR');
      expect(bytes.toString('latin1')).toBe('ERROR SQL0204\r\n');
      expect(servidor.tipoAlTransferir[0]).toMatch(/^RETR .* en A$/);
    } finally {
      sesion.cerrar();
    }
  });

  it('lista con NLST y LIST y devuelve el texto tal cual, sin interpretarlo', async () => {
    servidor = await crearServidor();
    const sesion = await abrirSesionBasicFtp(credenciales(servidor.puerto));
    try {
      expect(await sesion.listar('NLST')).toBe('ANCALCIO.MBR\r\nPGMREF.MBR\r\n');
      expect(await sesion.listar('LIST')).toContain('PGMREF.MBR');
      expect(servidor.comandos).toEqual(expect.arrayContaining(['NLST', 'LIST']));
    } finally {
      sesion.cerrar();
    }
  });

  it('un error del servidor al listar se lanza, y solo se permiten NLST y LIST', async () => {
    servidor = await crearServidor();
    const sesion = await abrirSesionBasicFtp(credenciales(servidor.puerto));
    try {
      await expect(sesion.listar('NLST /QSYS.LIB/NOEXISTE.LIB')).rejects.toThrow(/550/);
      await expect(sesion.listar('DELE x')).rejects.toThrow(/NLST o LIST/);
    } finally {
      sesion.cerrar();
    }
  });

  it('rechaza una contraseña incorrecta', async () => {
    servidor = await crearServidor();
    servidor.rechazarClave = true;
    await expect(abrirSesionBasicFtp(credenciales(servidor.puerto))).rejects.toThrow(/530/);
  });
});
