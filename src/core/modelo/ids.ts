/**
 * Generador de ids únicos para los elementos del modelo (registros, campos,
 * constantes). Lo comparten el parser y las operaciones de edición para que
 * nunca se repitan dentro de una misma sesión.
 */

let contador = 0;

export function nuevoId(prefijo: string): string {
  contador += 1;
  return `${prefijo}_${contador}`;
}
