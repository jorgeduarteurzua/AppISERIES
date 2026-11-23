import { useMemo } from 'react';
import type { Tabla } from '@core/tablas/modelo';
import { validarTabla, type ProblemaTabla } from '@core/tablas/validacionTabla';
import { resolverDesde, useTablas } from '../estado/storeTablas';

/** Lista de errores y avisos de la tabla; al pulsar uno se va al elemento afectado. */
export function PanelProblemasTabla({ tabla }: { tabla: Tabla }) {
  const catalogo = useTablas((s) => s.catalogo);
  const seleccionarRegistro = useTablas((s) => s.seleccionarRegistro);
  const seleccionar = useTablas((s) => s.seleccionar);

  const problemas = useMemo(
    () => validarTabla(tabla, { resolverArchivo: resolverDesde(catalogo) }),
    [tabla, catalogo],
  );
  const errores = problemas.filter((p) => p.nivel === 'error').length;
  const avisos = problemas.length - errores;

  const ir = (p: ProblemaTabla) => {
    if (p.regId) seleccionarRegistro(p.regId);
    if (p.elId) seleccionar(p.elId);
  };

  if (problemas.length === 0) {
    return (
      <p className="problemas-resumen problemas-ok" role="status">
        Sin problemas: el DDS y el SQL se pueden generar.
      </p>
    );
  }

  return (
    <div className="problemas">
      <p className="problemas-resumen" role="status">
        {errores > 0 && (
          <strong className="problema-error">
            {errores} {errores === 1 ? 'error' : 'errores'}
          </strong>
        )}
        {errores > 0 && avisos > 0 && ' · '}
        {avisos > 0 && (
          <span className="problema-aviso">
            {avisos} {avisos === 1 ? 'aviso' : 'avisos'}
          </span>
        )}
      </p>
      <ul className="problemas-lista">
        {problemas.map((p, i) => (
          <li key={i}>
            <button
              type="button"
              className={p.nivel === 'error' ? 'problema problema-error' : 'problema problema-aviso'}
              onClick={() => ir(p)}
              disabled={!p.regId}
            >
              <span className="problema-nivel">{p.nivel === 'error' ? 'Error' : 'Aviso'}:</span> {p.mensaje}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
