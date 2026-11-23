import { useMemo } from 'react';
import type { PantallaDSPF } from '@core/modelo/pantalla';
import { validar, type Problema } from '@core/edicion/validacion';
import { useStore } from '../../estado/store';

/** Lista de errores y avisos de la pantalla; al pulsar uno se va al registro/elemento afectado. */
export function PanelProblemas({ pantalla }: { pantalla: PantallaDSPF }) {
  const seleccionarRegistro = useStore((s) => s.seleccionarRegistro);
  const seleccionarElemento = useStore((s) => s.seleccionarElemento);

  const problemas = useMemo(() => validar(pantalla), [pantalla]);
  const errores = problemas.filter((p) => p.nivel === 'error').length;
  const avisos = problemas.length - errores;

  const ir = (p: Problema) => {
    if (p.regId) seleccionarRegistro(p.regId);
    if (p.elId) seleccionarElemento(p.elId);
  };

  if (problemas.length === 0) {
    return (
      <p className="problemas-resumen problemas-ok" role="status">
        Sin problemas: el DDS se puede generar.
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
              <span className="problema-nivel">{p.nivel === 'error' ? 'Error' : 'Aviso'}:</span>{' '}
              {p.mensaje}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
