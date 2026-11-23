import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import iconv from 'iconv-lite';
import { generarSql } from './generadorSql';
import { parsearTabla } from './parserTabla';
import { nombreArchivoTabla, tipoDeTabla, type Tabla } from './modelo';
import { dirFuentesTablas } from './fuentesPrueba';

interface Linea {
  marca?: string;
  nombre?: string;
  ref?: boolean;
  long?: number | string;
  tipo?: string;
  dec?: number | string;
  zona?: string;
}

/** Una línea DDS con cada dato en su columna (marca 17, nombre 19-28, R 29, long 30-34, tipo 35, dec 36-37, zona 45). */
function lin(o: Linea): string {
  const { marca = ' ', nombre = '', ref = false, long = '', tipo = ' ', dec = '', zona = '' } = o;
  return (
    '     A' +
    ' '.repeat(10) +
    marca +
    ' ' +
    nombre.padEnd(10) +
    (ref ? 'R' : ' ') +
    String(long).padStart(5) +
    tipo +
    String(dec).padStart(2) +
    ' ' +
    ' '.repeat(6) +
    zona
  ).trimEnd();
}

const fuente = (...l: string[]) => l.join('\n');
const registro = (nombre: string, zona = '') => lin({ marca: 'R', nombre, zona });
const campo = (nombre: string, long: number | string, tipo: string, dec: number | string = '', zona = '') =>
  lin({ nombre, long, tipo, dec, zona });
const llave = (nombre: string, zona = '') => lin({ marca: 'K', nombre, zona });
const sel = (marca: 'S' | 'O', nombre: string, zona = '') => lin({ marca, nombre, zona });
const archivo = (zona: string) => lin({ zona });

describe('lin() arma las columnas como el DDS real', () => {
  it('coincide con una línea de un fuente de ejemplo', () => {
    expect(campo('WHFLDB', 5, 'S', 0, "COLHDG('LONGITUD DEL CAMPO')")).toBe(
      "     A            WHFLDB         5S 0       COLHDG('LONGITUD DEL CAMPO')",
    );
    expect(registro('RASQRY01F', 'PFILE(ASQRY01F)')).toBe('     A          R RASQRY01F                 PFILE(ASQRY01F)');
  });
});

describe('nombreArchivoTabla', () => {
  it('quita el prefijo de exportación y la extensión', () => {
    expect(nombreArchivoTabla('GXCPSMI_QDDSSRC_120216_142741_ASQRY01F.TXT')).toBe('ASQRY01F');
    expect(nombreArchivoTabla('clientes.pf')).toBe('CLIENTES');
    expect(nombreArchivoTabla('NOMBRELARGOEXTREMO')).toBe('NOMBRELARG');
  });
});

