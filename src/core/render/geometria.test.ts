import { describe, it, expect } from 'vitest';
import {
  cajasElementos,
  dimensionElemento,
  elementoEnCelda,
  limitarPosicion,
  marcoDe,
} from './geometria';
import { parsearDspf } from '../parser/parserDspf';
import { agregarCampo, agregarConstante, agregarRegistro, crearPantalla } from '../edicion/operaciones';
import type { Campo } from '../modelo/pantalla';

describe('marcoDe y cajasElementos', () => {
  it('sin ventana, el marco es la pantalla completa', () => {
    const p = crearPantalla('P');
    expect(marcoDe(p, p.registros[0])).toMatchObject({ offF: 0, offC: 0, filas: 24, columnas: 80, ventana: null });
  });

  it('con ventana, las posiciones se desplazan al interior de la ventana', () => {
    const { pantalla, registroId } = agregarRegistro(crearPantalla('P'), {
      tipo: 'normal',
      nombre: 'W01',
      ventana: { fila: 2, columna: 3, alto: 20, ancho: 74 },
    });
    const t = agregarConstante(pantalla, registroId, 1, 1, 'Hola');
    const reg = t.pantalla.registros.find((r) => r.id === registroId)!;
    expect(marcoDe(t.pantalla, reg)).toMatchObject({ offF: 1, offC: 2, filas: 19, columnas: 74 });
    expect(cajasElementos(t.pantalla, reg)).toEqual([
      { elementoId: t.elementoId, fila: 2, columna: 3, ancho: 4, alto: 1 },
    ]);
  });

  it('un subfile usa la ventana de su control', () => {
    const { pantalla } = agregarRegistro(crearPantalla('P'), {
      tipo: 'subfile',
      nombre: 'WS01',
      nombreControl: 'WC01',
      ventana: { fila: 4, columna: 5, alto: 12, ancho: 50 },
    });
    const sfl = pantalla.registros.find((r) => r.clase === 'subfile')!;
    expect(marcoDe(pantalla, sfl)).toMatchObject({ offF: 3, offC: 4, filas: 11, columnas: 50 });
  });

  it('no incluye los campos ocultos', () => {
    const p = crearPantalla('P');
    const oculto = agregarCampo(p, p.registros[0].id, { fila: null, columna: null, uso: 'oculto' });
    expect(cajasElementos(oculto.pantalla, oculto.pantalla.registros[0])).toEqual([]);
  });
});

describe('dimensiones', () => {
  const marco = { offF: 0, offC: 0, filas: 24, columnas: 80, ventana: null };

  const campo = (fuente: string): Campo => {
    const p = parsearDspf(`     A          R REG\n${fuente}`);
    return p.registros[0].elementos[0] as Campo;
  };

  it('CNTFLD reparte el campo en segmentos de n caracteres por fila', () => {
    const c = campo(
      ['     A            SENTENCIA   1330   B  1  2CHECK(LC)', '     A                                      CNTFLD(070)'].join('\n'),
    );
    expect(dimensionElemento(c, marco)).toEqual({ ancho: 70, alto: 19 });
  });

  it('un campo que pasa del borde continúa en las filas siguientes', () => {
    const c = campo('     A            LARGO        100A  B  1  1');
    expect(dimensionElemento(c, marco)).toEqual({ ancho: 80, alto: 2 });
    const c2 = campo('     A            LARGO        100A  B  1 41');
    expect(dimensionElemento(c2, marco)).toEqual({ ancho: 40, alto: 2 });
  });

  it('los botones miden lo que ocupa su texto', () => {
    const c = campo(
      [
        '     A            BOTON          2Y 0B  6  1PSHBTNFLD',
        "     A                                      PSHBTNCHC(1 'F3-Salir' CF03)",
        "     A                                      PSHBTNCHC(2 'F9-Grabar' CF09)",
      ].join('\n'),
    );
    expect(dimensionElemento(c, marco)).toEqual({ ancho: '[F3-Salir] [F9-Grabar]'.length, alto: 1 });
  });

  it('la hora y la fecha ocupan 8 columnas', () => {
    const p = parsearDspf('     A          R REG\n     A                                  2 67TIME');
    expect(dimensionElemento(p.registros[0].elementos[0], marco)).toEqual({ ancho: 8, alto: 1 });
  });
});

describe('elementoEnCelda y limitarPosicion', () => {
  it('devuelve el último elemento dibujado en la celda', () => {
    const cajas = [
      { elementoId: 'a', fila: 2, columna: 2, ancho: 10, alto: 1 },
      { elementoId: 'b', fila: 2, columna: 5, ancho: 10, alto: 1 },
    ];
    expect(elementoEnCelda(cajas, 2, 6)?.elementoId).toBe('b');
    expect(elementoEnCelda(cajas, 2, 3)?.elementoId).toBe('a');
    expect(elementoEnCelda(cajas, 3, 3)).toBeNull();
    expect(elementoEnCelda(cajas, 2, 14)?.elementoId).toBe('b'); // última columna de b (5..14)
    expect(elementoEnCelda(cajas, 2, 15)).toBeNull();
  });

  it('limita la posición para que el elemento quepa en el marco', () => {
    const marco = { offF: 0, offC: 0, filas: 24, columnas: 80, ventana: null };
    expect(limitarPosicion(30, 100, { ancho: 10, alto: 1 }, marco)).toEqual({ fila: 24, columna: 71 });
    expect(limitarPosicion(-3, 0, { ancho: 10, alto: 1 }, marco)).toEqual({ fila: 1, columna: 1 });
    expect(limitarPosicion(20, 5, { ancho: 70, alto: 19 }, marco)).toEqual({ fila: 6, columna: 5 });
    // Más ancho que el marco: se queda en la columna 1.
    expect(limitarPosicion(1, 40, { ancho: 200, alto: 1 }, marco)).toEqual({ fila: 1, columna: 1 });
  });
});
