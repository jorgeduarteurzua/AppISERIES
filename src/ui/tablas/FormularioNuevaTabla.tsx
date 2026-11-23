import { useId, useState } from 'react';
import type { TipoArchivo } from '@core/tablas/modelo';
import { normalizarNombre } from '@core/tablas/operacionesTabla';
import { useTablas } from '../estado/storeTablas';

/** Formulario para crear una tabla nueva: archivo físico o lógico sobre un físico. */
export function FormularioNuevaTabla({ onCerrar }: { onCerrar: () => void }) {
  const nuevaTabla = useTablas((s) => s.nuevaTabla);
  const archivos = useTablas((s) => s.archivos);
  const idLista = useId();
  const [nombre, setNombre] = useState('TABLA1');
  const [tipo, setTipo] = useState<TipoArchivo>('PF');
  const [fisico, setFisico] = useState('');

  const crear = (e: React.FormEvent) => {
    e.preventDefault();
    nuevaTabla(normalizarNombre(nombre) || 'ARCHIVO', tipo, tipo === 'LF' ? fisico : undefined);
    onCerrar();
  };

  return (
    <form className="formulario-flotante" role="dialog" aria-label="Nueva tabla" onSubmit={crear}>
      <h3>Nueva tabla</h3>
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
        <span className="form-etiqueta">Tipo</span>
        <select className="form-entrada" value={tipo} onChange={(e) => setTipo(e.target.value as TipoArchivo)}>
          <option value="PF">Archivo físico (PF)</option>
          <option value="LF">Archivo lógico (LF)</option>
        </select>
      </label>
      {tipo === 'LF' && (
        <label className="form-fila">
          <span className="form-etiqueta">Sobre</span>
          <input
            type="text"
            className="form-entrada"
            list={idLista}
            maxLength={10}
            placeholder="Archivo físico (PFILE)"
            value={fisico}
            onChange={(e) => setFisico(e.target.value)}
          />
          <datalist id={idLista}>
            {archivos
              .filter((a) => a.tipo === 'PF')
              .map((a) => (
                <option key={a.clave} value={a.clave} />
              ))}
          </datalist>
        </label>
      )}
      <div className="form-acciones">
        <button type="submit">Crear</button>
        <button type="button" className="boton-secundario" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
