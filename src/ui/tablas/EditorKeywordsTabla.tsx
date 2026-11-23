import { useId, useState } from 'react';
import type { Keyword } from '@core/modelo/pantalla';
import {
  actualizarKeyword,
  agregarKeyword,
  quitarKeyword,
  type DestinoTabla,
} from '@core/tablas/operacionesTabla';
import { useTablas } from '../estado/storeTablas';

/** Keywords de DDS de archivos que se sugieren al escribir. */
const KEYWORDS_SUGERIDAS = [
  'ABSVAL', 'ALIAS', 'ALTSEQ', 'ALWNULL', 'CCSID', 'CHECK', 'COLHDG', 'COMP', 'DATFMT', 'DESCEND',
  'DFT', 'EDTCDE', 'EDTWRD', 'FCFO', 'FIFO', 'FLTPCN', 'FORMAT', 'JDFTVAL', 'JFILE', 'JFLD', 'JOIN',
  'LIFO', 'PFILE', 'RANGE', 'REF', 'REFFLD', 'RENAME', 'SIGNED', 'TEXT', 'TIMFMT', 'UNIQUE',
  'UNSIGNED', 'VALUES', 'VARLEN',
];

interface Props {
  destino: DestinoTabla;
  keywords: Keyword[];
  /** Prefijo para fusionar en un solo paso de deshacer lo que se teclea. */
  clave: string;
  /** Keywords que no se muestran porque se editan en otro lugar. Los índices reales se conservan. */
  ocultar?: (k: Keyword) => boolean;
}

/** Lista editable de keywords: sirve para llegar a cualquiera aunque no tenga un control propio. */
export function EditorKeywordsTabla({ destino, keywords, clave, ocultar }: Props) {
  const modificar = useTablas((s) => s.modificar);
  const [nuevo, setNuevo] = useState('');
  const idLista = useId();

  const agregar = () => {
    const nombre = nuevo.trim();
    if (nombre === '') return;
    modificar((t) => agregarKeyword(t, destino, nombre));
    setNuevo('');
  };

  return (
    <div className="keywords">
      {keywords.map((k, i) =>
        ocultar?.(k) ? null : (
          <div className="keyword-fila keyword-fila-tabla" key={i}>
            <input
              type="text"
              className="form-entrada keyword-nombre"
              aria-label={`Nombre de la keyword ${i + 1}`}
              value={k.nombre}
              onChange={(e) =>
                modificar((t) => actualizarKeyword(t, destino, i, { nombre: e.target.value }), {
                  clave: `${clave}:kw${i}:nombre`,
                })
              }
            />
            <input
              type="text"
              className="form-entrada keyword-parametros"
              aria-label={`Parámetros de ${k.nombre}`}
              placeholder="parámetros"
              value={k.parametros}
              onChange={(e) =>
                modificar((t) => actualizarKeyword(t, destino, i, { parametros: e.target.value }), {
                  clave: `${clave}:kw${i}:parametros`,
                })
              }
            />
            <button
              type="button"
              className="boton-icono"
              aria-label={`Quitar la keyword ${k.nombre}`}
              title="Quitar"
              onClick={() => modificar((t) => quitarKeyword(t, destino, i))}
            >
              ×
            </button>
          </div>
        ),
      )}
      <div className="keyword-nueva">
        <input
          type="text"
          className="form-entrada"
          list={idLista}
          aria-label="Nombre de la keyword nueva"
          placeholder="Nueva keyword (p.ej. EDTCDE)"
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              agregar();
            }
          }}
        />
        <datalist id={idLista}>
          {KEYWORDS_SUGERIDAS.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <button type="button" onClick={agregar} disabled={nuevo.trim() === ''}>
          Agregar
        </button>
      </div>
    </div>
  );
}
