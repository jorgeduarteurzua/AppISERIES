import { describe, expect, it } from 'vitest';
import { archivoDeReferencia, camposDelArchivo, incorporarCampos } from './camposDeArchivo';
import { crearPantalla } from './operaciones';
import { generarDspf } from '../generador/generadorDspf';
import { parsearDspf } from '../parser/parserDspf';
import { validar } from './validacion';
import { parsearTabla } from '../tablas/parserTabla';
import type { Campo } from '../modelo/pantalla';

const PF = parsearTabla(
  [
    "     A          R RCLIENTE",
    "     A            RUT            9S 0       TEXT('Rut del cliente') COLHDG('Rut')",
    "     A            NOMBRE        40A         TEXT('Nombre') COLHDG('Nombre' 'completo')",
    "     A            SALDO         11P 2       TEXT('Saldo')",
    "     A            FECALT          L         TEXT('Fecha de alta')",
    "     A          K RUT",
  ].join('\n') + '\n',
  'CLIENTES.pf',
);
const LF = parsearTabla(['     A          R RCLIENTE                  PFILE(CLIENTES)', '     A          K NOMBRE'].join('\n') + '\n', 'CLIENTESL1.lf');
const resolver = (n: string) => (n === 'CLIENTES' ? PF : null);

describe('campos de un archivo', () => {
  it('con su definición, su texto, su encabezado y si son llave', () => {
    expect(camposDelArchivo(PF).map((c) => [c.nombre, c.longitud, c.tipo, c.decimales, c.llave])).toEqual([
      ['RUT', 9, 'S', 0, true],
      ['NOMBRE', 40, 'A', 0, false],
      ['SALDO', 11, 'P', 2, false],
      ['FECALT', 1, 'L', 0, false],
    ]);
    expect(camposDelArchivo(PF)[1].encabezado).toBe('Nombre completo');
  });
  it('un lógico sin campos usa los del físico, con sus propias llaves', () => {
    const c = camposDelArchivo(LF, resolver);
    expect(c.map((x) => x.nombre)).toEqual(['RUT', 'NOMBRE', 'SALDO', 'FECALT']);
    expect(c.filter((x) => x.llave).map((x) => x.nombre)).toEqual(['NOMBRE']);
  });
});

describe('incorporar campos a la pantalla', () => {
  const base = crearPantalla('CLIENTED');
  const regId = base.registros[0].id;
  const r = incorporarCampos(base, {
    archivo: 'CLIENTES.pf',
    tabla: PF,
    regId,
    campos: ['RUT', 'NOMBRE', 'SALDO', 'FECALT'],
    uso: 'ambos',
    etiqueta: 'texto',
    fila: 4,
    columna: 2,
  });
  const campos = r.pantalla.registros[0].elementos.filter((e): e is Campo => e.tipo === 'campo');

  it('cada campo con REFFLD, alineado después de la etiqueta más larga', () => {
    expect(r.agregados).toEqual(['RUT', 'NOMBRE', 'SALDO', 'FECALT']);
    expect(campos.map((c) => [c.nombre, c.fila, c.columna, c.tipoDato, c.longitud, c.decimales])).toEqual([
      ['RUT', 4, 20, 'S', 9, 0],
      ['NOMBRE', 5, 20, 'A', 40, 0],
      ['SALDO', 6, 20, 'S', 11, 2],
      ['FECALT', 7, 20, 'L', 10, 0],
    ]);
    expect(archivoDeReferencia(campos[0])).toEqual({ campo: 'RUT', archivo: 'CLIENTES' });
  });

  it('el DDS lleva la R, el REFFLD y, en la fecha, sin largo ni tipo; valida y se vuelve a leer', () => {
    const dds = generarDspf(r.pantalla);
    expect(dds).toMatch(/ {5}A {12}RUT {7}R {4}9S 0B {2}4 20REFFLD\(RUT CLIENTES\)/);
    expect(dds).toMatch(/ {5}A {12}FECALT {4}R {8}B {2}7 20REFFLD\(FECALT CLIENTES\)/);
    expect(dds).toContain("'Rut del cliente :'");
    expect(validar(r.pantalla).filter((p) => p.nivel === 'error')).toEqual([]);
    const vuelta = parsearDspf(dds, 'CLIENTED');
    expect(vuelta.advertencias).toEqual([]);
    expect(generarDspf(vuelta)).toBe(dds);
  });

  it('salida sin subrayado, sin etiquetas y con errores claros', () => {
    const s = incorporarCampos(base, { archivo: 'CLIENTES', tabla: PF, regId, campos: ['NOMBRE'], uso: 'salida', etiqueta: 'ninguna', fila: 3, columna: 5 });
    const c = s.pantalla.registros[0].elementos[0] as Campo;
    expect([c.columna, c.uso, c.keywords.map((k) => k.nombre)]).toEqual([5, 'salida', ['REFFLD']]);
    expect(() => incorporarCampos(r.pantalla, { archivo: 'CLIENTES', tabla: PF, regId, campos: ['RUT'], uso: 'ambos', etiqueta: 'ninguna', fila: 10, columna: 2 })).toThrow(/ya tiene RUT/);
    expect(() => incorporarCampos(base, { archivo: 'CLIENTES', tabla: PF, regId, campos: ['NOMBRE'], uso: 'ambos', etiqueta: 'ninguna', fila: 3, columna: 60 })).toThrow(/no cabe/);
    expect(() => incorporarCampos(base, { archivo: 'CLIENTES', tabla: PF, regId, campos: ['RUT', 'NOMBRE'], uso: 'ambos', etiqueta: 'ninguna', fila: 24, columna: 2 })).toThrow(/No caben/);
    expect(() => incorporarCampos(base, { archivo: 'CLIENTES', tabla: PF, regId, campos: ['NOEXISTE'], uso: 'ambos', etiqueta: 'ninguna', fila: 3, columna: 2 })).toThrow(/no está en CLIENTES/);
  });
});
