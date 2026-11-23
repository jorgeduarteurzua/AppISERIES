import { describe, expect, it } from 'vitest';
import { definicionDe, estructuraDe, palabraEn } from './estructura';
import { infoDeArchivo, miembroDeArchivo, secuenciaDeLinea } from './lenguaje';
import { revisarFuente } from './revision';

const COBOL = [
  '       IDENTIFICATION DIVISION.',
  '       PROGRAM-ID.  TABLA1P.',
  '       DATA DIVISION.',
  '       WORKING-STORAGE SECTION.',
  '       01 C01-II.',
  '          COPY DDS-C01-I       OF TABLA1D.',
  '      * PROCESO. (comentario, no es un parrafo)',
  '       PROCEDURE DIVISION.',
  '       PRINCIPAL.',
  '           PERFORM INICIO',
  '           PERFORM PROCESO UNTIL SALIR-WS = "S"',
  '           GOBACK.',
  '       INICIO.',
  '           OPEN I-O PANTALLA.',
  '       PROCESO.',
  '           IF A = B',
  '              CONTINUE',
  '           END-IF.',
].join('\n');

const CL = [
  '             PGM        PARM(&OPCION)',
  '             DCL        VAR(&OPCION) TYPE(*CHAR) LEN(1)',
  '             DCL        &MENSAJE *CHAR 20',
  '/* LAZO: comentario */',
  ' LAZO:       IF         COND(&OPCION *EQ X) THEN(GOTO CMDLBL(FIN))',
  '             CALLSUBR   SUBR(LIMPIAR)',
  ' FIN:        RETURN',
  '             SUBR       SUBR(LIMPIAR)',
  '             ENDSUBR',
  '             ENDPGM',
].join('\n');

describe('lenguaje y secuencia', () => {
  it('reconoce COBOL, CL y RPG por la extensión', () => {
    expect(infoDeArchivo('TABLA1P.sqlcbl')).toMatchObject({ tipo: 'SQLCBL', lenguaje: 'cobol', envio: 'SQLCBL' });
    expect(infoDeArchivo('PGMERR.CLP')).toMatchObject({ tipo: 'CLP', lenguaje: 'cl', envio: 'CLP', archivoFuente: 'QCLSRC' });
    expect(infoDeArchivo('x.rpgle')).toMatchObject({ lenguaje: 'rpg', envio: null });
    expect(infoDeArchivo('pantalla.dspf')).toBeNull();
  });
  it('el miembro sale del nombre del archivo, también en las exportaciones', () => {
    expect(miembroDeArchivo('C:/fuentes/tabla1p.sqlcbl')).toBe('TABLA1P');
    expect(miembroDeArchivo('GXCPSMI_QCBLSRC_120216_142832_ASQRY03P.TXT')).toBe('ASQRY03P');
  });
  it('secuencia estilo SEU', () => {
    expect(secuenciaDeLinea(1)).toBe('0001.00');
    expect(secuenciaDeLinea(139)).toBe('0139.00');
    expect(secuenciaDeLinea(12345)).toBe('12345.00');
  });
});

describe('estructura', () => {
  it('COBOL: divisiones, secciones, COPY y párrafos de la PROCEDURE DIVISION (sin comentarios)', () => {
    expect(estructuraDe(COBOL, 'cobol').map((e) => [e.tipo, e.nombre, e.linea])).toEqual([
      ['division', 'IDENTIFICATION DIVISION', 1],
      ['division', 'DATA DIVISION', 3],
      ['seccion', 'WORKING-STORAGE', 4],
      ['copy', 'DDS-C01-I OF TABLA1D', 6],
      ['division', 'PROCEDURE DIVISION', 8],
      ['parrafo', 'PRINCIPAL', 9],
      ['parrafo', 'INICIO', 13],
      ['parrafo', 'PROCESO', 15],
    ]);
  });
  it('CL: programa, variables, etiquetas y subrutinas', () => {
    expect(estructuraDe(CL, 'cl').map((e) => [e.tipo, e.nombre, e.linea])).toEqual([
      ['programa', 'PGM', 1],
      ['variable', '&OPCION', 2],
      ['variable', '&MENSAJE', 3],
      ['etiqueta', 'LAZO', 5],
      ['etiqueta', 'FIN', 7],
      ['subrutina', 'LIMPIAR', 8],
    ]);
  });
  it('ir a la definición desde un PERFORM, un GOTO o un CALLSUBR', () => {
    const cobol = estructuraDe(COBOL, 'cobol');
    const linea = COBOL.split('\n')[10];
    const nombre = palabraEn(linea, linea.indexOf('PROCESO') + 3)!;
    expect(nombre).toBe('PROCESO');
    expect(definicionDe(cobol, nombre, 'cobol')?.linea).toBe(15);
    expect(definicionDe(cobol, 'NOEXISTE', 'cobol')).toBeNull();
    const cl = estructuraDe(CL, 'cl');
    expect(definicionDe(cl, 'fin', 'cl')?.linea).toBe(7);
    expect(definicionDe(cl, 'LIMPIAR', 'cl')?.linea).toBe(8);
    expect(definicionDe(cl, palabraEn('  CHGVAR &MENSAJE', 10)!, 'cl')?.linea).toBe(3);
  });
});

