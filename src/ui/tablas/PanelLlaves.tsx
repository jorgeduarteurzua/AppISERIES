import { useId } from 'react';
import type { Keyword } from '@core/modelo/pantalla';
import {
  camposDe,
  llavesDe,
  seleccionesDe,
  type RegistroTabla,
  type SeleccionTabla,
  type Tabla,
} from '@core/tablas/modelo';
import {
  actualizarSeleccion,
  agregarLlave,
  agregarSeleccion,
  alternarDescendente,
  eliminarElemento,
  establecerUnico,
  moverLlave,
} from '@core/tablas/operacionesTabla';
import { useTablas } from '../estado/storeTablas';

interface Props {
  tabla: Tabla;
  registro: RegistroTabla;
  logico: boolean;
  /** Nombres de campo que se sugieren (los propios o, en un lógico, los del físico). */
  sugeridos: string[];
}

const KEYWORDS_CONDICION = ['COMP', 'VALUES', 'RANGE'];

/** Llaves de acceso (K), UNIQUE y, en un lógico, las sentencias de selección y omisión (S/O). */
export function PanelLlaves({ tabla, registro, logico, sugeridos }: Props) {
  const modificar = useTablas((s) => s.modificar);
  const seleccionar = useTablas((s) => s.seleccionar);
  const idLista = useId();
  const regId = registro.id;
  const llaves = llavesDe(registro);
  const selecciones = seleccionesDe(registro);
  const unico = tabla.keywords.some((k) => k.nombre === 'UNIQUE');

  const nuevaLlave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const campo = (new FormData(e.currentTarget).get('campo') as string | null)?.trim() ?? '';
    if (campo === '') return;
    modificar((t) => agregarLlave(t, regId, campo).tabla);
    e.currentTarget.reset();
  };

  return (
    <div className="form">
      <datalist id={idLista}>
        {sugeridos.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <label className="form-check" title="UNIQUE: no se admiten dos registros con la misma llave">
        <input
          type="checkbox"
          checked={unico}
          onChange={(e) => modificar((t) => establecerUnico(t, e.target.checked))}
        />
        Llave única (UNIQUE)
      </label>

      <h4>Llave de acceso</h4>
      {llaves.length === 0 && <p className="tenue">Sin llave: el archivo se lee en el orden de llegada.</p>}
      {llaves.map((k, i) => {
        const desc = k.keywords.some((x) => x.nombre === 'DESCEND');
        return (
          <div className="llave-fila" key={k.id}>
            <span className="col-numero">{i + 1}</span>
            <button type="button" className="enlace" onClick={() => seleccionar(camposDe(registro).find((c) => c.nombre === k.nombre)?.id ?? null)}>
              {k.nombre}
            </button>
            <button
              type="button"
              className={desc ? 'boton-chico activo' : 'boton-chico'}
              aria-pressed={desc}
              title="Orden descendente (DESCEND)"
              onClick={() => modificar((t) => alternarDescendente(t, regId, k.id))}
            >
              {desc ? 'Desc.' : 'Asc.'}
            </button>
            <button
              type="button"
              className="boton-icono"
              aria-label={`Subir la llave ${k.nombre}`}
              disabled={i === 0}
              onClick={() => modificar((t) => moverLlave(t, regId, k.id, -1))}
            >
              ↑
            </button>
            <button
              type="button"
              className="boton-icono"
              aria-label={`Bajar la llave ${k.nombre}`}
              disabled={i === llaves.length - 1}
              onClick={() => modificar((t) => moverLlave(t, regId, k.id, 1))}
            >
              ↓
            </button>
            <button
              type="button"
              className="boton-icono"
              aria-label={`Quitar ${k.nombre} de la llave`}
              onClick={() => modificar((t) => eliminarElemento(t, regId, k.id))}
            >
              ×
            </button>
          </div>
        );
      })}
      <form className="keyword-nueva" onSubmit={nuevaLlave}>
        <input
          name="campo"
          type="text"
          className="form-entrada"
          list={idLista}
          aria-label="Campo que se agrega a la llave"
          placeholder="Campo para la llave"
        />
        <button type="submit">Agregar</button>
      </form>

      {logico && (
        <>
          <h4>Selección y omisión</h4>
          <p className="tenue">
            Se evalúan en orden: la primera que se cumple decide. Si ninguna se cumple, el registro entra solo si la última fue una omisión.
          </p>
          {selecciones.map((s) => (
            <FilaSeleccion key={s.id} regId={regId} s={s} listaId={idLista} />
          ))}
          <div className="form-acciones">
            <button type="button" onClick={() => modificar((t) => agregarSeleccion(t, regId, 'seleccion', '', [{ nombre: 'COMP', parametros: '', indicadores: [] }]).tabla)}>
              + Seleccionar
            </button>
            <button type="button" onClick={() => modificar((t) => agregarSeleccion(t, regId, 'omision', 'ALL').tabla)}>
              + Omitir
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function FilaSeleccion({ regId, s, listaId }: { regId: string; s: SeleccionTabla; listaId: string }) {
  const modificar = useTablas((s2) => s2.modificar);
  const indice = s.keywords.findIndex((k) => KEYWORDS_CONDICION.includes(k.nombre));
  const condicion: Keyword | null = indice >= 0 ? s.keywords[indice] : null;

  const cambiarCondicion = (nombre: string, parametros: string) => {
    const nueva: Keyword = { nombre, parametros, indicadores: [] };
    const keywords = [...s.keywords];
    if (indice >= 0) keywords[indice] = nueva;
    else keywords.unshift(nueva);
    modificar((t) => actualizarSeleccion(t, regId, s.id, { keywords }), { clave: `sel:${s.id}:cond` });
  };

  return (
    <div className="seleccion-fila">
      <select
        className="form-entrada"
        aria-label="Seleccionar u omitir"
        value={s.tipo}
        onChange={(e) => modificar((t) => actualizarSeleccion(t, regId, s.id, { tipo: e.target.value as 'seleccion' | 'omision' }))}
      >
        <option value="seleccion">S</option>
        <option value="omision">O</option>
      </select>
      <input
        type="text"
        className="form-entrada"
        list={listaId}
        aria-label="Campo de la sentencia"
        placeholder="Campo o ALL"
        value={s.nombre}
        onChange={(e) => modificar((t) => actualizarSeleccion(t, regId, s.id, { nombre: e.target.value }), { clave: `sel:${s.id}:nombre` })}
      />
      <select
        className="form-entrada"
        aria-label="Tipo de condición"
        value={condicion?.nombre ?? ''}
        disabled={s.nombre.toUpperCase() === 'ALL'}
        onChange={(e) => cambiarCondicion(e.target.value, condicion?.parametros ?? '')}
      >
        <option value="" disabled>
          —
        </option>
        {KEYWORDS_CONDICION.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <input
        type="text"
        className="form-entrada seleccion-parametros"
        aria-label="Parámetros de la condición"
        placeholder={condicion?.nombre === 'RANGE' ? "1 10" : condicion?.nombre === 'VALUES' ? "'A' 'B'" : "EQ 'A'"}
        disabled={s.nombre.toUpperCase() === 'ALL'}
        value={condicion?.parametros ?? ''}
        onChange={(e) => cambiarCondicion(condicion?.nombre ?? 'COMP', e.target.value)}
      />
      <button
        type="button"
        className="boton-icono"
        aria-label="Quitar la sentencia"
        onClick={() => modificar((t) => eliminarElemento(t, regId, s.id))}
      >
        ×
      </button>
    </div>
  );
}
