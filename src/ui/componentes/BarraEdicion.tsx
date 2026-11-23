import { puedeDeshacer, puedeRehacer } from '@core/edicion/historial';
import { useStore } from '../estado/store';

/** Barra de herramientas del modo edición. */
export function BarraEdicion({ hayRegistro }: { hayRegistro: boolean }) {
  const modoEdicion = useStore((s) => s.modoEdicion);
  const herramienta = useStore((s) => s.herramienta);
  const historial = useStore((s) => s.historial);
  const modificado = useStore((s) => s.modificado);
  const alternarEdicion = useStore((s) => s.alternarEdicion);
  const elegirHerramienta = useStore((s) => s.elegirHerramienta);
  const deshacer = useStore((s) => s.deshacer);
  const rehacer = useStore((s) => s.rehacer);

  return (
    <div className="barra-edicion" role="toolbar" aria-label="Herramientas de edición">
      <button
        type="button"
        className={modoEdicion ? 'activo' : ''}
        aria-pressed={modoEdicion}
        onClick={alternarEdicion}
      >
        {modoEdicion ? 'Salir de edición' : 'Editar pantalla'}
      </button>

      {modoEdicion && (
        <>
          <span className="barra-separador" aria-hidden="true" />
          <button
            type="button"
            onClick={deshacer}
            disabled={!puedeDeshacer(historial)}
            title="Deshacer (Ctrl+Z)"
          >
            Deshacer
          </button>
          <button
            type="button"
            onClick={rehacer}
            disabled={!puedeRehacer(historial)}
            title="Rehacer (Ctrl+Y)"
          >
            Rehacer
          </button>
          <span className="barra-separador" aria-hidden="true" />
          <button
            type="button"
            className={herramienta === 'texto' ? 'activo' : ''}
            aria-pressed={herramienta === 'texto'}
            disabled={!hayRegistro}
            onClick={() => elegirHerramienta(herramienta === 'texto' ? null : 'texto')}
          >
            + Texto
          </button>
          <button
            type="button"
            className={herramienta === 'campo' ? 'activo' : ''}
            aria-pressed={herramienta === 'campo'}
            disabled={!hayRegistro}
            onClick={() => elegirHerramienta(herramienta === 'campo' ? null : 'campo')}
          >
            + Campo
          </button>
        </>
      )}

      {modificado && (
        <span className="barra-modificado" role="status">
          ● Cambios sin guardar
        </span>
      )}
    </div>
  );
}
