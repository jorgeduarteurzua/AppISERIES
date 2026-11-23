import { useMemo, useState } from 'react';
import { nombreArchivoTabla, tipoDeTabla, type Tabla } from '@core/tablas/modelo';
import { generarTabla } from '@core/tablas/generadorTabla';
import { generarSql } from '@core/tablas/generadorSql';
import { hayErroresTabla, validarTabla } from '@core/tablas/validacionTabla';
import { resolverDesde, useTablas } from '../estado/storeTablas';
import { guardarTabla } from '../estado/guardado';
import { ResultadoTexto } from './ResultadoTexto';

function mensajeDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Nombre del archivo de base de datos a partir del fuente abierto (o de la tabla nueva). */
function nombreDe(tabla: Tabla, nombreArchivoActual: string | null): string {
  return nombreArchivoActual ? nombreArchivoTabla(nombreArchivoActual) : tabla.nombre;
}

/** Fuente DDS generado desde el modelo. */
export function VistaDdsTabla({ tabla }: { tabla: Tabla }) {
  const nombreArchivoActual = useTablas((s) => s.nombreArchivoActual);
  const catalogo = useTablas((s) => s.catalogo);

  const resultado = useMemo(() => {
    try {
      return { texto: generarTabla(tabla), error: null as string | null };
    } catch (e) {
      return { texto: '', error: mensajeDe(e) };
    }
  }, [tabla]);

  const errores = useMemo(
    () => validarTabla(tabla, { resolverArchivo: resolverDesde(catalogo) }).filter((p) => p.nivel === 'error').length,
    [tabla, catalogo],
  );

  const extension = tipoDeTabla(tabla) === 'PF' ? 'pf' : 'lf';
  return (
    <ResultadoTexto
      texto={resultado.texto}
      nombreSugerido={`${nombreDe(tabla, nombreArchivoActual)}.${extension}`}
      etiquetaAria="Fuente DDS generado"
      guardarComo={() => guardarTabla(true)}
      deshabilitado={resultado.error !== null}
    >
      {errores > 0 && (
        <div className="app-error" role="alert">
          La tabla tiene {errores} {errores === 1 ? 'error' : 'errores'} de validación: el DDS puede no compilar. Revisa el
          panel de problemas.
        </div>
      )}
      {resultado.error && <div className="app-error">No se pudo generar el DDS: {resultado.error}</div>}
    </ResultadoTexto>
  );
}

/** SQL (CREATE TABLE / INDEX / VIEW) generado desde el modelo. */
export function VistaSqlTabla({ tabla }: { tabla: Tabla }) {
  const nombreArchivoActual = useTablas((s) => s.nombreArchivoActual);
  const catalogo = useTablas((s) => s.catalogo);
  const biblioteca = useTablas((s) => s.biblioteca);
  const establecerBiblioteca = useTablas((s) => s.establecerBiblioteca);
  const [reemplazar, setReemplazar] = useState(false);

  const resultado = useMemo(() => {
    try {
      const r = generarSql(tabla, {
        biblioteca: biblioteca.trim() === '' ? undefined : biblioteca.trim().toUpperCase(),
        nombre: nombreDe(tabla, nombreArchivoActual),
        reemplazar,
        resolverArchivo: resolverDesde(catalogo),
      });
      return { ...r, error: null as string | null };
    } catch (e) {
      return { sql: '', advertencias: [] as string[], error: mensajeDe(e) };
    }
  }, [tabla, biblioteca, reemplazar, nombreArchivoActual, catalogo]);

  const hayErrores = hayErroresTabla(validarTabla(tabla, { resolverArchivo: resolverDesde(catalogo) }));

  return (
    <ResultadoTexto
      texto={resultado.sql}
      nombreSugerido={`${nombreDe(tabla, nombreArchivoActual)}.sql`}
      etiquetaAria="SQL generado"
      deshabilitado={resultado.error !== null}
    >
      <div className="opciones-sql">
        <label className="form-fila">
          <span className="form-etiqueta">Biblioteca</span>
          <input
            type="text"
            className="form-entrada"
            maxLength={10}
            placeholder="(sin calificar)"
            value={biblioteca}
            onChange={(e) => establecerBiblioteca(e.target.value)}
          />
        </label>
        <label className="form-check">
          <input type="checkbox" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)} />
          CREATE OR REPLACE
        </label>
      </div>
      {hayErrores && (
        <div className="app-error" role="alert">
          La tabla tiene errores de validación: el SQL puede no ser correcto. Revisa el panel de problemas.
        </div>
      )}
      {resultado.error && <div className="app-error">No se pudo generar el SQL: {resultado.error}</div>}
      {resultado.advertencias.length > 0 && (
        <details className="advertencias-sql" open>
          <summary>
            {resultado.advertencias.length} {resultado.advertencias.length === 1 ? 'advertencia' : 'advertencias'} de la conversión
          </summary>
          <ul className="lista-compacta">
            {resultado.advertencias.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </details>
      )}
    </ResultadoTexto>
  );
}
