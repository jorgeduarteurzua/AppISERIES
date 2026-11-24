import { generarDspf } from '@core/generador/generadorDspf';
import { generarTabla } from '@core/tablas/generadorTabla';
import { generarSql } from '@core/tablas/generadorSql';
import { indicesDe } from '@core/tablas/indices';
import { nombreArchivoTabla, tipoDeTabla } from '@core/tablas/modelo';
import type { FuenteEnvio } from './as400';
import { useStore } from './store';
import { resolverDesde, useTablas } from './storeTablas';
import { nombreCortoPantalla } from './nombres';

/** Miembro sugerido: mayúsculas y máximo 10 caracteres. */
export function miembroSugerido(nombre: string): string {
  return nombre.toUpperCase().slice(0, 10);
}

/** La pantalla abierta como fuente DSPF. Lanza si no se puede generar el DDS. */
export function fuentesDePantalla(): FuenteEnvio[] | null {
  const { pantalla, nombreArchivoActual } = useStore.getState();
  if (!pantalla) return null;
  const nombre = nombreCortoPantalla(nombreArchivoActual ?? pantalla.nombre);
  return [
    {
      clave: 'dspf',
      etiqueta: 'Pantalla',
      tipo: 'DSPF',
      miembro: miembroSugerido(nombre),
      texto: generarDspf(pantalla),
      descripcion: '',
      incluido: true,
    },
  ];
}

/**
 * La tabla abierta: el DDS (marcado), los lógicos de la carpeta que la usan si es un físico (marcados:
 * para volver a crear el físico hay que borrarlos y crearlos de nuevo) y el script SQL (sin marcar).
 * Lanza si no se puede generar.
 */
export function fuentesDeTabla(): FuenteEnvio[] | null {
  const { tabla, nombreArchivoActual, catalogo } = useTablas.getState();
  if (!tabla) return null;
  const nombre = nombreArchivoActual ? nombreArchivoTabla(nombreArchivoActual) : tabla.nombre;
  const miembro = miembroSugerido(nombre);
  const tipo = tipoDeTabla(tabla);
  const sql = generarSql(tabla, { nombre, resolverArchivo: resolverDesde(catalogo) });
  const logicos: FuenteEnvio[] =
    tipo === 'PF'
      ? indicesDe(nombre, catalogo).flatMap((i) => {
          const lf = catalogo[i.nombre];
          return lf
            ? [{ clave: `lf-${i.nombre}`, etiqueta: `Lógico ${i.nombre}`, tipo: 'LF' as const, miembro: miembroSugerido(i.nombre), texto: generarTabla(lf), descripcion: '', incluido: true }]
            : [];
        })
      : [];
  return [
    {
      clave: 'dds',
      etiqueta: tipo === 'PF' ? 'Archivo físico' : 'Archivo lógico',
      tipo,
      miembro,
      texto: generarTabla(tabla),
      descripcion: '',
      incluido: true,
    },
    ...logicos,
    {
      clave: 'sql',
      etiqueta: 'Script SQL',
      tipo: 'SQL',
      miembro,
      texto: sql.sql,
      descripcion: '',
      incluido: false,
    },
  ];
}
