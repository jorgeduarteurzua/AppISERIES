import type { PantallaDSPF, Registro } from '@core/modelo/pantalla';
import { PanelProblemas } from './PanelProblemas';
import { PropiedadesElemento } from './PropiedadesElemento';
import { PropiedadesPantalla } from './PropiedadesPantalla';
import { PropiedadesRegistro } from './PropiedadesRegistro';

interface Props {
  pantalla: PantallaDSPF;
  registro: Registro | null;
  seleccionElemento: string | null;
}

/** Panel lateral del modo edición: problemas, elemento, registro y pantalla. */
export function PanelPropiedades({ pantalla, registro, seleccionElemento }: Props) {
  const elemento = registro?.elementos.find((e) => e.id === seleccionElemento) ?? null;

  return (
    <div className="panel-detalle panel-propiedades">
      <section>
        <h3>Problemas</h3>
        <PanelProblemas pantalla={pantalla} />
      </section>

      {registro && elemento && (
        <section>
          <h3>{elemento.tipo === 'campo' ? 'Campo' : 'Texto'} seleccionado</h3>
          {/* key: al cambiar de elemento se reinician los controles con estado local */}
          <PropiedadesElemento key={elemento.id} regId={registro.id} elemento={elemento} />
        </section>
      )}

      {registro && (
        <details open={!elemento}>
          <summary>Registro {registro.nombre}</summary>
          <PropiedadesRegistro key={registro.id} pantalla={pantalla} registro={registro} />
        </details>
      )}

      <details open={!registro}>
        <summary>Pantalla</summary>
        <PropiedadesPantalla pantalla={pantalla} />
      </details>
    </div>
  );
}
