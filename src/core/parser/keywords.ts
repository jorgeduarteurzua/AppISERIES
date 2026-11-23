/**
 * Utilidades para separar la zona de "funciones" (keywords) del DDS.
 *
 * A partir de la columna 45 el DDS contiene o bien una constante entre comillas
 * o bien una o más keywords. Una keyword puede ser:
 *   - sin paréntesis: INDARA, OVERLAY, SFLDSP, TIME
 *   - con paréntesis: DSPATR(HI), WINDOW(2 2 20 74), VALUES('S' 'N')
 *
 * Los parámetros pueden contener comillas (con espacios dentro) y paréntesis
 * anidados, p.ej. WDWTITLE((*TEXT 'PROCESOS QUERYS') (*COLOR WHT)). El separador
 * de keywords es el espacio, pero solo cuando no estamos dentro de comillas ni
 * de paréntesis.
 */

export interface KeywordBruta {
  nombre: string;
  parametros: string; // contenido entre paréntesis (vacío si no tiene)
}

/**
 * Separa una zona de funciones DDS en keywords individuales.
 * Devuelve lista vacía si la zona es una constante (empieza por comilla).
 */
export function separarKeywords(zona: string): KeywordBruta[] {
  const texto = zona.trimEnd();
  if (texto.length === 0) return [];

  const keywords: KeywordBruta[] = [];
  let i = 0;
  const n = texto.length;

  while (i < n) {
    // Saltar espacios entre keywords.
    while (i < n && texto[i] === ' ') i++;
    if (i >= n) break;

    // Si empieza por comilla aquí, es una constante, no una keyword.
    if (texto[i] === "'") break;

    // Leer el nombre de la keyword (hasta '(' o espacio).
    let nombre = '';
    while (i < n && texto[i] !== '(' && texto[i] !== ' ') {
      nombre += texto[i];
      i++;
    }

    if (nombre.length === 0) {
      i++;
      continue;
    }

    // ¿Tiene parámetros entre paréntesis?
    if (i < n && texto[i] === '(') {
      const { contenido, siguiente } = leerParentesis(texto, i);
      keywords.push({ nombre: nombre.toUpperCase(), parametros: contenido });
      i = siguiente;
    } else {
      keywords.push({ nombre: nombre.toUpperCase(), parametros: '' });
    }
  }

  return keywords;
}

/**
 * Lee el contenido de un paréntesis balanceado que empieza en la posición
 * `inicio` (donde texto[inicio] === '('). Respeta comillas simples: los
 * paréntesis dentro de comillas no cuentan. Devuelve el contenido interior
 * y el índice siguiente al paréntesis de cierre.
 */
function leerParentesis(
  texto: string,
  inicio: number,
): { contenido: string; siguiente: number } {
  let profundidad = 0;
  let enComillas = false;
  let contenido = '';
  let i = inicio;

  for (; i < texto.length; i++) {
    const c = texto[i];

    if (c === "'") {
      enComillas = !enComillas;
      if (profundidad > 0) contenido += c;
      continue;
    }

    if (!enComillas && c === '(') {
      profundidad++;
      if (profundidad === 1) continue; // no incluir el paréntesis exterior
      contenido += c;
      continue;
    }

    if (!enComillas && c === ')') {
      profundidad--;
      if (profundidad === 0) {
        i++;
        break;
      }
      contenido += c;
      continue;
    }

    contenido += c;
  }

  return { contenido, siguiente: i };
}

/**
 * Indica si una zona de funciones es una constante de texto (empieza por
 * comilla simple tras recortar espacios iniciales).
 */
export function esConstante(zona: string): boolean {
  const t = zona.trimStart();
  return t.startsWith("'");
}

/**
 * Extrae el texto de una constante DDS: quita las comillas exteriores y
 * convierte las comillas dobladas ('') en una sola comilla.
 */
export function extraerTextoConstante(zona: string): string {
  const t = zona.trim();
  if (!t.startsWith("'")) return t;
  // Quitar primera comilla y última comilla si existe.
  let cuerpo = t.slice(1);
  if (cuerpo.endsWith("'")) cuerpo = cuerpo.slice(0, -1);
  return cuerpo.replace(/''/g, "'");
}
