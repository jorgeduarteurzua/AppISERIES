import iconv from 'iconv-lite';
import {
  RUTA_LISTADO,
  RUTA_TIPOS,
  comandoAgregarBiblioteca,
  comandoCambiarMiembro,
  comandoCompilacion,
  comandoCopiarListado,
  comandoCrearArchivoFuente,
  comandoBorrarTipos,
  comandoCrearArchivoListado,
  comandoCrearTipos,
  comandoExisteArchivo,
  comandoListaMiembros,
  rutaMiembro,
  spoolsDeListado,
} from '../../../src/core/as400/comandos';
import { hayErrorGrave, leerListado } from '../../../src/core/as400/listado';
import {
  MAX_MIEMBROS_POR_DESCARGA,
  extensionDeTipo,
  extensionLocal,
  parsearListUnix,
  parsearNlst,
  parsearTiposMiembros,
  unirMiembros,
} from '../../../src/core/as400/miembros';
import type {
  InfoMiembro,
  PeticionTraer,
  ResultadoListado,
  ResultadoMiembroTraido,
  ResultadoTraer,
} from '../../../src/core/as400/miembros';
import type { PasoEnvio, PeticionEnvio, ResultadoEnvio } from '../../../src/core/as400/tipos';
import { esNombreValido, normalizarNombre, validarPeticion } from '../../../src/core/as400/validacion';
import type { Credenciales } from './configuracion';
import type { AbrirSesion, RespuestaFtp, SesionFtp } from './clienteFtp';

/** Los fuentes se envían en Windows-1252; el AS400 los convierte con su tabla ASCII. */
const CODIFICACION_ENVIO = 'windows-1252';

/** Texto listo para subir: líneas CRLF, sin líneas en blanco al final. */
export function prepararTexto(texto: string): Buffer {
  const limpio = texto.replace(/\r?\n/g, '\r\n').replace(/(\r\n)+$/, '');
  return iconv.encode(`${limpio}\r\n`, CODIFICACION_ENVIO);
}

/** Pone en mayúsculas los nombres de la petición, que son lo único que llega a los comandos. */
export function normalizarPeticion(p: PeticionEnvio): PeticionEnvio {
  const nombre = (x: unknown): string => (typeof x === 'string' ? normalizarNombre(x) : '');
  return {
    tipo: p.tipo,
    miembro: nombre(p.miembro),
    texto: typeof p.texto === 'string' ? p.texto : '',
    descripcion: typeof p.descripcion === 'string' ? p.descripcion.trim() : '',
    bibliotecaFuente: nombre(p.bibliotecaFuente),
    archivoFuente: nombre(p.archivoFuente),
    bibliotecaObjeto: nombre(p.bibliotecaObjeto),
    compilar: p.compilar === true,
    reemplazar: p.reemplazar === true,
    crearArchivoFuente: p.crearArchivoFuente === true,
    bibliotecasExtra: Array.isArray(p.bibliotecasExtra) ? p.bibliotecasExtra.map(nombre) : [],
  };
}

/** Código y mensaje de la respuesta, sin repetir el código si el mensaje ya lo trae. */
function texto(r: RespuestaFtp): string {
  const mensaje = r.mensaje.replace(/\s+/g, ' ').trim();
  return mensaje.startsWith(String(r.codigo)) ? mensaje : `${r.codigo} ${mensaje}`;
}

const fallo = (r: RespuestaFtp): boolean => r.codigo >= 400;

function mensajeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Comando CL por FTP (RCMD). */
function cl(sesion: SesionFtp, comando: string): Promise<RespuestaFtp> {
  return sesion.enviar(`RCMD ${comando}`);
}

/** Resultado de un paso que no puede continuar. */
function terminar(pasos: PasoEnvio[], rutaMbr: string, listado: string | null = null): ResultadoEnvio {
  return { ok: pasos.every((p) => p.ok || p.aviso === true), pasos, listado, rutaMiembro: rutaMbr };
}

/**
 * Envía el fuente al AS400 y, si se pide, lo compila. Cada paso queda
 * registrado para que la interfaz muestre qué pasó.
 */
