import type { CampoTabla } from '@core/tablas/modelo';
import {
  actualizarCampo,
  aliasDe,
  encabezadosDe,
  establecerAlias,
  establecerEncabezados,
  establecerNulos,
  establecerPorDefecto,
  establecerTexto,
  permiteNulos,
  porDefectoDe,
  textoDe,
  TIPOS_CON_DECIMALES,
  TIPOS_SIN_LONGITUD,
  TIPOS_TABLA,
} from '@core/tablas/operacionesTabla';
import { useTablas } from '../estado/storeTablas';
import { EntradaNumero, Etiquetado } from '../componentes/propiedades/controles';
import { EditorCondicion } from './EditorCondicion';
import { EditorKeywordsTabla } from './EditorKeywordsTabla';

interface Props {
  regId: string;
  campo: CampoTabla;
  /** En un lógico el campo tiene «uso» (I, B, N) y puede no tener tipo ni longitud propios. */
  logico: boolean;
}

/** Keywords que tienen su propio control arriba y no se repiten en la lista general. */
const KEYWORDS_CON_CONTROL = ['COLHDG', 'TEXT', 'ALIAS', 'DFT', 'ALWNULL', 'VALUES', 'RANGE', 'COMP'];

/** Comentarios (`A*`) que van antes del campo: una línea por comentario. */
function aTexto(comentarios: string[]): string {
  return comentarios.join('\n');
}
function aComentarios(texto: string): string[] {
  if (texto === '') return [];
  return texto.split('\n').map((l) => (l === '' || l.startsWith(' ') ? l : ` ${l}`));
}

/** Todas las propiedades del campo seleccionado. */
export function PropiedadesCampo({ regId, campo, logico }: Props) {
  const modificar = useTablas((s) => s.modificar);
  const clave = (p: string) => ({ clave: `campo:${campo.id}:${p}` });
  const cambiar = (parche: Parameters<typeof actualizarCampo>[3], propiedad: string) =>
    modificar((t) => actualizarCampo(t, regId, campo.id, parche), clave(propiedad));

  const encabezados = encabezadosDe(campo);
  const lineaCabecera = (i: number, valor: string) => {
    const lineas = [encabezados[0] ?? '', encabezados[1] ?? '', encabezados[2] ?? ''];
    lineas[i] = valor;
    modificar((t) => establecerEncabezados(t, regId, campo.id, lineas), clave(`colhdg${i}`));
  };

  return (
    <div className="form">
      <Etiquetado etiqueta="Nombre" ayuda="Hasta 10 caracteres: letras, números, #, $, @ y _">
        <input
          type="text"
          className="form-entrada"
          maxLength={10}
          value={campo.nombre}
          onChange={(e) => cambiar({ nombre: e.target.value }, 'nombre')}
        />
      </Etiquetado>
      <Etiquetado etiqueta="Tipo">
        <select
          className="form-entrada"
          value={campo.tipoDato}
          onChange={(e) => cambiar({ tipoDato: e.target.value }, 'tipo')}
        >
          {TIPOS_TABLA.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.texto}
            </option>
          ))}
          {!TIPOS_TABLA.some((t) => t.valor === campo.tipoDato) && <option value={campo.tipoDato}>{campo.tipoDato}</option>}
        </select>
      </Etiquetado>
      <div className="form-par">
        <Etiquetado etiqueta="Longitud">
          <EntradaNumero
            valor={campo.longitud}
            minimo={0}
            maximo={32766}
            deshabilitado={TIPOS_SIN_LONGITUD.has(campo.tipoDato)}
            onCambio={(n) => cambiar({ longitud: n }, 'longitud')}
          />
        </Etiquetado>
        <Etiquetado etiqueta="Decimales">
          <EntradaNumero
            valor={campo.decimales}
            minimo={0}
            maximo={31}
            deshabilitado={!TIPOS_CON_DECIMALES.has(campo.tipoDato)}
            onCambio={(n) => cambiar({ decimales: n }, 'decimales')}
          />
        </Etiquetado>
      </div>
      {logico && (
        <Etiquetado etiqueta="Uso" ayuda="Columna 38: I entrada, B ambos, N sin acceso">
          <select className="form-entrada" value={campo.uso} onChange={(e) => cambiar({ uso: e.target.value }, 'uso')}>
            <option value="">(en blanco)</option>
            <option value="I">I · Solo entrada</option>
            <option value="B">B · Entrada y salida</option>
            <option value="N">N · Neutro</option>
          </select>
        </Etiquetado>
      )}
      <label className="form-check" title="Toma la definición de un archivo de referencia (R en la columna 29)">
        <input
          type="checkbox"
          checked={campo.referencia}
          onChange={(e) => cambiar({ referencia: e.target.checked }, 'referencia')}
        />
        Campo de referencia (REFFLD)
      </label>

      <h4>Textos</h4>
      {[0, 1, 2].map((i) => (
        <Etiquetado key={i} etiqueta={i === 0 ? 'Cabecera' : ''} ayuda="Encabezado de columna (COLHDG): hasta 3 líneas de 20 caracteres">
          <input
            type="text"
            className="form-entrada"
            aria-label={`Línea ${i + 1} del encabezado`}
            maxLength={20}
            value={encabezados[i] ?? ''}
            onChange={(e) => lineaCabecera(i, e.target.value)}
          />
        </Etiquetado>
      ))}
      <Etiquetado etiqueta="Descripción" ayuda="TEXT: hasta 50 caracteres">
        <input
          type="text"
          className="form-entrada"
          maxLength={50}
          value={textoDe(campo)}
          onChange={(e) => modificar((t) => establecerTexto(t, regId, campo.id, e.target.value), clave('texto'))}
        />
      </Etiquetado>
      <Etiquetado etiqueta="Alias" ayuda="Nombre largo del campo (ALIAS), para SQL">
        <input
          type="text"
          className="form-entrada"
          value={aliasDe(campo)}
          onChange={(e) => modificar((t) => establecerAlias(t, regId, campo.id, e.target.value), clave('alias'))}
        />
      </Etiquetado>

      <h4>Valores</h4>
      <Etiquetado etiqueta="Por defecto" ayuda="DFT: tal como se escribe en DDS, por ejemplo 'A' o 0">
        <input
          type="text"
          className="form-entrada"
          placeholder="'A'  ó  0"
          value={porDefectoDe(campo)}
          onChange={(e) => modificar((t) => establecerPorDefecto(t, regId, campo.id, e.target.value), clave('dft'))}
        />
      </Etiquetado>
      <label className="form-check">
        <input
          type="checkbox"
          checked={permiteNulos(campo)}
          onChange={(e) => modificar((t) => establecerNulos(t, regId, campo.id, e.target.checked))}
        />
        Permite nulos (ALWNULL)
      </label>
      <EditorCondicion regId={regId} campo={campo} />

      <h4>Notas</h4>
      <textarea
        className="form-entrada notas"
        aria-label="Notas del campo (comentarios del fuente antes del campo)"
        placeholder="Comentarios del fuente que van antes de este campo"
        rows={3}
        value={aTexto(campo.comentarios)}
        onChange={(e) => cambiar({ comentarios: aComentarios(e.target.value) }, 'notas')}
      />

      <h4>Otras keywords</h4>
      <EditorKeywordsTabla
        destino={{ tipo: 'elemento', regId, elId: campo.id }}
        keywords={campo.keywords}
        clave={`campo:${campo.id}`}
        ocultar={(k) => KEYWORDS_CON_CONTROL.includes(k.nombre)}
      />
    </div>
  );
}
