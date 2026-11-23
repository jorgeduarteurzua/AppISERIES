import { create } from 'zustand';
import type { EsqueletoAyuda, TipoCobolCrud } from '@core/crud/crud';
import { generarDspf } from '@core/generador/generadorDspf';
import { generarTabla } from '@core/tablas/generadorTabla';
import { nombreArchivoTabla } from '@core/tablas/modelo';
import type { TipoArchivo } from '@core/tablas/modelo';
import type { FuenteEnvio } from './as400';
import { guardarConjunto, guardarPantallaEditada, guardarProgramaEditado, leerCrudGuardado } from './crudGuardado';
import { extensionFuente } from './guardadoLocal';
import { miembroSugerido } from './fuentesEnvio';
import { nombreCortoPantalla } from './nombres';
import { useStore } from './store';
import { useTablas } from './storeTablas';

/**
 * El CRUD generado: el archivo, la pantalla, el programa y los esqueletos de ayuda. Sigue
 * disponible aunque se cierre el diálogo del CRUD, para enviarlo o guardarlo completo.
 * Si la pantalla se abrió en el editor, lo que se envía y se guarda es la pantalla editada.
 * Todo se guarda también en el equipo, por tabla (crudGuardado), y se recupera al volver a abrirla.
 */
export interface ConjuntoCrud {
  /** Nombre del archivo (tabla). */
  tabla: string;
  tipoTabla: TipoArchivo;
  /** DDS del archivo cuando se generó el CRUD; se usa si la tabla ya no está abierta. */
  ddsTabla: string;
  nombrePantalla: string;
  nombrePrograma: string;
  tipoCobol: TipoCobolCrud;
  /** Pantalla tal como la generó el CRUD. */
  ddsPantalla: string;
  cobol: string;
  ayudas: EsqueletoAyuda[];
  /** La pantalla se abrió en el editor: si sigue ahí, se toma de ahí. */
  vinculadaAlEditor: boolean;
  /** La pantalla como quedó en el editor la última vez (se guarda en el equipo); null si no se editó. */
  ddsEditada: string | null;
  /** El programa como quedó en el editor de programas; null si no se editó. */
  cobolEditado: string | null;
}

interface EstadoConjunto {
  conjunto: ConjuntoCrud | null;
  definir: (c: Omit<ConjuntoCrud, 'vinculadaAlEditor' | 'ddsEditada' | 'cobolEditado'>) => void;
  /** El programa editado en el editor de programas (se guarda en el equipo). */
  editarCobol: (texto: string) => void;
  vincularEditor: () => void;
  /** Recupera el último CRUD guardado de la tabla. Devuelve false si no hay. */
  restaurar: (tabla: string) => boolean;
  descartar: () => void;
}

export const useConjuntoCrud = create<EstadoConjunto>((set) => ({
  conjunto: null,
  // Un CRUD nuevo reemplaza al anterior y deja de depender de lo que haya en el editor.
  definir: (c) => {
    guardarConjunto(c.tabla, c);
    set({ conjunto: { ...c, vinculadaAlEditor: false, ddsEditada: null, cobolEditado: null } });
  },
  editarCobol: (texto) =>
    set((s) => {
      if (!s.conjunto) return s;
      const cobolEditado = texto === s.conjunto.cobol ? null : texto;
      guardarProgramaEditado(s.conjunto.tabla, cobolEditado);
      return { conjunto: { ...s.conjunto, cobolEditado } };
    }),
  vincularEditor: () => set((s) => (s.conjunto ? { conjunto: { ...s.conjunto, vinculadaAlEditor: true } } : s)),
  restaurar: (tabla) => {
    const g = leerCrudGuardado(tabla);
    if (!g?.conjunto) return false;
    set({ conjunto: { ...g.conjunto, vinculadaAlEditor: false, ddsEditada: g.ddsEditada, cobolEditado: g.cobolEditado } });
    return true;
  },
  descartar: () => set({ conjunto: null }),
}));

/** La pantalla del editor es la del CRUD vinculado. */
function editorEsDelConjunto(c: ConjuntoCrud): boolean {
  return c.vinculadaAlEditor && miembroDelEditor() === c.nombrePantalla.toUpperCase();
}