export async function ejecutarEnvio(
  abrir: AbrirSesion,
  credenciales: Credenciales,
  entrada: PeticionEnvio,
): Promise<ResultadoEnvio> {
  const p = normalizarPeticion(entrada);
  const errores = validarPeticion(p);
  if (errores.length > 0) {
    return terminar([{ nombre: 'Validación', ok: false, mensaje: errores.join('\n') }], '');
  }
  const ruta = rutaMiembro(p.bibliotecaFuente, p.archivoFuente, p.miembro);
  const pasos: PasoEnvio[] = [];

  let sesion: SesionFtp;
  try {
    sesion = await abrir(credenciales);
    pasos.push({ nombre: 'Conexión', ok: true, mensaje: `Conectado a ${credenciales.host} como ${credenciales.usuario}.` });
  } catch (error) {
    pasos.push({ nombre: 'Conexión', ok: false, mensaje: mensajeError(error) });
    return terminar(pasos, ruta);
  }

  let listado: string | null = null;
  try {
    // Con el formato de nombres 1 se usan rutas /QSYS.LIB/BIBLIOTECA.LIB/...
    const formato = await sesion.enviar('SITE NAMEFMT 1');
    pasos.push({ nombre: 'Formato de nombres', ok: !fallo(formato), mensaje: texto(formato) });
    if (fallo(formato)) return terminar(pasos, ruta);

    if (p.crearArchivoFuente) {
      const existe = await cl(sesion, comandoExisteArchivo(p.bibliotecaFuente, p.archivoFuente));
      if (fallo(existe)) {
        const crear = await cl(sesion, comandoCrearArchivoFuente(p.tipo, p.bibliotecaFuente, p.archivoFuente));
        pasos.push({
          nombre: `Crear ${p.bibliotecaFuente}/${p.archivoFuente}`,
          ok: !fallo(crear),
          mensaje: texto(crear),
        });
        if (fallo(crear)) return terminar(pasos, ruta);
      }
    }

    try {
      await sesion.subir(prepararTexto(p.texto), ruta);
      pasos.push({ nombre: 'Enviar fuente', ok: true, mensaje: `Miembro ${p.bibliotecaFuente}/${p.archivoFuente}(${p.miembro}) enviado.` });
    } catch (error) {
      pasos.push({ nombre: 'Enviar fuente', ok: false, mensaje: mensajeError(error) });
      return terminar(pasos, ruta);
    }

    const cambio = await cl(sesion, comandoCambiarMiembro(p));
    if (fallo(cambio)) {
      pasos.push({
        nombre: 'Tipo y descripción del miembro',
        ok: false,
        aviso: true,
        mensaje: texto(cambio),
      });
    }

    if (!p.compilar) return terminar(pasos, ruta);

    // La lista de bibliotecas dura lo que dura la sesión FTP.
    for (const biblioteca of [p.bibliotecaObjeto, ...p.bibliotecasExtra]) {
      await cl(sesion, comandoAgregarBiblioteca(biblioteca));
    }

    // Lo que hay hoy en los spools del listado: si después de compilar siguen iguales, el compilador
    // no dejó listado nuevo y no se muestra el de una compilación anterior.
    const spools = spoolsDeListado(p.tipo, p.miembro);
    const anteriores = new Map<string, string | null>();
    for (const spool of spools) anteriores.set(spool, await traerListado(sesion, spool));

    const comando = comandoCompilacion(p);
    const compilacion = await cl(sesion, comando);
    pasos.push({ nombre: 'Compilar', ok: !fallo(compilacion), mensaje: `${comando}\n${texto(compilacion)}` });

    const traido = await traerListados(sesion, spools, anteriores);
    listado = traido.listado;
    if (traido.viejos.length > 0 && listado === null) {
      pasos.push({
        nombre: 'Listado del compilador',
        ok: false,
        aviso: true,
        mensaje: `El compilador no dejó un listado nuevo (${traido.viejos.join(', ')}): no se muestra el de una compilación anterior. Revísalo en el AS400 con WRKSPLF.`,
      });
    } else if (listado === null && fallo(compilacion)) {
      pasos.push({
        nombre: 'Listado del compilador',
        ok: false,
        aviso: true,
        mensaje: 'No se pudo traer el listado. Revísalo en el AS400 con WRKSPLF.',
      });
    }
    return terminar(pasos, ruta, listado);
  } catch (error) {
    pasos.push({ nombre: 'Error', ok: false, mensaje: mensajeError(error) });
    return terminar(pasos, ruta, listado);
  } finally {
    sesion.cerrar();
  }
}