describe('PF -> CREATE TABLE', () => {
  const base = fuente(
    archivo('UNIQUE'),
    registro('RCLI', "TEXT('Datos de clientes')"),
    campo('CODIGO', 5, 'S', 0, "COLHDG('CODIGO')"),
    campo('NOMBRE', 30, 'A', '', "COLHDG('NOMBRE' 'DEL' 'CLIENTE')"),
    lin({ zona: "TEXT('Nombre completo')" }),
    campo('SALDO', 9, 'P', 2),
    llave('CODIGO'),
  );

  it('genera la tabla con tipos, llave primaria y formato de registro', () => {
    const r = generarSql(parsearTabla(base, 'CLI'), { biblioteca: 'MILIB' });
    expect(r.sql).toContain('CREATE TABLE MILIB.CLI (');
    expect(r.sql).toContain('  CODIGO NUMERIC(5, 0) NOT NULL WITH DEFAULT,');
    expect(r.sql).toContain('  NOMBRE CHAR(30) NOT NULL WITH DEFAULT,');
    expect(r.sql).toContain('  SALDO DECIMAL(9, 2) NOT NULL WITH DEFAULT,');
    expect(r.sql).toContain('  PRIMARY KEY (CODIGO)');
    expect(r.sql).toContain(') RCDFMT RCLI;');
    expect(r.sql).not.toContain('INDEX');
    expect(r.advertencias).toEqual([]);
  });

  it('genera las etiquetas: texto de tabla, encabezados de 20 y texto de columna', () => {
    const r = generarSql(parsearTabla(base, 'CLI'), { biblioteca: 'MILIB' });
    expect(r.sql).toContain("LABEL ON TABLE MILIB.CLI IS 'Datos de clientes';");
    expect(r.sql).toContain("CODIGO IS 'CODIGO'");
    expect(r.sql).toContain(`NOMBRE IS '${'NOMBRE'.padEnd(20)}${'DEL'.padEnd(20)}CLIENTE'`);
    expect(r.sql).toContain("NOMBRE TEXT IS 'Nombre completo'");
  });

  it('sin UNIQUE la llave pasa a un índice normal', () => {
    const f = base.replace('UNIQUE', 'FIFO');
    const r = generarSql(parsearTabla(f, 'CLI'));
    expect(r.sql).not.toContain('PRIMARY KEY');
    expect(r.sql).toContain('CREATE INDEX IX_CLI ON CLI (CODIGO);');
  });

  it('una llave descendente usa un índice único en vez de PRIMARY KEY', () => {
    const f = base.replace(llave('CODIGO'), llave('CODIGO', 'DESCEND'));
    const r = generarSql(parsearTabla(f, 'CLI'));
    expect(r.sql).not.toContain('PRIMARY KEY');
    expect(r.sql).toContain('CREATE UNIQUE INDEX IX_CLI ON CLI (CODIGO DESC);');
  });

  it('avisa si UNIQUE no tiene llaves', () => {
    const r = generarSql(parsearTabla(fuente(archivo('UNIQUE'), registro('R'), campo('C1', 1, 'A')), 'T'));
    expect(r.advertencias.join(' ')).toMatch(/UNIQUE pero no tiene llaves/);
  });

  it('usa CREATE OR REPLACE si se pide', () => {
    expect(generarSql(parsearTabla(base, 'CLI'), { reemplazar: true }).sql).toContain('CREATE OR REPLACE TABLE CLI (');
  });

  it('no repite RCDFMT si el formato se llama como el archivo', () => {
    const r = generarSql(parsearTabla(fuente(registro('CLI'), campo('C1', 1, 'A')), 'CLI'));
    expect(r.sql).not.toContain('RCDFMT');
  });
});

describe('PF: nulos, valores por defecto y condiciones', () => {
  const r = generarSql(
    parsearTabla(
      fuente(
        registro('REG'),
        campo('ESTADO', 1, 'A', '', "DFT('A') VALUES('A' 'B' 'C')"),
        campo('NOTA', 20, 'A', '', 'ALWNULL'),
        campo('ORIGEN', 10, 'A', '', "ALWNULL DFT('WEB')"),
        campo('EDAD', 3, 'S', 0, 'RANGE(0 120)'),
        campo('CUPO', 7, 'S', 0, 'COMP(GE 1) COMP(LE 5000)'),
        campo('FLAG', 1, 'A', '', 'CHECK(ME)'),
      ),
      'T',
    ),
  );

  it('NOT NULL con y sin DFT, y ALWNULL con y sin DFT', () => {
    expect(r.sql).toContain("  ESTADO CHAR(1) NOT NULL DEFAULT 'A',");
    expect(r.sql).toContain('  NOTA CHAR(20),');
    expect(r.sql).toContain("  ORIGEN CHAR(10) DEFAULT 'WEB',");
  });

  it('VALUES, RANGE y COMP pasan a CHECK con nombre', () => {
    expect(r.sql).toContain("CONSTRAINT CK_T_ESTADO CHECK (ESTADO IN ('A', 'B', 'C'))");
    expect(r.sql).toContain('CONSTRAINT CK_T_EDAD CHECK (EDAD BETWEEN 0 AND 120)');
    expect(r.sql).toContain('CONSTRAINT CK_T_CUPO CHECK (CUPO >= 1)');
    expect(r.sql).toContain('CONSTRAINT CK_T_CUPO_2 CHECK (CUPO <= 5000)');
  });

  it('el CHECK de DDS (validación de pantalla) se avisa y no se traduce', () => {
    expect(r.sql).not.toContain('CHECK (FLAG');
    expect(r.advertencias.join(' ')).toMatch(/CHECK\(ME\) de FLAG/);
  });

  it('traduce todos los operadores de COMP', () => {
    const ops = generarSql(
      parsearTabla(
        fuente(
          registro('REG'),
          campo('N1', 3, 'S', 0, 'COMP(EQ 1) COMP(NE 2) COMP(LT 3) COMP(NL 4) COMP(GT 5) COMP(NG 6)'),
        ),
        'T',
      ),
    ).sql;
    for (const c of ['N1 = 1', 'N1 <> 2', 'N1 < 3', 'N1 >= 4', 'N1 > 5', 'N1 <= 6']) expect(ops).toContain(c);
  });
});

