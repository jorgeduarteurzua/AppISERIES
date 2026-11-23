// Sondeo del tipo y del texto de los miembros fuente (lo que PDM muestra en «Tipo» y «Texto»).
//
// El listado FTP no trae el tipo (DSPF, PF, LF...). Este sondeo prueba si el servidor deja ejecutar
// comandos con RCMD, genera la lista de miembros en un archivo de QTEMP con DSPFD *MBRLIST y la baja
// para ver cómo viene. Con lo que devuelva se decide cómo leer el tipo.
//
// Uso (desde la carpeta del proyecto):
//   node .\herramientas\sondeo-tipos.mjs SERVIDOR USUARIO BIBLIOTECA ARCHIVO_FUENTE
//
// Opciones:  --puerto=21   --seguro (FTPS)   --salida=ruta.txt
//
// ATENCIÓN: a diferencia de sondeo-ftp.mjs, este sí ejecuta comandos en el AS400, pero solo:
//   DSPFD ... OUTPUT(*OUTFILE) OUTFILE(QTEMP/SONDEOMBR)    (lista de miembros)
//   DSPFFD ... OUTPUT(*OUTFILE) OUTFILE(QTEMP/SONDEOCAM)   (descripción de los campos de la lista)
// Los dos escriben únicamente en QTEMP, que se vacía al cerrar la sesión. No cambia ni borra nada tuyo.
// La contraseña se pide por teclado y no se guarda ni se escribe en el resultado.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { Client, FTPError } from 'basic-ftp';
/** Tablas EBCDIC (iconv-lite no las trae): 37 = EE.UU., 1145 = español. */
const EBCDIC = {
  37 : [0,1,2,3,156,9,134,127,151,141,142,11,12,13,14,15,16,17,18,19,157,133,8,135,24,25,146,143,28,29,30,31,128,129,130,131,132,10,23,27,136,137,138,139,140,5,6,7,144,145,22,147,148,149,150,4,152,153,154,155,20,21,158,26,32,160,226,228,224,225,227,229,231,241,162,46,60,40,43,124,38,233,234,235,232,237,238,239,236,223,33,36,42,41,59,172,45,47,194,196,192,193,195,197,199,209,166,44,37,95,62,63,248,201,202,203,200,205,206,207,204,96,58,35,64,39,61,34,216,97,98,99,100,101,102,103,104,105,171,187,240,253,254,177,176,106,107,108,109,110,111,112,113,114,170,186,230,184,198,164,181,126,115,116,117,118,119,120,121,122,161,191,208,221,222,174,94,163,165,183,169,167,182,188,189,190,91,93,175,168,180,215,123,65,66,67,68,69,70,71,72,73,173,244,246,242,243,245,125,74,75,76,77,78,79,80,81,82,185,251,252,249,250,255,92,247,83,84,85,86,87,88,89,90,178,212,214,210,211,213,48,49,50,51,52,53,54,55,56,57,179,219,220,217,218,159],
  1145 : [0,1,2,3,156,9,134,127,151,141,142,11,12,13,14,15,16,17,18,19,157,133,8,135,24,25,146,143,28,29,30,31,128,129,130,131,132,10,23,27,136,137,138,139,140,5,6,7,144,145,22,147,148,149,150,4,152,153,154,155,20,21,158,26,32,160,226,228,224,225,227,229,231,166,91,46,60,40,43,124,38,233,234,235,232,237,238,239,236,223,93,36,42,41,59,172,45,47,194,196,192,193,195,197,199,35,241,44,37,95,62,63,248,201,202,203,200,205,206,207,204,96,58,209,64,39,61,34,216,97,98,99,100,101,102,103,104,105,171,187,240,253,254,177,176,106,107,108,109,110,111,112,113,114,170,186,230,184,198,8364,181,168,115,116,117,118,119,120,121,122,161,191,208,221,222,174,162,163,165,183,169,167,182,188,189,190,94,33,175,126,180,215,123,65,66,67,68,69,70,71,72,73,173,244,246,242,243,245,125,74,75,76,77,78,79,80,81,82,185,251,252,249,250,255,92,247,83,84,85,86,87,88,89,90,178,212,214,210,211,213,48,49,50,51,52,53,54,55,56,57,179,219,220,217,218,159],
};
const iconv = {
  decode(bytes, pagina) {
    const tabla = EBCDIC[pagina];
    let s = '';
    for (const b of bytes) s += String.fromCharCode(tabla[b]);
    return s;
  },
};

const argumentos = process.argv.slice(2);
const opciones = Object.fromEntries(
  argumentos.filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.slice(2).split('=');
    return [k, v ?? true];
  }),
);
const [servidor, usuario, biblioteca, archivoFuente] = argumentos.filter((a) => !a.startsWith('--'));

