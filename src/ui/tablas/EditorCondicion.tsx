import { useEffect, useState } from 'react';
import { sinComillas, type CampoTabla } from '@core/tablas/modelo';
import {
  comparacionesDe,
  establecerComparaciones,
  establecerRango,
  establecerValores,
  literalDds,
  OPERADORES_COMP,
  rangoDe,
  tipoCondicion,
  valoresDe,
  type Comparacion,
} from '@core/tablas/operacionesTabla';
import { useTablas } from '../estado/storeTablas';

type Modo = 'ninguna' | 'valores' | 'rango' | 'comparacion';

const TIPOS_NUMERICOS = new Set(['S', 'P', 'B', 'F']);

interface Props {
  regId: string;
  campo: CampoTabla;
}

/**
 * Condición de validez del campo: valores permitidos (VALUES), rango (RANGE) o
 * comparaciones (COMP). Son excluyentes entre sí. Los valores de carácter se
 * escriben sin comillas y se les ponen al guardar; los numéricos van tal cual.
 * Los cambios se aplican al salir del campo o con Enter.
 */
export function EditorCondicion({ regId, campo }: Props) {
  const modificar = useTablas((s) => s.modificar);
  const numerico = TIPOS_NUMERICOS.has(campo.tipoDato);
  const actual = tipoCondicion(campo);
  const [modo, setModo] = useState<Modo>(actual);

  // Si la condición cambia desde fuera (deshacer, keywords), el selector la sigue.
  useEffect(() => setModo(actual), [actual]);

  const cambiarModo = (nuevo: Modo) => {
    setModo(nuevo);
    if (nuevo === 'ninguna') modificar((t) => establecerValores(t, regId, campo.id, []));
  };

  return (
    <div className="condicion">
      <label className="form-fila">
        <span className="form-etiqueta">Condición</span>
        <select
          className="form-entrada"
          aria-label="Tipo de condición de validez"
          value={modo}
          onChange={(e) => cambiarModo(e.target.value as Modo)}
        >
          <option value="ninguna">Ninguna</option>
          <option value="valores">Valores permitidos (VALUES)</option>
          <option value="rango">Rango (RANGE)</option>
          <option value="comparacion">Comparación (COMP)</option>
        </select>
      </label>

      {modo === 'valores' && <EditorValores regId={regId} campo={campo} numerico={numerico} />}
      {modo === 'rango' && <EditorRango regId={regId} campo={campo} numerico={numerico} />}
      {modo === 'comparacion' && <EditorComparaciones regId={regId} campo={campo} numerico={numerico} />}
    </div>
  );
}

interface Sub {
  regId: string;
  campo: CampoTabla;
  numerico: boolean;
}

/** Valores separados por comas o espacios (numéricos) o por comas (carácter, que pueden llevar espacios). */
function separarValores(texto: string, numerico: boolean): string[] {
  const trozos = numerico ? texto.split(/[\s,]+/) : texto.split(',');
  return trozos.map((v) => v.trim()).filter((v) => v !== '');
}

function EditorValores({ regId, campo, numerico }: Sub) {
  const modificar = useTablas((s) => s.modificar);
  const mostrado = valoresDe(campo)
    .map((v) => (numerico ? v : sinComillas(v)))
    .join(', ');
  const [texto, setTexto] = useState(mostrado);
  useEffect(() => setTexto(mostrado), [mostrado]);

  const aplicar = () => {
    const lista = separarValores(texto, numerico).map((v) => literalDds(v, numerico));
    if (lista.length === 0) return;
    modificar((t) => establecerValores(t, regId, campo.id, lista));
  };

  return (
    <label className="form-fila">
      <span className="form-etiqueta">Valores</span>
      <input
        type="text"
        className="form-entrada"
        aria-label="Valores permitidos, separados por comas"
        placeholder={numerico ? 'p.ej. 1, 2, 3' : 'p.ej. S, N'}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={aplicar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            aplicar();
          }
        }}
      />
    </label>
  );
}

