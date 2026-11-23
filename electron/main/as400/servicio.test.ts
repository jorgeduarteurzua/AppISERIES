import { describe, expect, it } from 'vitest';
import type { PeticionEnvio } from '../../../src/core/as400/tipos';
import type { AbrirSesion, RespuestaFtp, SesionFtp } from './clienteFtp';
import type { Credenciales } from './configuracion';
import { ejecutarEnvio, listarMiembros, prepararTexto, probarConexion, traerMiembros } from './servicio';
import type { DestinoLocal } from './servicio';

const cred: Credenciales = { host: 'as400', puerto: 21, usuario: 'JDUARTE', password: 'x', seguro: false };

interface Guion {
  /** Respuesta por prefijo del comando; por defecto 250. */
  respuestas?: Array<[RegExp, RespuestaFtp]>;
  falloSubida?: string;
  falloConexion?: string;
  listado?: string;
  /** Listado que ya había antes de compilar (si falta, antes no hay ninguno). */
  listadoAntes?: string;
  /** Texto que devuelve cada comando de lista (NLST, LIST). Si falta, el comando falla. */
  listados?: Record<string, string>;
  /** Contenido de los miembros que se pueden bajar, por nombre de miembro. */
  miembros?: Record<string, Buffer>;
}

function crear(guion: Guion = {}) {
  const comandos: string[] = [];
  const subidas: Array<{ ruta: string; texto: string }> = [];
  let cerrada = false;
  const sesion: SesionFtp = {
    async enviar(c) {
      comandos.push(c);
      for (const [re, r] of guion.respuestas ?? []) if (re.test(c)) return r;
      return { codigo: 250, mensaje: 'ok' };
    },
    async subir(contenido, ruta) {
      if (guion.falloSubida) throw new Error(guion.falloSubida);
      subidas.push({ ruta, texto: contenido.toString('latin1') });
    },
    async descargar(ruta) {
      comandos.push(`RETR ${ruta}`);
      const mbr = /\/([^/]+)\.MBR$/.exec(ruta)?.[1] ?? '';
      if (guion.miembros && mbr in guion.miembros) return guion.miembros[mbr];
      if (guion.miembros) throw new Error(`426 Member ${mbr} not found.`);
      const compilo = comandos.some((c) => /^RCMD (CRT|RUNSQLSTM)/.test(c) && !c.startsWith('RCMD CRTPF FILE(QTEMP') && !c.startsWith('RCMD CRTSRCPF'));
      // Solo el listado del compilador tiene un antes y un después.
      const texto = compilo || !ruta.includes('APPLISTADO') ? guion.listado : guion.listadoAntes;
      if (texto === undefined) throw new Error('sin listado');
      return Buffer.from(texto, 'latin1');
    },
    async listar(comando) {
      comandos.push(comando);
      const texto = guion.listados?.[comando];
      if (texto === undefined) throw new Error(`550 ${comando} no disponible`);
      return texto;
    },
    cerrar() {
      cerrada = true;
    },
  };
  const abrir: AbrirSesion = async () => {
    if (guion.falloConexion) throw new Error(guion.falloConexion);
    return sesion;
  };
  return { abrir, comandos, subidas, cerrada: () => cerrada };
}

function peticion(extra: Partial<PeticionEnvio> = {}): PeticionEnvio {
  return {
    tipo: 'SQLCBL',
    miembro: 'clientep',
    texto: '       IDENTIFICATION DIVISION.\n',
    descripcion: 'Mantencion',
    bibliotecaFuente: 'mibib',
    archivoFuente: 'qcblsrc',
    bibliotecaObjeto: 'miobj',
    compilar: true,
    reemplazar: true,
    crearArchivoFuente: false,
    bibliotecasExtra: ['datos'],
    ...extra,
  };
}

describe('prepararTexto', () => {
  it('usa CRLF, quita líneas finales en blanco y codifica en Windows-1252', () => {
    expect(prepararTexto('a\nñ\n\n\n').toString('latin1')).toBe('a\r\n\xf1\r\n');
    expect(prepararTexto('a\r\nb').toString('latin1')).toBe('a\r\nb\r\n');
  });
});

