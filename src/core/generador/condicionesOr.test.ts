import { describe, expect, it } from 'vitest';
import { formatearCondicion, leerCondicion } from '../edicion/indicadores';
import { parsearDspf } from '../parser/parserDspf';
import { generarDspf } from './generadorDspf';
import { cabecera } from './formatoDds';

/** Línea con solo indicadores: `A  40` o `AO 41` (col 7 = 'O' para las alternativas). */
const soloInds = (inds: string, or = false): string => `     A${or ? 'O' : ' '}${inds.padEnd(9)}`.trimEnd();
/** Línea con indicadores y keyword en la col 45. */
const conKeyword = (inds: string, keyword: string, or = false): string =>
  `     A${or ? 'O' : ' '}${inds.padEnd(9)}`.padEnd(44) + keyword;

const registro = '     A          R REG1';
const campo = (extra = ''): string =>
  cabecera({ inds: [], nombre: 'RUT', longitud: '10', tipo: 'S', decimales: '0', uso: 'B', fila: '5', columna: '26' }) +
  'DSPATR(UL)' +
  extra;

function ida(lineas: string[]): string {
  return lineas.join('\n') + '\n';
}

describe('condiciones con OR en el DDS', () => {
  // El caso de la compilación real: PR cuando el 40 O el 41 están activos.
  const fuenteOr = ida([registro, campo(), soloInds(' 40'), conKeyword(' 41', 'DSPATR(PR)', true)]);

  it('lee `A 40` + `AO 41 DSPATR(PR)` como una keyword con alternativa', () => {
    const p = parsearDspf(fuenteOr);
    expect(p.advertencias).toEqual([]);
    const rut = p.registros[0].elementos[0];
    if (rut.tipo !== 'campo') throw new Error('se esperaba un campo');
    expect(rut.keywords.map((k) => k.nombre)).toEqual(['DSPATR', 'DSPATR']);
    expect(rut.keywords[0].indicadores).toEqual([]);
    expect(rut.keywords[1]).toMatchObject({
      parametros: 'PR',
      indicadores: [{ numero: 40, negado: false }],
      alternativas: [[{ numero: 41, negado: false }]],
    });
  });

  it('lo vuelve a generar idéntico', () => {
    expect(generarDspf(parsearDspf(fuenteOr))).toBe(fuenteOr);
  });

  it('`A 40 41 DSPATR(PR)` es AND y no tiene alternativas', () => {
    const fuente = ida([registro, campo(), conKeyword(' 40 41', 'DSPATR(PR)')]);
    const rut = parsearDspf(fuente).registros[0].elementos[0];
    if (rut.tipo !== 'campo') throw new Error('se esperaba un campo');
    expect(rut.keywords[1].indicadores.map((i) => i.numero)).toEqual([40, 41]);
    expect(rut.keywords[1].alternativas).toBeUndefined();
    expect(generarDspf(parsearDspf(fuente))).toBe(fuente);
  });

  it('genera las líneas del OR desde el modelo', () => {
    const p = parsearDspf(ida([registro, campo(), conKeyword(' 40 41', 'DSPATR(PR)')]));
    const rut = p.registros[0].elementos[0];
    if (rut.tipo !== 'campo') throw new Error('se esperaba un campo');
    rut.keywords[1].indicadores = [{ numero: 40, negado: false }];
    rut.keywords[1].alternativas = [[{ numero: 41, negado: false }]];
    const lineas = generarDspf(p).split('\n');
    expect(lineas.slice(1)).toEqual([
      campo(),
      soloInds(' 40'),
      conKeyword(' 41', 'DSPATR(PR)', true),
      '',
    ]);
  });

  it('un OR puede tener grupos AND y indicadores negados', () => {
    const fuente = ida([registro, campo(), soloInds('N30 99'), conKeyword(' 40', 'DSPATR(RI)', true)]);
    const rut = parsearDspf(fuente).registros[0].elementos[0];
    if (rut.tipo !== 'campo') throw new Error('se esperaba un campo');
    expect(rut.keywords[1].indicadores).toEqual([
      { numero: 30, negado: true },
      { numero: 99, negado: false },
    ]);
    expect(rut.keywords[1].alternativas).toEqual([[{ numero: 40, negado: false }]]);
    expect(generarDspf(parsearDspf(fuente))).toBe(fuente);
  });

  it('tres alternativas', () => {
    const fuente = ida([
      registro,
      campo(),
      soloInds(' 40'),
      soloInds(' 41', true),
      conKeyword(' 42', 'DSPATR(PR)', true),
    ]);
    const rut = parsearDspf(fuente).registros[0].elementos[0];
    if (rut.tipo !== 'campo') throw new Error('se esperaba un campo');
    expect(rut.keywords[1].alternativas).toHaveLength(2);
    expect(generarDspf(parsearDspf(fuente))).toBe(fuente);
  });

  it('la condición OR también puede ser la de un campo, una constante o un registro', () => {
    const fuente = ida([
      registro,
      soloInds(' 30'),
      cabecera({ inds: [{ numero: 31, negado: false }], alternativas: undefined, nombre: 'OTRO', longitud: '5', tipo: 'A', uso: 'O', fila: '6', columna: '2' })
        .replace('     A ', '     AO'),
      soloInds(' 50'),
      cabecera({ inds: [{ numero: 51, negado: false }], fila: '7', columna: '2' }).replace('     A ', '     AO') + "'Texto'",
    ]);
    const [campoOtro, constante] = parsearDspf(fuente).registros[0].elementos;
    expect(campoOtro).toMatchObject({ tipo: 'campo', nombre: 'OTRO', indicadores: [{ numero: 30 }], alternativas: [[{ numero: 31 }]] });
    expect(constante).toMatchObject({ tipo: 'constante', texto: 'Texto', indicadores: [{ numero: 50 }], alternativas: [[{ numero: 51 }]] });
    expect(generarDspf(parsearDspf(fuente))).toBe(fuente);
  });

  it('una línea suelta de indicadores sin OR se ignora, como antes', () => {
    const fuente = ida([registro, soloInds(' 40'), campo()]);
    const p = parsearDspf(fuente);
    expect(p.registros[0].elementos).toHaveLength(1);
    const rut = p.registros[0].elementos[0];
    expect(rut).toMatchObject({ nombre: 'RUT', indicadores: [] });
    expect((rut as { alternativas?: unknown }).alternativas).toBeUndefined();
  });
});

