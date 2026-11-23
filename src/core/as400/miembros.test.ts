import { describe, expect, it } from 'vitest';
import { extensionDeTipo, extensionLocal, parsearTiposMiembros, tipoPorContenido, fechaDeLista, parsearListUnix, parsearNlst, unirMiembros } from './miembros';

// Respuestas reales de un IBM i 7.5 (sondeo del 19-11-2026).
const NLST = ['ANCALCIO.MBR', 'MQGETJD_V2.MBR', 'PGMREF.MBR', 'SI1118PRG2.MBR', ''].join('\r\n');

const LIST_UNIX = [
  '-rwx---rwx   1 PRSIAS   0        2942884 Jul 13 14:52 ANCALCIO.MBR',
  '-rwx---rwx   1 PRSIAS   0          13054 Sep 24 15:09 CALLBAG61.MBR',
  '-rwx---rwx   1 PRSIAS   0          99552 Jun 25 2025  PGMREF.MBR',
  '-rwx---rwx   1 PRSIAS   0          37454 Sep 30 2005  MQGETJD_V2.MBR',
  '-rwx---rwx   1 PRSIAS   0         158722 Nov 06 12:00 SI1096MM.MBR',
  '-rwx---rwx   1 PRSIAS   0          47946 Jan 29 2026  SI1118PRG2.MBR',
].join('\r\n');

const LIST_CERO = [
  'PRSIAS       27422720 17/11/26 15:30:50 *FILE      ',
  'PRSIAS                                  *MEM       ANCALCIO.MBR',
].join('\r\n');

// «Hoy» del sondeo: el 19 de noviembre de 2026.
const HOY = new Date(2026, 10, 19, 12, 0, 0);

describe('parsearNlst', () => {
  it('lee los nombres de miembro', () => {
    expect(parsearNlst(NLST)).toEqual({ nombres: ['ANCALCIO', 'MQGETJD_V2', 'PGMREF', 'SI1118PRG2'], ignorados: 0 });
  });

  it('acepta minúsculas y $ # @ pero ignora lo que no es un miembro válido', () => {
    const r = parsearNlst(['abc.mbr', '$MIPGM.MBR', 'A#B.MBR', 'NOMBRE_MUY_LARGO.MBR', 'x y.MBR', '../A.MBR', 'A.TXT', '/QSYS.LIB/X.LIB/Y.FILE/'].join('\n'));
    expect(r.nombres).toEqual(['ABC', '$MIPGM', 'A#B']);
    expect(r.ignorados).toBe(5);
  });

  it('una respuesta vacía no tiene miembros', () => {
    expect(parsearNlst('')).toEqual({ nombres: [], ignorados: 0 });
  });
});

describe('fechas de LIST', () => {
  it('con año', () => {
    expect(fechaDeLista('Jun', 25, '2025', HOY)).toBe('2025-06-25');
    expect(fechaDeLista('Sep', 5, '2005', HOY)).toBe('2005-09-05');
  });

  it('sin año usa el actual, o el anterior si quedaría en el futuro', () => {
    expect(fechaDeLista('Jul', 13, '14:52', HOY)).toBe('2026-07-13 14:52');
    expect(fechaDeLista('Nov', 6, '12:00', HOY)).toBe('2026-11-06 12:00');
    // Un mes que aún no llega este año: es del año pasado.
    expect(fechaDeLista('Dec', 28, '09:05', HOY)).toBe('2025-12-28 09:05');
    expect(fechaDeLista('Nov', 19, '08:00', HOY)).toBe('2026-11-19 08:00');
  });

  it('rechaza meses o días que no existen', () => {
    expect(fechaDeLista('Xyz', 1, '2025', HOY)).toBeNull();
    expect(fechaDeLista('Jan', 0, '2025', HOY)).toBeNull();
    expect(fechaDeLista('Jan', 32, '2025', HOY)).toBeNull();
  });
});

describe('parsearListUnix', () => {
  it('lee la fecha de cada miembro', () => {
    const f = parsearListUnix(LIST_UNIX, HOY);
    expect(f.get('PGMREF')).toBe('2025-06-25');
    expect(f.get('ANCALCIO')).toBe('2026-07-13 14:52');
    expect(f.get('MQGETJD_V2')).toBe('2005-09-30');
    expect(f.get('SI1118PRG2')).toBe('2026-01-29');
    expect(f.size).toBe(6);
  });

  it('el formato por defecto (LISTFMT 0) no trae fechas y no rompe nada', () => {
    expect(parsearListUnix(LIST_CERO, HOY).size).toBe(0);
    expect(parsearListUnix('', HOY).size).toBe(0);
  });
});

describe('unirMiembros', () => {
  it('une nombres y fechas y deja null si falta la fecha', () => {
    const fechas = parsearListUnix(LIST_UNIX, HOY);
    expect(unirMiembros(['PGMREF', 'OTRO'], fechas)).toEqual([
      { nombre: 'PGMREF', fecha: '2025-06-25', tipo: null, texto: null },
      { nombre: 'OTRO', fecha: null, tipo: null, texto: null },
    ]);
  });

  it('agrega el tipo y el texto cuando se conocen', () => {
    const tipos = parsearTiposMiembros('PGMREF    SQLCBL    GENERA REFERENCIAS\r\n');
    expect(unirMiembros(['PGMREF'], new Map(), tipos)).toEqual([
      { nombre: 'PGMREF', fecha: null, tipo: 'SQLCBL', texto: 'GENERA REFERENCIAS' },
    ]);
  });
});

