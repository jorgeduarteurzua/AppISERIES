import type { Campo, Registro } from '@core/modelo/pantalla';
import { useStore } from '../estado/store';

const USO: Record<string, string> = { oculto: 'H', programa: 'P' };

function definicion(c: Campo): string {
  if (c.referencia && c.heredada) return 'ref.';
  return c.tipoDato === 'A' || c.tipoDato === '' ? `${c.longitud}A` : `${c.longitud},${c.decimales}${c.tipoDato}`;
}

/**
 * Campos del formato que no se ven en el lienzo: ocultos (H) y de programa (P). Un clic los
 * selecciona para editarlos o borrarlos en las propiedades.
 */
export function CamposSinPosicion({ registro }: { registro: Registro }) {
  const seleccion = useStore((s) => s.seleccionElemento);
  const seleccionar = useStore((s) => s.seleccionarElemento);
  const campos = registro.elementos.filter(
    (e): e is Campo => e.tipo === 'campo' && (e.uso === 'oculto' || e.uso === 'programa'),
  );
  return (
    <section className="campos-sin-posicion" aria-label="Campos sin posición">
      <h4>Campos sin posición ({campos.length})</h4>
      {campos.length === 0 ? (
        <p className="tenue">Este formato no tiene campos ocultos ni de programa. Use «+ Campo oculto» para agregar uno.</p>
      ) : (
        <ul>
          {campos.map((c) => {
            const condiciones = c.keywords.filter((k) => k.nombre !== 'REFFLD').map((k) => k.nombre);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={seleccion === c.id ? 'enlace activo' : 'enlace'}
                  aria-pressed={seleccion === c.id}
                  onClick={() => seleccionar(c.id)}
                >
                  <strong>{c.nombre || '(sin nombre)'}</strong>{' '}
                  <span className="crud-definicion">
                    {definicion(c)} {USO[c.uso]}
                  </span>
                  {condiciones.length > 0 && <span className="tenue"> {condiciones.join(' ')}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
