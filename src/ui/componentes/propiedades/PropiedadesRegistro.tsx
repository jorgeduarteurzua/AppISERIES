import type { PantallaDSPF, Registro } from '@core/modelo/pantalla';
import {
  eliminarRegistro,
  establecerTituloVentana,
  establecerVentana,
  leerTituloVentana,
  leerVentana,
  renombrarRegistro,
  ventanaPorDefecto,
  type VentanaDef,
} from '@core/edicion/operaciones';
import { ID_TODOS } from '@core/render/lienzo';
import { useStore } from '../../estado/store';
import { EditorKeywords } from './EditorKeywords';
import { EntradaNumero, EntradaTextoConfirmar, Etiquetado } from './controles';

const NOMBRE_CLASE: Record<Registro['clase'], string> = {
  normal: 'Normal',
  subfile: 'Subfile (SFL)',
  'control-subfile': 'Control de subfile (SFLCTL)',
};

interface Props {
  pantalla: PantallaDSPF;
  registro: Registro;
}

/** Propiedades del registro (formato): nombre, ventana, títulos y keywords. */
export function PropiedadesRegistro({ pantalla, registro }: Props) {
  const modificar = useStore((s) => s.modificar);
  const aplicar = useStore((s) => s.aplicar);

  const tieneWindow = registro.keywords.some((k) => k.nombre === 'WINDOW');
  const ventana = leerVentana(registro);
  const heredada = tieneWindow && ventana === null;
  const esSubfile = registro.clase === 'subfile';

  const cambiarVentana = (parche: Partial<VentanaDef>) => {
    if (!ventana) return;
    modificar((p) => establecerVentana(p, registro.id, { ...ventana, ...parche }), {
      clave: `reg:${registro.id}:ventana`,
    });
  };

  const eliminar = () => {
    const aviso =
      registro.clase === 'normal'
        ? `¿Eliminar el registro ${registro.nombre}?`
        : `¿Eliminar el registro ${registro.nombre}? Su subfile/control asociado también se elimina.`;
    if (typeof window !== 'undefined' && !window.confirm(aviso)) return;
    try {
      const nueva = eliminarRegistro(pantalla, registro.id);
      aplicar(nueva, { registro: nueva.registros[0]?.id ?? ID_TODOS, seleccionar: null });
    } catch (e) {
      useStore.setState({ error: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="form">
      <Etiquetado etiqueta="Nombre" ayuda="Hasta 10 caracteres. Se confirma al salir del campo.">
        <EntradaTextoConfirmar
          valor={registro.nombre}
          etiquetaAria="Nombre del registro"
          onConfirmar={(texto) => modificar((p) => renombrarRegistro(p, registro.id, texto))}
        />
      </Etiquetado>
      <p className="tenue">Tipo: {NOMBRE_CLASE[registro.clase]}</p>

      {esSubfile ? (
        <p className="tenue">
          Un subfile se dibuja dentro de la ventana de su registro de control.
        </p>
      ) : (
        <>
          <label className="form-check">
            <input
              type="checkbox"
              checked={tieneWindow}
              onChange={(e) =>
                modificar((p) =>
                  establecerVentana(p, registro.id, e.target.checked ? ventanaPorDefecto(p) : null),
                )
              }
            />
            Mostrar como ventana (WINDOW)
          </label>

          {heredada && (
            <p className="tenue">
              La ventana se toma de otro registro: WINDOW(
              {registro.keywords.find((k) => k.nombre === 'WINDOW')?.parametros}).
            </p>
          )}

          {ventana && (
            <>
              <div className="form-par">
                <Etiquetado etiqueta="Fila">
                  <EntradaNumero valor={ventana.fila} minimo={1} onCambio={(n) => cambiarVentana({ fila: n })} />
                </Etiquetado>
                <Etiquetado etiqueta="Columna">
                  <EntradaNumero
                    valor={ventana.columna}
                    minimo={1}
                    onCambio={(n) => cambiarVentana({ columna: n })}
                  />
                </Etiquetado>
              </div>
              <div className="form-par">
                <Etiquetado etiqueta="Alto">
                  <EntradaNumero valor={ventana.alto} minimo={1} onCambio={(n) => cambiarVentana({ alto: n })} />
                </Etiquetado>
                <Etiquetado etiqueta="Ancho">
                  <EntradaNumero valor={ventana.ancho} minimo={1} onCambio={(n) => cambiarVentana({ ancho: n })} />
                </Etiquetado>
              </div>
              <Etiquetado etiqueta="Título arriba">
                <input
                  type="text"
                  className="form-entrada"
                  value={leerTituloVentana(registro, 'arriba')}
                  onChange={(e) =>
                    modificar((p) => establecerTituloVentana(p, registro.id, 'arriba', e.target.value), {
                      clave: `reg:${registro.id}:tituloArriba`,
                    })
                  }
                />
              </Etiquetado>
              <Etiquetado etiqueta="Título abajo" ayuda="WDWTITLE con *BOTTOM: va en el borde inferior, a la izquierda">
                <input
                  type="text"
                  className="form-entrada"
                  value={leerTituloVentana(registro, 'abajo')}
                  onChange={(e) =>
                    modificar((p) => establecerTituloVentana(p, registro.id, 'abajo', e.target.value), {
                      clave: `reg:${registro.id}:tituloAbajo`,
                    })
                  }
                />
              </Etiquetado>
            </>
          )}
        </>
      )}

      <h4>Keywords del registro</h4>
      <EditorKeywords
        destino={{ tipo: 'registro', regId: registro.id }}
        keywords={registro.keywords}
        clave={`reg:${registro.id}`}
        ocultar={(k) => k.nombre === 'WINDOW' || k.nombre === 'WDWTITLE'}
      />

      <div className="form-acciones">
        <button type="button" className="boton-peligro" onClick={eliminar}>
          Eliminar registro
        </button>
      </div>
    </div>
  );
}