describe('texto de una condición', () => {
  const i = (numero: number, negado = false) => ({ numero, negado });

  it('formatea AND con espacios y OR con barra', () => {
    expect(formatearCondicion({ indicadores: [i(40)] })).toBe('40');
    expect(formatearCondicion({ indicadores: [i(40), i(41)] })).toBe('40 41');
    expect(formatearCondicion({ indicadores: [i(40)], alternativas: [[i(41)]] })).toBe('40 | 41');
    expect(formatearCondicion({ indicadores: [i(30, true), i(99)], alternativas: [[i(40)]] })).toBe('N30 99 | 40');
    expect(formatearCondicion({ indicadores: [] })).toBe('');
  });

  it('lee lo mismo que formatea', () => {
    expect(leerCondicion('40 | 41')).toEqual({ indicadores: [i(40)], alternativas: [[i(41)]] });
    expect(leerCondicion('N30 99|40')).toEqual({ indicadores: [i(30, true), i(99)], alternativas: [[i(40)]] });
    expect(leerCondicion('40 41')).toEqual({ indicadores: [i(40), i(41)] });
    expect(leerCondicion('')).toEqual({ indicadores: [] });
  });

  it('rechaza grupos vacíos o indicadores no válidos', () => {
    expect(leerCondicion('40 |')).toBeNull();
    expect(leerCondicion('| 41')).toBeNull();
    expect(leerCondicion('40 | abc')).toBeNull();
    expect(leerCondicion('40 | 100')).toBeNull();
  });
});
