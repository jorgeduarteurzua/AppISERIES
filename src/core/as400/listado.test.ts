import { describe, expect, it } from 'vitest';
import { hayErrorGrave, leerListado, lineaDeSecuencia, nivelDeGravedad } from './listado';

// Listados copiados de los spool reales (recortados).
const SQL = `5770ST1 V7R5M0 220415             Crear Programa COBOL SQL           TABLA1P                20/11/26 07:07:17        Pagina
Reg     *...+... 1 ...+... 2 ...+... 3 ...+... 4 ...+... 5 ...+... 6 ...+... 7 ...+... 8    NUMSEC  Ultimo cambio
  139             COPY DDS-C01-I       OF TABLA1D.                                       013900
  141             COPY DDS-C01-O       OF TABLA1D.                                       014100
  156             COPY DDS-R01-O       OF TABLA1D.                                       015600
5770ST1 V7R5M0 220415             Crear Programa COBOL SQL           TABLA1P                20/11/26 07:07:17        Pagina
                                   MENSAJES DIAGNOSTICO
MSJ ID  GRV  REG     TEXTO
SQL1001  30     139  Definicion de archivo externa para TABLA1D no encontrada.
SQL1001  30     141  Definicion de archivo externa para TABLA1D no encontrada.
SQL1001  30     156  Definicion de archivo externa para TABLA1D no encontrada.
                Resumen Mensajes
  Total     Info   Aviso    Error   Grave  Terminal
      3        0       0        0       3         0
En el fuente se encontraron errores con nivel de gravedad 30
Se procesaron   779 registros fuente
                         * * * * *  F I N  D E  L I S T A D O  * * * * *`;

const COBOL = `  205  012200 77 ENCAB-LINEA            PIC X(334).
  206  012300 01 TABLA-LISTA.
  207  012400    05 FILA-LISTA OCCURS 9999 TIMES.
       077900*
                       * * * * *   F I N   D E   F U E N T E   * * * * *
 5770WDS V7R5M0  220415               Mensajes COBOL            LIBJDU/TABLA1P      SISTEMAS 19/11/26 11:29:22  Pagina   22
 INST
*  206  IDMSJ: LBL1078  GRAVEDAD: 30  NUMSEC:  012300
        Mensaje . . . :   El tama o de 'TABLA-LISTA' excede el limite
          de 3000000 bytes. La longitud se ha restaurado a 1 byte.
*  316  IDMSJ: LBL0345  GRAVEDAD: 20  NUMSEC:  016700
        Mensaje . . . :   La cabecera PROCEDURE DIVISION no va seguida
          de nombre de procedimiento o cabecera DECLARATIVES. Se acepta.
*  429  IDMSJ: LBL0412  GRAVEDAD: 20  NUMSEC:  033800
        Mensaje . . . :   Frase INVALID KEY no encontrada en
          instruccion WRITE. Se acepta.
                    * * * * *   F I N   D E   M E N S A J E S   * * * * *
                                   Resumen de Mensajes
  Total     Info(0-4)    Aviso(5-19)    Error(20-29)    Grave(30-39)    Terminal(40-99)
    3            0            0              2               1                 0`;

const CL = ` NUMSEC  *...+... 1 ...+... 2 ...+... 3 ...+... 4 ...+... 5 ...+... 6 ...+... 7 ...+... 8 ...+... 9 ...+.  FECHA
    100-      PGM                                                                                   20/11/26
    200-                                                                                            20/11/26
    300-         DCL VAR(&MENSAJE) TYPE(*CHAR) LEN(20)                                              20/11/26
    400-                                                                                            20/11/26
    500-         CHGVAR VAR(&MEN) VALUE('HOLA MUNDO')                                               20/11/26
* CPD0727 40  Se ha hecho referencia a la variable &MEN pero no se ha declarado.
    600-                                                                                            20/11/26
    700-     ENDPGM                                                                                 20/11/26
                       * * * * *   F I N   D E   F U E N T E   * * * * *
 5770SS1 V7R5M0  220415                 Lenguaje de Control       LIBJDU/PGMERR         SISTEMAS 20/11/26 12:19:25  Pagina
                                     Referencias Cruzadas
 Variables Declaradas
 Nombre                      Definida    Tipo          Longitud    Referencias
 &MENSAJE                       300      *CHAR              20
* CPD0726 10  Se ha declarado la variable &MENSAJE pero no se ha hecho referencia a ella.
* CPD0791 00  No se ha utilizado ninguna etiqueta en el programa.
                    * * * * *   F I N   D E   R E F E R E N C I A S   C R U Z A D A S   * * * * *`;

describe('leerListado', () => {
  it('precompilador SQL: la línea es el registro', () => {
    const m = leerListado(SQL);
    expect(m.map((x) => [x.id, x.gravedad, x.linea])).toEqual([
      ['SQL1001', 30, 139],
      ['SQL1001', 30, 141],
      ['SQL1001', 30, 156],
    ]);
    expect(m[0].texto).toBe('Definicion de archivo externa para TABLA1D no encontrada.');
    expect(hayErrorGrave(m)).toBe(true);
  });

  it('compilador COBOL: la línea sale de NUMSEC y el texto se junta', () => {
    const m = leerListado(COBOL);
    expect(m.map((x) => [x.id, x.gravedad, x.nivel, x.linea])).toEqual([
      ['LBL1078', 30, 'error', 123],
      ['LBL0345', 20, 'aviso', 167],
      ['LBL0412', 20, 'aviso', 338],
    ]);
    expect(m[0].texto).toBe("El tama o de 'TABLA-LISTA' excede el limite de 3000000 bytes. La longitud se ha restaurado a 1 byte.");
    expect(m[2].texto).toBe('Frase INVALID KEY no encontrada en instruccion WRITE. Se acepta.');
  });

  it('CL: el mensaje es de la línea de arriba; los de referencias cruzadas no tienen línea', () => {
    const m = leerListado(CL);
    expect(m.map((x) => [x.id, x.gravedad, x.nivel, x.linea])).toEqual([
      ['CPD0727', 40, 'error', 5],
      ['CPD0726', 10, 'aviso', null],
      ['CPD0791', 0, 'info', null],
    ]);
  });

  it('dos listados juntos (precompilador y COBOL) y sin repetidos', () => {
    const m = leerListado(`${SQL}\n${COBOL}\n${COBOL}`);
    expect(m).toHaveLength(6);
  });

  it('un texto cualquiera no da mensajes', () => {
    expect(leerListado('Hola\n  123 algo\nCPF9999 no es un mensaje de listado')).toEqual([]);
  });
});

describe('gravedad y secuencia', () => {
  it('menos de 10 información, 10 a 29 aviso, 30 o más error', () => {
    expect([0, 9, 10, 20, 29, 30, 40].map(nivelDeGravedad)).toEqual(['info', 'info', 'aviso', 'aviso', 'aviso', 'error', 'error']);
  });
  it('secuencias de los listados', () => {
    expect(lineaDeSecuencia('012300')).toBe(123);
    expect(lineaDeSecuencia('500')).toBe(5);
    expect(lineaDeSecuencia('0139.00')).toBe(139);
    expect(lineaDeSecuencia('000000')).toBeNull();
    expect(lineaDeSecuencia('x')).toBeNull();
  });
});
