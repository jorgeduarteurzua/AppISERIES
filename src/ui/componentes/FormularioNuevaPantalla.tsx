import { useState } from 'react';
import { TAMANO_24X80, TAMANO_27X132 } from '@core/modelo/pantalla';
import { normalizarNombre } from '@core/edicion/operaciones';
import { useStore } from '../estado/store';

/** Formulario para crear una pantalla nueva desde cero. */
export function FormularioNuevaPantalla({ onCerrar }: { onCerrar: () => void }) {
  const nuevaPantalla = useStore((s) => s.nuevaPantalla);
  const [nombre, setNombre] = useState('PANTALLA1');
  const [tamano, setTamano] = useState<'24x80' | '27x132'>('24x80');

  const crear = (e: React.FormEvent) => {
    e.preventDefault();
    const limpio = normalizarNombre(nombre) || 'PANTALLA';
    nuevaPantalla(limpio, tamano === '24x80' ? TAMANO_24X80 : TAMANO_27X132);
    onCerrar();
  };

  return (
    <form className="formulario-flotante" role="dialog" aria-label="Nueva pantalla" onSubmit={crear}>
      <h3>Nueva pantalla</h3>
      <label className="form-fila">
        <span className="form-etiqueta">Nombre</span>
        <input
          type="text"
          className="form-entrada"
          autoFocus
          maxLength={10}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
      </label>
      <label className="form-fila">
        <span className="form-etiqueta">Tamaño</span>
        <select
          className="form-entrada"
          value={tamano}
          onChange={(e) => setTamano(e.target.value as '24x80' | '27x132')}
        >
          <option value="24x80">24 x 80 (*DS3)</option>
          <option value="27x132">27 x 132 (*DS4)</option>
        </select>
      </label>
      <div className="form-acciones">
        <button type="submit">Crear</button>
        <button type="button" className="boton-secundario" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
