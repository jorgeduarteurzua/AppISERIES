/**
 * Lo último del CRUD de cada tabla, guardado en el equipo (localStorage) para que sobreviva al
 * cierre de la aplicación: lo que se marcó en el diálogo, el último CRUD generado y la pantalla
 * tal como quedó en el editor.
 */
import type {
  AnchoPantallaCrud,
  EsqueletoAyuda,
  RequeridoCampo,
  TeclaCrud,
  TipoCobolCrud,
  TipoPantallaCrud,
  ValorAuto,
} from '@core/crud/crud';
import type { FechaHoraCampo } from '@core/crud/fechaHora';
import type { TipoArchivo } from '@core/tablas/modelo';

const PREFIJO = 'appiseries.crud.';
const VERSION = 1;

export type TipoReglaUi = '' | 'email' | 'rango' | 'valores' | 'existe';

/** Lo que se marca de cada campo en el diálogo. */
export interface CampoGuardado {
  lista: boolean;
  detalle: boolean;
  fh: FechaHoraCampo | null;
  agregar: { tipo: ValorAuto['tipo']; valor: string };
  modificar: { tipo: ValorAuto['tipo']; valor: string };
  ajuste: string;
  ayudaParrafo: string;
  ayudaPrograma: string;
  requerido: RequeridoCampo;
  regla: TipoReglaUi;
  reglaMinimo: string;
  reglaMaximo: string;
  reglaValores: string;
  reglaTabla: string;
  reglaColumna: string;
}

export interface DialogoGuardado {
  nombrePantalla: string;
  nombrePrograma: string;
  titulo: string;
  tipoCobol: TipoCobolCrud;
  bibliotecaTabla: string;
  tipoPantalla: TipoPantallaCrud;
  ancho: AnchoPantallaCrud;
  teclas: TeclaCrud[];
  campos: Record<string, CampoGuardado>;
}

/** El CRUD generado, tal como se guarda (sin el vínculo con el editor, que es de la sesión). */
export interface ConjuntoGuardado {
  tabla: string;
  tipoTabla: TipoArchivo;
  ddsTabla: string;
  nombrePantalla: string;
  nombrePrograma: string;
  tipoCobol: TipoCobolCrud;
  ddsPantalla: string;
  cobol: string;
  ayudas: EsqueletoAyuda[];
}

export interface CrudGuardado {
  version: number;
  dialogo: DialogoGuardado | null;
  conjunto: ConjuntoGuardado | null;
  /** La pantalla del CRUD como quedó en el editor; null si no se editó. */
  ddsEditada: string | null;
  /** El programa del CRUD como quedó en el editor de programas; null si no se editó. */
  cobolEditado: string | null;
}

const clave = (tabla: string): string => `${PREFIJO}${tabla.trim().toUpperCase()}`;

export function leerCrudGuardado(tabla: string): CrudGuardado | null {
  try {
    const texto = window.localStorage.getItem(clave(tabla));
    if (!texto) return null;
    const g = JSON.parse(texto) as CrudGuardado;
    if (!g || g.version !== VERSION) return null;
    return {
      version: VERSION,
      dialogo: g.dialogo ?? null,
      conjunto: g.conjunto ?? null,
      ddsEditada: g.ddsEditada ?? null,
      cobolEditado: g.cobolEditado ?? null,
    };
  } catch {
    return null;
  }
}

function escribir(tabla: string, cambio: Partial<CrudGuardado>): void {
  try {
    const actual = leerCrudGuardado(tabla) ?? { version: VERSION, dialogo: null, conjunto: null, ddsEditada: null, cobolEditado: null };
    window.localStorage.setItem(clave(tabla), JSON.stringify({ ...actual, ...cambio, version: VERSION }));
  } catch {
    // Sin almacenamiento (o lleno): no se recuerda y nada más.
  }
}

export function guardarDialogo(tabla: string, dialogo: DialogoGuardado): void {
  escribir(tabla, { dialogo });
}

/** Un CRUD recién generado reemplaza al anterior y a su pantalla y programa editados. */
export function guardarConjunto(tabla: string, conjunto: ConjuntoGuardado): void {
  escribir(tabla, { conjunto, ddsEditada: null, cobolEditado: null });
}

export function guardarProgramaEditado(tabla: string, cobol: string | null): void {
  escribir(tabla, { cobolEditado: cobol });
}

export function guardarPantallaEditada(tabla: string, dds: string): void {
  escribir(tabla, { ddsEditada: dds });
}
