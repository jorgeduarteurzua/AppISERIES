// Sondeo del FTP del AS400: ejecuta una serie de comandos de solo lectura y deja las respuestas
// tal como las devuelve el servidor, para poder construir la lista de fuentes con ellas.
//
// Uso (desde la carpeta del proyecto):
//   node .\herramientas\sondeo-ftp.mjs SERVIDOR USUARIO BIBLIOTECA ARCHIVO_FUENTE MIEMBRO
//
// Opciones:  --puerto=21   --seguro (FTPS)   --salida=ruta.txt
//
// La contraseña se pide por teclado (no se ve al escribirla) y no se guarda ni se escribe en el
// resultado. Solo se leen datos: no se crea, cambia ni borra nada en el AS400.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { Client, FTPError } from 'basic-ftp';

const argumentos = process.argv.slice(2);
const opciones = Object.fromEntries(
  argumentos.filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.slice(2).split('=');
    return [k, v ?? true];
  }),
);
const [servidor, usuario, biblioteca, archivoFuente, miembro] = argumentos.filter((a) => !a.startsWith('--'));

if (!servidor || !usuario || !biblioteca || !archivoFuente || !miembro) {
  console.error('Uso: node .\\herramientas\\sondeo-ftp.mjs SERVIDOR USUARIO BIBLIOTECA ARCHIVO_FUENTE MIEMBRO');
  console.error('Ejemplo: node .\\herramientas\\sondeo-ftp.mjs 192.168.1.10 JDUARTE MIBIB QDSPSRC ASQRY05D');
  process.exit(1);
}
const nombre = /^[A-Za-z$#@][A-Za-z0-9$#@_]{0,9}$/;
for (const [etiqueta, valor] of [['usuario', usuario], ['biblioteca', biblioteca], ['archivo fuente', archivoFuente], ['miembro', miembro]]) {
  if (!nombre.test(valor)) {
    console.error(`El ${etiqueta} «${valor}» no es un nombre válido (máximo 10 caracteres: A-Z, 0-9, $ # @ _).`);
    process.exit(1);
  }
}
const BIB = biblioteca.toUpperCase();
const ARC = archivoFuente.toUpperCase();
const MBR = miembro.toUpperCase();
const rutaSalida = typeof opciones.salida === 'string' ? opciones.salida : join(process.cwd(), 'sondeo-ftp-resultado.txt');

/** Pide la contraseña sin mostrarla. Si la entrada no es un teclado, lee la primera línea. */
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

/** Código y mensaje sin repetir el código si el mensaje ya lo trae. */
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

/** Comando de control: se anota la respuesta del servidor o el error. */
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

/** Comando con datos (NLST, LIST...): se anota tal cual el texto que llega por la conexión de datos. */
async function conDatos(cliente, texto) {
  escribir(`> ${texto}`);
  let crudo = null;
  cliente.parseList = (t) => {
    crudo = t;
    return [];
  };
  try {
    await cliente.prepareTransfer(cliente.ftp);
    await cliente._requestListWithCommand(texto);
    const filas = crudo === null ? [] : crudo.split(/\r?\n/);
    escribir(`< ${crudo === null ? 0 : filas.filter((f) => f !== '').length} líneas${filas.length > 60 ? ' (se muestran las primeras 60)' : ''}`);
    for (const f of filas.filter((x) => x !== '').slice(0, 60)) escribir(`  | ${visible(f)}`);
    return crudo;
  } catch (e) {
    escribir(e instanceof FTPError ? `< ERROR ${e.code} ${visible(e.message)}` : `< FALLÓ ${e.message}`);
    return null;
  }
}

/** Baja un miembro y muestra las primeras líneas y los primeros bytes. */
async function bajar(cliente, ruta) {
  escribir(`> RETR ${ruta}   (modo ASCII)`);
  const trozos = [];
  const destino = new Writable({
    write(t, _c, listo) {
      trozos.push(Buffer.from(t));
      listo();
    },
  });
  try {
    await cliente.send('TYPE A');
    await cliente.downloadTo(destino, ruta);
    const bytes = Buffer.concat(trozos);
    escribir(`< ${bytes.length} bytes`);
    escribir('  Primeros 120 bytes (hex):');
    escribir(`  ${bytes.subarray(0, 120).toString('hex').replace(/(..)/g, '$1 ').trim()}`);
    escribir('  Primeras 25 líneas (leídas como Windows-1252):');
    const texto = new TextDecoder('windows-1252').decode(bytes);
    for (const l of texto.split(/\r?\n/).slice(0, 25)) escribir(`  | ${visible(l)}`);
  } catch (e) {
    escribir(e instanceof FTPError ? `< ERROR ${e.code} ${visible(e.message)}` : `< FALLÓ ${e.message}`);
  }
}

const clave = await pedirClave();
const cliente = new Client(30_000);
let codigoSalida = 0;
try {
  titulo('Conexión');
  escribir(`Servidor: ${servidor}:${opciones.puerto ?? 21}   Usuario: ${usuario.toUpperCase()}   FTPS: ${opciones.seguro ? 'sí' : 'no'}`);
  escribir(`Biblioteca: ${BIB}   Archivo fuente: ${ARC}   Miembro: ${MBR}`);
  escribir(`Fecha: ${new Date().toISOString()}`);
  const inicio = await cliente.access({
    host: servidor,
    port: Number(opciones.puerto ?? 21),
    user: usuario,
    password: clave,
    secure: opciones.seguro === true,
  });
  escribir(`< ${visible(respuesta(inicio))}`);

  titulo('1. Servidor');
  await comando(cliente, 'SYST');
  await comando(cliente, 'FEAT');
  await comando(cliente, 'PWD');

  titulo('2. Formato de nombres 1 (rutas /QSYS.LIB/...)');
  await comando(cliente, 'SITE NAMEFMT 1');
  await comando(cliente, 'PWD');
  const archivo = `/QSYS.LIB/${BIB}.LIB/${ARC}.FILE`;
  await comando(cliente, `CWD ${archivo}`);
  await comando(cliente, 'PWD');

  titulo(`3. Miembros de ${BIB}/${ARC}: NLST (solo nombres)`);
  await conDatos(cliente, 'NLST');
  await conDatos(cliente, `NLST ${archivo}`);

  titulo(`4. Miembros de ${BIB}/${ARC}: LIST (con detalles)`);
  await conDatos(cliente, 'LIST');
  await comando(cliente, 'SITE LISTFMT 0');
  await conDatos(cliente, 'LIST');
  await comando(cliente, 'SITE LISTFMT 1');
  await conDatos(cliente, 'LIST');

  titulo('5. Un miembro concreto');
  await conDatos(cliente, `NLST ${MBR}*`);
  await conDatos(cliente, `LIST ${MBR}.MBR`);

  titulo(`6. Archivos fuente de la biblioteca ${BIB}`);
  await conDatos(cliente, `NLST /QSYS.LIB/${BIB}.LIB/Q*SRC*.FILE`);
  await conDatos(cliente, `NLST /QSYS.LIB/${BIB}.LIB/*.FILE`);

  titulo('7. Descarga de un miembro');
  await bajar(cliente, `${archivo}/${MBR}.MBR`);

  titulo('8. Descarga de un miembro que no existe (para ver el error)');
  await bajar(cliente, `${archivo}/ZZNOEXISTE.MBR`);
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
  console.log('Revísalo antes de enviarlo: puede incluir nombres de miembros y las primeras líneas de uno.');
  process.exit(codigoSalida);
}
