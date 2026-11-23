import { describe, expect, it } from 'vitest';
import {
  comandoCambiarMiembro,
  comandoCompilacion,
  comandoCrearArchivoFuente,
  rutaMiembro,
} from './comandos';
import { TIPOS_FUENTE } from './tipos';
import type { PeticionEnvio, TipoFuente } from './tipos';
import {
  esNombreValido,
  lineasDemasiadoLargas,
  normalizarNombre,
  validarConexion,
  validarPeticion,
} from './validacion';

function peticion(extra: Partial<PeticionEnvio> = {}): PeticionEnvio {
  return {
    tipo: 'DSPF',
    miembro: 'CLIENTED',
    texto: '     A          R REG1\n',
    descripcion: '',
    bibliotecaFuente: 'MIBIB',
    archivoFuente: 'QDSPSRC',
    bibliotecaObjeto: 'MIOBJ',
    compilar: true,
    reemplazar: true,
    crearArchivoFuente: false,
    bibliotecasExtra: [],
    ...extra,
  };
}

describe('nombres', () => {
  it('acepta nombres IBM i y rechaza lo demás', () => {
    for (const ok of ['A', 'QDSPSRC', '$MIBIB', 'ASQRY06', 'A_B#@1', 'ABCDEFGHIJ']) {
      expect(esNombreValido(ok), ok).toBe(true);
    }
    for (const mal of ['', '1ABC', 'ABCDEFGHIJK', 'a', 'A B', 'A/B', "A'B", 'A)B', 'A;B', 'A\nB', 'A.B', '*ALL']) {
      expect(esNombreValido(mal), mal).toBe(false);
    }
  });

  it('normaliza a mayúsculas', () => {
    expect(normalizarNombre('  qdspsrc ')).toBe('QDSPSRC');
  });
});

describe('validarPeticion', () => {
  it('acepta una petición correcta', () => {
    expect(validarPeticion(peticion())).toEqual([]);
  });

  it('rechaza nombres que podrían inyectar comandos', () => {
    expect(validarPeticion(peticion({ miembro: 'A) CALL QCMD' })).length).toBeGreaterThan(0);
    expect(validarPeticion(peticion({ bibliotecaFuente: 'X/Y' })).length).toBeGreaterThan(0);
    expect(validarPeticion(peticion({ bibliotecasExtra: ['OK', 'MAL NOMBRE'] })).length).toBeGreaterThan(0);
  });

  it('rechaza una descripción con comillas o saltos de línea', () => {
    expect(validarPeticion(peticion({ descripcion: "x') CALL PGM(Y" })).length).toBeGreaterThan(0);
    expect(validarPeticion(peticion({ descripcion: 'a\nb' })).length).toBeGreaterThan(0);
    expect(validarPeticion(peticion({ descripcion: 'Mantencion de clientes' }))).toEqual([]);
    expect(validarPeticion(peticion({ descripcion: 'Mantención' })).length).toBeGreaterThan(0);
  });

  it('exige la biblioteca de compilación solo si se compila', () => {
    expect(validarPeticion(peticion({ bibliotecaObjeto: '' })).length).toBeGreaterThan(0);
    expect(validarPeticion(peticion({ bibliotecaObjeto: '', compilar: false }))).toEqual([]);
  });

  it('rechaza líneas más largas que el archivo fuente', () => {
    const errores = validarPeticion(peticion({ texto: `${'X'.repeat(81)}\nok` }));
    expect(errores.join(' ')).toMatch(/80/);
    // En SQL caben 100.
    expect(validarPeticion(peticion({ tipo: 'SQL', texto: 'X'.repeat(100) }))).toEqual([]);
  });

  it('rechaza un fuente vacío y un tipo desconocido', () => {
    expect(validarPeticion(peticion({ texto: '  \n' })).length).toBeGreaterThan(0);
    expect(validarPeticion(peticion({ tipo: 'XYZ' as TipoFuente })).length).toBeGreaterThan(0);
  });

  it('cuenta las líneas largas', () => {
    expect(lineasDemasiadoLargas('a\r\nbbb\r\ncc', 2)).toEqual([2]);
  });
});

