import { useMemo, useRef, useState } from 'react';
import type { PantallaDSPF, Registro } from '@core/modelo/pantalla';
import { construirLienzo } from '@core/render/lienzo';
import {
  cajasElementos,
  dimensionElemento,
  elementoEnCelda,
  limitarPosicion,
  marcoDe,
  type Caja,
} from '@core/render/geometria';
import { FilasLienzo } from './FilasLienzo';
import type { Herramienta } from '../estado/store';

interface Props {
  pantalla: PantallaDSPF;
  registro: Registro;
  seleccionId: string | null;
  herramienta: Herramienta;
  onSeleccionar: (id: string | null) => void;
  /** Coloca un elemento nuevo en (fila, columna) del registro. */
  onColocar: (fila: number, columna: number) => void;
  /** Mueve un elemento. `clave` fusiona movimientos seguidos en un solo paso de deshacer. */
  onMover: (elId: string, fila: number, columna: number, clave?: string) => void;
  onBorrar: () => void;
  onCancelarHerramienta: () => void;
}

interface Arrastre {
  elId: string;
  /** Celda de pantalla donde empezó el arrastre. */
  inicio: { fila: number; columna: number };
  /** Posición del elemento (coordenadas del registro) al empezar. */
  origen: { fila: number; columna: number };
}

const NOMBRE_HERRAMIENTA: Record<Exclude<Herramienta, null>, string> = {
  texto: 'un texto',
  campo: 'un campo',
};

function estiloCaja(c: Caja, filas: number, columnas: number): React.CSSProperties {
  return {
    left: `${((c.columna - 1) / columnas) * 100}%`,
    top: `${((c.fila - 1) / filas) * 100}%`,
    width: `${(c.ancho / columnas) * 100}%`,
    height: `${(c.alto / filas) * 100}%`,
  };
}

/**
 * Lienzo de edición: dibuja la pantalla igual que el visor y encima las cajas
 * de los elementos del registro. Clic selecciona, arrastrar mueve, las flechas
 * ajustan (Mayús = 5 celdas), Supr borra y Esc cancela.
 */
