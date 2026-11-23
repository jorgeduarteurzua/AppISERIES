import { useEffect, useMemo, useState } from 'react';
import { camposDe, nombreArchivoTabla, tipoDeTabla, type RegistroTabla, type Tabla } from '@core/tablas/modelo';
import { useTablas, type VistaTabla } from './estado/storeTablas';
import { CuadriculaCampos } from './tablas/CuadriculaCampos';
import { FormularioNuevaTabla } from './tablas/FormularioNuevaTabla';
import { PanelLlaves } from './tablas/PanelLlaves';
import { PanelProblemasTabla } from './tablas/PanelProblemasTabla';
import { PropiedadesArchivo } from './tablas/PropiedadesArchivo';
import { PropiedadesCampo } from './tablas/PropiedadesCampo';
import { VistaDdsTabla, VistaSqlTabla } from './tablas/VistasTabla';
import { BotonesGuardar } from './componentes/BotonesGuardar';
import { guardarTabla } from './estado/guardado';
import { BotonAs400 } from './as400/BotonAs400';
import { DialogoCrud } from './tablas/DialogoCrud';
import { PanelIndices } from './tablas/PanelIndices';
import { fuentesDeTabla } from './estado/fuentesEnvio';
import { archivosDelConjunto, fuentesDelConjunto, guardarEdicionAhora, useConjuntoCrud } from './estado/conjuntoCrud';
import { useAs400 } from './estado/as400';
import { useGuardado } from './estado/guardado';
import { guardarFuentesLocal } from './estado/guardadoLocal';

const PESTANAS: { vista: VistaTabla; texto: string }[] = [
  { vista: 'campos', texto: 'Campos' },
  { vista: 'dds', texto: 'Fuente DDS' },
  { vista: 'sql', texto: 'SQL' },
];

