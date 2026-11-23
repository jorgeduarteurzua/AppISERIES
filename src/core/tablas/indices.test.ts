import { describe, expect, it } from 'vitest';
import { crearIndice, indicesDe, sugerirNombreIndice } from './indices';
import { generarSql } from './generadorSql';
import { generarTabla } from './generadorTabla';
import { parsearTabla } from './parserTabla';
import { validarTabla } from './validacionTabla';
import { tipoDeTabla } from './modelo';
import type { Tabla } from './modelo';

const PF = parsearTabla(
  [
    '     A                                      UNIQUE',
    '     A          R RCLIENTE                  TEXT(\'Clientes\')',
    '     A            RUT            9S 0       COLHDG(\'Rut\')',
    '     A            NOMBRE        40A         COLHDG(\'Nombre\')',
    '     A            COMUNA         5S 0       COLHDG(\'Comuna\')',
    '     A            FECALT         8S 0       COLHDG(\'Fecha alta\')',
    '     A          K RUT',
  ].join('\n') + '\n',
  'CLIENTES',
);

const LF1 = parsearTabla(
  ['     A          R RCLIENTE                  PFILE(MIBIB/CLIENTES)', '     A          K NOMBRE', '     A          K FECALT                    DESCEND'].join('\n') + '\n',
  'CLIENTESL1',
);
const OTRO = parsearTabla(['     A          R RPROD                     PFILE(PRODUCTOS)', '     A          K CODIGO'].join('\n') + '\n', 'PRODL1');

describe('índices de un físico', () => {
  it('lista los lógicos que usan el físico, con sus llaves', () => {
    const catalogo: Record<string, Tabla> = { CLIENTES: PF, CLIENTESL1: LF1, PRODL1: OTRO };
    expect(indicesDe('clientes', catalogo)).toEqual([
      {
        nombre: 'CLIENTESL1',
        unico: false,
        llaves: [
          { nombre: 'NOMBRE', descendente: false },
          { nombre: 'FECALT', descendente: true },
        ],
        conSeleccion: false,
        texto: '',
      },
    ]);
  });

  it('propone el primer nombre libre', () => {
    expect(sugerirNombreIndice('CLIENTES', ['CLIENTESL1'])).toBe('CLIENTESL2');
    expect(sugerirNombreIndice('ASQRY03F', [])).toBe('ASQRY03L1');
    expect(sugerirNombreIndice('MOVIMIENTOS', [])).toBe('MOVIMIENL1');
  });

  it('con todos los campos usa el formato del físico; el DDS vuelve a leerse igual y es un LF válido', () => {
    const lf = crearIndice(PF, 'CLIENTES.pf', {
      nombre: 'clientesl2',
      llaves: [{ nombre: 'comuna', descendente: false }, { nombre: 'NOMBRE', descendente: true }],
      unico: false,
      campos: null,
      texto: "Clientes por comuna y nombre",
    });
    expect(tipoDeTabla(lf)).toBe('LF');
    const dds = generarTabla(lf);
    expect(dds).toMatch(/R RCLIENTE +PFILE\(CLIENTES\)/);
    expect(dds).toMatch(/K COMUNA\n/);
    expect(dds).toMatch(/K NOMBRE +DESCEND/);
    expect(dds).not.toMatch(/ RUT /);
    expect(generarTabla(parsearTabla(dds, 'CLIENTESL2'))).toBe(dds);
    const errores = validarTabla(lf, { resolverArchivo: (n) => (n === 'CLIENTES' ? PF : null) }).filter((p) => p.nivel === 'error');
    expect(errores).toEqual([]);
  });

  it('el SQL del índice es un CREATE INDEX (UNIQUE si se pide)', () => {
    const lf = crearIndice(PF, 'CLIENTES', { nombre: 'CLIRUTNOM', llaves: [{ nombre: 'NOMBRE', descendente: false }], unico: true, campos: null, texto: '' });
    const { sql } = generarSql(lf, { nombre: 'CLIRUTNOM', resolverArchivo: (n) => (n === 'CLIENTES' ? PF : null) });
    expect(sql).toMatch(/CREATE UNIQUE INDEX CLIRUTNOM\s+ON CLIENTES \(NOMBRE( ASC)?\)/);
  });

  it('con algunos campos lleva su propio formato y los campos de la llave deben estar', () => {
    const lf = crearIndice(PF, 'CLIENTES', {
      nombre: 'CLINOM',
      llaves: [{ nombre: 'NOMBRE', descendente: false }],
      unico: false,
      campos: ['RUT', 'NOMBRE'],
      texto: '',
    });
    const dds = generarTabla(lf);
    expect(dds).toMatch(/R RCLINOM +PFILE\(CLIENTES\)/);
    expect(dds).toMatch(/ RUT\n/);
    expect(() =>
      crearIndice(PF, 'CLIENTES', { nombre: 'CLINOM', llaves: [{ nombre: 'COMUNA', descendente: false }], unico: false, campos: ['RUT'], texto: '' }),
    ).toThrow(/falta COMUNA/);
  });

  it('rechaza lo que no se puede', () => {
    const base = { llaves: [{ nombre: 'NOMBRE', descendente: false }], unico: false, campos: null, texto: '' };
    expect(() => crearIndice(PF, 'CLIENTES', { ...base, nombre: 'CLIENTES' })).toThrow(/distinto al del físico/);
    expect(() => crearIndice(PF, 'CLIENTES', { ...base, nombre: '1MAL' })).toThrow(/no es válido/);
    expect(() => crearIndice(PF, 'CLIENTES', { ...base, nombre: 'X', llaves: [] })).toThrow(/al menos un campo/);
    expect(() => crearIndice(PF, 'CLIENTES', { ...base, nombre: 'X', llaves: [{ nombre: 'NOEXISTE', descendente: false }] })).toThrow(/no está en el físico/);
    expect(() => crearIndice(LF1, 'CLIENTESL1', { ...base, nombre: 'X' })).toThrow(/archivo físico/);
  });
});