describe('revisión de formato', () => {
  it('un fuente bien escrito no tiene problemas', () => {
    expect(revisarFuente(COBOL, 'cobol')).toEqual([]);
    expect(revisarFuente(CL, 'cl')).toEqual([]);
  });
  it('COBOL: columna 7, texto después de la 72, línea larga, tabulador y acentos', () => {
    const fuente = [
      '       X   MOVE A TO B.',
      '      x    MOVE A TO B.',
      `           MOVE A TO B.${' '.repeat(49)}IDENTIF`,
      `           MOVE A TO B.${' '.repeat(70)}`,
      '\t   MOVE A TO B.',
      '           MOVE "Año" TO B.',
      '      * Comentario con acentos: está bien.',
    ].join('\n');
    const p = revisarFuente(fuente, 'cobol');
    expect(p.map((x) => [x.linea, x.nivel, x.columna])).toEqual([
      [2, 'error', 7],
      [3, 'aviso', 73],
      [4, 'error', 81],
      [5, 'error', 1],
      [6, 'aviso', 19],
    ]);
  });
  it('CL: sin columnas fijas, pero con largo de registro y acentos fuera de comentarios', () => {
    const p = revisarFuente(['  CHGVAR &A VALUE(\'Ñandú\')', '  /* Comentario con ñ */', `  ${'X'.repeat(81)}`].join('\n'), 'cl');
    expect(p.map((x) => [x.linea, x.nivel])).toEqual([
      [1, 'aviso'],
      [3, 'error'],
    ]);
  });
});

import { describirCopia, leerCopiaDds } from './copiaDds';
import { parsearDspf } from '../parser/parserDspf';

describe('COPY DDS', () => {
  it('lee el formato, la parte y la pantalla', () => {
    expect(leerCopiaDds('           COPY DDS-C01-I       OF TABLA1D.')).toEqual({ formato: 'C01', parte: 'I', archivo: 'TABLA1D' });
    expect(leerCopiaDds('           COPY DDS-R01-INDIC   OF LIBJDU/TABLA1D.')).toEqual({ formato: 'R01', parte: 'INDIC', archivo: 'TABLA1D' });
    expect(leerCopiaDds('           COPY DDS-ALL-FORMATS-O OF X.')).toEqual({ formato: null, parte: 'O', archivo: 'X' });
    expect(leerCopiaDds('           MOVE A TO B.')).toBeNull();
  });
  it('describe los campos y los indicadores del formato', () => {
    const p = parsearDspf(
      [
        '     A          R R01',
        '     A            NOMBRE        20A  B  3  2',
        '     A  50                                  DSPATR(RI PC)',
        '     A            TOTAL          7S 2O  4  2',
        '     A            CLAVE          5A  H',
      ].join('\n') + '\n',
      'PANT',
    );
    expect(describirCopia(p, leerCopiaDds('       COPY DDS-R01-I OF PANT.')!)).toEqual(['  NOMBRE     20A B', '  CLAVE      5A H']);
    expect(describirCopia(p, leerCopiaDds('       COPY DDS-R01-O OF PANT.')!)).toEqual(['  NOMBRE     20A B', '  TOTAL      7,2S O', '  CLAVE      5A H']);
    expect(describirCopia(p, leerCopiaDds('       COPY DDS-R01-INDIC OF PANT.')!)).toEqual(['R01: IN50']);
    expect(describirCopia(p, leerCopiaDds('       COPY DDS-X99-I OF PANT.')!)).toBeNull();
  });
});
