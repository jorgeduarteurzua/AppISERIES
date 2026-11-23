import { useMemo, useState } from 'react';
import { crearIndice, indicesDe, sugerirNombreIndice } from '@core/tablas/indices';
import type { LlaveIndice } from '@core/tablas/indices';
import { generarSql } from '@core/tablas/generadorSql';
import { generarTabla } from '@core/tablas/generadorTabla';
import { camposDe } from '@core/tablas/modelo';
import type { Tabla } from '@core/tablas/modelo';
import { resolverDesde, useTablas } from '../estado/storeTablas';

const textoLlaves = (llaves: LlaveIndice[]): string => llaves.map((k) => `${k.nombre}${k.descendente ? ' ↓' : ''}`).join(', ');

/** Índices (lógicos) del físico abierto: los de la carpeta y la creación de uno nuevo. */
export function PanelIndices({ tabla, nombre }: { tabla: Tabla; nombre: string }) {
  const catalogo = useTablas((s) => s.catalogo);
  const archivos = useTablas((s) => s.archivos);
  const cargarArchivo = useTablas((s) => s.cargarArchivo);
  const [nuevo, setNuevo] = useState(false);
  const indices = useMemo(() => indicesDe(nombre, catalogo), [nombre, catalogo]);

  return (
    <div className="panel-indices">
      {indices.length === 0 ? (
        <p className="tenue">No hay lógicos de este archivo en la carpeta.</p>
      ) : (
        <ul className="lista-indices" aria-label="Índices del archivo">
          {indices.map((i) => {
            const archivo = archivos.find((a) => a.clave === i.nombre);
            return (
              <li key={i.nombre}>
                <button
                  type="button"
                  className="enlace"
                  disabled={!archivo}
                  title={archivo ? `Abrir ${archivo.nombre}` : 'Todavía no está guardado'}
                  onClick={() => archivo && void cargarArchivo(archivo)}
                >
                  <strong>{i.nombre}</strong>
                  {i.unico && <span className="etq etq-pf">UNIQUE</span>}
                  {i.conSeleccion && <span className="etq">S/O</span>}
                  <span className="tenue indice-llaves">{i.llaves.length > 0 ? textoLlaves(i.llaves) : 'sin llave'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="boton-secundario" onClick={() => setNuevo(true)}>
        Nuevo índice…
      </button>
      {nuevo && <FormularioNuevoIndice tabla={tabla} nombre={nombre} existentes={Object.keys(catalogo)} onCerrar={() => setNuevo(false)} />}
    </div>
  );
}

function FormularioNuevoIndice({
  tabla,
  nombre,
  existentes,
  onCerrar,
}: {
  tabla: Tabla;
  nombre: string;
  existentes: string[];
  onCerrar: () => void;
}) {
  const abrirTablaNueva = useTablas((s) => s.abrirTablaNueva);
  const catalogo = useTablas((s) => s.catalogo);
  const biblioteca = useTablas((s) => s.biblioteca);
  const campos = useMemo(() => (tabla.registros[0] ? camposDe(tabla.registros[0]).map((c) => c.nombre) : []), [tabla]);
  const [nombreIndice, setNombreIndice] = useState(() => sugerirNombreIndice(nombre, existentes));
  const [texto, setTexto] = useState('');
  const [unico, setUnico] = useState(false);
  const [llaves, setLlaves] = useState<LlaveIndice[]>([]);
  const [todos, setTodos] = useState(true);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [vista, setVista] = useState<'dds' | 'sql'>('dds');

  const opciones = { nombre: nombreIndice, llaves, unico, campos: todos ? null : campos.filter((c) => elegidos.includes(c) || llaves.some((k) => k.nombre === c)), texto };
  const previa = useMemo(() => {
    try {
      const lf = crearIndice(tabla, nombre, opciones);
      const sql = generarSql(lf, {
        nombre: lf.nombre,
        biblioteca: biblioteca.trim() === '' ? undefined : biblioteca.trim().toUpperCase(),
        resolverArchivo: (n) => (n.toUpperCase() === nombre.toUpperCase() ? tabla : resolverDesde(catalogo)(n)),
      }).sql;
      return { lf, dds: generarTabla(lf), sql, error: null as string | null };
    } catch (e) {
      return { lf: null, dds: '', sql: '', error: e instanceof Error ? e.message : String(e) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabla, nombre, nombreIndice, texto, unico, llaves, todos, elegidos, biblioteca, catalogo]);

  const libres = campos.filter((c) => !llaves.some((k) => k.nombre === c));

  return (
    <form
      className="formulario-flotante dialogo-indice"
      role="dialog"
      aria-label="Nuevo índice"
      onSubmit={(e) => {
        e.preventDefault();
        if (previa.lf && abrirTablaNueva(previa.lf)) onCerrar();
      }}
    >
      <h3>Nuevo índice de {nombre}</h3>
      <p className="tenue">
        Crea un archivo lógico (LF) sobre el físico. Se abre para revisarlo; al guardarlo queda en la carpeta y aparece en la lista. Su
        SQL (CREATE INDEX) está en la pestaña SQL.
      </p>
      <label className="form-fila">
        <span className="form-etiqueta">Nombre</span>
        <input className="form-entrada" maxLength={10} value={nombreIndice} onChange={(e) => setNombreIndice(e.target.value.toUpperCase())} />
      </label>
      <label className="form-fila">
        <span className="form-etiqueta">Texto</span>
        <input className="form-entrada" maxLength={50} value={texto} placeholder="Opcional" onChange={(e) => setTexto(e.target.value)} />
      </label>
      <label className="form-fila form-check">
        <input type="checkbox" checked={unico} onChange={(e) => setUnico(e.target.checked)} />
        <span>Llave única (UNIQUE)</span>
      </label>

      <fieldset className="indice-llave">
        <legend>Llave</legend>
        {llaves.length === 0 && <p className="tenue">Agregue los campos de la llave en orden.</p>}
        <ol>
          {llaves.map((k, i) => (
            <li key={k.nombre}>
              <span className="crud-definicion">{k.nombre}</span>
              <label className="form-check">
                <input
                  type="checkbox"
                  aria-label={`${k.nombre} descendente`}
                  checked={k.descendente}
                  onChange={(e) => setLlaves((ls) => ls.map((x, j) => (j === i ? { ...x, descendente: e.target.checked } : x)))}
                />
                descendente
              </label>
              <button
                type="button"
                className="boton-icono"
                aria-label={`Subir ${k.nombre}`}
                disabled={i === 0}
                onClick={() => setLlaves((ls) => ls.map((x, j) => (j === i - 1 ? ls[i] : j === i ? ls[i - 1] : x)))}
              >
                ↑
              </button>
              <button type="button" className="boton-icono" aria-label={`Quitar ${k.nombre} de la llave`} onClick={() => setLlaves((ls) => ls.filter((_, j) => j !== i))}>
                ×
              </button>
            </li>
          ))}
        </ol>
        {libres.length > 0 && (
          <select
            className="form-entrada"
            aria-label="Agregar campo a la llave"
            value=""
            onChange={(e) => e.target.value && setLlaves((ls) => [...ls, { nombre: e.target.value, descendente: false }])}
          >
            <option value="">+ Agregar campo a la llave…</option>
            {libres.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </fieldset>

      <fieldset className="indice-campos">
        <legend>Campos</legend>
        <label className="form-check">
          <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />
          <span>Todos los campos del físico (usa su mismo formato)</span>
        </label>
        {!todos && (
          <div className="indice-lista-campos">
            {campos.map((c) => {
              const enLlave = llaves.some((k) => k.nombre === c);
              return (
                <label key={c} className="form-check">
                  <input
                    type="checkbox"
                    aria-label={`Incluir ${c}`}
                    checked={enLlave || elegidos.includes(c)}
                    disabled={enLlave}
                    onChange={(e) => setElegidos((xs) => (e.target.checked ? [...xs, c] : xs.filter((x) => x !== c)))}
                  />
                  <span>{c}</span>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

      <div className="pestanas" role="tablist">
        <button type="button" role="tab" aria-selected={vista === 'dds'} className={vista === 'dds' ? 'pestana activa' : 'pestana'} onClick={() => setVista('dds')}>
          DDS (LF)
        </button>
        <button type="button" role="tab" aria-selected={vista === 'sql'} className={vista === 'sql' ? 'pestana activa' : 'pestana'} onClick={() => setVista('sql')}>
          SQL (CREATE INDEX)
        </button>
      </div>
      {previa.error ? (
        <p className="form-error" role="alert">
          {previa.error}
        </p>
      ) : (
        <pre className="as400-listado" aria-label={vista === 'dds' ? 'DDS del índice' : 'SQL del índice'}>
          {vista === 'dds' ? previa.dds : previa.sql}
        </pre>
      )}

      <div className="form-acciones">
        <button type="submit" disabled={!previa.lf}>
          Crear índice
        </button>
        <button type="button" className="boton-secundario" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