export function LienzoEditable({
  pantalla,
  registro,
  seleccionId,
  herramienta,
  onSeleccionar,
  onColocar,
  onMover,
  onBorrar,
  onCancelarHerramienta,
}: Props) {
  const matriz = useMemo(
    () => construirLienzo(pantalla, registro, { edicion: true }),
    [pantalla, registro],
  );
  const marco = useMemo(() => marcoDe(pantalla, registro), [pantalla, registro]);
  const cajas = useMemo(() => cajasElementos(pantalla, registro), [pantalla, registro]);

  const arrastre = useRef<Arrastre | null>(null);
  const [cursor, setCursor] = useState<{ fila: number; columna: number } | null>(null);

  const celdaDe = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const columna = Math.min(
      matriz.columnas,
      Math.max(1, Math.floor(((e.clientX - rect.left) / rect.width) * matriz.columnas) + 1),
    );
    const fila = Math.min(
      matriz.filas,
      Math.max(1, Math.floor(((e.clientY - rect.top) / rect.height) * matriz.filas) + 1),
    );
    return { fila, columna };
  };

  const dentroDelMarco = (fila: number, columna: number) =>
    fila > marco.offF &&
    fila <= marco.offF + marco.filas &&
    columna > marco.offC &&
    columna <= marco.offC + marco.columnas;

  const alPresionar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.focus();
    const celda = celdaDe(e);

    if (herramienta) {
      if (dentroDelMarco(celda.fila, celda.columna)) {
        onColocar(celda.fila - marco.offF, celda.columna - marco.offC);
      }
      return;
    }

    const caja = elementoEnCelda(cajas, celda.fila, celda.columna);
    if (!caja) {
      onSeleccionar(null);
      return;
    }
    onSeleccionar(caja.elementoId);
    const el = registro.elementos.find((x) => x.id === caja.elementoId);
    if (el && el.fila !== null && el.columna !== null) {
      arrastre.current = {
        elId: el.id,
        inicio: celda,
        origen: { fila: el.fila, columna: el.columna },
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const alMover = (e: React.PointerEvent<HTMLDivElement>) => {
    const celda = celdaDe(e);
    if (dentroDelMarco(celda.fila, celda.columna)) {
      const fila = celda.fila - marco.offF;
      const columna = celda.columna - marco.offC;
      setCursor((c) => (c && c.fila === fila && c.columna === columna ? c : { fila, columna }));
    } else {
      setCursor(null);
    }

    const a = arrastre.current;
    if (!a) return;
    const el = registro.elementos.find((x) => x.id === a.elId);
    if (!el) return;
    const destino = limitarPosicion(
      a.origen.fila + (celda.fila - a.inicio.fila),
      a.origen.columna + (celda.columna - a.inicio.columna),
      dimensionElemento(el, marco),
      marco,
    );
    if (destino.fila !== el.fila || destino.columna !== el.columna) {
      onMover(a.elId, destino.fila, destino.columna, `arrastre:${a.elId}`);
    }
  };

  const alSoltar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (arrastre.current && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    arrastre.current = null;
  };

  const alTeclear = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (herramienta) onCancelarHerramienta();
      else onSeleccionar(null);
      return;
    }
    if (!seleccionId) return;
    const el = registro.elementos.find((x) => x.id === seleccionId);
    if (!el) return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onBorrar();
      return;
    }

    const paso = e.shiftKey ? 5 : 1;
    let df = 0;
    let dc = 0;
    switch (e.key) {
      case 'ArrowUp':
        df = -paso;
        break;
      case 'ArrowDown':
        df = paso;
        break;
      case 'ArrowLeft':
        dc = -paso;
        break;
      case 'ArrowRight':
        dc = paso;
        break;
      default:
        return;
    }
    e.preventDefault();
    if (el.fila === null || el.columna === null) return;
    const destino = limitarPosicion(el.fila + df, el.columna + dc, dimensionElemento(el, marco), marco);
    if (destino.fila !== el.fila || destino.columna !== el.columna) {
      onMover(el.id, destino.fila, destino.columna, `teclado:${el.id}`);
    }
  };

  const cajaSeleccion = cajas.find((c) => c.elementoId === seleccionId) ?? null;

  return (
    <div className="pantalla5250">
      <div className="pantalla5250-marco">
        <div
          className={herramienta ? 'rejilla rejilla-colocando' : 'rejilla'}
          role="application"
          aria-label={`Lienzo de edición del formato ${registro.nombre}`}
          tabIndex={0}
          onPointerDown={alPresionar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
          onPointerLeave={() => setCursor(null)}
          onKeyDown={alTeclear}
        >
          <FilasLienzo matriz={matriz} />
          {cajas.map((c) => (
            <div
              key={c.elementoId}
              aria-hidden="true"
              className={c.elementoId === seleccionId ? 'caja-edicion caja-seleccionada' : 'caja-edicion'}
              style={estiloCaja(c, matriz.filas, matriz.columnas)}
            />
          ))}
          {marco.ventana && (
            <div
              aria-hidden="true"
              className="caja-marco"
              style={estiloCaja(
                {
                  elementoId: '',
                  fila: marco.offF + 1,
                  columna: marco.offC + 1,
                  ancho: marco.columnas,
                  alto: marco.filas,
                },
                matriz.filas,
                matriz.columnas,
              )}
            />
          )}
        </div>
      </div>
      <div className="pantalla5250-info" aria-live="polite">
        {matriz.filas} x {matriz.columnas} · formato <strong>{registro.nombre}</strong> ({registro.clase})
        {cursor && (
          <>
            {' '}
            · fila <strong>{cursor.fila}</strong>, columna <strong>{cursor.columna}</strong>
          </>
        )}
        {cajaSeleccion && !herramienta && (
          <>
            {' '}
            · {cajaSeleccion.ancho}x{cajaSeleccion.alto}
          </>
        )}
      </div>
      <div className="pantalla5250-ayuda">
        {herramienta
          ? `Haz clic en la pantalla para colocar ${NOMBRE_HERRAMIENTA[herramienta]}. Esc cancela.`
          : 'Clic para seleccionar · arrastra para mover · flechas ajustan (Mayús = 5) · Supr borra'}
      </div>
    </div>
  );
}
