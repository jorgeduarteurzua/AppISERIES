import { create } from 'zustand';
import { generarDspf } from '@core/generador/generadorDspf';
import { validar } from '@core/edicion/validacion';
import { generarTabla } from '@core/tablas/generadorTabla';
import { validarTabla } from '@core/tablas/validacionTabla';
import { nombreArchivoTabla, tipoDeTabla } from '@core/tablas/modelo';
import { useStore } from './store';
import { resolverDesde, useTablas } from './storeTablas';
import { nombreCortoPantalla } from './nombres';
import { revisarFuente } from '@core/fuentes/revision';
import { useProgramas } from './storeProgramas';
import { refrescarCarpetaDeArchivo } from './carpetas';

/** Aviso del último guardado (para mostrarlo junto a los botones). */
interface EstadoGuardado {
  mensaje: string | null;
  tipo: 'ok' | 'error';
  ocupado: boolean;
}

export const useGuardado = create<EstadoGuardado>(() => ({ mensaje: null, tipo: 'ok', ocupado: false }));

const SEGUNDOS_AVISO = 8;
let temporizador: ReturnType<typeof setTimeout> | null = null;

function avisar(mensaje: string, tipo: 'ok' | 'error'): void {
  if (temporizador) clearTimeout(temporizador);
  useGuardado.setState({ mensaje, tipo });
  // Los errores se quedan hasta el siguiente guardado; los avisos de éxito se retiran solos.
  if (tipo === 'ok') {
    temporizador = setTimeout(() => {
      if (useGuardado.getState().mensaje === mensaje) useGuardado.setState({ mensaje: null });
    }, SEGUNDOS_AVISO * 1000);
  }
}

/** Mensaje legible de un error, sin el prefijo que Electron agrega a los errores de IPC. */
function mensajeDe(e: unknown): string {
  const texto = e instanceof Error ? e.message : String(e);
  return texto.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

interface Pedido {
  /** Para los mensajes: «la pantalla», «la tabla». */
  que: string;
  generar: () => string;
  errores: () => number;
  /** Archivo del que salió lo que se edita; null si es nuevo. */
  ruta: string | null;
  nombreSugerido: string;
  /** true = «Guardar como…»: pide siempre una ruta. */
  como: boolean;
  /** Se llama con la ruta donde quedó guardado. */
  alGuardar: (ruta: string) => void;
  /** Para los mensajes: «el DDS» (por defecto) o «el fuente». */
  fuente?: string;
}

async function guardarGenerico(p: Pedido): Promise<void> {
  if (useGuardado.getState().ocupado) return;

  let texto: string;
  try {
    texto = p.generar();
  } catch (e) {
    avisar(`No se puede generar ${p.fuente ?? 'el DDS'}: ${mensajeDe(e)}`, 'error');
    return;
  }

  const errores = p.errores();
  if (errores > 0 && typeof window !== 'undefined' && typeof window.confirm === 'function') {
    const cuantos = errores === 1 ? '1 error' : `${errores} errores`;
    const continuar = window.confirm(
      `${p.que[0].toUpperCase()}${p.que.slice(1)} tiene ${cuantos} de validación y ${p.fuente ?? 'el DDS'} puede no compilar. ¿Guardar de todos modos?`,
    );
    if (!continuar) return;
  }

  useGuardado.setState({ ocupado: true });
  try {
    let destino: string | null;
    let copia: string | null = null;
    if (p.ruta !== null && !p.como) {
      copia = await window.api.escribirFuente(p.ruta, texto);
      destino = p.ruta;
    } else {
      destino = await window.api.guardarFuente(texto, p.nombreSugerido);
    }
    if (destino === null) return; // el usuario canceló el diálogo
    p.alGuardar(destino);
    void refrescarCarpetaDeArchivo(destino);
    avisar(`Guardado en ${destino}${copia ? `. El original quedó en ${copia}` : ''}`, 'ok');
  } catch (e) {
    avisar(`No se pudo guardar: ${mensajeDe(e)}`, 'error');
  } finally {
    useGuardado.setState({ ocupado: false });
  }
}

/** Guarda la pantalla abierta: sobrescribe su archivo, o pide dónde guardar si es nueva o `como` es true. */
export function guardarPantalla(como = false): Promise<void> {
  const { pantalla, rutaActual, nombreArchivoActual } = useStore.getState();
  if (!pantalla) return Promise.resolve();
  return guardarGenerico({
    que: 'la pantalla',
    generar: () => generarDspf(pantalla),
    errores: () => validar(pantalla).filter((p) => p.nivel === 'error').length,
    ruta: rutaActual,
    nombreSugerido: `${nombreCortoPantalla(nombreArchivoActual ?? pantalla.nombre)}.dspf`,
    como,
    alGuardar: (ruta) => {
      const e = useStore.getState();
      if (ruta !== e.rutaActual) e.establecerRuta(ruta);
      e.marcarGuardado();
    },
  });
}

/** Guarda la tabla abierta: sobrescribe su archivo, o pide dónde guardar si es nueva o `como` es true. */
export function guardarTabla(como = false): Promise<void> {
  const { tabla, rutaActual, nombreArchivoActual, catalogo, carpeta } = useTablas.getState();
  if (!tabla) return Promise.resolve();
  const nombre = nombreArchivoActual ? nombreArchivoTabla(nombreArchivoActual) : tabla.nombre;
  return guardarGenerico({
    que: 'la tabla',
    generar: () => generarTabla(tabla),
    errores: () =>
      validarTabla(tabla, { resolverArchivo: resolverDesde(catalogo) }).filter((p) => p.nivel === 'error').length,
    ruta: rutaActual,
    // Una tabla nueva se propone en la carpeta abierta (así aparece en la lista al guardarla).
    nombreSugerido: `${carpeta ? `${carpeta}${carpeta.includes('\\') ? '\\' : '/'}` : ''}${nombre}.${tipoDeTabla(tabla) === 'PF' ? 'pf' : 'lf'}`,
    como,
    alGuardar: (ruta) => {
      const e = useTablas.getState();
      if (ruta !== e.rutaActual) e.establecerRuta(ruta);
      e.marcarGuardado();
    },
  });
}

/** Guarda el programa abierto: sobrescribe su archivo, o pide dónde guardar si es nuevo, del CRUD o `como` es true. */
export function guardarPrograma(como = false): Promise<void> {
  const { texto, info, ruta, miembro } = useProgramas.getState();
  if (texto === null || !info) return Promise.resolve();
  return guardarGenerico({
    que: 'el programa',
    fuente: 'el fuente',
    generar: () => texto,
    errores: () => revisarFuente(texto, info.lenguaje).filter((p) => p.nivel === 'error').length,
    ruta,
    nombreSugerido: `${miembro || 'PROGRAMA'}.${info.tipo.toLowerCase()}`,
    como,
    alGuardar: (destino) => {
      const e = useProgramas.getState();
      if (destino !== e.ruta) e.establecerRuta(destino);
      e.marcarGuardado();
    },
  });
}