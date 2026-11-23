import { useDeferredValue, useMemo, useState } from 'react';
import type { MensajeListado } from '@core/as400/listado';
import { estructuraDe } from '@core/fuentes/estructura';
import type { ElementoEstructura } from '@core/fuentes/estructura';
import { TIPOS_PROGRAMA, secuenciaDeLinea } from '@core/fuentes/lenguaje';
import { revisarFuente } from '@core/fuentes/revision';
import type { ProblemaFuente } from '@core/fuentes/revision';
import { parsearDspf } from '@core/parser/parserDspf';
import type { TipoFuente } from '@core/as400/tipos';
import { BotonAs400 } from './as400/BotonAs400';
import { BotonesGuardar } from './componentes/BotonesGuardar';
import type { FuenteEnvio } from './estado/as400';
import { useConjuntoCrud } from './estado/conjuntoCrud';
import { guardarPrograma, useGuardado } from './estado/guardado';
import { nombreCortoPantalla } from './estado/nombres';
import { useProgramas } from './estado/storeProgramas';
import { useStore } from './estado/store';
import { EditorPrograma } from './programas/EditorPrograma';
import type { MarcaEditor, ResolverPantalla } from './programas/EditorPrograma';

const ETIQUETA_ESTRUCTURA: Record<ElementoEstructura['tipo'], string> = {
  division: 'División',
  seccion: 'Sección',
  parrafo: 'Párrafo',
  copy: 'COPY',
  programa: 'Programa',
  variable: 'Variable',
  etiqueta: 'Etiqueta',
  subrutina: 'Subrutina',
};

const NIVEL: Record<MensajeListado['nivel'], string> = { error: 'Error', aviso: 'Aviso', info: 'Info' };

/** La pantalla de un COPY DDS: la del editor de pantallas o la del CRUD, si se llama así. */
const resolverPantalla: ResolverPantalla = (nombre) => {
  const { pantalla, nombreArchivoActual } = useStore.getState();
  if (pantalla) {
    const n = nombreCortoPantalla(nombreArchivoActual ?? pantalla.nombre).replace(/\.[A-Za-z]+$/, '').toUpperCase();
    if (!nombre || n === nombre) return pantalla;
  }
  const c = useConjuntoCrud.getState().conjunto;
  if (c && (!nombre || c.nombrePantalla.toUpperCase() === nombre)) {
    try {
      return parsearDspf(c.ddsEditada ?? c.ddsPantalla, c.nombrePantalla);
    } catch {
      return null;
    }
  }
  return null;
};

/** El programa abierto, para el diálogo de envío. Al terminar, el listado vuelve al editor. */
function fuentesDelPrograma(): FuenteEnvio[] | null {
  const s = useProgramas.getState();
  if (s.texto === null || !s.info) return null;
  if (!s.info.envio) throw new Error(`los programas ${s.info.tipo} todavía no se compilan desde la aplicación`);
  if (s.miembro.trim() === '') throw new Error('falta el nombre del miembro');
  const lenguaje = s.info.lenguaje;
  const permitidos = Object.values(TIPOS_PROGRAMA)
    .filter((t) => t.lenguaje === lenguaje && t.envio)
    .map((t) => t.envio as TipoFuente);
  return [
    {
      clave: 'programa',
      etiqueta: 'Programa',
      tipo: s.info.envio,
      tiposPermitidos: permitidos,
      miembro: s.miembro,
      texto: s.texto,
      descripcion: '',
      incluido: true,
      alTerminar: (r) => useProgramas.getState().registrarCompilacion(r.listado),
    },
  ];
}

function FormularioNuevoPrograma({ onCerrar }: { onCerrar: () => void }) {
  const nuevo = useProgramas((s) => s.nuevo);
  const [tipo, setTipo] = useState('SQLCBL');
  const [miembro, setMiembro] = useState('');
  const valido = /^[A-Za-z$#@][A-Za-z0-9$#@_]{0,9}$/.test(miembro.trim());
  return (
    <form
      className="formulario-flotante"
      role="dialog"
      aria-label="Nuevo programa"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valido) return;
        nuevo(tipo, miembro);
        onCerrar();
      }}
    >
      <h3>Nuevo programa</h3>
      <label className="form-fila">
        <span className="form-etiqueta">Tipo</span>
        <select className="form-entrada" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {Object.values(TIPOS_PROGRAMA).map((t) => (
            <option key={t.tipo} value={t.tipo}>
              {t.tipo}
            </option>
          ))}
        </select>
      </label>
      <label className="form-fila">
        <span className="form-etiqueta">Miembro</span>
        <input className="form-entrada" maxLength={10} value={miembro} onChange={(e) => setMiembro(e.target.value.toUpperCase())} autoFocus />
      </label>
      <div className="form-acciones">
        <button type="submit" disabled={!valido}>
          Crear
        </button>
        <button type="button" className="boton-secundario" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Editor de programas: COBOL y CL (y RPG, solo para editar), con envío y compilación en el AS400. */
