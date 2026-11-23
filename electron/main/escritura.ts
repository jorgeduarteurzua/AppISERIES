import { access, copyFile, writeFile } from 'node:fs/promises';
import iconv from 'iconv-lite';

/** Codificación con la que se leen y se escriben los fuentes exportados del IBM i. */
export const CODIFICACION_FUENTES = 'windows-1252';

/**
 * Escribe un fuente en disco: líneas CRLF y la codificación de los fuentes
 * originales. Si el archivo ya existía, guarda antes una copia `ruta.bak` con
 * el contenido original, pero solo la primera vez: así el original queda
 * intacto aunque se guarde muchas veces.
 *
 * Devuelve la ruta de la copia creada, o null si no hizo falta.
 */
export async function escribirFuenteConCopia(
  ruta: string,
  texto: string,
  codificacion: string = CODIFICACION_FUENTES,
): Promise<{ copia: string | null }> {
  const contenido = iconv.encode(texto.replace(/\r?\n/g, '\r\n'), codificacion);
  const respaldo = `${ruta}.bak`;
  let copia: string | null = null;

  if (await existe(ruta)) {
    if (!(await existe(respaldo))) {
      await copyFile(ruta, respaldo);
      copia = respaldo;
    }
  }

  await writeFile(ruta, contenido);
  return { copia };
}

async function existe(ruta: string): Promise<boolean> {
  try {
    await access(ruta);
    return true;
  } catch {
    return false;
  }
}

/**
 * Nombre de archivo que se puede escribir en una carpeta elegida por el
 * usuario: solo el nombre, sin ruta, y con caracteres corrientes. Evita que la
 * interfaz escriba fuera de esa carpeta.
 */
export function nombreArchivoValido(nombre: unknown): nombre is string {
  return (
    typeof nombre === 'string' &&
    /^[A-Za-z0-9$#@_][A-Za-z0-9$#@_.-]{0,63}$/.test(nombre) &&
    !nombre.includes('..') &&
    !/\.(exe|bat|cmd|ps1|vbs|js|lnk|dll|msi)$/i.test(nombre)
  );
}

export interface ArchivoParaGuardar {
  nombre: string;
  texto: string;
}

/** Valida la lista que manda la interfaz. Devuelve null si algo no es válido. */
export function archivosValidos(valor: unknown): ArchivoParaGuardar[] | null {
  if (!Array.isArray(valor) || valor.length === 0 || valor.length > 20) return null;
  const nombres = new Set<string>();
  const resultado: ArchivoParaGuardar[] = [];
  for (const a of valor) {
    if (!a || typeof a !== 'object') return null;
    const { nombre, texto } = a as Record<string, unknown>;
    if (!nombreArchivoValido(nombre) || typeof texto !== 'string' || texto.length > 5_000_000) return null;
    if (nombres.has(nombre.toLowerCase())) return null;
    nombres.add(nombre.toLowerCase());
    resultado.push({ nombre, texto });
  }
  return resultado;
}
