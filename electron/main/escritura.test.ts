import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archivosValidos, escribirFuenteConCopia, nombreArchivoValido } from './escritura';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'appiseries-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const existe = (ruta: string) =>
  access(ruta).then(
    () => true,
    () => false,
  );

describe('escribirFuenteConCopia', () => {
  it('escribe con CRLF y en Windows-1252 (ó = 0xF3, ñ = 0xF1)', async () => {
    const ruta = join(dir, 'NUEVO.dspf');
    await escribirFuenteConCopia(ruta, 'Condición\nAño\n');
    const bytes = await readFile(ruta);
    expect([...bytes]).toEqual([
      ...Buffer.from('Condici', 'latin1'),
      0xf3,
      ...Buffer.from('n\r\nA', 'latin1'),
      0xf1,
      ...Buffer.from('o\r\n', 'latin1'),
    ]);
  });

  it('no duplica el retorno de carro si el texto ya trae CRLF', async () => {
    const ruta = join(dir, 'A.txt');
    await escribirFuenteConCopia(ruta, 'uno\r\ndos\r\n');
    expect((await readFile(ruta)).toString('latin1')).toBe('uno\r\ndos\r\n');
  });

  it('un archivo nuevo no genera copia', async () => {
    const ruta = join(dir, 'NUEVO.pf');
    const r = await escribirFuenteConCopia(ruta, 'x');
    expect(r.copia).toBeNull();
    expect(await existe(`${ruta}.bak`)).toBe(false);
  });

  it('al sobrescribir deja una copia .bak del original, solo la primera vez', async () => {
    const ruta = join(dir, 'ORIGINAL.TXT');
    await writeFile(ruta, 'contenido original');

    const primera = await escribirFuenteConCopia(ruta, 'version 1');
    expect(primera.copia).toBe(`${ruta}.bak`);
    expect(await readFile(`${ruta}.bak`, 'latin1')).toBe('contenido original');
    expect(await readFile(ruta, 'latin1')).toBe('version 1');

    const segunda = await escribirFuenteConCopia(ruta, 'version 2');
    expect(segunda.copia).toBeNull();
    expect(await readFile(`${ruta}.bak`, 'latin1')).toBe('contenido original'); // el original sigue a salvo
    expect(await readFile(ruta, 'latin1')).toBe('version 2');
  });

  it('falla con un mensaje si la carpeta no existe', async () => {
    await expect(escribirFuenteConCopia(join(dir, 'no-existe', 'A.txt'), 'x')).rejects.toThrow();
  });
});

describe('archivos que la interfaz puede guardar en una carpeta', () => {
  it('acepta nombres corrientes y rechaza rutas y ejecutables', () => {
    for (const ok of ['ASQRY03D.dspf', 'ASQRY03P.sqlcbl', 'MI_PGM.cbl', 'A', '$MIPGM.sqlcblle']) {
      expect(nombreArchivoValido(ok), ok).toBe(true);
    }
    for (const mal of ['', '..', '../x.txt', 'a/b.txt', 'a\\b.txt', 'C:\\x.txt', '.oculto', 'a..b', 'virus.exe', 'x.BAT', 'a b.txt', 'x'.repeat(70), 'n\u00fam.txt']) {
      expect(nombreArchivoValido(mal), mal).toBe(false);
    }
    expect(nombreArchivoValido(42)).toBe(false);
    expect(nombreArchivoValido(null)).toBe(false);
  });

  it('valida la lista completa', () => {
    expect(archivosValidos([{ nombre: 'A.dspf', texto: 'x' }, { nombre: 'B.cbl', texto: '' }])).toHaveLength(2);
    expect(archivosValidos([])).toBeNull();
    expect(archivosValidos('x')).toBeNull();
    expect(archivosValidos([{ nombre: 'A.dspf' }])).toBeNull();
    expect(archivosValidos([{ nombre: '../A.dspf', texto: 'x' }])).toBeNull();
    // Dos archivos con el mismo nombre (aunque cambie la mayúscula) se pisarían.
    expect(archivosValidos([{ nombre: 'A.dspf', texto: 'x' }, { nombre: 'a.DSPF', texto: 'y' }])).toBeNull();
    expect(archivosValidos(Array.from({ length: 21 }, (_, i) => ({ nombre: `A${i}.txt`, texto: 'x' })))).toBeNull();
    expect(archivosValidos([{ nombre: 'A.dspf', texto: 'x'.repeat(5_000_001) }])).toBeNull();
  });
});
