import { useState } from 'react';
import type { PantallaDSPF } from '@core/modelo/pantalla';
import {
  agregarRegistro,
  nombreLibre,
  normalizarNombre,
  ventanaPorDefecto,
  type OpcionesRegistro,
} from '@core/edicion/operaciones';
import { useStore } from '../estado/store';

type TipoNuevo = 'normal' | 'ventana' | 'subfile' | 'subfile-ventana';

const TIPOS: { valor: TipoNuevo; texto: string }[] = [
  { valor: 'normal', texto: 'Registro normal' },
  { valor: 'ventana', texto: 'Registro en ventana' },
  { valor: 'subfile', texto: 'Subfile (pantalla completa)' },
  { valor: 'subfile-ventana', texto: 'Subfile en ventana' },
];

/** Primer par WSnn / WCnn libre para un subfile y su control. */
function parSubfileLibre(p: PantallaDSPF): { sfl: string; ctl: string } {
  const usados = new Set(p.registros.map((r) => r.nombre.toUpperCase()));
  for (let n = 1; n < 100; n++) {
    const nn = String(n).padStart(2, '0');
    if (!usados.has(`WS${nn}`) && !usados.has(`WC${nn}`)) return { sfl: `WS${nn}`, ctl: `WC${nn}` };
  }
  return { sfl: 'WS99', ctl: 'WC99' };
}

function nombreSugerido(p: PantallaDSPF, tipo: TipoNuevo): string {
  const existentes = p.registros.map((r) => r.nombre);
  if (tipo === 'subfile' || tipo === 'subfile-ventana') return parSubfileLibre(p).sfl;
  return nombreLibre(existentes, tipo === 'ventana' ? 'W' : 'REG');
}

/** Formulario para agregar un registro (normal, ventana o subfile con su control). */
export function FormularioNuevoRegistro({
  pantalla,
  onCerrar,
}: {
  pantalla: PantallaDSPF;
  onCerrar: () => void;
}) {
  const aplicar = useStore((s) => s.aplicar);
  const [tipo, setTipo] = useState<TipoNuevo>('normal');
  const [nombre, setNombre] = useState(() => nombreSugerido(pantalla, 'normal'));
  const [control, setControl] = useState(() => parSubfileLibre(pantalla).ctl);
  const [titulo, setTitulo] = useState('');
  const [completo, setCompleto] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const esSubfile = tipo === 'subfile' || tipo === 'subfile-ventana';
  const conVentana = tipo === 'ventana' || tipo === 'subfile-ventana';

  const cambiarTipo = (nuevo: TipoNuevo) => {
    setTipo(nuevo);
    setNombre(nombreSugerido(pantalla, nuevo));
    setControl(parSubfileLibre(pantalla).ctl);
    setError(null);
  };

  const crear = (e: React.FormEvent) => {
    e.preventDefault();
    const ventana = conVentana ? ventanaPorDefecto(pantalla) : undefined;
    const opciones: OpcionesRegistro = esSubfile
      ? {
          tipo: 'subfile',
          nombre: normalizarNombre(nombre),
          nombreControl: normalizarNombre(control),
          ventana,
          completo,
          tituloArriba: titulo || undefined,
        }
      : {
          tipo: 'normal',
          nombre: normalizarNombre(nombre),
          ventana,
          tituloArriba: titulo || undefined,
        };
    try {
      const r = agregarRegistro(pantalla, opciones);
      aplicar(r.pantalla, { registro: r.registroId, seleccionar: null });
      onCerrar();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form className="formulario-registro" aria-label="Registro nuevo" onSubmit={crear}>
      <label className="form-fila">
        <span className="form-etiqueta">Tipo</span>
        <select
          className="form-entrada"
          value={tipo}
          onChange={(e) => cambiarTipo(e.target.value as TipoNuevo)}
        >
          {TIPOS.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.texto}
            </option>
          ))}
        </select>
      </label>
      <label className="form-fila">
        <span className="form-etiqueta">{esSubfile ? 'Subfile' : 'Nombre'}</span>
        <input
          type="text"
          className="form-entrada"
          maxLength={10}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
      </label>
      {esSubfile && (
        <label className="form-fila">
          <span className="form-etiqueta">Control</span>
          <input
            type="text"
            className="form-entrada"
            maxLength={10}
            value={control}
            onChange={(e) => setControl(e.target.value)}
          />
        </label>
      )}
      {esSubfile && (
        <label className="form-fila form-check" title="OVERLAY, registro relativo del cursor (SFLCSRRRN), página donde quedó (SFLRCDNBR), campo de opción y la línea 2=Modificar 4=Eliminar 5=Consultar">
          <input type="checkbox" checked={completo} onChange={(e) => setCompleto(e.target.checked)} />
          <span>Como el CRUD: opción, registro relativo y OVERLAY</span>
        </label>
      )}
      {conVentana && (
        <label className="form-fila">
          <span className="form-etiqueta">Título</span>
          <input
            type="text"
            className="form-entrada"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
          />
        </label>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-acciones">
        <button type="submit">Crear</button>
        <button type="button" className="boton-secundario" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
