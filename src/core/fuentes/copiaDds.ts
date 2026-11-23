/**
 * Qué trae un `COPY DDS-<formato>-<parte> OF <archivo>` de COBOL, a partir del modelo de la pantalla:
 * -I los campos de entrada, -O los de salida, -INDIC los indicadores. Con ALL-FORMATS, todos los formatos.
 */
import type { Campo, IndicadorCond, PantallaDSPF, Registro } from '../modelo/pantalla';

export interface CopiaDds {
  /** Formato (C01) o null con ALL-FORMATS. */
  formato: string | null;
  parte: 'I' | 'O' | 'INDIC' | 'IO';
  /** Archivo del OF (la pantalla), sin biblioteca. */
  archivo: string | null;
}

/** Lee un COPY DDS de una línea COBOL; null si la línea no es uno. */
export function leerCopiaDds(linea: string): CopiaDds | null {
  const m = /\bCOPY\s+DDS-([A-Z0-9$#@_-]+?)(?:-(I|O|INDIC|I-O))?(?:\s+OF\s+(?:[A-Z0-9$#@_]+\/)?([A-Z0-9$#@_]+))?\s*\.?\s*$/i.exec(
    linea.slice(7, 72),
  );
  if (!m) return null;
  const nombre = m[1].toUpperCase();
  const parte = (m[2] ?? '').toUpperCase();
  return {
    formato: nombre === 'ALL-FORMATS' ? null : nombre,
    parte: parte === 'I' ? 'I' : parte === 'O' ? 'O' : parte === 'INDIC' ? 'INDIC' : 'IO',
    archivo: m[3] ? m[3].toUpperCase() : null,
  };
}

const LETRA_USO: Record<Campo['uso'], string> = { entrada: 'I', salida: 'O', ambos: 'B', oculto: 'H', programa: 'P' };

function entra(c: Campo, parte: CopiaDds['parte']): boolean {
  if (parte === 'IO') return true;
  if (parte === 'I') return c.uso === 'entrada' || c.uso === 'ambos' || c.uso === 'oculto';
  return c.uso === 'salida' || c.uso === 'ambos' || c.uso === 'oculto' || c.uso === 'programa';
}

function indicadoresDe(r: Registro): number[] {
  const n = new Set<number>();
  const agregar = (lista: IndicadorCond[], alternativas?: IndicadorCond[][]) => {
    for (const i of lista) n.add(i.numero);
    for (const g of alternativas ?? []) for (const i of g) n.add(i.numero);
  };
  agregar(r.indicadores, r.alternativas);
  for (const k of r.keywords) agregar(k.indicadores, k.alternativas);
  for (const e of r.elementos) {
    agregar(e.indicadores, e.alternativas);
    if (e.tipo === 'campo') for (const k of e.keywords) agregar(k.indicadores, k.alternativas);
  }
  return [...n].sort((a, b) => a - b);
}

/** Líneas que describen lo que trae la copia; null si el formato no está en la pantalla. */
export function describirCopia(pantalla: PantallaDSPF, copia: CopiaDds): string[] | null {
  const registros = copia.formato ? pantalla.registros.filter((r) => r.nombre.toUpperCase() === copia.formato) : pantalla.registros;
  if (registros.length === 0) return null;
  const salida: string[] = [];
  for (const r of registros) {
    if (copia.parte === 'INDIC') {
      const ind = indicadoresDe(r);
      salida.push(`${r.nombre}: ${ind.length > 0 ? ind.map((i) => `IN${String(i).padStart(2, '0')}`).join(' ') : 'sin indicadores'}`);
      continue;
    }
    const campos = r.elementos.filter((e): e is Campo => e.tipo === 'campo' && !e.sistema && entra(e, copia.parte));
    if (registros.length > 1) salida.push(`${r.nombre}:`);
    if (campos.length === 0) salida.push('  (sin campos)');
    for (const c of campos) {
      const tipo = c.tipoDato === '' ? '' : c.tipoDato;
      const largo = c.tipoDato === 'A' || c.tipoDato === '' ? `${c.longitud}` : `${c.longitud},${c.decimales}`;
      salida.push(`  ${c.nombre.padEnd(10)} ${largo}${tipo} ${LETRA_USO[c.uso]}`);
    }
  }
  return salida;
}