describe('ejecutarEnvio', () => {
  it('envía y compila en orden, con nombres en mayúsculas', async () => {
    const f = crear();
    const r = await ejecutarEnvio(f.abrir, cred, peticion());
    expect(r.ok).toBe(true);
    expect(r.rutaMiembro).toBe('/QSYS.LIB/MIBIB.LIB/QCBLSRC.FILE/CLIENTEP.MBR');
    expect(f.subidas).toHaveLength(1);
    expect(f.subidas[0].ruta).toBe(r.rutaMiembro);
    expect(f.comandos[0]).toBe('SITE NAMEFMT 1');
    expect(f.comandos).toContain("RCMD CHGPFM FILE(MIBIB/QCBLSRC) MBR(CLIENTEP) SRCTYPE(SQLCBL) TEXT('Mantencion')");
    expect(f.comandos).toContain('RCMD ADDLIBLE LIB(MIOBJ)');
    expect(f.comandos).toContain('RCMD ADDLIBLE LIB(DATOS)');
    const compilar = f.comandos.find((c) => c.startsWith('RCMD CRTSQLCBL'));
    expect(compilar).toContain('PGM(MIOBJ/CLIENTEP)');
    expect(compilar).toContain('COMMIT(*NONE)');
    expect(f.comandos.indexOf(compilar as string)).toBeGreaterThan(f.comandos.indexOf('RCMD ADDLIBLE LIB(DATOS)'));
    expect(f.cerrada()).toBe(true);
  });

  it('sin compilar solo envía', async () => {
    const f = crear();
    const r = await ejecutarEnvio(f.abrir, cred, peticion({ compilar: false, bibliotecaObjeto: '' }));
    expect(r.ok).toBe(true);
    expect(f.comandos.some((c) => /CRTSQLCBL|ADDLIBLE/.test(c))).toBe(false);
  });

  it('crea el archivo fuente solo si no existe', async () => {
    const existe = crear();
    await ejecutarEnvio(existe.abrir, cred, peticion({ crearArchivoFuente: true }));
    expect(existe.comandos.some((c) => c.includes('CRTSRCPF'))).toBe(false);

    const noExiste = crear({ respuestas: [[/CHKOBJ OBJ\(MIBIB/, { codigo: 550, mensaje: 'CPF9801' }]] });
    const r = await ejecutarEnvio(noExiste.abrir, cred, peticion({ crearArchivoFuente: true }));
    expect(r.ok).toBe(true);
    expect(noExiste.comandos).toContain("RCMD CRTSRCPF FILE(MIBIB/QCBLSRC) RCDLEN(92) TEXT('Fuentes')");
  });

  it('si falla el envío no compila', async () => {
    const f = crear({ falloSubida: '550 No existe el archivo' });
    const r = await ejecutarEnvio(f.abrir, cred, peticion());
    expect(r.ok).toBe(false);
    expect(r.pasos.at(-1)?.mensaje).toContain('No existe el archivo');
    expect(f.comandos.some((c) => c.includes('CRTSQLCBL'))).toBe(false);
    expect(f.cerrada()).toBe(true);
  });

  it('si falla la compilación devuelve el error y el listado', async () => {
    const f = crear({
      respuestas: [[/CRTSQLCBL/, { codigo: 550, mensaje: 'CPF0000 Compilación fallida' }]],
      listado: 'LINEA 12 SQL0204 TABLA NO ENCONTRADA\r\n',
    });
    const r = await ejecutarEnvio(f.abrir, cred, peticion());
    expect(r.ok).toBe(false);
    expect(r.pasos.find((p) => p.nombre === 'Compilar')?.ok).toBe(false);
    expect(r.listado).toContain('SQL0204');
    expect(f.comandos).toContain('RCMD CPYSPLF FILE(QSYSPRT) TOFILE(QTEMP/APPLISTADO) SPLNBR(*LAST) MBROPT(*REPLACE)');
  });

  it('COBOL con SQL: trae QSYSPRT y el spool del programa; si el SQL tiene errores graves, solo QSYSPRT', async () => {
    const copia = (spool: string) => `RCMD CPYSPLF FILE(${spool}) TOFILE(QTEMP/APPLISTADO) SPLNBR(*LAST) MBROPT(*REPLACE)`;
    const bien = crear({ listado: 'SQL0000  00     10  Informativo.\r\n' });
    await ejecutarEnvio(bien.abrir, cred, peticion());
    expect(bien.comandos).toContain(copia('QSYSPRT'));
    expect(bien.comandos).toContain(copia('CLIENTEP'));

    const grave = crear({ listado: 'SQL1001  30    139  Definicion de archivo externa no encontrada.\r\n' });
    const r = await ejecutarEnvio(grave.abrir, cred, peticion());
    expect(grave.comandos).toContain(copia('QSYSPRT'));
    // El del programa solo se copia antes de compilar (la foto), no después.
    const compilar = grave.comandos.findIndex((c) => c.startsWith('RCMD CRTSQLCBL'));
    expect(grave.comandos.slice(compilar)).not.toContain(copia('CLIENTEP'));
    expect(r.listado).toContain('SQL1001');
  });

  it('CL: compila con CRTCLPGM o CRTBNDCL y trae el spool con el nombre del programa', async () => {
    const f = crear({ listado: '* CPD0727 40  Variable no declarada.\r\n' });
    await ejecutarEnvio(f.abrir, cred, peticion({ tipo: 'CLP', miembro: 'pgmerr', archivoFuente: 'qclsrc' }));
    expect(f.comandos).toContain('RCMD CRTCLPGM PGM(MIOBJ/PGMERR) SRCFILE(MIBIB/QCLSRC) SRCMBR(PGMERR) REPLACE(*YES)');
    expect(f.comandos).toContain('RCMD CPYSPLF FILE(PGMERR) TOFILE(QTEMP/APPLISTADO) SPLNBR(*LAST) MBROPT(*REPLACE)');
    expect(f.comandos.some((c) => c.includes('FILE(QSYSPRT)'))).toBe(false);
    const ile = crear();
    await ejecutarEnvio(ile.abrir, cred, peticion({ tipo: 'CLLE', miembro: 'pgmerr', archivoFuente: 'qclsrc' }));
    expect(ile.comandos).toContain('RCMD CRTBNDCL PGM(MIOBJ/PGMERR) SRCFILE(MIBIB/QCLSRC) SRCMBR(PGMERR) REPLACE(*YES)');
  });

  it('si el spool no cambió con la compilación, no muestra el listado viejo y lo avisa', async () => {
    const viejo = 'SQL0204  30     12  Listado de ayer.\r\n';
    const f = crear({ respuestas: [[/CRTSQLCBL/, { codigo: 550, mensaje: 'falló' }]], listadoAntes: viejo, listado: viejo });
    const r = await ejecutarEnvio(f.abrir, cred, peticion());
    expect(r.listado).toBeNull();
    expect(r.pasos.find((p) => p.nombre === 'Listado del compilador')?.mensaje).toMatch(/no dejó un listado nuevo/);
    // La foto de antes se toma antes de compilar.
    const copias = f.comandos.filter((c) => c.includes('CPYSPLF FILE(QSYSPRT)'));
    expect(f.comandos.indexOf(copias[0])).toBeLessThan(f.comandos.findIndex((c) => c.startsWith('RCMD CRTSQLCBL')));

    const nuevo = crear({ listadoAntes: viejo, listado: 'SQL0000  00     1  Hoy.\r\n' });
    expect((await ejecutarEnvio(nuevo.abrir, cred, peticion())).listado).toContain('Hoy');
  });

  it('si el listado no se puede traer lo avisa sin ocultar el error', async () => {
    const f = crear({ respuestas: [[/CRTSQLCBL/, { codigo: 550, mensaje: 'falló' }]] });
    const r = await ejecutarEnvio(f.abrir, cred, peticion());
    expect(r.ok).toBe(false);
    expect(r.listado).toBeNull();
    expect(r.pasos.some((p) => p.nombre === 'Listado del compilador' && p.aviso)).toBe(true);
  });

  it('compilar bien aunque no se pueda cambiar el tipo del miembro', async () => {
    const f = crear({ respuestas: [[/CHGPFM/, { codigo: 550, mensaje: 'sin permiso' }]] });
    const r = await ejecutarEnvio(f.abrir, cred, peticion());
    expect(r.ok).toBe(true);
    expect(r.pasos.some((p) => p.aviso && !p.ok)).toBe(true);
  });

  it('informa si no se puede conectar', async () => {
    const f = crear({ falloConexion: 'ECONNREFUSED' });
    const r = await ejecutarEnvio(f.abrir, cred, peticion());
    expect(r.ok).toBe(false);
    expect(r.pasos[0]).toMatchObject({ nombre: 'Conexión', ok: false, mensaje: 'ECONNREFUSED' });
  });

  it('no se conecta si la petición no es válida', async () => {
    let conectado = false;
    const abrir: AbrirSesion = async () => {
      conectado = true;
      throw new Error('no debía conectar');
    };
    const r = await ejecutarEnvio(abrir, cred, peticion({ miembro: 'A) CALL QCMD' }));
    expect(r.ok).toBe(false);
    expect(r.pasos[0].nombre).toBe('Validación');
    expect(conectado).toBe(false);
  });

  it('nunca manda comandos con caracteres fuera de lo validado', async () => {
    const f = crear();
    await ejecutarEnvio(f.abrir, cred, peticion());
    for (const c of f.comandos) expect(c).not.toMatch(/[\r\n;]/);
  });
});

describe('probarConexion', () => {
  it('informa conexión, sistema y RCMD', async () => {
    const f = crear();
    const pasos = await probarConexion(f.abrir, cred);
    expect(pasos.map((p) => p.nombre)).toEqual(['Conexión', 'Sistema', 'Comandos remotos (RCMD)']);
    expect(pasos.every((p) => p.ok)).toBe(true);
    expect(f.cerrada()).toBe(true);
  });

  it('si RCMD no está permitido lo avisa', async () => {
    const f = crear({ respuestas: [[/RCMD/, { codigo: 502, mensaje: 'no permitido' }]] });
    const pasos = await probarConexion(f.abrir, cred);
    const rcmd = pasos.find((p) => p.nombre.startsWith('Comandos'));
    expect(rcmd?.ok).toBe(false);
    expect(rcmd?.aviso).toBe(true);
  });

  it('informa una conexión fallida', async () => {
    const f = crear({ falloConexion: '530 Login incorrect' });
    const pasos = await probarConexion(f.abrir, cred);
    expect(pasos).toEqual([{ nombre: 'Conexión', ok: false, mensaje: '530 Login incorrect' }]);
  });
});

// ---------------------------------------------------------------------------
// Traer fuentes del AS400
// ---------------------------------------------------------------------------

const NLST_REAL = ['PGMREF.MBR', 'ANCALCIO.MBR', 'SI1118PRG2.MBR', ''].join('\r\n');
const LIST_REAL = [
  '-rwx---rwx   1 PRSIAS   0          99552 Jun 25 2025  PGMREF.MBR',
  '-rwx---rwx   1 PRSIAS   0        2942884 Jul 13 14:52 ANCALCIO.MBR',
].join('\r\n');

describe('listarMiembros', () => {
  const hoy = new Date(2026, 10, 19, 12, 0, 0);
  const guion = { listados: { NLST: NLST_REAL, LIST: LIST_REAL } };

  it('trae los miembros ordenados y con su fecha', async () => {
    const f = crear(guion);
    const r = await listarMiembros(f.abrir, cred, 'libjdu', 'qcblsrc', hoy);
    expect(r.ok).toBe(true);
    expect(r.miembros).toEqual([
      { nombre: 'ANCALCIO', fecha: '2026-07-13 14:52', tipo: null, texto: null },
      { nombre: 'PGMREF', fecha: '2025-06-25', tipo: null, texto: null },
      { nombre: 'SI1118PRG2', fecha: null, tipo: null, texto: null },
    ]);
    expect(f.comandos.slice(0, 5)).toEqual([
      'SITE NAMEFMT 1',
      'CWD /QSYS.LIB/LIBJDU.LIB/QCBLSRC.FILE',
      'NLST',
      'SITE LISTFMT 1',
      'LIST',
    ]);
    expect(f.cerrada()).toBe(true);
  });

  it('agrega el tipo y el texto que arma el servidor en QTEMP', async () => {
    const tabla = 'ANCALCIO  CBLLE     Emision de Polizas\r\nPGMREF    SQLCBL    GENERA REFERENCIAS\r\n';
    const f = crear({ ...guion, listado: tabla });
    const r = await listarMiembros(f.abrir, cred, 'LIBJDU', 'QCBLSRC', hoy);
    expect(r.miembros).toEqual([
      { nombre: 'ANCALCIO', fecha: '2026-07-13 14:52', tipo: 'CBLLE', texto: 'Emision de Polizas' },
      { nombre: 'PGMREF', fecha: '2025-06-25', tipo: 'SQLCBL', texto: 'GENERA REFERENCIAS' },
      { nombre: 'SI1118PRG2', fecha: null, tipo: null, texto: null },
    ]);
    expect(f.comandos).toContain('RCMD DSPFD FILE(LIBJDU/QCBLSRC) TYPE(*MBRLIST) OUTPUT(*OUTFILE) OUTFILE(QTEMP/APPMBRLST)');
    expect(f.comandos.some((c) => c.startsWith('RCMD RUNSQL SQL(') && c.endsWith('COMMIT(*NONE)'))).toBe(true);
    expect(f.comandos).toContain('RETR /QSYS.LIB/QTEMP.LIB/APPMBRTIP.FILE/APPMBRTIP.MBR');
    expect(r.pasos.some((p) => p.nombre === 'Tipo de los miembros')).toBe(false);
  });

  it('si el servidor no deja leer los tipos, avisa y lista igual', async () => {
    const f = crear({ ...guion, respuestas: [[/^RCMD DSPFD/, { codigo: 502, mensaje: 'Command not allowed' }]] });
    const r = await listarMiembros(f.abrir, cred, 'LIBJDU', 'QCBLSRC', hoy);
    expect(r.ok).toBe(true);
    expect(r.miembros.every((m) => m.tipo === null)).toBe(true);
    const aviso = r.pasos.find((p) => p.nombre === 'Tipo de los miembros');
    expect(aviso).toMatchObject({ ok: false, aviso: true });
    expect(aviso?.mensaje).toMatch(/502/);
  });

  it('sin fechas igual muestra los nombres y lo avisa', async () => {
    const f = crear({ listados: { NLST: NLST_REAL } });
    const r = await listarMiembros(f.abrir, cred, 'LIBJDU', 'QCBLSRC', hoy);
    expect(r.ok).toBe(true);
    expect(r.miembros.map((m) => m.nombre)).toEqual(['ANCALCIO', 'PGMREF', 'SI1118PRG2']);
    expect(r.pasos.some((p) => p.nombre === 'Fechas' && p.aviso)).toBe(true);
  });

  it('si el archivo fuente no existe devuelve el error del servidor', async () => {
    const f = crear({ ...guion, respuestas: [[/^CWD/, { codigo: 550, mensaje: 'File QCBLXXX in library LIBJDU not found.' }]] });
    const r = await listarMiembros(f.abrir, cred, 'LIBJDU', 'QCBLXXX');
    expect(r.ok).toBe(false);
    expect(r.pasos[0].mensaje).toMatch(/not found/);
    expect(f.comandos).not.toContain('NLST');
  });

  it('si NLST falla lo informa', async () => {
    const f = crear({ listados: {} });
    const r = await listarMiembros(f.abrir, cred, 'LIBJDU', 'QCBLSRC');
    expect(r.ok).toBe(false);
    expect(r.pasos[0]).toMatchObject({ nombre: 'Lista de miembros', ok: false });
  });

  it('avisa de las líneas que no son miembros', async () => {
    const f = crear({ listados: { NLST: 'A.MBR\r\nB C.MBR\r\n', LIST: '' } });
    const r = await listarMiembros(f.abrir, cred, 'LIBJDU', 'QCBLSRC');
    expect(r.miembros.map((m) => m.nombre)).toEqual(['A']);
    expect(r.pasos[0].mensaje).toMatch(/1 línea no es un miembro/);
  });

  it('rechaza biblioteca o archivo no válidos sin conectarse', async () => {
    let conectado = false;
    const abrir: AbrirSesion = async () => {
      conectado = true;
      throw new Error('no debía conectar');
    };
    expect((await listarMiembros(abrir, cred, '', 'QCBLSRC')).pasos[0].mensaje).toMatch(/biblioteca/);
    expect((await listarMiembros(abrir, cred, 'LIB/X', 'QCBLSRC')).ok).toBe(false);
    expect((await listarMiembros(abrir, cred, 'LIB', 'Q) CALL')).pasos[0].mensaje).toMatch(/archivo fuente/);
    expect(conectado).toBe(false);
  });

  it('informa si no se puede conectar', async () => {
    const f = crear({ falloConexion: 'ECONNREFUSED' });
    const r = await listarMiembros(f.abrir, cred, 'LIBJDU', 'QCBLSRC');
    expect(r.pasos).toEqual([{ nombre: 'Conexión', ok: false, mensaje: 'ECONNREFUSED' }]);
  });
});

describe('traerMiembros', () => {
  function destinoFalso(existentes: string[] = []) {
    const escritos: Array<{ nombre: string; texto: string }> = [];
    const destino: DestinoLocal = {
      carpeta: 'C:\\fuentes',
      existe: async (n) => existentes.includes(n),
      escribir: async (n, texto) => {
        escritos.push({ nombre: n, texto });
        return existentes.includes(n) ? `${n}.bak` : null;
      },
    };
    return { destino, escritos };
  }

  const miembros = {
    PGMREF: Buffer.from('       IDENTIFICATION DIVISION.\r\n       PROGRAM-ID. PGMREF.\r\n       * Compilaci\xf3n\r\n\r\n', 'latin1'),
    CONSQL: Buffer.from('           EXEC SQL\r\n              INCLUDE SQLCA\r\n           END-EXEC.\r\n', 'latin1'),
  };

  it('baja cada miembro, lo guarda con su extensión y respeta los acentos', async () => {
    const f = crear({ miembros });
    const { destino, escritos } = destinoFalso();
    const r = await traerMiembros(f.abrir, cred, { biblioteca: 'libjdu', archivoFuente: 'qcblsrc', miembros: ['pgmref', 'consql'], sobrescribir: false }, destino);
    expect(r.ok).toBe(true);
    expect(r.carpeta).toBe('C:\\fuentes');
    expect(r.resultados.map((x) => [x.miembro, x.archivo, x.ok])).toEqual([
      ['PGMREF', 'PGMREF.cbl', true],
      ['CONSQL', 'CONSQL.sqlcbl', true],
    ]);
    expect(escritos[0].texto).toBe('       IDENTIFICATION DIVISION.\n       PROGRAM-ID. PGMREF.\n       * Compilación\n');
    expect(f.comandos).toContain('RETR /QSYS.LIB/LIBJDU.LIB/QCBLSRC.FILE/PGMREF.MBR');
    expect(f.cerrada()).toBe(true);
  });

  it('la extensión sale del tipo del miembro en el servidor, no del archivo fuente', async () => {
    const tabla = Buffer.from('MIDSP     DSPF      Pantalla\r\nMILOG     LF        Logico\r\nMIFIS     PF        Fisico\r\n', 'latin1');
    const f = crear({
      miembros: {
        MIDSP: Buffer.from('     A          R REG1\r\n', 'latin1'),
        MILOG: Buffer.from('     A          R REG1\r\n', 'latin1'),
        MIFIS: Buffer.from('     A          R REG1\r\n', 'latin1'),
        APPMBRTIP: tabla,
      },
    });
    const { destino } = destinoFalso();
    const r = await traerMiembros(f.abrir, cred, { biblioteca: 'LIB', archivoFuente: 'QDDSSRC', miembros: ['MIDSP', 'MILOG', 'MIFIS'], sobrescribir: false }, destino);
    expect(r.resultados.map((x) => x.archivo)).toEqual(['MIDSP.dspf', 'MILOG.lf', 'MIFIS.pf']);
  });

  it('si el servidor no da los tipos, se deducen del contenido', async () => {
    const f = crear({
      miembros: { MIDSP: Buffer.from('     A                                      DSPSIZ(24 80 *DS3)\r\n     A          R REG1\r\n', 'latin1') },
      respuestas: [[/^RCMD/, { codigo: 502, mensaje: 'no permitido' }]],
    });
    const { destino } = destinoFalso();
    const r = await traerMiembros(f.abrir, cred, { biblioteca: 'LIB', archivoFuente: 'QDDSSRC', miembros: ['MIDSP'], sobrescribir: false }, destino);
    expect(r.resultados[0].archivo).toBe('MIDSP.dspf');
  });

  it('no reemplaza lo que ya existe, salvo que se pida, y entonces deja copia', async () => {
    const f1 = crear({ miembros });
    const a = destinoFalso(['PGMREF.cbl']);
    const sin = await traerMiembros(f1.abrir, cred, { biblioteca: 'LIBJDU', archivoFuente: 'QCBLSRC', miembros: ['PGMREF', 'CONSQL'], sobrescribir: false }, a.destino);
    expect(sin.resultados[0]).toMatchObject({ miembro: 'PGMREF', omitido: true, ok: false });
    expect(sin.resultados[1]).toMatchObject({ miembro: 'CONSQL', ok: true });
    expect(sin.ok).toBe(true);
    expect(a.escritos.map((e) => e.nombre)).toEqual(['CONSQL.sqlcbl']);

    const f2 = crear({ miembros });
    const b = destinoFalso(['PGMREF.cbl']);
    const con = await traerMiembros(f2.abrir, cred, { biblioteca: 'LIBJDU', archivoFuente: 'QCBLSRC', miembros: ['PGMREF'], sobrescribir: true }, b.destino);
    expect(con.resultados[0]).toMatchObject({ ok: true, copia: 'PGMREF.cbl.bak' });
    expect(con.resultados[0].mensaje).toMatch(/\.bak/);
  });

  it('un miembro que falla no detiene a los demás', async () => {
    const f = crear({ miembros });
    const { destino, escritos } = destinoFalso();
    const r = await traerMiembros(f.abrir, cred, { biblioteca: 'LIBJDU', archivoFuente: 'QCBLSRC', miembros: ['NOEXISTE', 'PGMREF'], sobrescribir: false }, destino);
    expect(r.ok).toBe(false);
    expect(r.resultados[0]).toMatchObject({ miembro: 'NOEXISTE', ok: false });
    expect(r.resultados[0].mensaje).toMatch(/not found/);
    expect(r.resultados[1]).toMatchObject({ miembro: 'PGMREF', ok: true });
    expect(escritos).toHaveLength(1);
  });

  it('valida los nombres antes de conectarse', async () => {
    let conectado = false;
    const abrir: AbrirSesion = async () => {
      conectado = true;
      throw new Error('no debía conectar');
    };
    const { destino } = destinoFalso();
    const pedir = (miembros: string[], bib = 'LIB') =>
      traerMiembros(abrir, cred, { biblioteca: bib, archivoFuente: 'QCBLSRC', miembros, sobrescribir: false }, destino);
    expect((await pedir([])).pasos[0].mensaje).toMatch(/No hay miembros/);
    expect((await pedir(['A/../B'])).pasos[0].mensaje).toMatch(/no válido/);
    expect((await pedir(['OK', 'X) CALL'])).ok).toBe(false);
    expect((await pedir(['OK'], '')).pasos[0].mensaje).toMatch(/biblioteca/);
    expect((await pedir(Array.from({ length: 201 }, (_, i) => `M${i}`))).pasos[0].mensaje).toMatch(/hasta 200/);
    expect(conectado).toBe(false);
  });

  it('un miembro repetido se baja una sola vez', async () => {
    const f = crear({ miembros });
    const { destino, escritos } = destinoFalso();
    await traerMiembros(f.abrir, cred, { biblioteca: 'LIBJDU', archivoFuente: 'QCBLSRC', miembros: ['PGMREF', 'pgmref'], sobrescribir: false }, destino);
    expect(escritos).toHaveLength(1);
  });
});
