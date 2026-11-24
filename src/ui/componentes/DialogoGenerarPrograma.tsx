import { useMemo, useState } from 'react';
import { archivoDeReferencia } from '@core/edicion/camposDeArchivo';
import { formatosIniciales, generarProgramaPantalla } from '@core/generador/generadorProgramaPantalla';
import type { TipoProgramaPantalla } from '@core/generador/generadorProgramaPantalla';
import { useNavegacion } from '../estado/navegacion';
import { nombreCortoPantalla } from '../estado/nombres';
import { useProgramas } from '../estado/storeProgramas';
import { useStore } from '../estado/store';
import { resolverDesde, useTablas } from '../estado/storeTablas';

const CLAVE_AUTOR = 'appiseries.autor';

function autorGuardado(): string {
  try {
    return window.localStorage.getItem(CLAVE_AUTOR) ?? '';
  } catch {
    return '';
  }
}

const TIPOS: Array<{ tipo: TipoProgramaPantalla; texto: string }> = [
  { tipo: 'CBL', texto: 'COBOL con E/S nativa, OPM (CRTCBLPGM)' },
  { tipo: 'CBLLE', texto: 'COBOL ILE con E/S nativa (CRTBNDCBL)' },
  { tipo: 'SQLCBL', texto: 'COBOL con SQL, OPM (CRTSQLCBL)' },
  { tipo: 'SQLCBLLE', texto: 'COBOL ILE con SQL (CRTSQLCBLI)' },
];

