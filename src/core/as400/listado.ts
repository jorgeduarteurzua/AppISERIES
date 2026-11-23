/**
 * Lee los mensajes de un listado de compilación del IBM i (texto del spool) y los
 * ubica en la línea del fuente. Reconoce tres formas, sin depender del idioma de los títulos:
 *
 * - Precompilador SQL (CRTSQLCBL/CRTSQLCBLI): `SQL1001  30   139  Texto`
 *   (identificador, gravedad, registro del fuente y texto).
 * - Compilador COBOL: `* 206  IDMSJ: LBL1078  GRAVEDAD: 30  NUMSEC: 012300`, con el texto en la
 *   línea «Mensaje . . . :» y las siguientes. 206 es la instrucción; la línea sale de NUMSEC.
 * - CL (CRTCLPGM/CRTBNDCL): `* CPD0727 40  Texto`, debajo de la línea del fuente que lo
 *   provoca (`   500-  CHGVAR ...`). Los de las referencias cruzadas no tienen línea.
 *
 * El FTP numera el miembro de 1,00 en 1,00, así que la secuencia 0123.00 (NUMSEC 012300)
 * es la línea 123 del fuente.
 */

export type NivelMensaje = 'info' | 'aviso' | 'error';

export interface MensajeListado {
  id: string;
  gravedad: number;
  nivel: NivelMensaje;
  /** Línea del fuente (desde 1); null si el mensaje no es de una línea. */
  linea: number | null;
  texto: string;
}

/** Menos de 10: información; de 10 a 29: aviso (el compilador lo acepta); 30 o más: error. */
export function nivelDeGravedad(gravedad: number): NivelMensaje {
  if (gravedad >= 30) return 'error';
  if (gravedad >= 10) return 'aviso';
  return 'info';
}

/** Secuencia del listado (012300, 500, 0123.00) a número de línea. */
export function lineaDeSecuencia(secuencia: string): number | null {
  const s = secuencia.trim();
  let valor: number;
  if (s.includes('.')) valor = Number(s);
  else if (/^\d+$/.test(s)) valor = Number(s) / 100;
  else return null;
  if (!Number.isFinite(valor) || valor < 1) return null;
  return Math.floor(valor);
}

const RE_SQL = /^\s{0,3}([A-Z]{3}\d{4})\s+(\d{1,2})\s+(\d{1,6})\s+(\S.*)$/;
const RE_COBOL = /^\s*\*\s+\d+\s+\S+:\s*([A-Z]{3}\d{4})\s+\S+:\s*(\d{1,2})\s+\S+:\s*(\d{1,6})/;
/** «Mensaje . . . . :  texto» (o «Message . . . :»). */
const RE_TEXTO_COBOL = /^\s+[^\s.:]+(?:\s*\.)+\s*:\s*(.*)$/;
const RE_CL = /^\s*\*\s+([A-Z]{3}\d{4})\s+(\d{1,2})\s+(\S.*)$/;
/** Línea del fuente en el listado de CL: «   500-   CHGVAR ...». */
const RE_FUENTE_CL = /^\s*(\d{1,7})-/;
/** Separadores como «* * * * *  F I N  D E  F U E N T E  * * * * *». */
const RE_SEPARADOR = /\*\s\*\s\*\s\*\s\*/;

function mensaje(id: string, gravedad: string, linea: number | null, texto: string): MensajeListado {
  const g = Number(gravedad);
  return { id, gravedad: g, nivel: nivelDeGravedad(g), linea, texto: texto.replace(/\s+/g, ' ').trim() };
}

export function leerListado(texto: string): MensajeListado[] {
  const lineas = texto.replace(/\r\n?/g, '\n').split('\n');
  const salida: MensajeListado[] = [];
  /** Última línea del fuente vista en un listado de CL (los mensajes van debajo). */
  let lineaCl: number | null = null;

  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (RE_SEPARADOR.test(l)) {
      lineaCl = null;
      continue;
    }
    const cobol = RE_COBOL.exec(l);
    if (cobol) {
      // El texto viene en las líneas siguientes, hasta otro mensaje, un separador o una línea vacía.
      const partes: string[] = [];
      let j = i + 1;
      const primera = RE_TEXTO_COBOL.exec(lineas[j] ?? '');
      if (primera) {
        partes.push(primera[1]);
        j++;
        while (j < lineas.length) {
          const s = lineas[j];
          if (s.trim() === '' || /^\s*\*/.test(s) || RE_SEPARADOR.test(s) || !/^\s{4,}\S/.test(s)) break;
          partes.push(s);
          j++;
        }
        i = j - 1;
      }
      salida.push(mensaje(cobol[1], cobol[2], lineaDeSecuencia(cobol[3]), partes.join(' ')));
      continue;
    }
    const cl = RE_CL.exec(l);
    if (cl) {
      salida.push(mensaje(cl[1], cl[2], lineaCl, cl[3]));
      continue;
    }
    const sql = RE_SQL.exec(l);
    if (sql) {
      const linea = Number(sql[3]);
      salida.push(mensaje(sql[1], sql[2], linea >= 1 ? linea : null, sql[4]));
      continue;
    }
    const fuente = RE_FUENTE_CL.exec(l);
    if (fuente) lineaCl = lineaDeSecuencia(fuente[1]);
  }

  // Sin repetidos (un mismo listado puede venir dos veces si se juntan spools).
  const vistos = new Set<string>();
  return salida.filter((m) => {
    const clave = `${m.id}|${m.linea}|${m.texto}`;
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

/** Hay algún error (gravedad 30 o más). */
export function hayErrorGrave(mensajes: MensajeListado[]): boolean {
  return mensajes.some((m) => m.nivel === 'error');
}
