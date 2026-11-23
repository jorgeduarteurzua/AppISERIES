import {
  camposDe,
  llavesDe,
  parametroDe,
  type CampoTabla,
  type RegistroTabla,
} from '@core/tablas/modelo';
import {
  actualizarCampo,
  agregarCampo,
  agregarLlave,
  duplicarCampo,
  eliminarElemento,
  moverCampo,
  permiteNulos,
  establecerNulos,
  establecerTexto,
  textoDe,
  tipoCondicion,
  TIPOS_CON_DECIMALES,
  TIPOS_SIN_LONGITUD,
  TIPOS_TABLA,
} from '@core/tablas/operacionesTabla';
import { puedeDeshacer, puedeRehacer } from '@core/edicion/historial';
import { useTablas } from '../estado/storeTablas';

interface Props {
  registro: RegistroTabla;
}

const ETIQUETA_CONDICION = {
  ninguna: '',
  valores: 'VALUES',
  rango: 'RANGE',
  comparacion: 'COMP',
} as const;

/** Resumen corto de la condición del campo para la columna «Validez». */
function resumenCondicion(c: CampoTabla): string {
  const tipo = tipoCondicion(c);
  if (tipo === 'ninguna') return '';
  const kw = c.keywords.find((k) => k.nombre === ETIQUETA_CONDICION[tipo]);
  return `${ETIQUETA_CONDICION[tipo]}(${kw?.parametros ?? ''})`;
}

/**
 * Cuadrícula de campos: cada fila se edita en el mismo lugar (nombre, tipo,
 * longitud, decimales, llave, nulos, descripción). Lo demás está en el panel de
 * propiedades del campo seleccionado.
 */
