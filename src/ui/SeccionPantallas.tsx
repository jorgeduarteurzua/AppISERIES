import { useEffect, useState } from 'react';
import { registroDe, useStore } from './estado/store';
import { VisorPantalla } from './componentes/VisorPantalla';
import { PanelDetalle } from './componentes/PanelDetalle';
import { PanelDds } from './componentes/PanelDds';
import { EditorPantalla } from './componentes/EditorPantalla';
import { BarraEdicion } from './componentes/BarraEdicion';
import { FormularioNuevaPantalla } from './componentes/FormularioNuevaPantalla';
import { FormularioNuevoRegistro } from './componentes/FormularioNuevoRegistro';
import { PanelPropiedades } from './componentes/propiedades/PanelPropiedades';
import { BotonesGuardar } from './componentes/BotonesGuardar';
import { guardarPantalla } from './estado/guardado';
import { BotonAs400 } from './as400/BotonAs400';
import { fuentesDePantalla } from './estado/fuentesEnvio';
import { nombreCortoPantalla as nombreCorto } from './estado/nombres';
import { ID_TODOS } from '@core/render/lienzo';
import { DialogoCamposArchivo } from './componentes/DialogoCamposArchivo';
import { DialogoGenerarPrograma } from './componentes/DialogoGenerarPrograma';