// Mientras se edita la pantalla del CRUD, se guarda en el equipo (con una pausa, para no
// generar el DDS en cada cambio). Así se recupera aunque se cierre la aplicación.
let pendiente: ReturnType<typeof setTimeout> | null = null;
export function guardarEdicionAhora(): void {
  if (pendiente) clearTimeout(pendiente);
  pendiente = null;
  const c = useConjuntoCrud.getState().conjunto;
  const { pantalla } = useStore.getState();
  if (!c || !pantalla || !editorEsDelConjunto(c)) return;
  try {
    const dds = generarDspf(pantalla);
    // Sin cambios respecto de lo último (o de lo generado): nada que guardar.
    if (dds === (c.ddsEditada ?? c.ddsPantalla)) return;
    guardarPantallaEditada(c.tabla, dds);
    useConjuntoCrud.setState({ conjunto: { ...c, ddsEditada: dds } });
  } catch {
    // Con errores no se puede generar el DDS: se guarda en el próximo cambio.
  }
}
useStore.subscribe((s, antes) => {
  if (s.pantalla === antes.pantalla) return;
  const c = useConjuntoCrud.getState().conjunto;
  if (!c?.vinculadaAlEditor) return;
  if (pendiente) clearTimeout(pendiente);
  pendiente = setTimeout(guardarEdicionAhora, 800);
});
if (typeof window !== 'undefined') window.addEventListener('beforeunload', guardarEdicionAhora);

/** Nombre del miembro de la pantalla abierta en el editor, sin prefijos de exportación ni extensión. */
function miembroDelEditor(): string | null {
  const { pantalla, nombreArchivoActual } = useStore.getState();
  if (!pantalla || !nombreArchivoActual) return null;
  return nombreCortoPantalla(nombreArchivoActual).replace(/\.[A-Za-z]+$/, '').toUpperCase();
}

/** La pantalla del CRUD: la del editor si se está editando ahí, o la que se generó. Lanza si el DDS del editor no se puede generar. */
export function pantallaDelConjunto(c: ConjuntoCrud): { texto: string; delEditor: boolean } {
  if (editorEsDelConjunto(c)) {
    const { pantalla } = useStore.getState();
    if (pantalla) return { texto: generarDspf(pantalla), delEditor: true };
  }
  // Editada en otra sesión (o antes de abrir otra pantalla en el editor).
  if (c.ddsEditada) return { texto: c.ddsEditada, delEditor: true };
  return { texto: c.ddsPantalla, delEditor: false };
}

/** El DDS del archivo: el de la tabla abierta si es la misma, o el que se guardó al generar el CRUD. */
export function archivoDelConjunto(c: ConjuntoCrud): string {
  const { tabla, nombreArchivoActual } = useTablas.getState();
  if (tabla) {
    const nombre = (nombreArchivoActual ? nombreArchivoTabla(nombreArchivoActual) : tabla.nombre).toUpperCase();
    if (nombre === c.tabla.toUpperCase()) return generarTabla(tabla);
  }
  return c.ddsTabla;
}

function descripcion(c: ConjuntoCrud): string {
  return `Mantenedor ${c.tabla}`.replace(/[^A-Za-z0-9 .,\-_/()]/g, '').slice(0, 50);
}

/** Los fuentes del CRUD para enviarlos al AS400, en el orden en que deben compilarse. */
export function fuentesDelConjunto(c: ConjuntoCrud): FuenteEnvio[] {
  const pantalla = pantallaDelConjunto(c);
  const fuentes: FuenteEnvio[] = [
    {
      clave: 'dds',
      etiqueta: c.tipoTabla === 'PF' ? 'Archivo físico' : 'Archivo lógico',
      tipo: c.tipoTabla,
      miembro: miembroSugerido(c.tabla),
      texto: archivoDelConjunto(c),
      descripcion: descripcion(c),
      incluido: true,
    },
    {
      clave: 'dspf',
      etiqueta: pantalla.delEditor ? 'Pantalla (editada)' : 'Pantalla',
      tipo: 'DSPF',
      miembro: c.nombrePantalla,
      texto: pantalla.texto,
      descripcion: descripcion(c),
      incluido: true,
    },
    {
      clave: 'cobol',
      etiqueta: c.cobolEditado ? 'Programa (editado)' : 'Programa',
      tipo: c.tipoCobol,
      tiposPermitidos: ['SQLCBL', 'SQLCBLLE'],
      miembro: c.nombrePrograma,
      texto: c.cobolEditado ?? c.cobol,
      descripcion: descripcion(c),
      incluido: true,
    },
  ];
  // Los esqueletos de ayuda vienen sin marcar: enviarlos reemplazaría un programa de ayuda que ya exista.
  for (const a of c.ayudas) {
    fuentes.push({
      clave: `ayuda-${a.programa}`,
      etiqueta: `Ayuda ${a.programa} (esqueleto)`,
      tipo: a.tipo,
      tiposPermitidos: ['CBL', 'CBLLE'],
      miembro: a.programa,
      texto: a.texto,
      descripcion: `Ayuda de campo ${a.campos.join(' ')}`.slice(0, 50),
      incluido: false,
    });
  }
  return fuentes;
}

/** Los archivos del CRUD para guardarlos en el equipo. */
export function archivosDelConjunto(c: ConjuntoCrud): Array<{ nombre: string; texto: string }> {
  return fuentesDelConjunto(c).map((f) => ({
    nombre: `${f.clave === 'dds' ? c.tabla : f.miembro}.${extensionFuente(f.tipo)}`,
    texto: f.texto,
  }));
}