/**
 * Trae los listados de los spools indicados y los junta. Descarta los que no cambiaron desde antes de
 * compilar. Si el del precompilador SQL tiene errores graves, el compilador COBOL no corrió: no se trae el suyo.
 */
async function traerListados(
  sesion: SesionFtp,
  spools: string[],
  anteriores: Map<string, string | null>,
): Promise<{ listado: string | null; viejos: string[] }> {
  const partes: string[] = [];
  const viejos: string[] = [];
  for (const spool of spools) {
    const listado = await traerListado(sesion, spool);
    if (listado === null) continue;
    // Igual al de antes de compilar: es de una compilación anterior.
    if (anteriores.get(spool) === listado) {
      viejos.push(spool);
      continue;
    }
    partes.push(listado);
    if (spool === 'QSYSPRT' && spools.length > 1 && hayErrorGrave(leerListado(listado))) break;
  }
  return { listado: partes.length > 0 ? partes.join('\n') : null, viejos };
}

/** Copia el último spool con ese nombre a un archivo de QTEMP y lo baja. Si algo falla devuelve null. */
async function traerListado(sesion: SesionFtp, spool: string): Promise<string | null> {
  try {
    const crear = await cl(sesion, comandoCrearArchivoListado());
    if (fallo(crear) && !/CPF7302|already exists|ya existe/i.test(crear.mensaje)) return null;
    const copia = await cl(sesion, comandoCopiarListado(spool));
    if (fallo(copia)) return null;
    const bytes = await sesion.descargar(RUTA_LISTADO);
    const contenido = iconv.decode(bytes, CODIFICACION_ENVIO).replace(/\r\n/g, '\n').trimEnd();
    return contenido === '' ? null : contenido;
  } catch {
    return null;
  }
}

/** Abre una sesión y la cierra, para comprobar servidor, usuario y contraseña. */
export async function probarConexion(abrir: AbrirSesion, credenciales: Credenciales): Promise<PasoEnvio[]> {
  let sesion: SesionFtp;
  try {
    sesion = await abrir(credenciales);
  } catch (error) {
    return [{ nombre: 'Conexión', ok: false, mensaje: mensajeError(error) }];
  }
  try {
    const pasos: PasoEnvio[] = [
      { nombre: 'Conexión', ok: true, mensaje: `Conectado a ${credenciales.host} como ${credenciales.usuario}.` },
    ];
    const sistema = await sesion.enviar('SYST');
    pasos.push({ nombre: 'Sistema', ok: !fallo(sistema), aviso: true, mensaje: texto(sistema) });
    const comandos = await cl(sesion, 'CHKOBJ OBJ(QSYS/QSYS) OBJTYPE(*LIB)');
    pasos.push({
      nombre: 'Comandos remotos (RCMD)',
      ok: !fallo(comandos),
      aviso: true,
      mensaje: fallo(comandos)
        ? `${texto(comandos)}. Sin RCMD se pueden enviar fuentes pero no compilar.`
        : 'Permitidos.',
    });
    return pasos;
  } catch (error) {
    return [{ nombre: 'Conexión', ok: false, mensaje: mensajeError(error) }];
  } finally {
    sesion.cerrar();
  }
}

// ---------------------------------------------------------------------------
// Traer fuentes del AS400
// ---------------------------------------------------------------------------

/** Carpeta del equipo donde se dejan los fuentes que se traen. */
export interface DestinoLocal {
  carpeta: string;
  existe(nombreArchivo: string): Promise<boolean>;
  /** Escribe el fuente (dejando copia .bak si ya existía). Devuelve la ruta de la copia, si se creó. */
  escribir(nombreArchivo: string, texto: string): Promise<string | null>;
}

/** Ruta IFS de un archivo fuente: /QSYS.LIB/BIBLIOTECA.LIB/ARCHIVO.FILE */
function rutaArchivoFuente(biblioteca: string, archivo: string): string {
  return `/QSYS.LIB/${biblioteca}.LIB/${archivo}.FILE`;
}

/** Valida biblioteca y archivo y los pone en mayúsculas. Devuelve el error si no son válidos. */
function validarOrigen(biblioteca: string, archivo: string): { bib: string; arc: string } | { error: string } {
  const bib = normalizarNombre(typeof biblioteca === 'string' ? biblioteca : '');
  const arc = normalizarNombre(typeof archivo === 'string' ? archivo : '');
  if (!esNombreValido(bib)) return { error: 'Falta la biblioteca o no es válida (máximo 10 caracteres: A-Z, 0-9, $ # @ _).' };
  if (!esNombreValido(arc)) return { error: 'Falta el archivo fuente o no es válido (máximo 10 caracteres: A-Z, 0-9, $ # @ _).' };
  return { bib, arc };
}