/** Nombres de campo que se sugieren para llaves y selecciones: los propios o, si no hay, los del físico. */
function camposSugeridos(
  registro: RegistroTabla,
  catalogo: Record<string, Tabla>,
  pfile: string | null,
): string[] {
  const propios = camposDe(registro).map((c) => c.nombre);
  if (propios.length > 0 || pfile === null) return propios;
  const fisico = catalogo[pfile.trim().split(/\s+/)[0].replace(/^.*\//, '').toUpperCase()];
  return fisico ? fisico.registros.flatMap(camposDe).map((c) => c.nombre) : [];
}

/** Sección de tablas: diseño de archivos físicos y lógicos, con DDS y SQL generados. */
export function SeccionTablas() {
  const carpeta = useTablas((s) => s.carpeta);
  const archivos = useTablas((s) => s.archivos);
  const catalogo = useTablas((s) => s.catalogo);
  const tabla = useTablas((s) => s.tabla);
  const nombreArchivoActual = useTablas((s) => s.nombreArchivoActual);
  const rutaActual = useTablas((s) => s.rutaActual);
  const registroId = useTablas((s) => s.registroId);
  const seleccion = useTablas((s) => s.seleccion);
  const vista = useTablas((s) => s.vista);
  const modificado = useTablas((s) => s.modificado);
  const error = useTablas((s) => s.error);
  const abrirCarpeta = useTablas((s) => s.abrirCarpeta);
  const cargarArchivo = useTablas((s) => s.cargarArchivo);
  const cambiarVista = useTablas((s) => s.cambiarVista);
  const seleccionarRegistro = useTablas((s) => s.seleccionarRegistro);
  const limpiarError = useTablas((s) => s.limpiarError);

  const conjunto = useConjuntoCrud((s) => s.conjunto);
  const abrirEnvio = useAs400((s) => s.abrirEnvio);

  /** Envía o guarda el CRUD completo: archivo, pantalla (la editada, si se está editando) y programa. */
  const conCrud = async (accion: 'enviar' | 'guardar') => {
    if (!conjunto) return;
    try {
      if (accion === 'enviar') {
        abrirEnvio(fuentesDelConjunto(conjunto));
      } else {
        const r = await guardarFuentesLocal(archivosDelConjunto(conjunto));
        useGuardado.setState({ mensaje: r.mensaje, tipo: r.ok ? 'ok' : 'error' });
      }
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      useGuardado.setState({ mensaje: `No se puede generar el CRUD: ${motivo}`, tipo: 'error' });
    }
  };

  const [nuevaAbierta, setNuevaAbierta] = useState(false);
  const [crudAbierto, setCrudAbierto] = useState(false);

  // Al abrir una tabla se recupera su último CRUD (aunque se haya cerrado la aplicación).
  const tablaCrud = tabla ? (nombreArchivoActual ? nombreArchivoTabla(nombreArchivoActual) : tabla.nombre).toUpperCase() : null;
  useEffect(() => {
    if (!tablaCrud) return;
    const actual = useConjuntoCrud.getState().conjunto;
    if (actual && actual.tabla.toUpperCase() === tablaCrud) return;
    // La pantalla del CRUD anterior queda guardada tal como está en el editor.
    if (actual?.vinculadaAlEditor) guardarEdicionAhora();
    useConjuntoCrud.getState().restaurar(tablaCrud);
  }, [tablaCrud]);

  // Atajos de deshacer/rehacer.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const estado = useTablas.getState();
      if (!estado.tabla) return;
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

  const registro = tabla?.registros.find((r) => r.id === registroId) ?? tabla?.registros[0] ?? null;
  const logico = tabla ? tipoDeTabla(tabla) === 'LF' : false;
  const campoSel = registro ? (camposDe(registro).find((c) => c.id === seleccion) ?? null) : null;
  const nombreMostrado = tabla ? (nombreArchivoActual ? nombreArchivoTabla(nombreArchivoActual) : `${tabla.nombre} (nueva)`) : '';
  const sugeridos = useMemo(
    () => (registro ? camposSugeridos(registro, catalogo, registro.keywords.find((k) => k.nombre === 'PFILE')?.parametros ?? null) : []),
    [registro, catalogo],
  );

  return (
    <div className="app">
      <header className="app-barra">
        <span className="app-titulo">Tablas (PF / LF)</span>
        <button onClick={abrirCarpeta}>Abrir carpeta…</button>
        <button onClick={() => setNuevaAbierta(true)}>Nueva tabla…</button>
        <span className="barra-separador" aria-hidden="true" />
        <BotonesGuardar
          hayObjeto={tabla !== null}
          modificado={modificado}
          tieneRuta={rutaActual !== null}
          alGuardar={(como) => void guardarTabla(como)}
        />
        <BotonAs400
          hayObjeto={tabla !== null}
          obtenerFuentes={fuentesDeTabla}
          etiquetaEnviar="Enviar archivo…"
          archivoTraer="QDDSSRC"
        />
        <button
          type="button"
          className="boton-secundario"
          disabled={!tabla || logico}
          title={
            !tabla
              ? 'Abre una tabla'
              : logico
                ? 'El CRUD se genera sobre un archivo físico'
                : 'Generar la pantalla y el programa COBOL con SQL para mantener esta tabla'
          }
          onClick={() => setCrudAbierto(true)}
        >
          Generar CRUD…
        </button>
        {conjunto && (
          <>
            <button
              type="button"
              className="boton-secundario"
              title={`Enviar al AS400 el archivo ${conjunto.tabla}, la pantalla ${conjunto.nombrePantalla} y el programa ${conjunto.nombrePrograma}${
                conjunto.vinculadaAlEditor ? ' (la pantalla sale del editor, con sus cambios)' : ''
              }`}
              onClick={() => void conCrud('enviar')}
            >
              Enviar el CRUD…
            </button>
            <button
              type="button"
              className="boton-secundario"
              title="Guardar en el equipo el archivo, la pantalla y el programa del CRUD"
              onClick={() => void conCrud('guardar')}
            >
              Guardar el CRUD…
            </button>
          </>
        )}
        {tabla && (
          <span className="app-archivo" title={nombreArchivoActual ?? tabla.nombre}>
            {modificado && <span aria-label="con cambios sin guardar">● </span>}
            {nombreMostrado}
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

      {nuevaAbierta && <FormularioNuevaTabla onCerrar={() => setNuevaAbierta(false)} />}
      {crudAbierto && tabla && (
        <DialogoCrud
          // Con otra tabla, el diálogo empieza de cero.
          key={`${nombreArchivoActual ?? tabla.nombre}`}
          tabla={tabla}
          nombre={nombreArchivoActual ? nombreArchivoTabla(nombreArchivoActual) : tabla.nombre}
          onCerrar={() => setCrudAbierto(false)}
        />
      )}

      <div className="app-cuerpo app-cuerpo-edicion">
        <aside className="app-lateral">
          <section className="lateral-seccion lateral-archivos lateral-completo">
            <h3>
              {carpeta ? 'Archivos en carpeta' : 'Archivos'} ({archivos.length})
            </h3>
            {archivos.length === 0 ? (
              <p className="tenue">Abre la carpeta QDDSSRC o crea una tabla nueva.</p>
            ) : (
              <ul className="lista-archivos">
                {archivos.map((a) => (
                  <li
                    key={a.ruta}
                    className={a.nombre === nombreArchivoActual ? 'activo' : ''}
                    onClick={() => cargarArchivo(a)}
                    title={a.nombre}
                  >
                    <span className="archivo-nombre">{a.clave}</span>
                    <span className={`etq etq-${a.tipo.toLowerCase()}`}>{a.tipo}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <main className="app-centro app-centro-tablas">
          {tabla && registro ? (
            <div className="centro-contenido centro-ancho">
              <div className="pestanas" role="tablist">
                {PESTANAS.map((p) => (
                  <button
                    key={p.vista}
                    role="tab"
                    aria-selected={vista === p.vista}
                    className={vista === p.vista ? 'pestana activa' : 'pestana'}
                    onClick={() => cambiarVista(p.vista)}
                  >
                    {p.texto}
                  </button>
                ))}
              </div>

              {tabla.registros.length > 1 && (
                <label className="form-fila selector-registro">
                  <span className="form-etiqueta">Formato</span>
                  <select className="form-entrada" value={registro.id} onChange={(e) => seleccionarRegistro(e.target.value)}>
                    {tabla.registros.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {vista === 'campos' && <CuadriculaCampos registro={registro} />}
              {vista === 'dds' && <VistaDdsTabla tabla={tabla} />}
              {vista === 'sql' && <VistaSqlTabla tabla={tabla} />}
            </div>
          ) : (
            <div className="app-vacio">
              <p>Abre un archivo de la lista o crea una tabla nueva.</p>
            </div>
          )}
        </main>

        {tabla && registro && (
          <aside className="app-derecha">
            <div className="panel-detalle panel-propiedades">
              <section>
                <h3>Problemas</h3>
                <PanelProblemasTabla tabla={tabla} />
              </section>

              {campoSel && (
                <section>
                  <h3>Campo {campoSel.nombre}</h3>
                  {/* key: al cambiar de campo se reinician los controles con estado propio */}
                  <PropiedadesCampo key={campoSel.id} regId={registro.id} campo={campoSel} logico={logico} />
                </section>
              )}

              <details open={!campoSel}>
                <summary>Llave{logico ? ' y selección' : ''}</summary>
                <PanelLlaves tabla={tabla} registro={registro} logico={logico} sugeridos={sugeridos} />
              </details>

              {!logico && (
                <details open={!campoSel}>
                  <summary>Índices de este archivo</summary>
                  <PanelIndices tabla={tabla} nombre={tablaCrud ?? tabla.nombre} />
                </details>
              )}
              <details open={!campoSel}>
                <summary>Archivo y formato</summary>
                <PropiedadesArchivo
                  key={registro.id}
                  tabla={tabla}
                  registro={registro}
                  nombreArchivo={nombreMostrado}
                />
              </details>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