/** Sección de pantallas (DSPF): ver, editar y generar el DDS. */
export function SeccionPantallas() {
  const {
    carpeta,
    archivos,
    pantalla,
    nombreArchivoActual,
    rutaActual,
    registroSeleccionado,
    seleccionElemento,
    modoEdicion,
    modificado,
    error,
    vista,
    abrirCarpeta,
    importarArchivos,
    cargarArchivo,
    seleccionarRegistro,
    cambiarVista,
    limpiarError,
  } = useStore();

  const [nuevaPantallaAbierta, setNuevaPantallaAbierta] = useState(false);
  const [nuevoRegistroAbierto, setNuevoRegistroAbierto] = useState(false);
  const [camposArchivoAbierto, setCamposArchivoAbierto] = useState(false);
  const [generarAbierto, setGenerarAbierto] = useState(false);

  const registro = registroDe(pantalla, registroSeleccionado);
  const verTodos = registroSeleccionado === ID_TODOS;

  // Atajos de deshacer/rehacer en modo edición.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const estado = useStore.getState();
      if (!estado.modoEdicion || !(e.ctrlKey || e.metaKey)) return;
      const tecla = e.key.toLowerCase();
      if (tecla === 'z' && !e.shiftKey) {
        e.preventDefault();
        estado.deshacer();
      } else if (tecla === 'y' || (tecla === 'z' && e.shiftKey)) {
        e.preventDefault();
        estado.rehacer();
      }
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);

  // Al salir del modo edición se cierra el formulario de registro.
  useEffect(() => {
    if (!modoEdicion) setNuevoRegistroAbierto(false);
  }, [modoEdicion]);

  return (
    <div className="app">
      <header className="app-barra">
        <span className="app-titulo">Pantallas DSPF</span>
        <button onClick={abrirCarpeta}>Abrir carpeta…</button>
        <button onClick={importarArchivos}>Importar fuentes…</button>
        <button onClick={() => setNuevaPantallaAbierta(true)}>Nueva pantalla…</button>
        <button
          type="button"
          className="boton-secundario"
          disabled={!pantalla}
          title="Agregar a un formato campos de un archivo PF o LF (con REFFLD)"
          onClick={() => setCamposArchivoAbierto(true)}
        >
          Campos de un archivo…
        </button>
        <button
          type="button"
          className="boton-secundario"
          disabled={!pantalla}
          title="Generar el programa COBOL que atiende esta pantalla"
          onClick={() => setGenerarAbierto(true)}
        >
          Generar programa…
        </button>
        <span className="barra-separador" aria-hidden="true" />
        <BotonesGuardar
          hayObjeto={pantalla !== null}
          modificado={modificado}
          tieneRuta={rutaActual !== null}
          alGuardar={(como) => void guardarPantalla(como)}
        />
        <BotonAs400
          hayObjeto={pantalla !== null}
          obtenerFuentes={fuentesDePantalla}
          etiquetaEnviar="Enviar pantalla…"
          archivoTraer="QDSPSRC"
        />
        {nombreArchivoActual && (
          <span className="app-archivo" title={nombreArchivoActual}>
            {modificado && <span aria-label="con cambios sin guardar">● </span>}
            {nombreCorto(nombreArchivoActual)}
          </span>
        )}
      </header>

      {error && (
        <div className="app-error" role="alert">
          <span>{error}</span>
          <button type="button" className="boton-icono" aria-label="Cerrar el aviso" onClick={limpiarError}>
            ×
          </button>
        </div>
      )}

      {camposArchivoAbierto && <DialogoCamposArchivo onCerrar={() => setCamposArchivoAbierto(false)} />}
      {generarAbierto && <DialogoGenerarPrograma onCerrar={() => setGenerarAbierto(false)} />}
      {nuevaPantallaAbierta && (
        <FormularioNuevaPantalla onCerrar={() => setNuevaPantallaAbierta(false)} />
      )}

      <div className={modoEdicion ? 'app-cuerpo app-cuerpo-edicion' : 'app-cuerpo'}>
        <aside className="app-lateral">
          <section className="lateral-seccion lateral-archivos">
            <h3>
              {carpeta ? 'Fuentes en carpeta' : 'Fuentes'} ({archivos.length})
            </h3>
            {archivos.length === 0 ? (
              <p className="tenue">
                Abre la carpeta QDSPSRC, importa fuentes DDS o crea una pantalla nueva.
              </p>
            ) : (
              <ul className="lista-archivos">
                {archivos.map((a) => (
                  <li
                    key={a.ruta}
                    className={a.nombre === nombreArchivoActual ? 'activo' : ''}
                    onClick={() => cargarArchivo(a.ruta, a.nombre)}
                    title={a.nombre}
                  >
                    {nombreCorto(a.nombre)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {pantalla && (
            <section className="lateral-seccion lateral-formatos">
              <div className="lateral-encabezado">
                <h3>Formatos ({pantalla.registros.length})</h3>
                {modoEdicion && (
                  <button
                    type="button"
                    className="boton-chico"
                    aria-expanded={nuevoRegistroAbierto}
                    onClick={() => setNuevoRegistroAbierto((a) => !a)}
                  >
                    + Registro
                  </button>
                )}
              </div>
              {modoEdicion && nuevoRegistroAbierto && (
                <FormularioNuevoRegistro
                  pantalla={pantalla}
                  onCerrar={() => setNuevoRegistroAbierto(false)}
                />
              )}
              <ul className="lista-formatos">
                {!modoEdicion && (
                  <li
                    className={verTodos ? 'activo' : ''}
                    onClick={() => seleccionarRegistro(ID_TODOS)}
                  >
                    <span className="formato-nombre">Todos los formatos</span>
                  </li>
                )}
                {pantalla.registros.map((r) => (
                  <li
                    key={r.id}
                    className={r.id === registroSeleccionado ? 'activo' : ''}
                    onClick={() => seleccionarRegistro(r.id)}
                  >
                    <span className="formato-nombre">{r.nombre}</span>
                    <span className={`etq etq-${r.clase}`}>{r.clase}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>

        <main className="app-centro">
          {pantalla ? (
            <div className="centro-contenido">
              <div className="pestanas" role="tablist">
                <button
                  role="tab"
                  aria-selected={vista === 'pantalla'}
                  className={vista === 'pantalla' ? 'pestana activa' : 'pestana'}
                  onClick={() => cambiarVista('pantalla')}
                >
                  Pantalla
                </button>
                <button
                  role="tab"
                  aria-selected={vista === 'dds'}
                  className={vista === 'dds' ? 'pestana activa' : 'pestana'}
                  onClick={() => cambiarVista('dds')}
                >
                  Fuente DDS
                </button>
              </div>

              {vista === 'pantalla' ? (
                <>
                  <BarraEdicion hayRegistro={registro !== null} />
                  {modoEdicion ? (
                    registro ? (
                      <EditorPantalla pantalla={pantalla} registro={registro} />
                    ) : (
                      <p className="tenue">
                        {pantalla.registros.length === 0
                          ? 'La pantalla no tiene registros. Usa «+ Registro» para agregar uno.'
                          : 'Selecciona un formato de la lista para editarlo.'}
                      </p>
                    )
                  ) : (
                    <VisorPantalla pantalla={pantalla} registro={registro} />
                  )}
                </>
              ) : (
                <PanelDds pantalla={pantalla} />
              )}
            </div>
          ) : (
            <div className="app-vacio">
              <p>Selecciona una fuente DDS para visualizar la pantalla, o crea una nueva.</p>
            </div>
          )}
        </main>

        {pantalla && (
          <aside className="app-derecha">
            {modoEdicion ? (
              <PanelPropiedades
                pantalla={pantalla}
                registro={registro}
                seleccionElemento={seleccionElemento}
              />
            ) : (
              <PanelDetalle pantalla={pantalla} registro={registro} />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