if (!servidor || !usuario || !biblioteca || !archivoFuente) {
  console.error('Uso: node .\\herramientas\\sondeo-tipos.mjs SERVIDOR USUARIO BIBLIOTECA ARCHIVO_FUENTE');
  console.error('Ejemplo: node .\\herramientas\\sondeo-tipos.mjs 192.168.1.10 USUARIO MIBIB QDDSSRC');
  process.exit(1);
}
const nombre = /^[A-Za-z$#@][A-Za-z0-9$#@_]{0,9}$/;
for (const [etiqueta, valor] of [['usuario', usuario], ['biblioteca', biblioteca], ['archivo fuente', archivoFuente]]) {
  if (!nombre.test(valor)) {
    console.error(`El ${etiqueta} «${valor}» no es un nombre válido (máximo 10 caracteres: A-Z, 0-9, $ # @ _).`);
    process.exit(1);
  }
}
const BIB = biblioteca.toUpperCase();
const ARC = archivoFuente.toUpperCase();
const rutaSalida = typeof opciones.salida === 'string' ? opciones.salida : join(process.cwd(), 'sondeo-tipos-resultado.txt');

function pedirClave() {
  return new Promise((resolver) => {
    process.stdout.write('Contraseña: ');
    const entrada = process.stdin;
    if (!entrada.isTTY) {
      let texto = '';
      entrada.setEncoding('utf8');
      entrada.on('data', (t) => (texto += t));
      entrada.on('end', () => resolver(texto.split(/\r?\n/)[0] ?? ''));
      return;
    }
    let clave = '';
    entrada.setRawMode(true);
    entrada.resume();
    entrada.setEncoding('utf8');
    const alDato = (trozo) => {
      for (const c of trozo) {
        if (c === '\r' || c === '\n' || c === '\u0004') {
          entrada.setRawMode(false);
          entrada.pause();
          entrada.off('data', alDato);
          process.stdout.write('\n');
          resolver(clave);
          return;
        }
        if (c === '\u0003') process.exit(1);
        if (c === '\u007f' || c === '\b') clave = clave.slice(0, -1);
        else clave += c;
      }
    };
    entrada.on('data', alDato);
  });
}

const respuesta = (r) => (r.message.trimStart().startsWith(String(r.code)) ? r.message : ` ${r.code} ${r.message}`);
const lineas = [];
const escribir = (texto = '') => lineas.push(texto);
const visible = (texto) =>
  texto.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, (c) => `<${c.charCodeAt(0).toString(16).padStart(2, '0')}>`);

function titulo(texto) {
  escribir('');
  escribir('='.repeat(78));
  escribir(texto);
  escribir('='.repeat(78));
}

async function comando(cliente, texto) {
  escribir(`> ${texto}`);
  try {
    const r = await cliente.send(texto);
    escribir(`< ${visible(respuesta(r)).replace(/\r?\n/g, '\n<   ')}`);
    return r;
  } catch (e) {
    escribir(e instanceof FTPError ? `< ERROR ${e.code} ${visible(e.message)}` : `< FALLÓ ${e.message}`);
    return null;
  }
}

async function nombres(cliente, texto) {
  escribir(`> ${texto}`);
  let crudo = null;
  cliente.parseList = (t) => {
    crudo = t;
    return [];
  };
  try {
    await cliente.prepareTransfer(cliente.ftp);
    await cliente._requestListWithCommand(texto);
    const filas = (crudo ?? '').split(/\r?\n/).filter((f) => f !== '');
    escribir(`< ${filas.length} líneas`);
    for (const f of filas.slice(0, 15)) escribir(`  | ${visible(f)}`);
    return filas;
  } catch (e) {
    escribir(e instanceof FTPError ? `< ERROR ${e.code} ${visible(e.message)}` : `< FALLÓ ${e.message}`);
    return [];
  }
}

async function bajarBytes(cliente, ruta, tipo) {
  const trozos = [];
  const destino = new Writable({
    write(t, _c, listo) {
      trozos.push(Buffer.from(t));
      listo();
    },
  });
  try {
    await cliente.send(tipo === 'A' ? 'TYPE A' : 'TYPE I');
    await cliente.downloadTo(destino, ruta);
    return Buffer.concat(trozos);
  } catch (e) {
    escribir(e instanceof FTPError ? `< ERROR ${e.code} ${visible(e.message)}` : `< FALLÓ ${e.message}`);
    return null;
  }
}