export function CuadriculaCampos({ registro }: Props) {
  const seleccion = useTablas((s) => s.seleccion);
  const historial = useTablas((s) => s.historial);
  const seleccionar = useTablas((s) => s.seleccionar);
  const modificar = useTablas((s) => s.modificar);
  const aplicar = useTablas((s) => s.aplicar);
  const tabla = useTablas((s) => s.tabla);
  const deshacer = useTablas((s) => s.deshacer);
  const rehacer = useTablas((s) => s.rehacer);

  const campos = camposDe(registro);
  const llaves = llavesDe(registro);
  const regId = registro.id;
  const campoSel = campos.find((c) => c.id === seleccion) ?? null;
  const posicionSel = campoSel ? campos.indexOf(campoSel) : -1;

  const cambiar = (c: CampoTabla, parche: Parameters<typeof actualizarCampo>[3], propiedad: string) =>
    modificar((t) => actualizarCampo(t, regId, c.id, parche), { clave: `campo:${c.id}:${propiedad}` });

  const alternarLlave = (c: CampoTabla) => {
    const llave = llaves.find((k) => k.nombre.toUpperCase() === c.nombre.toUpperCase());
    modificar((t) => (llave ? eliminarElemento(t, regId, llave.id) : agregarLlave(t, regId, c.nombre).tabla));
  };

  const agregar = () => {
    if (!tabla) return;
    const r = agregarCampo(tabla, regId, { despuesDe: campoSel?.id });
    aplicar(r.tabla, { seleccionar: r.elementoId });
  };

  const duplicar = () => {
    if (!tabla || !campoSel) return;
    const r = duplicarCampo(tabla, regId, campoSel.id);
    aplicar(r.tabla, { seleccionar: r.elementoId });
  };

  const eliminar = () => {
    if (!tabla || !campoSel) return;
    // Selecciona el vecino para poder seguir borrando o editando.
    const vecino = campos[posicionSel + 1] ?? campos[posicionSel - 1] ?? null;
    aplicar(eliminarElemento(tabla, regId, campoSel.id), { seleccionar: vecino?.id ?? null });
  };

  const alTeclearFila = (e: React.KeyboardEvent<HTMLTableRowElement>, indice: number) => {
    // Solo con el foco en la fila misma, para no robar las flechas a los cuadros de texto.
    if (e.target !== e.currentTarget) return;
    if (e.key === 'ArrowDown' && campos[indice + 1]) {
      e.preventDefault();
      seleccionar(campos[indice + 1].id);
    } else if (e.key === 'ArrowUp' && campos[indice - 1]) {
      e.preventDefault();
      seleccionar(campos[indice - 1].id);
    } else if (e.key === 'Delete') {
      e.preventDefault();
      eliminar();
    }
  };

  return (
    <div className="cuadricula-contenedor">
      <div className="barra-edicion" role="toolbar" aria-label="Herramientas de campos">
        <button type="button" onClick={agregar}>
          + Campo
        </button>
        <button type="button" onClick={duplicar} disabled={!campoSel}>
          Duplicar
        </button>
        <button
          type="button"
          onClick={() => modificar((t) => moverCampo(t, regId, campoSel!.id, -1))}
          disabled={!campoSel || posicionSel <= 0}
          title="Subir el campo"
        >
          ↑ Subir
        </button>
        <button
          type="button"
          onClick={() => modificar((t) => moverCampo(t, regId, campoSel!.id, 1))}
          disabled={!campoSel || posicionSel >= campos.length - 1}
          title="Bajar el campo"
        >
          ↓ Bajar
        </button>
        <button type="button" className="boton-peligro" onClick={eliminar} disabled={!campoSel}>
          Eliminar
        </button>
        <span className="barra-separador" aria-hidden="true" />
        <button type="button" onClick={deshacer} disabled={!puedeDeshacer(historial)} title="Deshacer (Ctrl+Z)">
          Deshacer
        </button>
        <button type="button" onClick={rehacer} disabled={!puedeRehacer(historial)} title="Rehacer (Ctrl+Y)">
          Rehacer
        </button>
      </div>

      {campos.length === 0 ? (
        <p className="tenue">
          {parametroDe(registro.keywords, 'PFILE') !== null
            ? `Este lógico no lista campos: hereda todos los del físico ${parametroDe(registro.keywords, 'PFILE')}. Puedes agregar campos para elegir solo algunos.`
            : 'El registro no tiene campos. Usa «+ Campo» para agregar uno.'}
        </p>
      ) : (
        <div className="cuadricula-scroll">
          <table className="cuadricula">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Nombre</th>
                <th scope="col">Tipo</th>
                <th scope="col">Long.</th>
                <th scope="col">Dec.</th>
                <th scope="col" title="Posición en la llave">
                  Llave
                </th>
                <th scope="col" title="Permite valores nulos (ALWNULL)">
                  Nulo
                </th>
                <th scope="col">Descripción (TEXT)</th>
                <th scope="col">Validez</th>
              </tr>
            </thead>
            <tbody>
              {campos.map((c, i) => {
                const posLlave = llaves.findIndex((k) => k.nombre.toUpperCase() === c.nombre.toUpperCase());
                const desc = posLlave >= 0 && llaves[posLlave].keywords.some((k) => k.nombre === 'DESCEND');
                const sinLongitud = TIPOS_SIN_LONGITUD.has(c.tipoDato);
                return (
                  <tr
                    key={c.id}
                    tabIndex={0}
                    className={c.id === seleccion ? 'fila-seleccionada' : ''}
                    aria-current={c.id === seleccion ? 'true' : undefined}
                    onClick={() => seleccionar(c.id)}
                    onFocusCapture={() => c.id !== seleccion && seleccionar(c.id)}
                    onKeyDown={(e) => alTeclearFila(e, i)}
                  >
                    <td className="col-numero">{i + 1}</td>
                    <td>
                      <input
                        type="text"
                        className="celda-entrada"
                        aria-label={`Nombre del campo ${i + 1}`}
                        maxLength={10}
                        value={c.nombre}
                        onChange={(e) => cambiar(c, { nombre: e.target.value }, 'nombre')}
                      />
                    </td>
                    <td>
                      <select
                        className="celda-entrada"
                        aria-label={`Tipo del campo ${c.nombre}`}
                        value={c.tipoDato}
                        onChange={(e) => cambiar(c, { tipoDato: e.target.value }, 'tipo')}
                      >
                        {TIPOS_TABLA.map((t) => (
                          <option key={t.valor} value={t.valor}>
                            {t.valor === '' ? '—' : t.valor}
                          </option>
                        ))}
                        {!TIPOS_TABLA.some((t) => t.valor === c.tipoDato) && (
                          <option value={c.tipoDato}>{c.tipoDato}</option>
                        )}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        className="celda-entrada celda-numero"
                        aria-label={`Longitud del campo ${c.nombre}`}
                        disabled={sinLongitud}
                        value={c.longitud ?? ''}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          cambiar(c, { longitud: Number.isNaN(n) ? null : n }, 'longitud');
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        className="celda-entrada celda-numero"
                        aria-label={`Decimales del campo ${c.nombre}`}
                        disabled={!TIPOS_CON_DECIMALES.has(c.tipoDato)}
                        value={c.decimales ?? ''}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          cambiar(c, { decimales: Number.isNaN(n) ? null : n }, 'decimales');
                        }}
                      />
                    </td>
                    <td className="col-centro">
                      <button
                        type="button"
                        className={posLlave >= 0 ? 'boton-llave activa' : 'boton-llave'}
                        aria-pressed={posLlave >= 0}
                        aria-label={
                          posLlave >= 0
                            ? `${c.nombre} es parte de la llave en la posición ${posLlave + 1}${desc ? ' (descendente)' : ''}; pulsa para quitarla`
                            : `Agregar ${c.nombre} a la llave`
                        }
                        title={posLlave >= 0 ? 'Quitar de la llave' : 'Agregar a la llave'}
                        onClick={() => alternarLlave(c)}
                      >
                        {posLlave >= 0 ? `${posLlave + 1}${desc ? '↓' : ''}` : '·'}
                      </button>
                    </td>
                    <td className="col-centro">
                      <input
                        type="checkbox"
                        aria-label={`${c.nombre} permite nulos`}
                        checked={permiteNulos(c)}
                        onChange={(e) =>
                          modificar((t) => establecerNulos(t, regId, c.id, e.target.checked))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="celda-entrada"
                        aria-label={`Descripción del campo ${c.nombre}`}
                        maxLength={50}
                        value={textoDe(c)}
                        onChange={(e) =>
                          modificar((t) => establecerTexto(t, regId, c.id, e.target.value), {
                            clave: `campo:${c.id}:texto`,
                          })
                        }
                      />
                    </td>
                    <td className="col-validez" title={resumenCondicion(c)}>
                      {resumenCondicion(c)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
