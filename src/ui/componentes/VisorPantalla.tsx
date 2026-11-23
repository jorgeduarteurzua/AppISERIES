import { useMemo } from 'react';
import type { PantallaDSPF, Registro } from '@core/modelo/pantalla';
import { construirLienzo } from '@core/render/lienzo';
import { FilasLienzo } from './FilasLienzo';

interface Props {
  pantalla: PantallaDSPF;
  /** Registro a dibujar, o null para ver todos los formatos superpuestos. */
  registro: Registro | null;
}

/**
 * Visor tipo SDA: dibuja la matriz de celdas con fuente monoespaciada sobre
 * fondo negro, emulando un terminal 5250.
 */
export function VisorPantalla({ pantalla, registro }: Props) {
  const matriz = useMemo(
    () => construirLienzo(pantalla, registro),
    [pantalla, registro],
  );

  return (
    <div className="pantalla5250">
      <div className="pantalla5250-marco">
        <FilasLienzo matriz={matriz} />
      </div>
      <div className="pantalla5250-info">
        {matriz.filas} x {matriz.columnas} ·{' '}
        {registro ? (
          <>
            formato <strong>{registro.nombre}</strong> ({registro.clase})
          </>
        ) : (
          <>todos los formatos ({pantalla.registros.length})</>
        )}
      </div>
    </div>
  );
}