export function SeccionProgramas() {
  const carpeta = useProgramas((s) => s.carpeta);
  const archivos = useProgramas((s) => s.archivos);
  const error = useProgramas((s) => s.error);
  const texto = useProgramas((s) => s.texto);
  const info = useProgramas((s) => s.info);
  const miembro = useProgramas((s) => s.miembro);
  const nombreArchivo = useProgramas((s) => s.nombreArchivo);
  const ruta = useProgramas((s) => s.ruta);
  const origen = useProgramas((s) => s.origen);
  const modificado = useProgramas((s) => s.modificado);
  const mensajes = useProgramas((s) => s.mensajes);
  const listado = useProgramas((s) => s.listado);
  const irA = useProgramas((s) => s.irA);
  const conjunto = useConjuntoCrud((s) => s.conjunto);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);

  // La estructura y la revisión se calculan con un poco de retraso al escribir.
  const textoDiferido = useDeferredValue(texto ?? '');
  const lenguaje = info?.lenguaje ?? 'cobol';
  const estructura = useMemo(() => estructuraDe(textoDiferido, lenguaje), [textoDiferido, lenguaje]);
  const revision = useMemo(() => revisarFuente(textoDiferido, lenguaje), [textoDiferido, lenguaje]);
  const marcas: MarcaEditor[] = useMemo(
    () => [
      ...revision,
      ...mensajes.flatMap((m) => (m.linea ? [{ linea: m.linea, columna: 1, hasta: 200, nivel: m.nivel, mensaje: `${m.id} (${m.gravedad}): ${m.texto}` }] : [])),
    ],
    [revision, mensajes],
  );

  const st = useProgramas.getState;
  const titulo = texto === null ? '' : origen === 'crud' ? `${miembro} (programa del CRUD)` : (nombreArchivo ?? `${miembro} (nuevo)`);

  return (
    <div className="app">
      <header className="app-barra">
        <span className="app-titulo">Programas (COBOL / CL)</span>
        <button onClick={() => void st().abrirCarpeta()}>Abrir carpeta…</button>
        <button onClick={() => setNuevoAbierto(true)}>Nuevo programa…</button>
        {conjunto && (
          <button
            type="button"
            className="boton-secundario"
            title={`Abrir el programa ${conjunto.nombrePrograma} del último CRUD; lo que se edite se envía y se guarda con el CRUD`}
            onClick={() => st().abrirDelCrud()}
          >
            Programa del CRUD
          </button>
        )}
        <span className="barra-separador" aria-hidden="true" />
        <BotonesGuardar hayObjeto={texto !== null} modificado={modificado} tieneRuta={ruta !== null} alGuardar={(como) => void guardarPrograma(como)} />
        <BotonAs400
          hayObjeto={texto !== null && !!info?.envio}
          obtenerFuentes={fuentesDelPrograma}
          etiquetaEnviar="Enviar programa…"
          archivoTraer={info?.archivoFuente ?? 'QCBLSRC'}
        />
        {texto !== null && (
          <>
            <label className="programa-dato">
              <span className="tenue">Miembro</span>
              <input
                className="form-entrada"
                aria-label="Miembro"
                maxLength={10}
                value={miembro}
                onChange={(e) => st().cambiarMiembro(e.target.value)}
              />
            </label>
            <label className="programa-dato">
              <span className="tenue">Tipo</span>
              <select className="form-entrada" aria-label="Tipo del programa" value={info?.tipo ?? ''} onChange={(e) => st().cambiarTipo(e.target.value)}>
                {Object.values(TIPOS_PROGRAMA).map((t) => (
                  <option key={t.tipo} value={t.tipo}>
                    {t.tipo}
                  </option>
                ))}
              </select>
            </label>
            <span className="app-archivo" title={ruta ?? titulo}>
              {modificado && <span aria-label="con cambios sin guardar">● </span>}
              {titulo}
            </span>
          </>
        )}
      </header>

      {error && (
        <div className="app-error" role="alert">
          <span>{error}</span>
          <button type="button" className="boton-secundario" onClick={() => st().limpiarError()}>
            Cerrar
          </button>
        </div>
      )}
      {nuevoAbierto && <FormularioNuevoPrograma onCerrar={() => setNuevoAbierto(false)} />}

      <div className="app-cuerpo app-cuerpo-edicion">
        <aside className="app-lateral">
          <section className="lateral-seccion lateral-archivos">
            <h3>
              {carpeta ? 'Programas en carpeta' : 'Programas'} ({archivos.length})
            </h3>
            {archivos.length === 0 ? (
              <p className="tenue">Abre la carpeta con los fuentes (QCBLSRC, QCLSRC) o crea un programa nuevo.</p>
            ) : (
              <ul className="lista-archivos">
                {archivos.map((a) => (
                  <li key={a.ruta} className={a.nombre === nombreArchivo ? 'activo' : ''} onClick={() => void st().cargarArchivo(a)} title={a.nombre}>
                    <span className="archivo-nombre">{a.miembro}</span>
                    <span className="etq">{a.info.tipo}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {texto !== null && (
            <section className="lateral-seccion" aria-label="Estructura">
              <h3>Estructura</h3>
              {estructura.length === 0 ? (
                <p className="tenue">Sin divisiones, párrafos ni etiquetas.</p>
              ) : (
                <ul className="lista-archivos programa-estructura">
                  {estructura.map((e, i) => (
                    <li
                      key={`${e.linea}-${i}`}
                      className={`estructura-${e.tipo}`}
                      title={`${ETIQUETA_ESTRUCTURA[e.tipo]} en la línea ${secuenciaDeLinea(e.linea)}`}
                      onClick={() => st().irALinea(e.linea)}
                    >
                      <span className="archivo-nombre">{e.nombre}</span>
                      <span className="tenue">{secuenciaDeLinea(e.linea)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </aside>

        <main className="app-centro app-centro-programas">
          {texto !== null && info ? (
            <EditorPrograma
              texto={texto}
              lenguaje={info.lenguaje}
              marcas={marcas}
              irA={irA}
              alCambiar={(t) => st().cambiarTexto(t)}
              resolverPantalla={resolverPantalla}
              alAvisar={(mensaje) => useGuardado.setState({ mensaje, tipo: 'error' })}
            />
          ) : (
            <p className="app-vacio tenue">Abre un programa de la lista, crea uno nuevo o abre el programa del CRUD.</p>
          )}
        </main>

        <aside className="app-derecha">
          {texto !== null && (
            <PanelProblemasPrograma
              revision={revision}
              mensajes={mensajes}
              listado={listado}
              ir={(linea, columna) => st().irALinea(linea, columna)}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function PanelProblemasPrograma({
  revision,
  mensajes,
  listado,
  ir,
}: {
  revision: ProblemaFuente[];
  mensajes: MensajeListado[];
  listado: string | null;
  ir: (linea: number, columna: number) => void;
}) {
  const errores = mensajes.filter((m) => m.nivel === 'error').length;
  return (
    <section className="lateral-seccion" aria-label="Problemas del programa">
      <h3>Formato</h3>
      {revision.length === 0 ? (
        <p className="problemas-resumen problemas-ok" role="status">
          Sin problemas de columnas ni caracteres.
        </p>
      ) : (
        <ul className="problemas-lista">
          {revision.map((p, i) => (
            <li key={i}>
              <button type="button" className={`problema problema-${p.nivel}`} onClick={() => ir(p.linea, p.columna)}>
                <span className="problema-nivel">{NIVEL[p.nivel]}</span> {secuenciaDeLinea(p.linea)}: {p.mensaje}
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3>Compilación</h3>
      {listado === null ? (
        <p className="tenue">Envíe y compile el programa para ver aquí los mensajes del compilador.</p>
      ) : mensajes.length === 0 ? (
        <p className="problemas-resumen problemas-ok" role="status">
          El listado no tiene mensajes.
        </p>
      ) : (
        <>
          <p className="problemas-resumen" role="status">
            {errores > 0 ? (
              <strong className="problema-error">
                {errores} {errores === 1 ? 'error' : 'errores'} (gravedad 30 o más)
              </strong>
            ) : (
              'Sin errores graves.'
            )}
          </p>
          <ul className="problemas-lista" aria-label="Mensajes del compilador">
            {mensajes.map((m, i) => (
              <li key={i}>
                <button
                  type="button"
                  className={`problema problema-${m.nivel}`}
                  disabled={m.linea === null}
                  onClick={() => m.linea && ir(m.linea, 1)}
                >
                  <span className="problema-nivel">
                    {m.id} {m.gravedad}
                  </span>{' '}
                  {m.linea ? `${secuenciaDeLinea(m.linea)}: ` : ''}
                  {m.texto}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {listado && (
        <details>
          <summary>Listado del compilador</summary>
          <pre className="as400-listado">{listado}</pre>
        </details>
      )}
    </section>
  );
}
