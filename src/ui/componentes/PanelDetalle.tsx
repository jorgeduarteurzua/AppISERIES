import type { PantallaDSPF, Registro } from '@core/modelo/pantalla';

interface Props {
  pantalla: PantallaDSPF;
  registro: Registro | null;
}

/** Panel lateral con teclas de función, keywords y campos del registro. */
export function PanelDetalle({ pantalla, registro }: Props) {
  const campos =
    registro?.elementos.filter((e) => e.tipo === 'campo') ?? [];

  return (
    <div className="panel-detalle">
      <section>
        <h3>Teclas de función</h3>
        {pantalla.teclasFuncion.length === 0 ? (
          <p className="tenue">Ninguna declarada.</p>
        ) : (
          <ul className="lista-compacta">
            {pantalla.teclasFuncion.map((t, i) => (
              <li key={i}>
                <code>
                  {t.tipo}
                  {String(t.numero).padStart(2, '0')}
                </code>{' '}
                {t.texto ?? ''}
              </li>
            ))}
          </ul>
        )}
      </section>

      {registro && (
        <section>
          <h3>Campos de {registro.nombre}</h3>
          {campos.length === 0 ? (
            <p className="tenue">Sin campos.</p>
          ) : (
            <table className="tabla-campos">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Long</th>
                  <th>Uso</th>
                  <th>Pos</th>
                </tr>
              </thead>
              <tbody>
                {campos.map((c) =>
                  c.tipo === 'campo' ? (
                    <tr key={c.id}>
                      <td>{c.nombre}</td>
                      <td>
                        {c.tipoDato || (c.referencia ? 'ref' : '—')}
                        {c.decimales ? `,${c.decimales}` : ''}
                      </td>
                      <td>{c.longitud}</td>
                      <td>{c.uso}</td>
                      <td>
                        {c.fila !== null && c.columna !== null
                          ? `${c.fila},${c.columna}`
                          : '—'}
                      </td>
                    </tr>
                  ) : null,
                )}
              </tbody>
            </table>
          )}
        </section>
      )}

      {pantalla.advertencias.length > 0 && (
        <section>
          <h3>Advertencias ({pantalla.advertencias.length})</h3>
          <ul className="lista-compacta tenue">
            {pantalla.advertencias.slice(0, 10).map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