describe('PF: tipos', () => {
  const def = (nombre: string, long: number | string, tipo: string, dec: number | string = '', zona = '') =>
    generarSql(parsearTabla(fuente(registro('REG'), campo(nombre, long, tipo, dec, zona)), 'T'));

  it.each([
    [9, 'B', 0, '', 'INTEGER'],
    [4, 'B', 0, '', 'SMALLINT'],
    [18, 'B', 0, '', 'BIGINT'],
    [9, 'F', '', '', 'REAL'],
    [4, 'F', '', '', 'REAL'],
    [10, 'F', '', '', 'DOUBLE'],
    [17, 'F', '', '', 'DOUBLE'],
    [7, 'F', '', 'FLTPCN(*DOUBLE)', 'DOUBLE'],
    [15, 'F', '', 'FLTPCN(*SINGLE)', 'REAL'],
    ['', 'L', '', '', 'DATE'],
    ['', 'T', '', '', 'TIME'],
    ['', 'Z', '', '', 'TIMESTAMP'],
    [10, 'H', '', '', 'BINARY(10)'],
    [7, 'P', 2, '', 'DECIMAL(7, 2)'],
    [7, 'S', 2, '', 'NUMERIC(7, 2)'],
    [100, 'A', '', 'VARLEN', 'VARCHAR(100)'],
  ])('longitud %s tipo %s decimales %s %s -> %s', (long, tipo, dec, zona, esperado) => {
    expect(def('CAMPO', long, tipo as string, dec, zona as string).sql).toContain(`CAMPO ${esperado}`);
  });

  it('un campo sin tipo pero con decimales es numérico (zoned)', () => {
    expect(def('CAMPO', 5, ' ', 2).sql).toContain('CAMPO NUMERIC(5, 2)');
  });

  it('un campo sin tipo ni decimales es alfanumérico', () => {
    expect(def('CAMPO', 5, ' ').sql).toContain('CAMPO CHAR(5)');
  });

  it('ALIAS usa el nombre largo y deja el del sistema con FOR COLUMN', () => {
    expect(def('CAMPO', 10, 'A', '', 'ALIAS(NOMBRE_LARGO_DEL_CAMPO)').sql).toContain(
      'NOMBRE_LARGO_DEL_CAMPO FOR COLUMN CAMPO CHAR(10)',
    );
  });

  it('las palabras reservadas van entre comillas', () => {
    expect(def('DATE', 10, 'A').sql).toContain('"DATE" CHAR(10)');
    expect(def('USER', 10, 'A').sql).toContain('"USER" CHAR(10)');
  });
});

describe('PF: campos heredados (REFFLD)', () => {
  const maestro = parsearTabla(
    fuente(registro('RMAE'), campo('AYUDA', 10, 'A', '', "COLHDG('AYUDA')"), campo('LARGO', 3, 'S', 0)),
    'MAESTRO',
  );
  const buscar = (n: string): Tabla | null => (n === 'MAESTRO' ? maestro : null);
  const f = fuente(
    archivo('REF(MAESTRO)'),
    registro('RDET'),
    lin({ nombre: 'AYUDA', ref: true }),
    lin({ nombre: 'LARGO', ref: true, zona: 'REFFLD(RMAE/LARGO MAESTRO)' }),
  );

  it('toma el tipo del archivo de referencia', () => {
    const r = generarSql(parsearTabla(f, 'DET'), { resolverArchivo: buscar });
    expect(r.sql).toContain('AYUDA CHAR(10)');
    expect(r.sql).toContain('LARGO NUMERIC(3, 0)');
    expect(r.advertencias).toEqual([]);
  });

  it('si no está el archivo de referencia lo avisa y usa CHAR(10)', () => {
    const r = generarSql(parsearTabla(f, 'DET'));
    expect(r.sql).toContain('AYUDA CHAR(10)');
    expect(r.advertencias.join(' ')).toMatch(/AYUDA toma su definición/);
  });
});

