import { useMemo, useState } from 'react';
import type { PantallaDSPF } from '@core/modelo/pantalla';
import { generarDspf } from '@core/generador/generadorDspf';
import { validar } from '@core/edicion/validacion';
import { guardarPantalla } from '../estado/guardado';

interface Props {
  pantalla: PantallaDSPF;
}

/** Muestra el fuente DDS generado a partir del modelo, con copiar y «Guardar como…». */
export function PanelDds({ pantalla }: Props) {
  const [aviso, setAviso] = useState<string | null>(null);

  const resultado = useMemo(() => {
    try {
      return { texto: generarDspf(pantalla), error: null as string | null };
    } catch (e) {
      return { texto: '', error: e instanceof Error ? e.message : String(e) };
    }
  }, [pantalla]);

  const errores = useMemo(
    () => validar(pantalla).filter((p) => p.nivel === 'error').length,
    [pantalla],
  );

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(resultado.texto);
      setAviso('Fuente copiado al portapapeles.');
    } catch (e) {
      setAviso(`No se pudo copiar: ${String(e)}`);
    }
  };

  const lineas = resultado.texto === '' ? 0 : resultado.texto.split('\n').length - 1;

  return (
    <div className="panel-dds">
      <div className="panel-dds-barra">
        <button onClick={copiar} disabled={resultado.error !== null}>
          Copiar
        </button>
        <button onClick={() => void guardarPantalla(true)} disabled={resultado.error !== null}>
          Guardar como…
        </button>
        <span className="tenue">{lineas} líneas</span>
        {aviso && <span className="panel-dds-aviso">{aviso}</span>}
      </div>
      {errores > 0 && (
        <div className="app-error" role="alert">
          La pantalla tiene {errores} {errores === 1 ? 'error' : 'errores'} de validación: el DDS puede no
          compilar. Actívalo desde «Editar pantalla» y revisa el panel de problemas.
        </div>
      )}
      {resultado.error ? (
        <div className="app-error">No se pudo generar el DDS: {resultado.error}</div>
      ) : (
        <pre className="panel-dds-texto" aria-label="Fuente DDS generado">
          {resultado.texto}
        </pre>
      )}
    </div>
  );
}