/**
 * Tipo y texto de cada miembro, como los muestra PDM. El listado FTP no los trae: se piden al
 * servidor con DSPFD *MBRLIST hacia QTEMP (que se vacía al cerrar la sesión) y una tabla solo de
 * texto, que se baja en ASCII. Devuelve el motivo si no se pudo (por ejemplo, RCMD bloqueado).
 */
async function tiposDeMiembros(
  sesion: SesionFtp,
  bib: string,
  arc: string,
): Promise<{ tipos: Map<string, InfoMiembro> } | { motivo: string }> {
  try {
    const lista = await cl(sesion, comandoListaMiembros(bib, arc));
    if (fallo(lista)) return { motivo: texto(lista) };
    await cl(sesion, comandoBorrarTipos()); // si quedó de antes en la misma sesión; si no existe, se ignora
    const tabla = await cl(sesion, comandoCrearTipos());
    if (fallo(tabla)) return { motivo: texto(tabla) };
    const bytes = await sesion.descargar(RUTA_TIPOS);
    const tipos = parsearTiposMiembros(iconv.decode(bytes, CODIFICACION_ENVIO));
    return tipos.size === 0 ? { motivo: 'El servidor devolvió la lista vacía.' } : { tipos };
  } catch (error) {
    return { motivo: mensajeError(error).replace(/\s+/g, ' ').trim() };
  }
}

/** Lista los miembros de un archivo fuente: nombres, tipo y texto (si el servidor los da) y fechas. */
export async function listarMiembros(
  abrir: AbrirSesion,
  credenciales: Credenciales,
  biblioteca: string,
  archivoFuente: string,
  hoy: Date = new Date(),
): Promise<ResultadoListado> {
  const origen = validarOrigen(biblioteca, archivoFuente);
  if ('error' in origen) return { ok: false, miembros: [], pasos: [{ nombre: 'Validación', ok: false, mensaje: origen.error }] };
  const { bib, arc } = origen;
  const pasos: ResultadoListado['pasos'] = [];

  let sesion: SesionFtp;
  try {
    sesion = await abrir(credenciales);
  } catch (error) {
    return { ok: false, miembros: [], pasos: [{ nombre: 'Conexión', ok: false, mensaje: mensajeError(error) }] };
  }

  try {
    const formato = await sesion.enviar('SITE NAMEFMT 1');
    if (fallo(formato)) {
      return { ok: false, miembros: [], pasos: [{ nombre: 'Formato de nombres', ok: false, mensaje: texto(formato) }] };
    }
    const cwd = await sesion.enviar(`CWD ${rutaArchivoFuente(bib, arc)}`);
    if (fallo(cwd)) {
      return {
        ok: false,
        miembros: [],
        pasos: [{ nombre: `${bib}/${arc}`, ok: false, mensaje: `No se pudo abrir el archivo fuente: ${texto(cwd)}` }],
      };
    }

    let crudo: string;
    try {
      crudo = await sesion.listar('NLST');
    } catch (error) {
      return { ok: false, miembros: [], pasos: [{ nombre: 'Lista de miembros', ok: false, mensaje: mensajeError(error) }] };
    }
    const { nombres, ignorados } = parsearNlst(crudo);
    if (ignorados > 0) {
      pasos.push({
        nombre: 'Lista de miembros',
        ok: false,
        aviso: true,
        mensaje: `${ignorados} ${ignorados === 1 ? 'línea no es' : 'líneas no son'} un miembro con nombre válido y se ignoran.`,
      });
    }

    // Las fechas son un adorno: si el servidor no las da, se muestran solo los nombres.
    let fechas = new Map<string, string>();
    try {
      await sesion.enviar('SITE LISTFMT 1');
      fechas = parsearListUnix(await sesion.listar('LIST'), hoy);
    } catch {
      pasos.push({ nombre: 'Fechas', ok: false, aviso: true, mensaje: 'El servidor no entregó las fechas de los miembros.' });
    }

    const info = await tiposDeMiembros(sesion, bib, arc);
    if ('motivo' in info) {
      pasos.push({
        nombre: 'Tipo de los miembros',
        ok: false,
        aviso: true,
        mensaje: `No se pudo leer el tipo y el texto de los miembros (${info.motivo}). Al traerlos, el tipo se deduce del contenido.`,
      });
    }

    nombres.sort((a, b) => a.localeCompare(b));
    return { ok: true, miembros: unirMiembros(nombres, fechas, 'tipos' in info ? info.tipos : undefined), pasos };
  } catch (error) {
    return { ok: false, miembros: [], pasos: [{ nombre: 'Error', ok: false, mensaje: mensajeError(error) }] };
  } finally {
    sesion.cerrar();
  }
}

