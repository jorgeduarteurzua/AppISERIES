import type { PantallaDSPF, Registro } from '@core/modelo/pantalla';
import {
  agregarCampo,
  agregarConstante,
  eliminarElemento,
  moverElemento,
} from '@core/edicion/operaciones';
import { limitarPosicion, marcoDe } from '@core/render/geometria';
import { useStore } from '../estado/store';
import { LienzoEditable } from './LienzoEditable';

interface Props {
  pantalla: PantallaDSPF;
  registro: Registro;
}

/** Conecta el lienzo editable con el store: colocar, mover, seleccionar y borrar. */
export function EditorPantalla({ pantalla, registro }: Props) {
  const seleccionElemento = useStore((s) => s.seleccionElemento);
  const herramienta = useStore((s) => s.herramienta);
  const seleccionarElemento = useStore((s) => s.seleccionarElemento);
  const elegirHerramienta = useStore((s) => s.elegirHerramienta);
  const aplicar = useStore((s) => s.aplicar);
  const modificar = useStore((s) => s.modificar);

  const colocar = (fila: number, columna: number) => {
    const marco = marcoDe(pantalla, registro);
    try {
      if (herramienta === 'texto') {
        const pos = limitarPosicion(fila, columna, { ancho: 5, alto: 1 }, marco);
        const r = agregarConstante(pantalla, registro.id, pos.fila, pos.columna);
        aplicar(r.pantalla, { seleccionar: r.elementoId });
      } else if (herramienta === 'campo') {
        const pos = limitarPosicion(fila, columna, { ancho: 10, alto: 1 }, marco);
        const r = agregarCampo(pantalla, registro.id, { fila: pos.fila, columna: pos.columna });
        aplicar(r.pantalla, { seleccionar: r.elementoId });
      }
      // Tras colocar un elemento se vuelve a la herramienta de selección.
      elegirHerramienta(null);
    } catch (e) {
      useStore.setState({ error: e instanceof Error ? e.message : String(e) });
    }
  };

  const borrar = () => {
    if (!seleccionElemento) return;
    try {
      aplicar(eliminarElemento(pantalla, registro.id, seleccionElemento), { seleccionar: null });
    } catch (e) {
      useStore.setState({ error: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <LienzoEditable
      pantalla={pantalla}
      registro={registro}
      seleccionId={seleccionElemento}
      herramienta={herramienta}
      onSeleccionar={seleccionarElemento}
      onColocar={colocar}
      onMover={(elId, fila, columna, clave) =>
        modificar((p) => moverElemento(p, registro.id, elId, fila, columna), { clave })
      }
      onBorrar={borrar}
      onCancelarHerramienta={() => elegirHerramienta(null)}
    />
  );
}