/** Genera el programa COBOL que atiende la pantalla abierta y lo abre en Programas. */
export function DialogoGenerarPrograma({ onCerrar }: { onCerrar: () => void }) {
  const pantalla = useStore((s) => s.pantalla);
  const nombreArchivo = useStore((s) => s.nombreArchivoActual);
  const catalogo = useTablas((s) => s.catalogo);
  const biblioteca = useTablas((s) => s.biblioteca);
  const carpetaPantallas = useStore((s) => s.carpeta);
  const [busqueda, setBusqueda] = useState<string | null>(null);
  const irA = useNavegacion((s) => s.irA);

  const nombrePantalla = useMemo(
    () => nombreCortoPantalla(nombreArchivo ?? pantalla?.nombre ?? 'PANTALLA').replace(/\.[A-Za-z]+$/, '').toUpperCase().slice(0, 10),
    [nombreArchivo, pantalla],
  );
  const formatos = useMemo(() => (pantalla ? formatosIniciales(pantalla) : []), [pantalla]);
  // Se propone el control del primer subfile, o el primer formato.
  const propuesto = pantalla?.registros.find((r) => r.clase === 'control-subfile')?.nombre ?? formatos[0] ?? '';
  const [programa, setPrograma] = useState(() => `${nombrePantalla.replace(/D$/, '').slice(0, 9)}P`);
  const [tipo, setTipo] = useState<TipoProgramaPantalla>('CBL');
  const [inicial, setInicial] = useState(propuesto);
  const [autor, setAutor] = useState(autorGuardado);
  const [bibliotecaDatos, setBibliotecaDatos] = useState(biblioteca);

  // Archivos de los campos con REFFLD, para avisar si alguno no está abierto en Tablas.
  const archivos = useMemo(() => {
    const n = new Set<string>();
    for (const r of pantalla?.registros ?? []) {
      for (const e of r.elementos) {
        const ref = e.tipo === 'campo' ? archivoDeReferencia(e) : null;
        if (ref) n.add(ref.archivo);
      }
    }
    return [...n].sort();
  }, [pantalla]);

  const sql = tipo === 'SQLCBL' || tipo === 'SQLCBLLE';
  const faltan = archivos.filter((a) => !catalogo[a]);

  /** Los archivos se leen de Tablas: se abre la carpeta de la pantalla (o la que se elija) para encontrarlos. */
  const buscar = async (propia: boolean) => {
    setBusqueda(null);
    const tablas = useTablas.getState();
    if (propia && carpetaPantallas) await tablas.abrirCarpetaEn(carpetaPantallas);
    else await tablas.abrirCarpeta();
    const quedan = archivos.filter((a) => !useTablas.getState().catalogo[a]);
    setBusqueda(quedan.length === 0 ? 'Archivos encontrados.' : `No se encontró ${quedan.join(', ')} en esa carpeta.`);
  };
  const resultado = useMemo(() => {
    if (!pantalla) return null;
    try {
      return {
        ...generarProgramaPantalla(pantalla, {
          nombrePrograma: programa,
          nombrePantalla,
          tipo,
          autor,
          formatoInicial: inicial,
          bibliotecaDatos: sql ? bibliotecaDatos : '',
          resolverArchivo: resolverDesde(catalogo),
        }),
        error: null as string | null,
      };
    } catch (e) {
      return { cobol: '', advertencias: [] as string[], error: e instanceof Error ? e.message : String(e) };
    }
  }, [pantalla, programa, nombrePantalla, tipo, autor, inicial, sql, bibliotecaDatos, catalogo]);

  if (!pantalla) return null;

  const abrir = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resultado || resultado.error) return;
    try {
      window.localStorage.setItem(CLAVE_AUTOR, autor);
    } catch {
      // Sin almacenamiento: no se recuerda el autor.
    }
    if (useProgramas.getState().abrirGenerado(resultado.cobol, tipo, programa)) {
      irA('programas');
      onCerrar();
    }
  };

  return (
    <form className="formulario-flotante dialogo-generar" role="dialog" aria-label="Generar programa" onSubmit={abrir}>
      <h3>Generar programa de {nombrePantalla}</h3>
      <p className="tenue">
        Crea el programa COBOL que atiende la pantalla: un párrafo por formato con sus teclas, la carga de cada subfile y, para
        los campos que vienen de un archivo (REFFLD), la lectura y grabación de los datos. Se abre en Programas para completarlo.
      </p>
      <div className="campos-archivo-opciones">
        <label className="form-fila">
          <span className="form-etiqueta">Programa</span>
          <input className="form-entrada" aria-label="Nombre del programa" maxLength={10} value={programa} onChange={(e) => setPrograma(e.target.value.toUpperCase())} />
        </label>
        <label className="form-fila">
          <span className="form-etiqueta">Generar como</span>
          <select className="form-entrada" aria-label="Tipo de programa" value={tipo} onChange={(e) => setTipo(e.target.value as TipoProgramaPantalla)}>
            {TIPOS.map((t) => (
              <option key={t.tipo} value={t.tipo}>
                {t.texto}
              </option>
            ))}
          </select>
        </label>
        <label className="form-fila">
          <span className="form-etiqueta">Parte por</span>
          <select className="form-entrada" aria-label="Formato inicial" value={inicial} onChange={(e) => setInicial(e.target.value)}>
            {formatos.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="form-fila">
          <span className="form-etiqueta">Autor</span>
          <input className="form-entrada" aria-label="Autor" maxLength={30} value={autor} onChange={(e) => setAutor(e.target.value)} />
        </label>
        {sql && (
          <label className="form-fila">
            <span className="form-etiqueta">Biblioteca de los datos</span>
            <input
              className="form-entrada"
              aria-label="Biblioteca de los datos"
              maxLength={10}
              placeholder="Opcional: si no, la lista de bibliotecas"
              value={bibliotecaDatos}
              onChange={(e) => setBibliotecaDatos(e.target.value.toUpperCase())}
            />
          </label>
        )}
      </div>
      <p className="tenue">
        {archivos.length === 0
          ? 'La pantalla no tiene campos de archivos: el programa sale como esqueleto. Use «Campos de un archivo…» para agregarlos.'
          : `Archivos de la pantalla: ${archivos.map((a) => `${a}${catalogo[a] ? '' : ' (no está abierto en Tablas)'}`).join(', ')}.`}
      </p>
      {(faltan.length > 0 || busqueda) && (
        <p className="tenue">
          {faltan.length > 0 && carpetaPantallas && (
            <button type="button" className="boton-secundario" onClick={() => void buscar(true)}>
              Buscar en la carpeta de la pantalla
            </button>
          )}{' '}
          {faltan.length > 0 && (
            <button type="button" className="boton-secundario" onClick={() => void buscar(false)}>
              Abrir carpeta de archivos…
            </button>
          )}{' '}
          {busqueda}
        </p>
      )}
      {resultado?.error && (
        <p className="form-error" role="alert">
          {resultado.error}
        </p>
      )}
      {resultado && !resultado.error && resultado.advertencias.length > 0 && (
        <ul className="lista-compacta" aria-label="Avisos del programa">
          {resultado.advertencias.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      {resultado && !resultado.error && (
        <pre className="as400-listado" aria-label="Programa generado">
          {resultado.cobol}
        </pre>
      )}
      <div className="form-acciones">
        <button type="submit" disabled={!resultado || resultado.error !== null}>
          Abrir en Programas
        </button>
        <button type="button" className="boton-secundario" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