function EditorRango({ regId, campo, numerico }: Sub) {
  const modificar = useTablas((s) => s.modificar);
  const rango = rangoDe(campo);
  const mostrar = (v: string | undefined) => (v === undefined ? '' : numerico ? v : sinComillas(v));
  const [desde, setDesde] = useState(mostrar(rango?.desde));
  const [hasta, setHasta] = useState(mostrar(rango?.hasta));
  useEffect(() => {
    setDesde(mostrar(rango?.desde));
    setHasta(mostrar(rango?.hasta));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rango?.desde, rango?.hasta]);

  const aplicar = () => {
    if (desde.trim() === '' || hasta.trim() === '') return;
    modificar((t) =>
      establecerRango(t, regId, campo.id, {
        desde: literalDds(desde, numerico),
        hasta: literalDds(hasta, numerico),
      }),
    );
  };
  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      aplicar();
    }
  };

  return (
    <div className="form-par">
      <label className="form-fila">
        <span className="form-etiqueta">Desde</span>
        <input
          type="text"
          className="form-entrada"
          aria-label="Valor inicial del rango"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          onBlur={aplicar}
          onKeyDown={alTeclear}
        />
      </label>
      <label className="form-fila">
        <span className="form-etiqueta">Hasta</span>
        <input
          type="text"
          className="form-entrada"
          aria-label="Valor final del rango"
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
          onBlur={aplicar}
          onKeyDown={alTeclear}
        />
      </label>
    </div>
  );
}

function EditorComparaciones({ regId, campo, numerico }: Sub) {
  const modificar = useTablas((s) => s.modificar);
  const guardadas = comparacionesDe(campo);
  const aFilas = (l: Comparacion[]) =>
    l.map((c) => ({ operador: c.operador, valor: numerico ? c.valor : sinComillas(c.valor) }));
  const [filas, setFilas] = useState<Comparacion[]>(guardadas.length > 0 ? aFilas(guardadas) : [{ operador: 'GE', valor: '' }]);
  const firma = guardadas.map((c) => `${c.operador} ${c.valor}`).join('|');
  useEffect(() => {
    if (guardadas.length > 0) setFilas(aFilas(guardadas));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma]);

  /** Solo se guarda cuando todas las filas tienen valor. */
  const guardar = (nuevas: Comparacion[]) => {
    setFilas(nuevas);
    if (nuevas.length === 0 || nuevas.some((f) => f.valor.trim() === '')) return;
    modificar((t) =>
      establecerComparaciones(
        t,
        regId,
        campo.id,
        nuevas.map((f) => ({ operador: f.operador, valor: literalDds(f.valor, numerico) })),
      ),
    );
  };

  return (
    <div className="comparaciones">
      {filas.map((f, i) => (
        <div className="comparacion-fila" key={i}>
          <select
            className="form-entrada"
            aria-label={`Operador de la comparación ${i + 1}`}
            value={f.operador}
            onChange={(e) => guardar(filas.map((x, j) => (j === i ? { ...x, operador: e.target.value } : x)))}
          >
            {OPERADORES_COMP.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
          <input
            type="text"
            className="form-entrada"
            aria-label={`Valor de la comparación ${i + 1}`}
            value={f.valor}
            onChange={(e) => setFilas(filas.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
            onBlur={() => guardar(filas)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                guardar(filas);
              }
            }}
          />
          <button
            type="button"
            className="boton-icono"
            aria-label={`Quitar la comparación ${i + 1}`}
            title="Quitar"
            onClick={() => {
              const resto = filas.filter((_, j) => j !== i);
              if (resto.length === 0) {
                setFilas([{ operador: 'GE', valor: '' }]);
                modificar((t) => establecerComparaciones(t, regId, campo.id, []));
              } else guardar(resto);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="boton-chico" onClick={() => setFilas([...filas, { operador: 'LE', valor: '' }])}>
        + Comparación
      </button>
    </div>
  );
}
