import { describe, expect, it } from 'vitest';
import { datosCobol, errorDeNombre, nombresDelPrograma, ocurrencias, renombrar } from './simbolos';

const COBOL = [
  '       IDENTIFICATION DIVISION.',
  '       PROGRAM-ID.  PRUEBA.',
  '       DATA DIVISION.',
  '       FILE SECTION.',
  '       FD PANTALLA.',
  '       WORKING-STORAGE SECTION.',
  '       77 TOTAL-WS              PIC S9(7)V99.',
  '       77 TOTAL-WS-ANT          PIC S9(7)V99.',
  '       01 REG-WS.',
  '          05 FILLER            PIC X(2).',
  '          05 NOMBRE-WS         PIC X(40).',
  '             88 SIN-NOMBRE     VALUE SPACES.',
  '       PROCEDURE DIVISION.',
  '       PRINCIPAL.',
  '      * TOTAL-WS en un comentario no se toca',
  '           MOVE ZEROES TO TOTAL-WS TOTAL-WS-ANT',
  '           DISPLAY "TOTAL-WS = " TOTAL-WS',
  '           PERFORM SUMAR',
  '           GOBACK.',
  '       SUMAR.',
  '           ADD 1 TO TOTAL-WS.',
].join('\n');

const CL = [
  '             PGM        PARM(&OPCION)',
  '             DCL        VAR(&OPCION) TYPE(*CHAR) LEN(1)',
  '             DCL        VAR(&OPCIONES) TYPE(*CHAR) LEN(5)',
  "/* &OPCION en un comentario */",
  " FIN:        IF COND(&OPCION *EQ 'X') THEN(GOTO CMDLBL(FIN))",
  "             SNDPGMMSG  MSG('&OPCION es literal')",
  '             ENDPGM',
].join('\n');

describe('datos y nombres', () => {
  it('COBOL: los datos de la DATA DIVISION con su nivel y PIC, sin FILLER', () => {
    expect(datosCobol(COBOL).map((d) => [d.nombre, d.nivel, d.pic])).toEqual([
      ['PANTALLA', 'FD', null],
      ['TOTAL-WS', '77', 'S9(7)V99'],
      ['TOTAL-WS-ANT', '77', 'S9(7)V99'],
      ['REG-WS', '01', null],
      ['NOMBRE-WS', '05', 'X(40)'],
      ['SIN-NOMBRE', '88', null],
    ]);
  });
  it('nombres para autocompletar: datos y párrafos en COBOL; variables y etiquetas en CL', () => {
    const cobol = nombresDelPrograma(COBOL, 'cobol');
    expect(cobol.filter((n) => n.tipo === 'parrafo').map((n) => n.nombre)).toEqual(['PRINCIPAL', 'SUMAR']);
    expect(cobol.find((n) => n.nombre === 'NOMBRE-WS')?.detalle).toBe('05 PIC X(40)');
    expect(nombresDelPrograma(CL, 'cl').map((n) => [n.nombre, n.tipo])).toEqual([
      ['&OPCION', 'variable'],
      ['&OPCIONES', 'variable'],
      ['FIN', 'etiqueta'],
    ]);
  });
});

describe('ocurrencias', () => {
  it('COBOL: palabra entera, sin comentarios ni literales', () => {
    expect(ocurrencias(COBOL, 'total-ws', 'cobol').map((o) => [o.linea, o.columna])).toEqual([
      [7, 11],
      [16, 27],
      [17, 34],
      [21, 21],
    ]);
  });
  it('CL: la variable sin tocar la que empieza igual, ni comentarios ni literales', () => {
    expect(ocurrencias(CL, '&OPCION', 'cl').map((o) => o.linea)).toEqual([1, 2, 5]);
  });
  it('COBOL: no mira después de la columna 72', () => {
    expect(ocurrencias(`           MOVE A TO B.${' '.repeat(49)}TOTAL-WS`, 'TOTAL-WS', 'cobol')).toEqual([]);
  });
});

describe('renombrar', () => {
  it('cambia todas las ocurrencias de un dato', () => {
    const r = renombrar(COBOL, 'TOTAL-WS', 'suma-ws', 'cobol');
    expect(r.cambios).toBe(4);
    expect(r.texto).toContain('77 SUMA-WS              PIC S9(7)V99.');
    expect(r.texto).toContain('MOVE ZEROES TO SUMA-WS TOTAL-WS-ANT');
    expect(r.texto).toContain('DISPLAY "TOTAL-WS = " SUMA-WS');
    expect(r.texto).toContain('* TOTAL-WS en un comentario no se toca');
    expect(r.largas).toEqual([]);
  });
  it('un párrafo y su PERFORM', () => {
    const r = renombrar(COBOL, 'SUMAR', 'SUMAR-TOTAL', 'cobol');
    expect(r.texto).toContain('PERFORM SUMAR-TOTAL');
    expect(r.texto).toContain('       SUMAR-TOTAL.');
  });
  it('avisa las líneas que el nombre más largo empuja más allá de la columna 72', () => {
    const fuente = `           MOVE TOTAL-WS TO NOMBRE-DE-UN-DATO-BASTANTE-LARGO-QUE-LLEGA.`;
    expect(fuente.length).toBeLessThanOrEqual(72);
    const r = renombrar(`       DATA DIVISION.\n       77 TOTAL-WS PIC 9.\n${fuente}`, 'TOTAL-WS', 'TOTAL-DEL-MES-ACTUAL', 'cobol');
    expect(r.largas).toEqual([3]);
  });
  it('CL: variable y etiqueta', () => {
    expect(renombrar(CL, '&OPCION', '&OPC', 'cl').texto).toContain("IF COND(&OPC *EQ 'X')");
    expect(renombrar(CL, 'FIN', 'SALIR', 'cl').texto).toContain(' SALIR:');
  });
  it('rechaza nombres no válidos o que ya existen', () => {
    expect(() => renombrar(COBOL, 'TOTAL-WS', 'TOTAL-WS-ANT', 'cobol')).toThrow(/ya existe/);
    expect(() => renombrar(COBOL, 'TOTAL-WS', '-MAL', 'cobol')).toThrow(/guion/);
    expect(() => renombrar(COBOL, 'NO-ESTA', 'OTRO', 'cobol')).toThrow(/no aparece/);
    expect(() => renombrar(CL, '&OPCION', 'OPC', 'cl')).toThrow(/variable CL/);
    expect(errorDeNombre('123', 'cobol')).toMatch(/al menos una letra/);
    expect(errorDeNombre('A'.repeat(31), 'cobol')).toMatch(/1 a 30/);
  });
});
