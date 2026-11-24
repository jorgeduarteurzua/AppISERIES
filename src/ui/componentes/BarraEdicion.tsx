import { puedeDeshacer, puedeRehacer } from '@core/edicion/historial';
import { agregarCampo, completarSubfile, nombreLibre } from '@core/edicion/operaciones';
import { registroDe, useStore } from '../estado/store';
import { useGuardado } from '../estado/guardado';

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
  const pantalla = useStore((s) => s.pantalla);
  const registro = registroDe(pantalla, useStore((s) => s.registroSeleccionado));
  const esSubfile = registro?.clase === 'subfile' || registro?.clase === 'control-subfile';

  /** Un campo oculto (H): no tiene posición; se ve en «Campos sin posición». */
  const agregarOculto = () => {
    if (!pantalla || !registro) return;
    const existentes = registro.elementos.flatMap((e) => (e.tipo === 'campo' ? [e.nombre] : []));
    const r = agregarCampo(pantalla, registro.id, { nombre: nombreLibre(existentes, 'OCULTO'), uso: 'oculto', fila: null, columna: null });
    useStore.getState().aplicar(r.pantalla, { seleccionar: r.elementoId });
  };

  const completar = () => {
    if (!pantalla || !registro) return;
    try {
      const r = completarSubfile(pantalla, registro.id);
      if (r.agregados.length > 0) useStore.getState().aplicar(r.pantalla);
      const partes = [
        r.agregados.length > 0 ? `Se agregó: ${r.agregados.join('; ')}.` : 'El subfile ya tenía todo lo del CRUD.',
        ...r.avisos,
      ];
      useGuardado.setState({ mensaje: partes.join(' '), tipo: r.avisos.length > 0 ? 'error' : 'ok' });
    } catch (e) {
      useGuardado.setState({ mensaje: e instanceof Error ? e.message : String(e), tipo: 'error' });
    }
  };

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
          <button type="button" disabled={!hayRegistro} title="Campo oculto (H): sin posición; queda en «Campos sin posición»" onClick={agregarOculto}>
            + Campo oculto
          </button>
          {esSubfile && (
            <button
              type="button"
              title="Agrega lo que tiene el subfile del CRUD y le falte: OVERLAY, registro relativo (SFLCSRRRN), página (SFLRCDNBR), OPCION y la línea de opciones"
              onClick={completar}
            >
              Completar subfile
            </button>
          )}
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
