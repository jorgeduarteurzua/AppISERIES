import { useId, useState } from 'react';
import type { Keyword } from '@core/modelo/pantalla';
import {
  actualizarKeyword,
  agregarKeyword,
  quitarKeyword,
  type Destino,
} from '@core/edicion/operaciones';
import { useStore } from '../../estado/store';
import { EntradaIndicadores } from './controles';

/** Keywords de DDS que se sugieren al escribir. */
const KEYWORDS_SUGERIDAS = [
  'ALARM', 'ASSUME', 'CHECK', 'CNTFLD', 'COLOR', 'COMP', 'DFTVAL', 'DSPATR', 'EDTCDE',
  'EDTWRD', 'ERASE', 'ERRMSG', 'HELP', 'INVITE', 'LOCK', 'OVERLAY', 'PUTOVR', 'RANGE',
  'REFFLD', 'SFLMSG', 'VALUES', 'WDWBORDER', 'WINDOW',
];

interface Props {
  destino: Destino;
  keywords: Keyword[];
  /** Prefijo para fusionar en un solo paso de deshacer lo que se teclea. */
  clave: string;
  /** Keywords que no se muestran (se controlan en otro lugar). Se conservan sus posiciones reales. */
  ocultar?: (k: Keyword) => boolean;
}

/**
 * Lista editable de keywords DDS: nombre, parámetros e indicadores. Permite
 * llegar a cualquier keyword (VALUES, EDTCDE, ERRMSG...) sin un formulario
 * específico para cada una.
 */
export function EditorKeywords({ destino, keywords, clave, ocultar }: Props) {
  const modificar = useStore((s) => s.modificar);
  const [nuevo, setNuevo] = useState('');
  const idLista = useId();

  const agregar = () => {
    const nombre = nuevo.trim();
    if (nombre === '') return;
    modificar((p) => agregarKeyword(p, destino, { nombre }));
    setNuevo('');
  };

  return (
    <div className="keywords">
      {keywords.map((k, i) =>
        ocultar?.(k) ? null : (
          <div className="keyword-fila" key={i}>
            <input
              type="text"
              className="form-entrada keyword-nombre"
              aria-label={`Nombre de la keyword ${i + 1}`}
              value={k.nombre}
              onChange={(e) =>
                modificar((p) => actualizarKeyword(p, destino, i, { nombre: e.target.value }), {
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
                modificar((p) => actualizarKeyword(p, destino, i, { parametros: e.target.value }), {
                  clave: `${clave}:kw${i}:parametros`,
                })
              }
            />
            <EntradaIndicadores
              etiquetaAria={`Indicadores de ${k.nombre}`}
              valor={{ indicadores: k.indicadores, alternativas: k.alternativas }}
              onCambio={(c) =>
                modificar((p) =>
                  actualizarKeyword(p, destino, i, { indicadores: c.indicadores, alternativas: c.alternativas }),
                )
              }
            />
            <button
              type="button"
              className="boton-icono"
              aria-label={`Quitar la keyword ${k.nombre}`}
              title="Quitar"
              onClick={() => modificar((p) => quitarKeyword(p, destino, i))}
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
          placeholder="Nueva keyword (p.ej. VALUES)"
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