describe('LF', () => {
  const lf = (...elementos: string[]) =>
    generarSql(
      parsearTabla(fuente(registro('REGL', 'PFILE(MAESTRO)'), lin({ nombre: 'CODIGO' }), lin({ nombre: 'ESTADO' }), ...elementos), 'MAEL02'),
    );

  it('sin selección es un índice, único si el archivo es UNIQUE', () => {
    const r = generarSql(
      parsearTabla(
        fuente(archivo('UNIQUE'), registro('RMAE', 'PFILE(MAESTRO)'), llave('CODIGO'), llave('FECHA', 'DESCEND')),
        'MAEL01',
      ),
      { biblioteca: 'BIB' },
    );
    expect(r.sql).toContain('CREATE UNIQUE INDEX BIB.MAEL01 ON BIB.MAESTRO (CODIGO, FECHA DESC) RCDFMT RMAE;');
  });

  it('con S/O es una vista con WHERE', () => {
    const uno = lf(sel('S', 'ESTADO', "COMP(EQ 'A')"));
    expect(uno.sql).toContain("CREATE VIEW MAEL02 (CODIGO, ESTADO) AS\nSELECT CODIGO, ESTADO\nFROM MAESTRO\nWHERE ESTADO = 'A';");
  });

  it('mismo campo: OR; campos distintos: AND', () => {
    expect(lf(sel('S', 'ESTADO', "COMP(EQ 'A')"), sel('S', 'ESTADO', "COMP(EQ 'B')")).sql).toContain(
      "WHERE (ESTADO = 'A' OR ESTADO = 'B');",
    );
    expect(lf(sel('S', 'ESTADO', "COMP(EQ 'A')"), sel('S', 'TIPO', "COMP(EQ 'X')")).sql).toContain(
      "WHERE ESTADO = 'A' AND TIPO = 'X';",
    );
  });

  it('solo omisión: entra todo lo que no se omite', () => {
    expect(lf(sel('O', 'ESTADO', "COMP(EQ 'B')")).sql).toContain("WHERE NOT (ESTADO = 'B');");
    expect(lf(sel('O', 'ESTADO', "COMP(EQ 'B')"), sel('O', 'ESTADO', "COMP(EQ 'C')")).sql).toContain(
      "WHERE NOT (ESTADO = 'B' OR ESTADO = 'C');",
    );
  });

  it('S seguido de O ALL: O ALL no deja entrar nada más', () => {
    expect(lf(sel('S', 'ESTADO', "COMP(EQ 'A')"), sel('O', 'ALL')).sql).toContain("WHERE ESTADO = 'A';");
  });

  it('O y luego S: se omite lo primero y se selecciona lo segundo', () => {
    expect(lf(sel('O', 'ESTADO', "COMP(EQ 'B')"), sel('S', 'TIPO', "COMP(EQ 'X')")).sql).toContain(
      "WHERE (NOT (ESTADO = 'B') AND TIPO = 'X');",
    );
  });

  it('S y luego O: si se cumple S entra; si no, entra salvo lo omitido', () => {
    expect(lf(sel('S', 'TIPO', "COMP(EQ 'X')"), sel('O', 'ESTADO', "COMP(EQ 'B')")).sql).toContain(
      "WHERE (TIPO = 'X' OR NOT (ESTADO = 'B'));",
    );
  });

  it('VALUES y RANGE en la selección', () => {
    const r = generarSql(
      parsearTabla(
        fuente(registro('REGL', 'PFILE(MAESTRO)'), sel('S', 'ESTADO', "VALUES('A' 'B')"), sel('S', 'EDAD', 'RANGE(18 65)')),
        'MAEL03',
      ),
    );
    expect(r.sql).toContain("WHERE ESTADO IN ('A', 'B') AND EDAD BETWEEN 18 AND 65;");
  });

  it('RENAME en un campo del lógico', () => {
    const r = generarSql(
      parsearTabla(
        fuente(registro('REGL', 'PFILE(MAESTRO)'), lin({ nombre: 'CODNUEVO', zona: 'RENAME(CODVIEJO)' }), sel('S', 'ESTADO', "COMP(EQ 'A')")),
        'MAEL04',
      ),
    );
    expect(r.sql).toContain('SELECT CODVIEJO AS CODNUEVO');
  });

  it('un lógico sin lista de campos usa los del físico si se puede resolver', () => {
    const maestro = parsearTabla(fuente(registro('RMAE'), campo('C1', 1, 'A'), campo('C2', 1, 'A')), 'MAESTRO');
    const f = fuente(registro('REGL', 'PFILE(MAESTRO)'), sel('S', 'C1', "COMP(EQ 'X')"));
    const con = generarSql(parsearTabla(f, 'MAEL05'), { resolverArchivo: (n) => (n === 'MAESTRO' ? maestro : null) });
    expect(con.sql).toContain('CREATE VIEW MAEL05 (C1, C2) AS\nSELECT C1, C2');
    const sin = generarSql(parsearTabla(f, 'MAEL05'));
    expect(sin.sql).toContain('SELECT *');
    expect(sin.advertencias.join(' ')).toMatch(/SELECT \*/);
  });

  it('la llave de una vista pasa a ORDER BY con aviso', () => {
    const r = lf(sel('S', 'ESTADO', "COMP(EQ 'A')"), llave('CODIGO'));
    expect(r.sql).toContain('ORDER BY CODIGO;');
    expect(r.advertencias.join(' ')).toMatch(/ORDER BY/);
  });

  it('una unión (JOIN) se avisa y no se inventa', () => {
    const r = generarSql(
      parsearTabla(fuente(registro('REGJ', 'JFILE(A B)'), lin({ marca: 'J', zona: 'JOIN(1 2)' }), lin({ zona: 'JFLD(K1 K1)' })), 'JOIN01'),
    );
    expect(r.advertencias.join(' ')).toMatch(/unión/);
    expect(r.sql).not.toContain('CREATE VIEW');
  });
});

