import { useMemo, useState } from 'react';
import { camposDelArchivo, incorporarCampos } from '@core/edicion/camposDeArchivo';
import type { EtiquetaCampo } from '@core/edicion/camposDeArchivo';
import { tipoDeTabla } from '@core/tablas/modelo';
import { useStore } from '../estado/store';
import { useGuardado } from '../estado/guardado';
import { resolverDesde, useTablas } from '../estado/storeTablas';

const definicion = (c: { longitud: number; decimales: number; tipo: string }): string =>
  ['A', 'L', 'T', 'Z'].includes(c.tipo) ? `${c.longitud}${c.tipo}` : `${c.longitud},${c.decimales}${c.tipo}`;

/** Agrega a un formato de la pantalla campos de un archivo (PF o LF), con referencia (REFFLD). */
export function DialogoCamposArchivo({ onCerrar }: { onCerrar: () => void }) {
  const pantalla = useStore((s) => s.pantalla);
  const registroSeleccionado = useStore((s) => s.registroSeleccionado);
  const catalogo = useTablas((s) => s.catalogo);
  const carpetaTablas = useTablas((s) => s.carpeta);
  const resolver = useMemo(() => resolverDesde(catalogo), [catalogo]);
  const archivos = useMemo(() => Object.keys(catalogo).sort(), [catalogo]);

  const registros = pantalla?.registros ?? [];
  const [regId, setRegId] = useState(() => registros.find((r) => r.id === registroSeleccionado)?.id ?? registros[0]?.id ?? '');
  const [archivo, setArchivo] = useState(archivos[0] ?? '');
  const [marcados, setMarcados] = useState<string[]>([]);
  const [uso, setUso] = useState<'entrada' | 'salida' | 'ambos'>('ambos');
  const [etiqueta, setEtiqueta] = useState<EtiquetaCampo>('texto');
  const [fila, setFila] = useState('4');
  const [columna, setColumna] = useState('2');
  const [error, setError] = useState<string | null>(null);

  const tabla = archivo ? catalogo[archivo] : undefined;
  const campos = useMemo(() => (tabla ? camposDelArchivo(tabla, resolver) : []), [tabla, resolver]);

  if (!pantalla) return null;

  const elegirArchivo = (a: string) => {
    setArchivo(a);
    setMarcados([]);
    setError(null);
  };

  const agregar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tabla) return;
    try {
      const r = incorporarCampos(pantalla, {
        archivo,
        tabla,
        resolver,
        regId,
        // En el orden del archivo.
        campos: campos.filter((c) => marcados.includes(c.nombre)).map((c) => c.nombre),
        uso,
        etiqueta,
        fila: Number(fila),
        columna: Number(columna),
      });
      useStore.getState().aplicar(r.pantalla, { registro: regId, seleccionar: null });
      // La barra de desplazamiento solo se avisa: el desarrollador decide cómo acomodar los campos.
      if (r.avisos.length > 0) useGuardado.setState({ mensaje: `Atención: ${r.avisos.join(' ')}`, tipo: 'error' });
      onCerrar();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form className="formulario-flotante dialogo-campos-archivo" role="dialog" aria-label="Campos de un archivo" onSubmit={agregar}>
      <h3>Campos de un archivo</h3>
      <p className="tenue">
        Los campos quedan con referencia al archivo (REFFLD): toman su largo y tipo, y el generador de programas sabe de dónde
        leerlos.
      </p>

      {archivos.length === 0 ? (
        <div className="form-fila">
          <p>No hay archivos abiertos. Abra la carpeta con los fuentes PF y LF (la de la sección Tablas).</p>
          <button type="button" onClick={() => void useTablas.getState().abrirCarpeta()}>
            Abrir carpeta de archivos…
          </button>
        </div>
      ) : (
        <>
          <div className="campos-archivo-opciones">
            <label className="form-fila">
              <span className="form-etiqueta">Archivo</span>
              <select className="form-entrada" aria-label="Archivo" value={archivo} onChange={(e) => elegirArchivo(e.target.value)}>
                {archivos.map((a) => (
                  <option key={a} value={a}>
                    {a} ({tipoDeTabla(catalogo[a])})
                  </option>
                ))}
              </select>
            </label>
            <label className="form-fila">
              <span className="form-etiqueta">Formato</span>
              <select className="form-entrada" aria-label="Formato de la pantalla" value={regId} onChange={(e) => setRegId(e.target.value)}>
                {registros.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-fila">
              <span className="form-etiqueta">Uso</span>
              <select className="form-entrada" aria-label="Uso de los campos" value={uso} onChange={(e) => setUso(e.target.value as typeof uso)}>
                <option value="ambos">Entrada y salida (B)</option>
                <option value="entrada">Entrada (I)</option>
                <option value="salida">Salida (O)</option>
              </select>
            </label>
            <label className="form-fila">
              <span className="form-etiqueta">Etiqueta</span>
              <select className="form-entrada" aria-label="Etiqueta de los campos" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value as EtiquetaCampo)}>
                <option value="texto">Texto del campo (TEXT)</option>
                <option value="encabezado">Encabezado de columna (COLHDG)</option>
                <option value="nombre">Nombre del campo</option>
                <option value="ninguna">Sin etiqueta</option>
              </select>
            </label>
            <label className="form-fila">
              <span className="form-etiqueta">Desde fila</span>
              <input className="form-entrada crud-numero" type="number" min={1} aria-label="Fila" value={fila} onChange={(e) => setFila(e.target.value)} />
            </label>
            <label className="form-fila">
              <span className="form-etiqueta">Columna</span>
              <input className="form-entrada crud-numero" type="number" min={1} aria-label="Columna" value={columna} onChange={(e) => setColumna(e.target.value)} />
            </label>
          </div>

          <div className="crud-tabla-scroll campos-archivo-lista">
            <table className="crud-campos">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Marcar todos"
                      checked={campos.length > 0 && marcados.length === campos.length}
                      onChange={(e) => setMarcados(e.target.checked ? campos.map((c) => c.nombre) : [])}
                    />
                  </th>
                  <th>Campo</th>
                  <th>Definición</th>
                  <th>Llave</th>
                  <th>Texto</th>
                </tr>
              </thead>
              <tbody>
                {campos.map((c) => (
                  <tr key={c.nombre}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Agregar ${c.nombre}`}
                        checked={marcados.includes(c.nombre)}
                        onChange={(e) => setMarcados((m) => (e.target.checked ? [...m, c.nombre] : m.filter((x) => x !== c.nombre)))}
                      />
                    </td>
                    <td>{c.nombre}</td>
                    <td className="crud-definicion">{definicion(c)}</td>
                    <td>{c.llave ? 'Sí' : ''}</td>
                    <td className="tenue">{c.texto || c.encabezado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {carpetaTablas && <p className="tenue">Archivos de {carpetaTablas}</p>}
        </>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-acciones">
        <button type="submit" disabled={!tabla || marcados.length === 0}>
          Agregar {marcados.length > 0 ? `${marcados.length} ` : ''}campo{marcados.length === 1 ? '' : 's'}
        </button>
        <button type="button" className="boton-secundario" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