/** Baja los miembros pedidos y los guarda en la carpeta indicada. Un fallo no detiene a los demás. */
export async function traerMiembros(
  abrir: AbrirSesion,
  credenciales: Credenciales,
  peticion: PeticionTraer,
  destino: DestinoLocal,
): Promise<ResultadoTraer> {
  const resultado = (ok: boolean, pasos: ResultadoTraer['pasos'], resultados: ResultadoMiembroTraido[] = []): ResultadoTraer => ({
    carpeta: destino.carpeta,
    ok,
    pasos,
    resultados,
  });
  const origen = validarOrigen(peticion.biblioteca, peticion.archivoFuente);
  if ('error' in origen) return resultado(false, [{ nombre: 'Validación', ok: false, mensaje: origen.error }]);
  const { bib, arc } = origen;

  const miembros = Array.isArray(peticion.miembros) ? [...new Set(peticion.miembros.map((m) => normalizarNombre(String(m))))] : [];
  if (miembros.length === 0) return resultado(false, [{ nombre: 'Validación', ok: false, mensaje: 'No hay miembros marcados.' }]);
  if (miembros.length > MAX_MIEMBROS_POR_DESCARGA) {
    return resultado(false, [
      { nombre: 'Validación', ok: false, mensaje: `Se pueden traer hasta ${MAX_MIEMBROS_POR_DESCARGA} miembros por vez.` },
    ]);
  }
  const malos = miembros.filter((m) => !esNombreValido(m));
  if (malos.length > 0) {
    return resultado(false, [{ nombre: 'Validación', ok: false, mensaje: `Nombre de miembro no válido: ${malos.slice(0, 3).join(', ')}.` }]);
  }

  let sesion: SesionFtp;
  try {
    sesion = await abrir(credenciales);
  } catch (error) {
    return resultado(false, [{ nombre: 'Conexión', ok: false, mensaje: mensajeError(error) }]);
  }

  const resultados: ResultadoMiembroTraido[] = [];
  try {
    const formato = await sesion.enviar('SITE NAMEFMT 1');
    if (fallo(formato)) return resultado(false, [{ nombre: 'Formato de nombres', ok: false, mensaje: texto(formato) }]);

    const info = await tiposDeMiembros(sesion, bib, arc);
    const tipos = 'tipos' in info ? info.tipos : new Map<string, InfoMiembro>();

    for (const miembro of miembros) {
      const base = { miembro, ok: false, omitido: false, archivo: null, copia: null };
      try {
        const bytes = await sesion.descargar(`${rutaArchivoFuente(bib, arc)}/${miembro}.MBR`);
        const contenido = iconv.decode(bytes, CODIFICACION_ENVIO).replace(/\r\n/g, '\n').replace(/\n+$/, '');
        const archivo = `${miembro}.${extensionDeTipo(tipos.get(miembro)?.tipo) ?? extensionLocal(arc, contenido)}`;
        if (!peticion.sobrescribir && (await destino.existe(archivo))) {
          resultados.push({ ...base, omitido: true, archivo, mensaje: 'Ya existe en la carpeta: no se reemplazó.' });
          continue;
        }
        const copia = await destino.escribir(archivo, `${contenido}\n`);
        resultados.push({ ...base, ok: true, archivo, copia, mensaje: copia ? 'Reemplazado; el anterior quedó como copia .bak.' : 'Guardado.' });
      } catch (error) {
        resultados.push({ ...base, mensaje: mensajeError(error).replace(/\s+/g, ' ').trim() });
      }
    }
  } catch (error) {
    return resultado(false, [{ nombre: 'Error', ok: false, mensaje: mensajeError(error) }], resultados);
  } finally {
    sesion.cerrar();
  }
  const ok = resultados.every((r) => r.ok || r.omitido);
  return resultado(ok, [], resultados);
}
