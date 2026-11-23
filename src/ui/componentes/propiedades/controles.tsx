import { useEffect, useState } from 'react';
import { formatearCondicion, leerCondicion, type Condicion } from '@core/edicion/indicadores';

/** Fila de formulario: etiqueta + control. */
export function Etiquetado({
  etiqueta,
  children,
  ayuda,
}: {
  etiqueta: string;
  children: React.ReactNode;
  ayuda?: string;
}) {
  return (
    <label className="form-fila" title={ayuda}>
      <span className="form-etiqueta">{etiqueta}</span>
      {children}
    </label>
  );
}

/** Entrada numérica entera. Ignora valores no numéricos mientras se escribe. */
export function EntradaNumero({
  valor,
  onCambio,
  minimo = 0,
  maximo,
  deshabilitado,
  etiquetaAria,
}: {
  valor: number | null;
  onCambio: (n: number) => void;
  minimo?: number;
  maximo?: number;
  deshabilitado?: boolean;
  etiquetaAria?: string;
}) {
  return (
    <input
      type="number"
      className="form-entrada form-numero"
      aria-label={etiquetaAria}
      value={valor === null ? '' : valor}
      min={minimo}
      max={maximo}
      disabled={deshabilitado}
      onChange={(e) => {
        const n = parseInt(e.target.value, 10);
        if (!Number.isNaN(n)) onCambio(n);
      }}
    />
  );
}

/**
 * Entrada de texto que confirma al salir del campo o con Enter. Sirve para
 * valores que pueden fallar al aplicarse (p.ej. renombrar un registro).
 */
export function EntradaTextoConfirmar({
  valor,
  onConfirmar,
  etiquetaAria,
}: {
  valor: string;
  onConfirmar: (texto: string) => void;
  etiquetaAria?: string;
}) {
  const [texto, setTexto] = useState(valor);
  useEffect(() => setTexto(valor), [valor]);

  const confirmar = () => {
    if (texto !== valor) onConfirmar(texto);
  };

  return (
    <input
      type="text"
      className="form-entrada"
      aria-label={etiquetaAria}
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          confirmar();
        } else if (e.key === 'Escape') {
          setTexto(valor);
        }
      }}
    />
  );
}

/**
 * Entrada de la condición de un elemento o keyword: indicadores separados por
 * espacio son AND ("N30 99") y `|` separa alternativas OR ("40 | 41"). Se
 * confirma al salir del campo o con Enter; si el texto no es válido se marca y
 * no se aplica.
 */
export function EntradaIndicadores({
  valor,
  onCambio,
  etiquetaAria = 'Indicadores',
}: {
  valor: Condicion;
  onCambio: (condicion: Condicion) => void;
  etiquetaAria?: string;
}) {
  const formateado = formatearCondicion(valor);
  const [texto, setTexto] = useState(formateado);
  const [invalido, setInvalido] = useState(false);
  useEffect(() => {
    setTexto(formateado);
    setInvalido(false);
  }, [formateado]);

  const confirmar = () => {
    const condicion = leerCondicion(texto);
    if (condicion === null) {
      setInvalido(true);
      return;
    }
    setInvalido(false);
    if (formatearCondicion(condicion) !== formateado) onCambio(condicion);
  };

  return (
    <input
      type="text"
      className={invalido ? 'form-entrada form-invalida' : 'form-entrada'}
      aria-label={etiquetaAria}
      aria-invalid={invalido}
      placeholder="p.ej. N30 99 | 40"
      title="Espacio = Y (todos), | = O (alguno)"
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          confirmar();
        }
      }}
    />
  );
}