describe('los 48 fuentes reales generan SQL sin errores', () => {
  const archivos = readdirSync(dirFuentesTablas).filter((f) => f.toUpperCase().endsWith('.TXT'));
  const leer = (f: string) => parsearTabla(iconv.decode(readFileSync(join(dirFuentesTablas, f)), 'windows-1252'), f);

  for (const archivoReal of archivos) {
    it(archivoReal.slice(32), () => {
      const t = leer(archivoReal);
      const r = generarSql(t, { biblioteca: 'MILIB' });
      const nombre = nombreArchivoTabla(archivoReal);
      if (tipoDeTabla(t) === 'PF') {
        expect(r.sql).toContain(`CREATE TABLE MILIB.${nombre} (`);
      } else {
        expect(r.sql).toMatch(new RegExp(`CREATE (UNIQUE INDEX|INDEX|VIEW) MILIB\\.${nombre}`));
      }
      expect(r.sql.trim().endsWith(';')).toBe(true);
    });
  }

  it('ASQRY27L01 (lógico sin campos, con 5 llaves) es un índice único sobre ASQRY27F', () => {
    const f = archivos.find((a) => a.endsWith('ASQRY27L01.TXT'))!;
    expect(generarSql(leer(f), { biblioteca: 'MILIB' }).sql).toContain(
      'CREATE UNIQUE INDEX MILIB.ASQRY27L01 ON MILIB.ASQRY27F (USRPRO, FECPRO1, HORPRO1, NOMCONS, SECEJE) RCDFMT RASQRY27F;',
    );
  });

  it('PEPITOJD (UNIQUE con una llave) tiene PRIMARY KEY', () => {
    const f = archivos.find((a) => a.endsWith('PEPITOJD.TXT'))!;
    expect(generarSql(leer(f)).sql).toContain('PRIMARY KEY (KEYUNO)');
  });

  it('SMIPRU00 (empaquetado sin decimales declarados) sale como DECIMAL(4, 0)', () => {
    const f = archivos.find((a) => a.endsWith('SMIPRU00.TXT'))!;
    expect(generarSql(leer(f)).sql).toContain('SMICOD DECIMAL(4, 0)');
  });

  it('ASQRY04F tiene los campos largos como CHAR(10000)', () => {
    const f = archivos.find((a) => a.endsWith('ASQRY04F.TXT'))!;
    expect(generarSql(leer(f)).sql).toContain('SELEJE CHAR(10000)');
  });
});
