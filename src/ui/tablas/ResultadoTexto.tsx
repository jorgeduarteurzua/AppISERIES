import { useState } from 'react';

interface Props {
  texto: string;
  nombreSugerido: string;
  etiquetaAria: string;
  /**
   * Reemplaza el «Guardar como…» del texto suelto: se usa cuando el texto es el
   * fuente de lo que se edita (así el archivo actual pasa a ser el nuevo).
   */
  guardarComo?: () => void | Promise<void>;
  /** Se llama tras guardar con éxito el texto suelto. */
  alGuardar?: () => void;
  /** Impide copiar y guardar (p.ej. si no se pudo generar el texto). */
  deshabilitado?: boolean;
  children?: React.ReactNode;
}

/** Texto generado (DDS o SQL) con copiar y guardar como. */
export function ResultadoTexto({
  texto,
  nombreSugerido,
  etiquetaAria,
  guardarComo,
  alGuardar,
  deshabilitado,
  children,
}: Props) {
  const [aviso, setAviso] = useState<string | null>(null);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso('Copiado al portapapeles.');
    } catch (e) {
      setAviso(`No se pudo copiar: ${String(e)}`);
    }
  };

  const guardar = async () => {
    if (guardarComo) {
      await guardarComo();
      return;
    }
    try {
      const ruta = await window.api.guardarFuente(texto, nombreSugerido);
      if (ruta) alGuardar?.();
      setAviso(ruta ? `Guardado en ${ruta}` : null);
    } catch (e) {
      setAviso(`No se pudo guardar: ${String(e)}`);
    }
  };

  const lineas = texto === '' ? 0 : texto.split('\n').length - 1;

  return (
    <div className="panel-dds">
      <div className="panel-dds-barra">
        <button type="button" onClick={copiar} disabled={deshabilitado}>
          Copiar
        </button>
        <button type="button" onClick={guardar} disabled={deshabilitado}>
          Guardar como…
        </button>
        <span className="tenue">{lineas} líneas</span>
        {aviso && (
          <span className="panel-dds-aviso" role="status">
            {aviso}
          </span>
        )}
      </div>
      {children}
      <pre className="panel-dds-texto" aria-label={etiquetaAria}>
        {texto}
      </pre>
    </div>
  );
}