/** Tramos legibles (EBCDIC 037) de un registro, con su posición, para localizar los campos de texto. */
function tramos(registro) {
  const texto = iconv.decode(registro, 37);
  const salida = [];
  const re = /[A-Za-z0-9$#@_ .,:;()\/\-ÁÉÍÓÚáéíóúñÑ]{3,}/g;
  let m;
  while ((m = re.exec(texto)) !== null) {
    const t = m[0].trimEnd();
    if (t.trim().length >= 3) salida.push(`    pos ${String(m.index + 1).padStart(4)} (${t.length} car.): ${t.slice(0, 70)}`);
  }
  return salida;
}

/** Baja un archivo de base de datos de QTEMP en ASCII y en binario y lo describe. */
async function volcar(cliente, miembro, etiqueta) {
  const ruta = `/QSYS.LIB/QTEMP.LIB/${miembro}.FILE/${miembro}.MBR`;
  escribir(`> RETR ${ruta}  (ASCII y binario)`);
  const ascii = await bajarBytes(cliente, ruta, 'A');
  const binario = await bajarBytes(cliente, ruta, 'I');
  if (!ascii || !binario) return null;
  const filasAscii = new TextDecoder('windows-1252').decode(ascii).split(/\r?\n/).filter((l) => l !== '');
  const registros = filasAscii.length;
  const largo = registros > 0 ? binario.length / registros : 0;
  escribir(`< ASCII: ${ascii.length} bytes, ${registros} líneas.  Binario: ${binario.length} bytes.`);
  escribir(`  Largo de registro estimado (binario / líneas): ${largo}${Number.isInteger(largo) ? '' : '  (NO es entero: las líneas ASCII no coinciden con los registros)'}`);
  escribir(`  Primeras 5 líneas en ASCII de ${etiqueta}:`);
  for (const l of filasAscii.slice(0, 5)) escribir(`  | ${visible(l).slice(0, 200)}`);
  if (Number.isInteger(largo) && largo > 0) {
    for (let i = 0; i < Math.min(3, registros); i++) {
      const reg = binario.subarray(i * largo, (i + 1) * largo);
      escribir(`  Registro ${i + 1}: tramos de texto (EBCDIC 037):`);
      for (const t of tramos(reg)) escribir(t);
    }
    const reg1 = binario.subarray(0, largo);
    escribir(`  Registro 1 en hex (${largo} bytes, filas de 32):`);
    for (let p = 0; p < reg1.length; p += 32) {
      escribir(`    ${String(p + 1).padStart(4)}: ${reg1.subarray(p, p + 32).toString('hex').replace(/(..)/g, '$1 ').trim()}`);
    }
  }
  return { binario, largo, registros, filasAscii };
}

const clave = await pedirClave();
const cliente = new Client(30_000);
let codigoSalida = 0;
try {
  titulo('Conexión');
  escribir(`Servidor: ${servidor}:${opciones.puerto ?? 21}   Usuario: ${usuario.toUpperCase()}   FTPS: ${opciones.seguro ? 'sí' : 'no'}`);
  escribir(`Biblioteca: ${BIB}   Archivo fuente: ${ARC}`);
  escribir(`Fecha: ${new Date().toISOString()}`);
  const inicio = await cliente.access({
    host: servidor,
    port: Number(opciones.puerto ?? 21),
    user: usuario,
    password: clave,
    secure: opciones.seguro === true,
  });
  escribir(`< ${visible(respuesta(inicio))}`);

  titulo('1. Miembros según el listado normal (para comparar)');
  await comando(cliente, 'SITE NAMEFMT 1');
  await comando(cliente, `CWD /QSYS.LIB/${BIB}.LIB/${ARC}.FILE`);
  const miembros = await nombres(cliente, 'NLST');
  escribir(`  Total de miembros: ${miembros.length}`);

  titulo('2. ¿Deja el servidor ejecutar comandos? (RCMD)');
  const r1 = await comando(cliente, `RCMD DSPFD FILE(${BIB}/${ARC}) TYPE(*MBRLIST) OUTPUT(*OUTFILE) OUTFILE(QTEMP/SONDEOMBR)`);
  if (!r1) {
    escribir('');
    escribir('RCMD no está permitido (o el comando falló). Mira el mensaje de arriba: si dice que el');
    escribir('comando no está permitido, el administrador lo bloqueó y habrá que deducir el tipo por el contenido.');
  } else {
    await comando(cliente, 'RCMD DSPFFD FILE(QTEMP/SONDEOMBR) OUTPUT(*OUTFILE) OUTFILE(QTEMP/SONDEOCAM)');

    titulo('3. Lista de miembros generada (QTEMP/SONDEOMBR)');
    await comando(cliente, 'SITE NAMEFMT 1');
    await nombres(cliente, 'NLST /QSYS.LIB/QTEMP.LIB');
    const lista = await volcar(cliente, 'SONDEOMBR', 'la lista de miembros');

    titulo('4. Descripción de los campos de esa lista (QTEMP/SONDEOCAM)');
    escribir('  Aquí aparecen los nombres de campo, la posición y el largo. Se busca el campo del tipo y el del texto.');
    await volcar(cliente, 'SONDEOCAM', 'la descripción de campos');

    titulo('5. Campos de la lista de miembros (leídos de SONDEOCAM)');
    const campos = [];
    const camposAscii = (await bajarBytes(cliente, '/QSYS.LIB/QTEMP.LIB/SONDEOCAM.FILE/SONDEOCAM.MBR', 'A')) ?? Buffer.alloc(0);
    for (const linea of new TextDecoder('windows-1252').decode(camposAscii).split(/\r?\n/)) {
      const m = /(ML[A-Z0-9]*)\s+(ML[A-Z0-9]*)\s+(\d{5})(\d{5})(\d{5})(\d{4})(.{0,30})/.exec(linea);
      if (m) campos.push({ nombre: m[1], pos: Number(m[3]), largo: Number(m[5]), dec: m[6], desc: m[7].trim() });
    }
    escribir(`  ${campos.length} campos (nombre, posición, largo, decimales, descripción):`);
    for (const c of campos) escribir(`  ${c.nombre.padEnd(10)} pos ${String(c.pos).padStart(4)}  largo ${String(c.largo).padStart(3)}  dec ${c.dec}  ${visible(c.desc)}`);

    titulo('6. Tipo y texto de cada miembro, leídos del registro binario');
    if (lista && miembros.length > 0 && Number.isInteger(lista.binario.length / miembros.length)) {
      const largoReg = lista.binario.length / miembros.length;
      escribir(`  Largo de registro = ${lista.binario.length} / ${miembros.length} miembros = ${largoReg}`);
      const buscar = (n) => campos.find((c) => c.nombre === n);
      const leer = (reg, c, codigo) => (c ? iconv.decode(reg.subarray(c.pos - 1, c.pos - 1 + c.largo), codigo).trimEnd() : '(sin campo)');
      const cuenta = new Map();
      for (let i = 0; i < miembros.length; i++) {
        const reg = lista.binario.subarray(i * largoReg, (i + 1) * largoReg);
        const tipo = leer(reg, buscar('MLSEU2'), 37);
        cuenta.set(tipo, (cuenta.get(tipo) ?? 0) + 1);
        if (i < 25) {
          escribir(`  ${leer(reg, buscar('MLNAME'), 37).padEnd(11)} tipo=${tipo.padEnd(10)} MLSEU=${leer(reg, buscar('MLSEU'), 37).padEnd(5)} texto(037)=${leer(reg, buscar('MLMTXT'), 37)}`);
          escribir(`${' '.repeat(14)}texto(1145)=${leer(reg, buscar('MLMTXT'), 1145)}`);
        }
      }
      escribir(`  Tipos encontrados: ${[...cuenta].map(([k, v]) => `${k || '(vacío)'}=${v}`).join(', ')}`);
    } else {
      escribir('  No se pudo calcular el largo de registro.');
    }

    titulo('7. Alternativa: lista solo con campos de texto (RUNSQL en QTEMP)');
    const r3 = await comando(cliente, "RCMD RUNSQL SQL('CREATE TABLE QTEMP/SONDEOTIP AS (SELECT MLNAME, MLSEU2, MLMTXT FROM QTEMP/SONDEOMBR) WITH DATA') COMMIT(*NONE)");
    if (r3) {
      await comando(cliente, 'SITE NAMEFMT 1');
      const ruta = '/QSYS.LIB/QTEMP.LIB/SONDEOTIP.FILE/SONDEOTIP.MBR';
      const sql = await bajarBytes(cliente, ruta, 'A');
      if (sql) {
        const filas = new TextDecoder('windows-1252').decode(sql).split(/\r?\n/).filter((l) => l !== '');
        escribir(`< ${filas.length} líneas (esperadas ${miembros.length})`);
        for (const f of filas.slice(0, 25)) escribir(`  | ${visible(f)}`);
      }
    }  }
} catch (e) {
  codigoSalida = 1;
  titulo('Error');
  escribir(e instanceof FTPError ? `${e.code} ${visible(e.message)}` : String(e?.message ?? e));
} finally {
  cliente.close();
  escribir('');
  escribir('Fin del sondeo.');
  writeFileSync(rutaSalida, lineas.join('\r\n') + '\r\n', 'utf-8');
  console.log(codigoSalida === 0 ? 'Listo.' : 'El sondeo terminó con un error.');
  console.log(`Resultado en: ${rutaSalida}`);
  console.log('Revísalo antes de enviarlo: incluye nombres de miembros y sus textos.');
  process.exit(codigoSalida);
}
