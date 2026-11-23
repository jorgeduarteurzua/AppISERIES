/**
 * Colores de COBOL, CL y RPG para Monaco (definiciones Monarch).
 * Solo tipos de monaco-editor: este archivo no carga el editor.
 */
import type { languages } from 'monaco-editor';
import type { LenguajePrograma } from '@core/fuentes/lenguaje';

export const ID_LENGUAJE: Record<LenguajePrograma, string> = {
  cobol: 'cobol-ibmi',
  cl: 'cl-ibmi',
  rpg: 'rpg-ibmi',
};

export const PALABRAS_COBOL = `ACCEPT ACCESS ADD ADVANCING AFTER ALL ALPHABETIC ALSO ALTER ALTERNATE AND ANY ARE AREA AREAS ASCENDING ASSIGN AT
AUTHOR BEFORE BINARY BLANK BLOCK BOTTOM BY CALL CANCEL CHARACTER CHARACTERS CLOSE CODE COLLATING COLUMN COMMA COMMIT
COMP COMP-3 COMP-4 COMPUTATIONAL COMPUTE CONFIGURATION CONTAINS CONTINUE CONTROL CONTROL-AREA CONVERTING COPY CORR
CORRESPONDING COUNT CURRENCY CURSOR DATA DATE DATE-WRITTEN DAY DECIMAL-POINT DECLARATIVES DELETE DELIMITED DELIMITER
DEPENDING DESCENDING DISPLAY DIVIDE DIVISION DOWN DUPLICATES DYNAMIC ELSE END END-ADD END-CALL END-COMPUTE END-DELETE
END-DIVIDE END-EVALUATE END-IF END-MULTIPLY END-PERFORM END-READ END-REWRITE END-SEARCH END-START END-STRING
END-SUBTRACT END-UNSTRING END-WRITE ENVIRONMENT EQUAL ERROR EVALUATE EXCEPTION EXIT EXTEND EXTERNAL FALSE FD FILE
FILE-CONTROL FILLER FIRST FOR FORMAT FROM FUNCTION GENERATE GIVING GLOBAL GO GOBACK GREATER GROUP I-O
I-O-CONTROL IDENTIFICATION IF IN INDEX INDEXED INDICATOR INDICATORS INITIAL INITIALIZE INPUT INPUT-OUTPUT INSPECT
INTO INVALID IS JUST JUSTIFIED KEY LABEL LEADING LEFT LENGTH LESS LINE LINES LINKAGE LOW-VALUE LOW-VALUES MODIFIED
MODE MOVE MULTIPLY NEXT NO NOT NUMERIC OBJECT-COMPUTER OCCURS OF OFF ON OPEN OPTIONAL OR ORDER ORGANIZATION OTHER
OUTPUT OVERFLOW PERFORM PIC PICTURE POINTER PROCEDURE PROGRAM PROGRAM-ID READ RECORD RECORDS REDEFINES RELATIVE
RELEASE REMAINDER REPLACING RETURN REWRITE RIGHT ROUNDED RUN SEARCH SECTION SECURITY SELECT SENTENCE SEPARATE
SEQUENCE SEQUENTIAL SET SIGN SIZE SORT SOURCE-COMPUTER SPECIAL-NAMES STANDARD START STATUS STOP STRING SUBFILE
SUBTRACT TALLYING TEST THAN THEN THROUGH THRU TIME TIMES TO TOP TRANSACTION TRUE UNSTRING UNTIL UP UPON USAGE USING
VALUE VALUES VARYING WHEN WITH WORKING-STORAGE WORKSTATION WRITE ZERO ZEROES ZEROS SPACE SPACES HIGH-VALUE HIGH-VALUES
QUOTE QUOTES`
  .split(/\s+/)
  .filter(Boolean);

export const PALABRAS_SQL = `SELECT FROM WHERE AND OR NOT INTO INSERT UPDATE DELETE SET VALUES DECLARE CURSOR FOR OPEN FETCH CLOSE ORDER BY
GROUP HAVING JOIN LEFT RIGHT INNER OUTER ON AS IN IS NULL LIKE BETWEEN EXISTS COUNT SUM MIN MAX AVG DISTINCT FETCH FIRST
ROWS ONLY WITH COMMIT ROLLBACK INCLUDE SQLCA CURRENT DATE TIME TIMESTAMP CHAR VARCHAR DECIMAL INTEGER CASE WHEN THEN
ELSE END UNION ALL ASC DESC OPTIMIZE`
  .split(/\s+/)
  .filter(Boolean);

