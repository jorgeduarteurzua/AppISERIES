import { useAs400 } from '../estado/as400';
import type { FuenteEnvio } from '../estado/as400';
import { useGuardado } from '../estado/guardado';

interface Props {
  /** Genera los fuentes de lo que se está editando. Si lanza, el motivo se muestra junto a «Guardar». */
  obtenerFuentes: () => FuenteEnvio[] | null;
  hayObjeto: boolean;
  /** Texto del botón de envío: «Enviar pantalla…», «Enviar archivo…». */
  etiquetaEnviar: string;
  /** Archivo fuente que se propone al traer: QDSPSRC en pantallas, QDDSSRC en tablas. */
  archivoTraer: string;
}

/** Envío del fuente que se edita, traer fuentes del AS400 y acceso a la conexión. */
export function BotonAs400({ obtenerFuentes, hayObjeto, etiquetaEnviar, archivoTraer }: Props) {
  const abrirEnvio = useAs400((s) => s.abrirEnvio);
  const abrirTraer = useAs400((s) => s.abrirTraer);
  const abrirConexion = useAs400((s) => s.abrirConexion);

  return (
    <span className="guardar-grupo">
      <button
        type="button"
        className="boton-secundario"
        disabled={!hayObjeto}
        title="Enviar el fuente al AS400 por FTP y compilarlo"
        onClick={() => {
          try {
            const fuentes = obtenerFuentes();
            if (fuentes) abrirEnvio(fuentes);
          } catch (e) {
            const motivo = e instanceof Error ? e.message : String(e);
            useGuardado.setState({ mensaje: `No se puede generar el fuente: ${motivo}`, tipo: 'error' });
          }
        }}
      >
        {etiquetaEnviar}
      </button>
      <button
        type="button"
        className="boton-secundario"
        title="Traer fuentes del AS400 a una carpeta de este equipo"
        onClick={() => abrirTraer(archivoTraer)}
      >
        Traer del AS400…
      </button>
      <button
        type="button"
        className="boton-secundario"
        title="Servidor, usuario y contraseña del AS400"
        onClick={abrirConexion}
      >
        Conexión
      </button>
    </span>
  );
}
