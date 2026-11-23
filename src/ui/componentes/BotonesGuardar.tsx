import { useGuardado } from '../estado/guardado';

interface Props {
  /** Hay una pantalla o tabla abierta. */
  hayObjeto: boolean;
  modificado: boolean;
  /** Viene de un archivo (Guardar lo sobrescribe). Si es nuevo, Guardar pide dónde guardar. */
  tieneRuta: boolean;
  alGuardar: (como: boolean) => void;
}

/** «Guardar» y «Guardar como…», con el resultado del último guardado. */
export function BotonesGuardar({ hayObjeto, modificado, tieneRuta, alGuardar }: Props) {
  const mensaje = useGuardado((s) => s.mensaje);
  const tipo = useGuardado((s) => s.tipo);
  const ocupado = useGuardado((s) => s.ocupado);

  // Un archivo abierto y sin cambios no se vuelve a escribir: evita regenerar el fuente por accidente.
  const sinCambios = tieneRuta && !modificado;

  return (
    <span className="guardar-grupo">
      <button
        type="button"
        className={modificado ? 'boton-guardar boton-guardar-pendiente' : 'boton-guardar'}
        disabled={!hayObjeto || ocupado || sinCambios}
        title={
          !hayObjeto
            ? 'No hay nada abierto'
            : sinCambios
              ? 'No hay cambios que guardar'
              : tieneRuta
                ? 'Guardar en el archivo abierto (Ctrl+S)'
                : 'Guardar: pide dónde dejar el archivo (Ctrl+S)'
        }
        onClick={() => alGuardar(false)}
      >
        Guardar
      </button>
      <button
        type="button"
        className="boton-secundario"
        disabled={!hayObjeto || ocupado}
        title="Guardar con otro nombre (Ctrl+Mayús+S)"
        onClick={() => alGuardar(true)}
      >
        Guardar como…
      </button>
      {mensaje && (
        <span
          className={tipo === 'error' ? 'guardar-mensaje guardar-error' : 'guardar-mensaje'}
          role={tipo === 'error' ? 'alert' : 'status'}
          title={mensaje}
        >
          {mensaje}
        </span>
      )}
    </span>
  );
}
