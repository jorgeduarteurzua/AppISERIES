import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AlmacenConexion } from './configuracion';
import type { Cifrador } from './configuracion';

/** Cifrador de prueba: invierte el texto y lo pasa a base64. */
const cifradorFalso: Cifrador = {
  disponible: () => true,
  cifrar: (t) => Buffer.from([...t].reverse().join('')).toString('base64'),
  descifrar: (b) => [...Buffer.from(b, 'base64').toString()].reverse().join(''),
};
const sinCifrado: Cifrador = { ...cifradorFalso, disponible: () => false };

const conexion = { host: '10.0.0.5', puerto: 21, usuario: 'JDUARTE', seguro: false };

let carpeta = '';
let archivo = '';

beforeEach(async () => {
  carpeta = await mkdtemp(join(tmpdir(), 'as400-cfg-'));
  archivo = join(carpeta, 'sub', 'conexion.json');
});
afterEach(async () => {
  await rm(carpeta, { recursive: true, force: true });
});

describe('AlmacenConexion', () => {
  it('parte vacío', async () => {
    const c = await new AlmacenConexion(archivo, cifradorFalso).leer();
    expect(c.host).toBe('');
    expect(c.puerto).toBe(21);
    expect(c.tienePassword).toBe(false);
    expect(c.cifradoDisponible).toBe(true);
  });

  it('guarda la contraseña cifrada y nunca en claro', async () => {
    const a = new AlmacenConexion(archivo, cifradorFalso);
    const c = await a.guardar({ ...conexion, password: 'Secreta123' });
    expect(c.tienePassword).toBe(true);
    expect(c.passwordSoloSesion).toBe(false);
    expect(JSON.stringify(c)).not.toContain('Secreta123');
    const enDisco = await readFile(archivo, 'utf-8');
    expect(enDisco).not.toContain('Secreta123');
    expect((await a.credenciales()).password).toBe('Secreta123');
  });

  it('la conexión sobrevive a reiniciar la aplicación', async () => {
    await new AlmacenConexion(archivo, cifradorFalso).guardar({ ...conexion, password: 'clave' });
    const nuevo = new AlmacenConexion(archivo, cifradorFalso);
    expect((await nuevo.leer()).usuario).toBe('JDUARTE');
    expect((await nuevo.credenciales()).password).toBe('clave');
  });

  it('cambiar los datos sin escribir contraseña conserva la guardada', async () => {
    const a = new AlmacenConexion(archivo, cifradorFalso);
    await a.guardar({ ...conexion, password: 'clave' });
    await a.guardar({ ...conexion, host: '10.0.0.9' });
    const cred = await a.credenciales();
    expect(cred.host).toBe('10.0.0.9');
    expect(cred.password).toBe('clave');
  });

  it('permite cambiar la contraseña', async () => {
    const a = new AlmacenConexion(archivo, cifradorFalso);
    await a.guardar({ ...conexion, password: 'vieja' });
    await a.guardar({ ...conexion, password: 'nueva' });
    expect((await a.credenciales()).password).toBe('nueva');
  });

  it('permite olvidar la contraseña', async () => {
    const a = new AlmacenConexion(archivo, cifradorFalso);
    await a.guardar({ ...conexion, password: 'clave' });
    const c = await a.olvidarPassword();
    expect(c.tienePassword).toBe(false);
    await expect(a.credenciales()).rejects.toThrow(/contraseña/);
  });

  it('sin cifrado del sistema la contraseña solo vive en memoria', async () => {
    const a = new AlmacenConexion(archivo, sinCifrado);
    const c = await a.guardar({ ...conexion, password: 'clave' });
    expect(c.tienePassword).toBe(true);
    expect(c.passwordSoloSesion).toBe(true);
    expect(await readFile(archivo, 'utf-8')).not.toContain('clave');
    expect((await a.credenciales()).password).toBe('clave');
    // Otra sesión: ya no está.
    expect((await new AlmacenConexion(archivo, sinCifrado).leer()).tienePassword).toBe(false);
  });

  it('rechaza datos no válidos', async () => {
    const a = new AlmacenConexion(archivo, cifradorFalso);
    await expect(a.guardar({ ...conexion, host: '' })).rejects.toThrow(/servidor/);
  });

  it('pide configurar antes de conectar', async () => {
    await expect(new AlmacenConexion(archivo, cifradorFalso).credenciales()).rejects.toThrow(/configurar/);
  });

  it('guarda el destino y descarta nombres no válidos', async () => {
    const a = new AlmacenConexion(archivo, cifradorFalso);
    const c = await a.guardarDestino({
      bibliotecaFuente: 'mibib',
      bibliotecaObjeto: 'MAL NOMBRE',
      archivoFuente: { DSPF: 'qdspsrc', PF: "x'y" },
      bibliotecasExtra: ['uno', 'dos tres'],
    });
    expect(c.destino).toEqual({
      bibliotecaFuente: 'MIBIB',
      bibliotecaObjeto: '',
      archivoFuente: { DSPF: 'QDSPSRC' },
      bibliotecasExtra: ['UNO'],
    });
    expect((await new AlmacenConexion(archivo, cifradorFalso).leer()).destino.bibliotecaFuente).toBe('MIBIB');
  });
});
