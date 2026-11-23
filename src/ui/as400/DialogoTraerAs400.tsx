import { useMemo, useState } from 'react';
import type { MiembroFuente, ResultadoTraer } from '@core/as400/miembros';
import type { PasoEnvio } from '@core/as400/tipos';
import { esNombreValido, normalizarNombre } from '@core/as400/validacion';
import { conexionLista, useAs400 } from '../estado/as400';
import { useNavegacion } from '../estado/navegacion';
import { useStore } from '../estado/store';
import { useTablas } from '../estado/storeTablas';
import { useProgramas } from '../estado/storeProgramas';
import { refrescarCarpeta } from '../estado/carpetas';
import { ListaPasos } from './ListaPasos';

/** Traer fuentes del AS400: se elige biblioteca y archivo fuente, se listan los miembros y se marcan los que se quieren. */
export function DialogoTraerAs400() {
  const peticion = useAs400((s) => s.traer);
  if (!peticion) return null;
  return <Formulario archivoSugerido={peticion.archivoSugerido} />;
}

function mensajeDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function Formulario({ archivoSugerido }: { archivoSugerido: string }) {
  const conexion = useAs400((s) => s.conexion);
  const cerrar = useAs400((s) => s.cerrarTraer);
  const abrirConexion = useAs400((s) => s.abrirConexion);
  const establecerConexion = useAs400((s) => s.establecerConexion);
  const irA = useNavegacion((s) => s.irA);

  const [biblioteca, setBiblioteca] = useState(conexion?.destino.bibliotecaFuente ?? '');
  const [archivo, setArchivo] = useState(archivoSugerido);
  const [miembros, setMiembros] = useState<MiembroFuente[] | null>(null);
  const [origen, setOrigen] = useState<{ biblioteca: string; archivo: string } | null>(null);
  const [avisos, setAvisos] = useState<PasoEnvio[]>([]);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState('');
  const [sobrescribir, setSobrescribir] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<'listando' | 'trayendo' | null>(null);
  const [resultado, setResultado] = useState<ResultadoTraer | null>(null);

  const visibles = useMemo(() => {
    const f = filtro.trim().toUpperCase();
    return (miembros ?? []).filter(
      (m) => f === '' || m.nombre.includes(f) || (m.tipo ?? '').includes(f) || (m.texto ?? '').toUpperCase().includes(f),
    );
  }, [miembros, filtro]);

  const listar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    setResultado(null);
    if (!conexionLista(conexion)) {
      setError('Primero configura la conexión: servidor, usuario y contraseña.');
      return;
    }
    const bib = normalizarNombre(biblioteca);
    const arc = normalizarNombre(archivo);
    if (!esNombreValido(bib)) return setError('Falta la biblioteca o no es válida (máximo 10 caracteres: A-Z, 0-9, $ # @ _).');
    if (!esNombreValido(arc)) return setError('Falta el archivo fuente o no es válido (máximo 10 caracteres: A-Z, 0-9, $ # @ _).');
    setOcupado('listando');
    try {
      const r = await window.api.as400.listarMiembros(bib, arc);
      setAvisos(r.pasos);
      if (!r.ok) {
        setMiembros(null);
        setError(r.pasos.map((p) => p.mensaje).join('\n'));
        return;
      }
      setMiembros(r.miembros);
      setOrigen({ biblioteca: bib, archivo: arc });
      setMarcados(new Set());
      setFiltro('');
      // La biblioteca se recuerda para la próxima vez.
      if (conexion && conexion.destino.bibliotecaFuente !== bib) {
        const g = await window.api.as400.guardarDestino({ ...conexion.destino, bibliotecaFuente: bib });
        if (g.conexion) establecerConexion(g.conexion);
      }
    } catch (err) {
      setError(mensajeDe(err));
    } finally {
      setOcupado(null);
    }
  };

  const alternar = (nombre: string, marcar: boolean) =>
    setMarcados((actuales) => {
      const nuevo = new Set(actuales);
      if (marcar) nuevo.add(nombre);
      else nuevo.delete(nombre);
      return nuevo;
    });

  const traer = async () => {
    if (!origen || marcados.size === 0) return;
    setError(null);
    setOcupado('trayendo');
    try {
      const r = await window.api.as400.traer({
        biblioteca: origen.biblioteca,
        archivoFuente: origen.archivo,
        miembros: [...marcados],
        sobrescribir,
      });
      if (r.carpeta === null && r.pasos.length === 0) return; // se canceló la carpeta
      setResultado(r);
      if (r.carpeta === null) setError(r.pasos.map((p) => p.mensaje).join('\n'));
      // Si esa carpeta ya está abierta en alguna sección, aparecen los fuentes nuevos.
      else void refrescarCarpeta(r.carpeta);
    } catch (err) {
      setError(mensajeDe(err));
    } finally {
      setOcupado(null);
    }
  };

  const abrirEn = async (seccion: 'pantallas' | 'tablas' | 'programas') => {
    if (!resultado?.carpeta) return;
    if (seccion === 'pantallas') await useStore.getState().abrirCarpetaEn(resultado.carpeta);
    else if (seccion === 'tablas') await useTablas.getState().abrirCarpetaEn(resultado.carpeta);
    else await useProgramas.getState().abrirCarpetaEn(resultado.carpeta);
    irA(seccion);
    cerrar();
  };

  const guardados = resultado?.resultados.filter((r) => r.ok).length ?? 0;
  const omitidos = resultado?.resultados.filter((r) => r.omitido).length ?? 0;
  const conError = resultado?.resultados.filter((r) => !r.ok && !r.omitido).length ?? 0;

  return (
    <form className="formulario-flotante as400-dialogo as400-envio traer-dialogo" role="dialog" aria-label="Traer del AS400" onSubmit={listar}>
      <h3>Traer fuentes del AS400</h3>

      {!conexionLista(conexion) && (
        <p className="form-error">
          Falta la conexión.{' '}
          <button type="button" className="enlace" onClick={abrirConexion}>
            Configurarla
          </button>
        </p>
      )}

      <div className="traer-origen">
        <label className="form-fila">
          <span className="form-etiqueta">Biblioteca</span>
          <input type="text" className="form-entrada" maxLength={10} autoFocus value={biblioteca} onChange={(e) => setBiblioteca(e.target.value)} />
        </label>
        <label className="form-fila">
          <span className="form-etiqueta">Archivo fuente</span>
          <input type="text" className="form-entrada" maxLength={10} value={archivo} onChange={(e) => setArchivo(e.target.value)} />
        </label>
        <button type="submit" disabled={ocupado !== null}>
          {ocupado === 'listando' ? 'Listando…' : 'Listar'}
        </button>
      </div>

      {error && (
        <p className="form-error as400-error" role="alert">
          {error}
        </p>
      )}

      {miembros && origen && (
        <>
          <p className="tenue">
            {miembros.length} {miembros.length === 1 ? 'miembro' : 'miembros'} en {origen.biblioteca}/{origen.archivo}. Marcados: {marcados.size}.
          </p>
          {avisos.some((a) => a.aviso && !a.ok) && <ListaPasos pasos={avisos.filter((a) => a.aviso && !a.ok)} />}
          <div className="traer-filtro">
            <input
              type="text"
              className="form-entrada"
              aria-label="Filtrar miembros"
              placeholder="Filtrar por nombre, tipo o texto"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            />
            <button
              type="button"
              className="boton-secundario"
              onClick={() => setMarcados((a) => new Set([...a, ...visibles.map((m) => m.nombre)]))}
            >
              Marcar los visibles
            </button>
            <button type="button" className="boton-secundario" onClick={() => setMarcados(new Set())}>
              Quitar marcas
            </button>
          </div>
          <div className="crud-tabla-scroll traer-lista">
            <table className="crud-campos">
              <thead>
                <tr>
                  <th />
                  <th>Miembro</th>
                  <th>Tipo</th>
                  <th>Texto</th>
                  <th>Último cambio</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((m) => (
                  <tr key={m.nombre}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Traer ${m.nombre}`}
                        checked={marcados.has(m.nombre)}
                        onChange={(e) => alternar(m.nombre, e.target.checked)}
                      />
                    </td>
                    <td>{m.nombre}</td>
                    <td>{m.tipo ?? ''}</td>
                    <td>{m.texto ?? ''}</td>
                    <td>{m.fecha ?? ''}</td>
                  </tr>
                ))}
                {visibles.length === 0 && (
                  <tr>
                    <td colSpan={5} className="tenue">
                      Ningún miembro coincide.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <label className="form-check">
            <input type="checkbox" checked={sobrescribir} onChange={(e) => setSobrescribir(e.target.checked)} />
            Reemplazar los que ya existen en la carpeta (queda una copia .bak)
          </label>
        </>
      )}

      {resultado && (
        <section className="as400-resultado">
          <h4>
            {resultado.ok ? '✔' : '✖'} {guardados} {guardados === 1 ? 'guardado' : 'guardados'}
            {omitidos > 0 ? `, ${omitidos} sin reemplazar` : ''}
            {conError > 0 ? `, ${conError} con error` : ''} en {resultado.carpeta ?? '—'}
          </h4>
          <ul className="as400-pasos">
            {resultado.resultados.map((r) => (
              <li key={r.miembro} className={r.ok ? 'paso-ok' : r.omitido ? 'paso-aviso' : 'paso-error'}>
                <span className="paso-marca">{r.ok ? '✔' : r.omitido ? '⚠' : '✖'}</span>
                <span className="paso-nombre">{r.archivo ?? r.miembro}</span>
                <span className="paso-mensaje">{r.mensaje}</span>
              </li>
            ))}
          </ul>
          {resultado.carpeta && guardados > 0 && (
            <div className="form-acciones">
              <button type="button" onClick={() => void abrirEn('pantallas')}>
                Abrir la carpeta en Pantallas
              </button>
              <button type="button" onClick={() => void abrirEn('tablas')}>
                Abrir la carpeta en Tablas
              </button>
              <button type="button" onClick={() => void abrirEn('programas')}>
                Abrir la carpeta en Programas
              </button>
            </div>
          )}
        </section>
      )}

      <div className="form-acciones">
        <button type="button" disabled={ocupado !== null || marcados.size === 0} onClick={() => void traer()}>
          {ocupado === 'trayendo' ? 'Trayendo…' : `Traer los marcados (${marcados.size})…`}
        </button>
        <button type="button" className="boton-secundario" disabled={ocupado !== null} onClick={abrirConexion}>
          Conexión…
        </button>
        <button type="button" className="boton-secundario" disabled={ocupado !== null} onClick={cerrar}>
          Cerrar
        </button>
      </div>
    </form>
  );
}
