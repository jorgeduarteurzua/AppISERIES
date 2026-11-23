import type { PantallaDSPF } from '@core/modelo/pantalla';
import { TAMANO_24X80, TAMANO_27X132 } from '@core/modelo/pantalla';
import {
  actualizarTecla,
  agregarTecla,
  cambiarTamano,
  quitarTecla,
  textoLegibleTecla,
} from '@core/edicion/operaciones';
import { useStore } from '../../estado/store';
import { EditorKeywords } from './EditorKeywords';
import { EntradaNumero, Etiquetado } from './controles';

const TAMANOS = [
  { clave: '24x80', texto: '24 x 80 (*DS3)', valor: TAMANO_24X80 },
  { clave: '27x132', texto: '27 x 132 (*DS4)', valor: TAMANO_27X132 },
];

/** Menor número de tecla (1-24) que aún no está definido. */
function siguienteTecla(p: PantallaDSPF): number {
  const usadas = new Set(p.teclasFuncion.map((t) => t.numero));
  for (let n = 1; n <= 24; n++) if (!usadas.has(n)) return n;
  return 24;
}

/** Propiedades de toda la pantalla: tamaño, teclas de función y keywords de archivo. */
export function PropiedadesPantalla({ pantalla }: { pantalla: PantallaDSPF }) {
  const modificar = useStore((s) => s.modificar);

  const claveTamano = `${pantalla.tamano.filas}x${pantalla.tamano.columnas}`;
  const esEstandar = TAMANOS.some((t) => t.clave === claveTamano);

  return (
    <div className="form">
      <Etiquetado etiqueta="Tamaño" ayuda="Se mantiene sincronizado con DSPSIZ">
        <select
          className="form-entrada"
          value={claveTamano}
          onChange={(e) => {
            const t = TAMANOS.find((x) => x.clave === e.target.value);
            if (t) modificar((p) => cambiarTamano(p, t.valor));
          }}
        >
          {!esEstandar && <option value={claveTamano}>{claveTamano} (personalizado)</option>}
          {TAMANOS.map((t) => (
            <option key={t.clave} value={t.clave}>
              {t.texto}
            </option>
          ))}
        </select>
      </Etiquetado>

      <h4>Teclas de función</h4>
      {pantalla.teclasFuncion.length === 0 && <p className="tenue">Ninguna definida.</p>}
      {pantalla.teclasFuncion.map((t, i) => (
        <div className="tecla-fila" key={i}>
          <select
            className="form-entrada tecla-tipo"
            aria-label={`Tipo de la tecla ${i + 1}`}
            title="CF devuelve los datos de la pantalla; CA no"
            value={t.tipo}
            onChange={(e) =>
              modificar((p) => actualizarTecla(p, i, { tipo: e.target.value as 'CF' | 'CA' }))
            }
          >
            <option value="CF">CF</option>
            <option value="CA">CA</option>
          </select>
          <EntradaNumero
            valor={t.numero}
            minimo={1}
            maximo={24}
            etiquetaAria={`Número de la tecla ${i + 1}`}
            onCambio={(n) =>
              modificar((p) => actualizarTecla(p, i, { numero: n }), { clave: `tecla:${i}:numero` })
            }
          />
          <input
            type="text"
            className="form-entrada"
            aria-label={`Texto de la tecla ${i + 1}`}
            placeholder="descripción"
            value={textoLegibleTecla(t)}
            onChange={(e) =>
              modificar((p) => actualizarTecla(p, i, { texto: e.target.value }), {
                clave: `tecla:${i}:texto`,
              })
            }
          />
          <button
            type="button"
            className="boton-icono"
            aria-label={`Quitar la tecla ${t.tipo}${String(t.numero).padStart(2, '0')}`}
            title="Quitar"
            onClick={() => modificar((p) => quitarTecla(p, i))}
          >
            ×
          </button>
        </div>
      ))}
      <div className="form-acciones">
        <button
          type="button"
          onClick={() =>
            modificar((p) => agregarTecla(p, { tipo: 'CF', numero: siguienteTecla(p), texto: '' }))
          }
        >
          Agregar tecla
        </button>
      </div>

      <h4>Keywords del archivo</h4>
      <EditorKeywords
        destino={{ tipo: 'archivo' }}
        keywords={pantalla.keywordsArchivo}
        clave="archivo"
        ocultar={(k) => k.nombre === 'DSPSIZ'}
      />
    </div>
  );
}