/**
 * COBOL de formato fijo: columnas 1-6 de secuencia, la 7 indicador (* o / = comentario),
 * y el SQL entre EXEC SQL y END-EXEC.
 */
export const COBOL: languages.IMonarchLanguage = {
  ignoreCase: true,
  defaultToken: '',
  keywords: PALABRAS_COBOL,
  sqlKeywords: PALABRAS_SQL,
  tokenizer: {
    root: [
      [/^.{6}[*/].*$/, 'comment'],
      [/^.{1,6}/, 'comment.doc'],
      [/EXEC\s+SQL\b/, { token: 'keyword.sql', next: '@sql' }],
      { include: '@comun' },
    ],
    sql: [
      [/^.{6}[*/].*$/, 'comment'],
      [/^.{1,6}/, 'comment.doc'],
      [/END-EXEC/, { token: 'keyword.sql', next: '@pop' }],
      [/:[A-Za-z0-9][\w-]*/, 'variable'],
      [/"[^"]*"|'[^']*'/, 'string'],
      [/[A-Za-z][\w-]*/, { cases: { '@sqlKeywords': 'keyword.sql', '@default': 'identifier' } }],
      [/\d+(\.\d+)?/, 'number'],
    ],
    comun: [
      [/"[^"]*("|$)/, 'string'],
      [/'[^']*('|$)/, 'string'],
      [/\b(PIC|PICTURE)(\s+)(\S+)/, ['keyword', '', 'type']],
      [/[A-Za-z0-9][\w-]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
      [/[+-]?\d+(\.\d+)?/, 'number'],
    ],
  },
};

/** CL: comandos, parámetros PARAM(...), valores especiales *XXX, variables &X, etiquetas y comentarios /* *\/. */
export const CL: languages.IMonarchLanguage = {
  ignoreCase: true,
  defaultToken: '',
  tokenizer: {
    root: [
      [/\/\*/, { token: 'comment', next: '@comentario' }],
      [/'[^']*('|$)/, 'string'],
      [/^\s*[A-Za-z@#$][\w@#$]*:/, 'type'],
      [/&[A-Za-z@#$][\w@#$]*/, 'variable'],
      [/\*[A-Za-z][\w]*/, 'constant'],
      [/[A-Za-z@#$][\w@#$]*(?=\()/, 'attribute'],
      [/[A-Za-z@#$][\w@#$/]*/, 'keyword'],
      [/\d+(\.\d+)?/, 'number'],
    ],
    comentario: [
      [/\*\//, { token: 'comment', next: '@pop' }],
      [/./, 'comment'],
    ],
  },
};

/** RPG (solo para leer y editar): comentarios * en la columna 7 o //, literales. */
export const RPG: languages.IMonarchLanguage = {
  ignoreCase: true,
  defaultToken: '',
  tokenizer: {
    root: [
      [/^.{6}\*.*$/, 'comment'],
      [/\/\/.*$/, 'comment'],
      [/'[^']*('|$)/, 'string'],
      [/[A-Za-z][\w]*/, 'identifier'],
      [/\d+(\.\d+)?/, 'number'],
    ],
  },
};

/** Comandos CL más usados, para autocompletar. */
export const COMANDOS_CL = `PGM ENDPGM DCL DCLF CHGVAR IF ELSE DO ENDDO DOWHILE DOUNTIL DOFOR ITERATE LEAVE SELECT WHEN OTHERWISE
ENDSELECT GOTO SUBR ENDSUBR CALLSUBR RTNSUBR CALL RETURN MONMSG SNDPGMMSG RCVMSG SNDRCVF SNDF RCVF OVRDBF DLTOVR
OVRPRTF CHKOBJ CRTDTAARA CHGDTAARA RTVDTAARA RTVJOBA RTVSYSVAL ADDLIBLE RMVLIBLE CPYF CLRPFM RUNSQL RUNSQLSTM
SBMJOB DLYJOB OPNQRYF CLOF STRCMTCTL ENDCMTCTL`.split(/\s+/).filter(Boolean);

/** Columnas donde se dibujan guías: área A (8), área B (12), fin del código (72) y fin del registro (80). */
export const REGLAS: Record<LenguajePrograma, number[]> = {
  cobol: [6, 7, 11, 72, 80],
  cl: [80],
  rpg: [5, 6, 80],
};
