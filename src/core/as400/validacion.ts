import { TIPOS_FUENTE } from './tipos';
import type { EntradaConexion, PeticionEnvio, TipoFuente } from './tipos';

/**
 * Nombre de objeto IBM i: empieza con letra o $ # @ y sigue con letras,
 * dígitos o $ # @ _ ; máximo 10 caracteres. Solo estos caracteres llegan a un
 * comando RCMD, por lo que no hay forma de inyectar otro comando.
 */
const NOMBRE_OBJETO = /^[A-Z$#@][A-Z0-9$#@_]{0,9}$/;

/**
 * Texto descriptivo permitido: letras sin acento, dígitos, espacio y unos pocos
 * signos. Sin acentos porque el comando viaja por FTP y el AS400 puede no leer UTF-8.
 */
const TEXTO_DESCRIPTIVO = /^[A-Za-z0-9 .,\-_/()]{0,50}$/;

const TIPOS = Object.keys(TIPOS_FUENTE) as TipoFuente[];

/** Nombre en mayúsculas y sin espacios en los extremos. */
export function normalizarNombre(valor: string): string {
  return valor.trim().toUpperCase();
}

export function esNombreValido(valor: string): boolean {
  return NOMBRE_OBJETO.test(valor);
}

export function esTextoDescriptivoValido(valor: string): boolean {
  return TEXTO_DESCRIPTIVO.test(valor);
}

/** Líneas del fuente que superan el largo que cabe en el archivo fuente (1-based). */
export function lineasDemasiadoLargas(texto: string, maximo: number): number[] {
  const largas: number[] = [];
  texto.split(/\r?\n/).forEach((linea, i) => {
    if (linea.length > maximo) largas.push(i + 1);
  });
  return largas;
}

/** Valida una petición de envío. Devuelve los problemas; vacío = válida. */
export function validarPeticion(p: PeticionEnvio): string[] {
  const errores: string[] = [];
  if (!TIPOS.includes(p.tipo)) {
    errores.push('El tipo de fuente no es válido.');
    return errores;
  }
  if (typeof p.texto !== 'string' || p.texto.trim() === '') errores.push('El fuente está vacío.');
  if (!esNombreValido(p.miembro)) {
    errores.push('El nombre del miembro no es válido (máximo 10 caracteres: A-Z, 0-9, $ # @ _).');
  }
  if (!esNombreValido(p.bibliotecaFuente)) errores.push('Falta la biblioteca del fuente o no es válida.');
  if (!esNombreValido(p.archivoFuente)) errores.push('Falta el archivo fuente o su nombre no es válido.');
  if (p.compilar && !esNombreValido(p.bibliotecaObjeto)) {
    errores.push('Falta la biblioteca de compilación o no es válida.');
  }
  if (typeof p.descripcion !== 'string' || !esTextoDescriptivoValido(p.descripcion)) {
    errores.push('La descripción admite hasta 50 letras sin acento, números, espacios y . , - _ / ( ).');
  }
  if (!Array.isArray(p.bibliotecasExtra) || !p.bibliotecasExtra.every(esNombreValido)) {
    errores.push('Alguna biblioteca adicional no es válida.');
  }
  if (typeof p.texto === 'string') {
    const maximo = TIPOS_FUENTE[p.tipo].maxLinea;
    const largas = lineasDemasiadoLargas(p.texto, maximo);
    if (largas.length > 0) {
      const lista = largas.slice(0, 5).join(', ');
      errores.push(
        `Hay líneas de más de ${maximo} caracteres (línea ${lista}${largas.length > 5 ? '…' : ''}); el AS400 las cortaría.`,
      );
    }
  }
  return errores;
}

/** Valida los datos de conexión (sin tocar la red). */
export function validarConexion(c: EntradaConexion): string[] {
  const errores: string[] = [];
  if (typeof c.host !== 'string' || !/^[A-Za-z0-9]([A-Za-z0-9.\-]*[A-Za-z0-9])?$/.test(c.host.trim())) {
    errores.push('El servidor no es válido (nombre o dirección IP).');
  }
  if (!Number.isInteger(c.puerto) || c.puerto < 1 || c.puerto > 65535) {
    errores.push('El puerto debe estar entre 1 y 65535.');
  }
  if (typeof c.usuario !== 'string' || !/^[A-Za-z$#@][A-Za-z0-9$#@_]{0,9}$/.test(c.usuario.trim())) {
    errores.push('El usuario no es válido (máximo 10 caracteres).');
  }
  if (c.password !== undefined && (typeof c.password !== 'string' || /[\r\n]/.test(c.password))) {
    errores.push('La contraseña no es válida.');
  }
  return errores;
}
