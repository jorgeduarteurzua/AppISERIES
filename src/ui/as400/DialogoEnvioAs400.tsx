import { useState } from 'react';
import { comandoCompilacion } from '@core/as400/comandos';
import { TIPOS_FUENTE } from '@core/as400/tipos';
import type { DestinoGuardado, PeticionEnvio, ResultadoEnvio, TipoFuente } from '@core/as400/tipos';
import { normalizarNombre, validarPeticion } from '@core/as400/validacion';
import { conexionLista, useAs400 } from '../estado/as400';
import { extensionFuente, guardarFuentesLocal } from '../estado/guardadoLocal';
import type { FuenteEnvio } from '../estado/as400';
import { ListaPasos } from './ListaPasos';

interface Fila extends FuenteEnvio {
  archivo: string;
}

/** Enviar fuentes al AS400 (y compilarlos): dónde dejarlos y dónde compilar. */
export function DialogoEnvioAs400() {
  const fuentes = useAs400((s) => s.envio);
  if (!fuentes) return null;
  return <Formulario fuentes={fuentes} />;
}

function mensajeDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function Formulario({ fuentes }: { fuentes: FuenteEnvio[] }) {
  const conexion = useAs400((s) => s.conexion);
  const cerrar = useAs400((s) => s.cerrarEnvio);
  const abrirConexion = useAs400((s) => s.abrirConexion);
  const establecerConexion = useAs400((s) => s.establecerConexion);
  const destino = conexion?.destino;

  const [filas, setFilas] = useState<Fila[]>(() =>
    fuentes.map((f) => ({ ...f, archivo: destino?.archivoFuente[f.tipo] ?? TIPOS_FUENTE[f.tipo].archivoPorDefecto })),
  );
  const [bibFuente, setBibFuente] = useState(destino?.bibliotecaFuente ?? '');
  const [bibObjeto, setBibObjeto] = useState(destino?.bibliotecaObjeto ?? '');
  const [extra, setExtra] = useState((destino?.bibliotecasExtra ?? []).join(', '));
  const [compilar, setCompilar] = useState(true);
  const [reemplazar, setReemplazar] = useState(true);
  const [crearArchivo, setCrearArchivo] = useState(true);
  const [copiaLocal, setCopiaLocal] = useState(false);
  const [avisoLocal, setAvisoLocal] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Record<string, ResultadoEnvio>>({});

  const cambiar = (clave: string, cambio: Partial<Fila>) =>
    setFilas((fs) =>
      fs.map((f) => {
        if (f.clave !== clave) return f;
        const nueva = { ...f, ...cambio };
        // Al cambiar el tipo se propone el archivo fuente habitual de ese tipo.
        if (cambio.tipo && cambio.tipo !== f.tipo) nueva.archivo = TIPOS_FUENTE[cambio.tipo].archivoPorDefecto;
        return nueva;
      }),
    );

  const bibliotecasExtra = extra
    .split(/[\s,;]+/)
    .map(normalizarNombre)
    .filter((b) => b !== '');

  const peticionDe = (f: Fila): PeticionEnvio => ({
    tipo: f.tipo,
    miembro: normalizarNombre(f.miembro),
    texto: f.texto,
    descripcion: f.descripcion,
    bibliotecaFuente: normalizarNombre(bibFuente),
    archivoFuente: normalizarNombre(f.archivo),
    bibliotecaObjeto: normalizarNombre(bibObjeto),
    compilar,
    reemplazar,
    crearArchivoFuente: crearArchivo,
    bibliotecasExtra,
  });

  const incluidas = filas.filter((f) => f.incluido);

  const enviar = async () => {
    setError(null);
    setResultados({});
    if (!conexionLista(conexion)) {
      setError('Primero configura la conexión: servidor, usuario y contraseña.');
      return;
    }
    if (incluidas.length === 0) {
      setError('Marca al menos un fuente para enviar.');
      return;
    }
    const problemas = incluidas.flatMap((f) => validarPeticion(peticionDe(f)).map((p) => `${f.miembro || f.etiqueta}: ${p}`));
    if (problemas.length > 0) {
      setError(problemas.join('\n'));
      return;
    }
    if (compilar && reemplazar && incluidas.some((f) => f.tipo === 'PF')) {
      const seguir = window.confirm(
        'Compilar un archivo físico (PF) con REPLACE(*YES) borra los datos del archivo si ya existe. ¿Continuar?',
      );
      if (!seguir) return;
    }

    setEnviando(true);
    try {
      // Copia en el equipo: si falla o se cancela, el envío sigue.
      setAvisoLocal(null);
      if (copiaLocal) {
        const local = await guardarFuentesLocal(
          incluidas.map((f) => ({ nombre: `${normalizarNombre(f.miembro)}.${extensionFuente(f.tipo)}`, texto: f.texto })),
        );
        setAvisoLocal(local.mensaje);
      }
      const archivos: DestinoGuardado['archivoFuente'] = { ...(destino?.archivoFuente ?? {}) };
      for (const f of incluidas) archivos[f.tipo] = normalizarNombre(f.archivo);
      const guardado = await window.api.as400.guardarDestino({
        bibliotecaFuente: normalizarNombre(bibFuente),
        bibliotecaObjeto: normalizarNombre(bibObjeto),
        archivoFuente: archivos,
        bibliotecasExtra,
      });
      if (guardado.conexion) establecerConexion(guardado.conexion);

      // En orden: lo que sigue puede depender de lo anterior (el programa usa la pantalla).
      for (const f of incluidas) {
        const r = await window.api.as400.enviar(peticionDe(f));
        setResultados((rs) => ({ ...rs, [f.clave]: r }));
        f.alTerminar?.(r);
        if (!r.ok) break;
      }
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form
      className="formulario-flotante as400-dialogo as400-envio"
      role="dialog"
      aria-label="Enviar al AS400"
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      <h3>Enviar al AS400</h3>

      {!conexionLista(conexion) && (
        <p className="form-error">
          Falta la conexión.{' '}
          <button type="button" className="enlace" onClick={abrirConexion}>
            Configurarla
          </button>
        </p>
      )}

      <div className="as400-filas">
        {filas.map((f) => (
          <div key={f.clave} className="as400-fila">
            <label className="form-check as400-incluir">
              <input
                type="checkbox"
                checked={f.incluido}
                onChange={(e) => cambiar(f.clave, { incluido: e.target.checked })}
              />
              {f.etiqueta}
            </label>
            <input
              type="text"
              className="form-entrada"
              aria-label={`Miembro de ${f.etiqueta}`}
              title="Nombre del miembro y del objeto"
              maxLength={10}
              value={f.miembro}
              onChange={(e) => cambiar(f.clave, { miembro: e.target.value })}
            />
            {f.tiposPermitidos && f.tiposPermitidos.length > 1 ? (
              <select
                className="form-entrada"
                aria-label={`Tipo de ${f.etiqueta}`}
                value={f.tipo}
                onChange={(e) => cambiar(f.clave, { tipo: e.target.value as TipoFuente })}
              >
                {f.tiposPermitidos.map((t) => (
                  <option key={t} value={t}>
                    {TIPOS_FUENTE[t].etiqueta}
                  </option>
                ))}
              </select>
            ) : (
              <span className="tenue">{TIPOS_FUENTE[f.tipo].etiqueta}</span>
            )}
            <input
              type="text"
              className="form-entrada"
              aria-label={`Archivo fuente de ${f.etiqueta}`}
              title="Archivo fuente"
              maxLength={10}
              value={f.archivo}
              onChange={(e) => cambiar(f.clave, { archivo: e.target.value })}
            />
          </div>
        ))}
      </div>

      <label className="form-fila as400-fila-form">
        <span className="form-etiqueta">Biblioteca fuente</span>
        <input
          type="text"
          className="form-entrada"
          maxLength={10}
          autoFocus
          placeholder="Donde se guardan los fuentes"
          value={bibFuente}
          onChange={(e) => setBibFuente(e.target.value)}
        />
      </label>
      <label className="form-check">
        <input type="checkbox" checked={compilar} onChange={(e) => setCompilar(e.target.checked)} />
        Compilar después de enviar
      </label>
      {compilar && (
        <>
          <label className="form-fila as400-fila-form">
            <span className="form-etiqueta">Biblioteca de compilación</span>
            <input
              type="text"
              className="form-entrada"
              maxLength={10}
              placeholder="Donde queda el objeto"
              value={bibObjeto}
              onChange={(e) => setBibObjeto(e.target.value)}
            />
          </label>
          <label className="form-fila as400-fila-form">
            <span className="form-etiqueta">Otras bibliotecas</span>
            <input
              type="text"
              className="form-entrada"
              placeholder="Opcional, p.ej. donde está la tabla"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
            />
          </label>
          <label className="form-check">
            <input type="checkbox" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)} />
            Reemplazar el objeto si ya existe
          </label>
        </>
      )}
      <label className="form-check">
        <input type="checkbox" checked={crearArchivo} onChange={(e) => setCrearArchivo(e.target.checked)} />
        Crear el archivo fuente si no existe
      </label>
      <label className="form-check">
        <input type="checkbox" checked={copiaLocal} onChange={(e) => setCopiaLocal(e.target.checked)} />
        Guardar también una copia de los fuentes en mi equipo
      </label>
      {avisoLocal && <p className="tenue">{avisoLocal}</p>}

      {compilar && incluidas.length > 0 && (
        <details className="as400-comandos">
          <summary>Comandos de compilación</summary>
          <pre>
            {normalizarNombre(bibObjeto) !== '' && normalizarNombre(bibFuente) !== ''
              ? incluidas.map((f) => comandoCompilacion(peticionDe(f))).join('\n')
              : 'Indica las bibliotecas para ver los comandos.'}
          </pre>
        </details>
      )}

      {error && (
        <p className="form-error as400-error" role="alert">
          {error}
        </p>
      )}

      {incluidas.map((f) => {
        const r = resultados[f.clave];
        if (!r) return null;
        return (
          <section key={f.clave} className="as400-resultado">
            <h4>
              {r.ok ? '✔' : '✖'} {f.etiqueta} {normalizarNombre(f.miembro)}
            </h4>
            <ListaPasos pasos={r.pasos} />
            {r.listado && (
              <details open={!r.ok}>
                <summary>Listado del compilador</summary>
                <pre className="as400-listado">{r.listado}</pre>
              </details>
            )}
          </section>
        );
      })}

      <div className="form-acciones">
        <button type="submit" disabled={enviando}>
          {enviando ? 'Enviando…' : compilar ? 'Enviar y compilar' : 'Enviar'}
        </button>
        <button type="button" className="boton-secundario" disabled={enviando} onClick={abrirConexion}>
          Conexión…
        </button>
        <button type="button" className="boton-secundario" disabled={enviando} onClick={cerrar}>
          Cerrar
        </button>
      </div>
    </form>
  );
}
