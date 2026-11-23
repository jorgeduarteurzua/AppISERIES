import { describe, expect, it } from 'vitest';
import { parsearDspf } from '../parser/parserDspf';
import { validar } from './validacion';
import { cabecera } from '../generador/formatoDds';

const campo = (nombre: string, fila: string, columna: string, zona = 'DSPATR(UL)'): string =>
  cabecera({ inds: [], nombre, longitud: '10', tipo: 'A', uso: 'B', fila, columna }) + zona;
const keyword = (inds: string, zona: string, or = false): string =>
  `     A${or ? 'O' : ' '}${inds.padEnd(9)}`.padEnd(44) + zona;

describe('validación: atributo repetido en un campo', () => {
  it('rechaza DSPATR(PR) dos veces con indicadores distintos', () => {
    const p = parsearDspf(
      ['     A          R REG1', campo('RUT', '5', '26'), keyword(' 40', 'DSPATR(PR)'), keyword(' 41', 'DSPATR(PR)')].join('\n') + '\n',
    );
    const errores = validar(p).filter((x) => x.nivel === 'error');
    expect(errores.map((e) => e.mensaje).join('\n')).toMatch(/DSPATR\(PR\) está más de una vez.*OR/s);
  });

  it('acepta la forma con OR y atributos distintos', () => {
    const p = parsearDspf(
      ['     A          R REG1', campo('RUT', '5', '26'), keyword(' 40', ''), keyword(' 41', 'DSPATR(PR)', true)].join('\n') + '\n',
    );
    expect(validar(p).filter((x) => x.nivel === 'error')).toEqual([]);
  });
});

describe('validación: control del subfile superpuesto al subfile (CPD7812)', () => {
  const fuente = (filaMensaje: string, extra = ''): string =>
    [
      '     A          R S01                       SFL',
      campo('DETALLE', '7', '3', ''),
      '     A          R C01                       SFLCTL(S01)',
      '     A                                      SFLSIZ(9999)',
      '     A                                      SFLPAG(0012)',
      '     A                                      SFLDSP',
      '     A                                      SFLDSPCTL',
      cabecera({ inds: [], fila: '4', columna: '2' }) + "'Titulo'",
      cabecera({ inds: [], nombre: 'MENSAJE', longitud: '70', tipo: 'A', uso: 'O', fila: filaMensaje, columna: '2' }),
      extra,
    ]
      .filter((l) => l !== '')
      .join('\n') + '\n';

  it('un campo del control dentro de las filas de la página es un error', () => {
    const errores = validar(parsearDspf(fuente('15'))).filter((x) => x.nivel === 'error');
    expect(errores.map((e) => e.mensaje).join('\n')).toMatch(/MENSAJE.*fila 15.*filas 7 a 18.*CPD7812/s);
  });

  it('debajo de la página también es un error: va en otro registro con OVERLAY', () => {
    for (const fila of ['19', '22']) {
      const errores = validar(parsearDspf(fuente(fila))).filter((x) => x.nivel === 'error');
      expect(errores.map((e) => e.mensaje).join('\n')).toMatch(/MENSAJE.*debajo de la página.*CPD7812/s);
    }
  });
  it('arriba de la página no hay error', () => {
    expect(validar(parsearDspf(fuente('5'))).filter((x) => x.nivel === 'error')).toEqual([]);
  });
});