describe('extensionLocal', () => {
  it('pantallas', () => {
    expect(extensionLocal('QDSPSRC', '     A          R REG1')).toBe('dspf');
  });

  it('archivos: físico o lógico según el contenido', () => {
    expect(extensionLocal('QDDSSRC', '     A          R REG1\n     A            CAMPO1        10A\n')).toBe('pf');
    expect(extensionLocal('QDDSSRC', '     A          R REG1                      PFILE(ARCH)\n')).toBe('lf');
    expect(extensionLocal('QDDSSRC', '     A          R REG1                      JFILE(A B)\n')).toBe('lf');
  });

  it('COBOL: con SQL o sin SQL, también en archivos con nombres propios', () => {
    expect(extensionLocal('QCBLSRC', '       IDENTIFICATION DIVISION.\n')).toBe('cbl');
    expect(extensionLocal('QCBLSRC', '           EXEC SQL\n              INCLUDE SQLCA\n           END-EXEC.\n')).toBe('sqlcbl');
    expect(extensionLocal('QCBLFTE', '       IDENTIFICATION DIVISION.\n')).toBe('cbl');
    expect(extensionLocal('QCBL101641', '           exec sql commit end-exec')).toBe('sqlcbl');
  });

  it('SQL y desconocidos', () => {
    expect(extensionLocal('QSQLSRC', 'CREATE TABLE X (A INT);')).toBe('sql');
    expect(extensionLocal('MISFUENTES', 'texto')).toBe('txt');
  });
});

describe('tipo de fuente por contenido (un QDDSSRC mezcla pantallas, PF y LF)', () => {
  const dspf = [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R REG1',
    '     A                                  1  2\'Titulo\'',
  ].join('\n');
  const pf = ['     A          R REG1', '     A            CAMPO1        10A', '     A            CAMPO2         5S 0', '     A          K CAMPO1'].join('\n');
  const lf = ['     A          R REG1                      PFILE(ARCH)', '     A          K CAMPO1'].join('\n');

  it('una pantalla guardada en QDDSSRC sigue siendo dspf', () => {
    expect(extensionLocal('QDDSSRC', dspf)).toBe('dspf');
  });

  it('campos con uso y posición, o teclas de función, indican pantalla', () => {
    expect(tipoPorContenido('     A          R REG1\n     A            CAMPO1        10A  B  5 10')).toBe('dspf');
    expect(tipoPorContenido('     A          R REG1\n     A                                  CF03(03)')).toBe('dspf');
  });

  it('PF y LF en QDDSSRC y también si están en QDSPSRC', () => {
    expect(extensionLocal('QDDSSRC', pf)).toBe('pf');
    expect(extensionLocal('QDDSSRC', lf)).toBe('lf');
    expect(extensionLocal('QDSPSRC', lf)).toBe('lf');
    expect(tipoPorContenido(pf)).toBe('dds');
  });

  it('los comentarios no cuentan y otros fuentes se reconocen', () => {
    expect(tipoPorContenido('     A*                                      PFILE(X)\n     A          R REG1')).toBe('dds');
    expect(tipoPorContenido('             PGM\n             ENDPGM')).toBe('clp');
    expect(tipoPorContenido('texto cualquiera')).toBeNull();
    expect(extensionLocal('QCLPSRC', '             PGM\n             ENDPGM')).toBe('clp');
  });
});
describe('tipos de miembro que entrega el servidor', () => {
  const TABLA = [
    'ANCALCIO  CBLLE     Emision de Polizas',
    'INSMQPUTCBCBL       Envia Mensajes a Cola MQ',
    'MQGETJD_V2CBLLE     RV. Lee un mensaje desde QM Pensi�n Colectivo',
    'PMSBAR63SOSQLCBLLE  Llama al sp PAPAR64IB',
    'SINTEXTO  PF',
    '',
  ].join('\r\n');

  it('lee las columnas fijas de 10, 10 y 50 aunque el nombre ocupe todo su ancho', () => {
    const t = parsearTiposMiembros(TABLA);
    expect(t.get('ANCALCIO')).toEqual({ tipo: 'CBLLE', texto: 'Emision de Polizas' });
    expect(t.get('INSMQPUTCB')).toEqual({ tipo: 'CBL', texto: 'Envia Mensajes a Cola MQ' });
    expect(t.get('MQGETJD_V2')?.texto).toBe('RV. Lee un mensaje desde QM Pensi�n Colectivo');
    expect(t.get('PMSBAR63SO')?.tipo).toBe('SQLCBLLE');
    expect(t.get('SINTEXTO')).toEqual({ tipo: 'PF', texto: '' });
    expect(t.size).toBe(5);
  });

  it('ignora l�neas con un nombre que no es v�lido', () => {
    expect(parsearTiposMiembros('A B       PF        x\r\n').size).toBe(0);
  });

  it('la extensi�n sale del tipo en min�sculas, si es usable', () => {
    expect(extensionDeTipo('DSPF')).toBe('dspf');
    expect(extensionDeTipo('SQLCBLLE')).toBe('sqlcblle');
    expect(extensionDeTipo('')).toBeNull();
    expect(extensionDeTipo(null)).toBeNull();
    expect(extensionDeTipo('../X')).toBeNull();
  });
});