describe('validarConexion', () => {
  const base = { host: '192.168.1.10', puerto: 21, usuario: 'JDUARTE', seguro: false };
  it('acepta datos correctos', () => {
    expect(validarConexion(base)).toEqual([]);
    expect(validarConexion({ ...base, host: 'as400.empresa.cl', password: 'x y' })).toEqual([]);
  });
  it('rechaza datos incorrectos', () => {
    expect(validarConexion({ ...base, host: '' }).length).toBeGreaterThan(0);
    expect(validarConexion({ ...base, host: 'a b' }).length).toBeGreaterThan(0);
    expect(validarConexion({ ...base, puerto: 0 }).length).toBeGreaterThan(0);
    expect(validarConexion({ ...base, puerto: 70000 }).length).toBeGreaterThan(0);
    expect(validarConexion({ ...base, usuario: 'USUARIO_MUY_LARGO' }).length).toBeGreaterThan(0);
    expect(validarConexion({ ...base, password: 'a\r\nQUIT' }).length).toBeGreaterThan(0);
  });
});

describe('comandos', () => {
  it('arma la ruta IFS del miembro', () => {
    expect(rutaMiembro('MIBIB', 'QDSPSRC', 'CLIENTED')).toBe('/QSYS.LIB/MIBIB.LIB/QDSPSRC.FILE/CLIENTED.MBR');
  });

  it('compila cada tipo con su comando', () => {
    const c = (tipo: TipoFuente, extra: Partial<PeticionEnvio> = {}): string =>
      comandoCompilacion(peticion({ tipo, miembro: 'PGM1', archivoFuente: 'QXSRC', ...extra }));
    expect(c('DSPF')).toBe('CRTDSPF FILE(MIOBJ/PGM1) SRCFILE(MIBIB/QXSRC) SRCMBR(PGM1) REPLACE(*YES)');
    expect(c('PF', { reemplazar: false })).toBe('CRTPF FILE(MIOBJ/PGM1) SRCFILE(MIBIB/QXSRC) SRCMBR(PGM1) REPLACE(*NO)');
    expect(c('LF')).toMatch(/^CRTLF FILE\(MIOBJ\/PGM1\)/);
    expect(c('SQL')).toBe('RUNSQLSTM SRCFILE(MIBIB/QXSRC) SRCMBR(PGM1) COMMIT(*NONE) DFTRDBCOL(MIOBJ)');
    expect(c('CBL')).toMatch(/^CRTCBLPGM PGM\(MIOBJ\/PGM1\)/);
    expect(c('CBLLE')).toMatch(/^CRTBNDCBL PGM\(MIOBJ\/PGM1\)/);
    expect(c('SQLCBL')).toBe(
      'CRTSQLCBL PGM(MIOBJ/PGM1) SRCFILE(MIBIB/QXSRC) SRCMBR(PGM1) COMMIT(*NONE) REPLACE(*YES)',
    );
    expect(c('SQLCBLLE')).toBe(
      'CRTSQLCBLI OBJ(MIOBJ/PGM1) SRCFILE(MIBIB/QXSRC) SRCMBR(PGM1) COMMIT(*NONE) OBJTYPE(*PGM) REPLACE(*YES)',
    );
  });

  it('todos los programas y scripts SQL compilan con COMMIT(*NONE)', () => {
    for (const tipo of ['SQL', 'SQLCBL', 'SQLCBLLE'] as TipoFuente[]) {
      expect(comandoCompilacion(peticion({ tipo }))).toContain('COMMIT(*NONE)');
    }
  });

  it('el comando de cada tipo coincide con la tabla de tipos', () => {
    for (const tipo of Object.keys(TIPOS_FUENTE) as TipoFuente[]) {
      expect(comandoCompilacion(peticion({ tipo })).startsWith(TIPOS_FUENTE[tipo].comando + ' ')).toBe(true);
    }
  });

  it('crea el archivo fuente con largo de registro = línea + 12', () => {
    expect(comandoCrearArchivoFuente('DSPF', 'MIBIB', 'QDSPSRC')).toContain('RCDLEN(92)');
    expect(comandoCrearArchivoFuente('SQL', 'MIBIB', 'QSQLSRC')).toContain('RCDLEN(112)');
  });

  it('fija tipo y descripción del miembro', () => {
    expect(comandoCambiarMiembro(peticion({ tipo: 'SQLCBL', descripcion: 'Clientes' }))).toBe(
      "CHGPFM FILE(MIBIB/QDSPSRC) MBR(CLIENTED) SRCTYPE(SQLCBL) TEXT('Clientes')",
    );
    expect(comandoCambiarMiembro(peticion())).not.toContain('TEXT(');
  });
});
