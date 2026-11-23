import { useState } from 'react';
import type { ConexionPublica, PasoEnvio } from '@core/as400/tipos';
import { validarConexion } from '@core/as400/validacion';
import { useAs400 } from '../estado/as400';
import { ListaPasos } from './ListaPasos';

/** Datos de conexión al AS400. La contraseña se guarda cifrada y se puede cambiar o borrar. */
export function DialogoConexionAs400() {
  const abierta = useAs400((s) => s.conexionAbierta);
  const conexion = useAs400((s) => s.conexion);
  const errorConexion = useAs400((s) => s.errorConexion);
  const cerrar = useAs400((s) => s.cerrarConexion);

  if (!abierta) return null;
  if (!conexion) {
    return (
      <div className="formulario-flotante as400-dialogo" role="dialog" aria-label="Conexión al AS400">
        <h3>Conexión al AS400</h3>
        <p className="form-error">{errorConexion ?? 'Cargando…'}</p>
        <div className="form-acciones">
          <button type="button" className="boton-secundario" onClick={cerrar}>
            Cerrar
          </button>
        </div>
      </div>
    );
  }
  return <Formulario conexion={conexion} cerrar={cerrar} />;
}

function Formulario({ conexion, cerrar }: { conexion: ConexionPublica; cerrar: () => void }) {
  const establecerConexion = useAs400((s) => s.establecerConexion);
  const [host, setHost] = useState(conexion.host);
  const [puerto, setPuerto] = useState(String(conexion.puerto));
  const [usuario, setUsuario] = useState(conexion.usuario);
  const [seguro, setSeguro] = useState(conexion.seguro);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pasos, setPasos] = useState<PasoEnvio[] | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Guarda los datos. Devuelve true si quedaron guardados.
  const guardar = async (): Promise<boolean> => {
    const entrada = {
      host: host.trim(),
      puerto: Number(puerto),
      usuario: usuario.trim(),
      seguro,
      password: password === '' ? undefined : password,
    };
    const errores = validarConexion(entrada);
    if (errores.length > 0) {
      setError(errores.join(' '));
      return false;
    }
    const r = await window.api.as400.guardar(entrada);
    if (r.error || !r.conexion) {
      setError(r.error ?? 'No se pudo guardar.');
      return false;
    }
    establecerConexion(r.conexion);
    setPassword('');
    setError(null);
    return true;
  };

  const ejecutar = async (probar: boolean) => {
    setOcupado(true);
    setPasos(null);
    try {
      const guardada = await guardar();
      if (guardada && probar) setPasos(await window.api.as400.probar());
      else if (guardada) cerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };

  const olvidar = async () => {
    if (!window.confirm('¿Borrar la contraseña guardada? La próxima vez tendrás que escribirla.')) return;
    const r = await window.api.as400.olvidarPassword();
    if (r.conexion) establecerConexion(r.conexion);
    if (r.error) setError(r.error);
  };

  return (
    <form
      className="formulario-flotante as400-dialogo"
      role="dialog"
      aria-label="Conexión al AS400"
      onSubmit={(e) => {
        e.preventDefault();
        void ejecutar(true);
      }}
    >
      <h3>Conexión al AS400 (FTP)</h3>
      <label className="form-fila">
        <span className="form-etiqueta">Servidor</span>
        <input
          type="text"
          className="form-entrada"
          autoFocus
          placeholder="Nombre o dirección IP"
          value={host}
          onChange={(e) => setHost(e.target.value)}
        />
      </label>
      <label className="form-fila">
        <span className="form-etiqueta">Puerto</span>
        <input
          type="number"
          className="form-entrada"
          min={1}
          max={65535}
          value={puerto}
          onChange={(e) => setPuerto(e.target.value)}
        />
      </label>
      <label className="form-fila">
        <span className="form-etiqueta">Usuario</span>
        <input
          type="text"
          className="form-entrada"
          maxLength={10}
          autoComplete="off"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
        />
      </label>
      <label className="form-fila">
        <span className="form-etiqueta">Contraseña</span>
        <input
          type="password"
          className="form-entrada"
          autoComplete="new-password"
          placeholder={conexion.tienePassword ? 'Guardada. Escribe para cambiarla' : ''}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <label className="form-check">
        <input type="checkbox" checked={seguro} onChange={(e) => setSeguro(e.target.checked)} />
        FTP seguro (FTPS)
      </label>
      {!seguro && (
        <p className="tenue">Con FTP simple la contraseña y los fuentes viajan sin cifrar por la red.</p>
      )}
      {!conexion.cifradoDisponible && (
        <p className="form-error">
          Este equipo no puede cifrar la contraseña: se conserva solo mientras la aplicación esté abierta.
        </p>
      )}
      {conexion.passwordSoloSesion && <p className="tenue">La contraseña está solo en memoria (esta sesión).</p>}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {pasos && <ListaPasos pasos={pasos} />}

      <div className="form-acciones">
        <button type="submit" disabled={ocupado}>
          {ocupado ? 'Probando…' : 'Guardar y probar'}
        </button>
        <button type="button" className="boton-secundario" disabled={ocupado} onClick={() => void ejecutar(false)}>
          Guardar
        </button>
        {conexion.tienePassword && (
          <button type="button" className="boton-peligro" disabled={ocupado} onClick={() => void olvidar()}>
            Borrar contraseña
          </button>
        )}
        <button type="button" className="boton-secundario" onClick={cerrar}>
          Cerrar
        </button>
      </div>
    </form>
  );
}
