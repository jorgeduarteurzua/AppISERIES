import type { PasoEnvio } from '@core/as400/tipos';

/** Pasos de una operación con el AS400: ✔ correcto, ✖ error, ⚠ aviso. */
export function ListaPasos({ pasos }: { pasos: PasoEnvio[] }) {
  return (
    <ul className="as400-pasos">
      {pasos.map((p, i) => {
        const marca = p.ok ? '✔' : p.aviso ? '⚠' : '✖';
        const clase = p.ok ? 'paso-ok' : p.aviso ? 'paso-aviso' : 'paso-error';
        return (
          <li key={i} className={clase}>
            <span className="paso-marca" aria-label={p.ok ? 'correcto' : p.aviso ? 'aviso' : 'error'}>
              {marca}
            </span>
            <span className="paso-nombre">{p.nombre}</span>
            <span className="paso-mensaje">{p.mensaje}</span>
          </li>
        );
      })}
    </ul>
  );
}
