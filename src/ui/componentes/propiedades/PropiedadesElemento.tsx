import type { Elemento, TipoCampo, UsoCampo } from '@core/modelo/pantalla';
import {
  actualizarElemento,
  alternarAtributo,
  ATRIBUTOS_DISPLAY,
  colorDe,
  COLORES,
  eliminarElemento,
  establecerColor,
  tieneAtributo,
  type AtributoDisplay,
  type ParcheElemento,
} from '@core/edicion/operaciones';
import { useStore } from '../../estado/store';
import { EditorKeywords } from './EditorKeywords';
import { Etiquetado, EntradaIndicadores, EntradaNumero } from './controles';

const TIPOS_DATO: { valor: TipoCampo; texto: string }[] = [
  { valor: 'A', texto: 'A · Alfanumérico' },
  { valor: 'S', texto: 'S · Numérico (zoned)' },
  { valor: 'P', texto: 'P · Empaquetado' },
  { valor: 'B', texto: 'B · Binario' },
  { valor: 'Y', texto: 'Y · Numérico (solo dígitos)' },
  { valor: 'F', texto: 'F · Coma flotante' },
  { valor: 'L', texto: 'L · Fecha' },
  { valor: 'T', texto: 'T · Hora' },
  { valor: 'Z', texto: 'Z · Marca de tiempo' },
  { valor: '', texto: '(en blanco / heredado)' },
];

const USOS: { valor: UsoCampo; texto: string }[] = [
  { valor: 'ambos', texto: 'Entrada/salida (B)' },
  { valor: 'entrada', texto: 'Entrada (I)' },
  { valor: 'salida', texto: 'Salida (O)' },
  { valor: 'oculto', texto: 'Oculto (H)' },
  { valor: 'programa', texto: 'Programa a sistema (P)' },
];

const NOMBRE_ATRIBUTO: Record<AtributoDisplay, string> = {
  HI: 'Alta intensidad',
  UL: 'Subrayado',
  RI: 'Video inverso',
  BL: 'Parpadeo',
  ND: 'No visible',
  PR: 'Protegido',
};

const NOMBRE_COLOR: Record<string, string> = {
  GRN: 'Verde',
  WHT: 'Blanco',
  RED: 'Rojo',
  TRQ: 'Turquesa',
  YLW: 'Amarillo',
  PNK: 'Rosa',
  BLU: 'Azul',
};

const TIPOS_NUMERICOS = new Set(['S', 'P', 'Y', 'B', 'F', 'I']);

interface Props {
  regId: string;
  elemento: Elemento;
}

/** Propiedades de la constante o del campo seleccionado. */
export function PropiedadesElemento({ regId, elemento }: Props) {
  const modificar = useStore((s) => s.modificar);
  const aplicar = useStore((s) => s.aplicar);
  const pantalla = useStore((s) => s.pantalla);

  const cambiar = (parche: ParcheElemento, campo: string) =>
    modificar((p) => actualizarElemento(p, regId, elemento.id, parche), {
      clave: `el:${elemento.id}:${campo}`,
    });

  const eliminar = () => {
    if (!pantalla) return;
    aplicar(eliminarElemento(pantalla, regId, elemento.id), { seleccionar: null });
  };

  const esCampo = elemento.tipo === 'campo';
  const posicionable =
    elemento.tipo === 'constante' ||
    (elemento.uso !== 'oculto' && elemento.uso !== 'programa');
  const atributos = ATRIBUTOS_DISPLAY.filter((a) => a !== 'PR' || esCampo);

  return (
    <div className="form">
      {elemento.tipo === 'constante' ? (
        <Etiquetado etiqueta="Texto">
          <input
            type="text"
            className="form-entrada"
            value={elemento.texto}
            onChange={(e) => cambiar({ texto: e.target.value }, 'texto')}
          />
        </Etiquetado>
      ) : (
        <>
          <Etiquetado etiqueta="Nombre" ayuda="Hasta 10 caracteres: letras, números, #, $, @ y _">
            <input
              type="text"
              className="form-entrada"
              maxLength={10}
              value={elemento.nombre}
              disabled={elemento.sistema}
              onChange={(e) => cambiar({ nombre: e.target.value }, 'nombre')}
            />
          </Etiquetado>
          {!elemento.sistema && (
            <>
              <Etiquetado etiqueta="Tipo">
                <select
                  className="form-entrada"
                  value={elemento.tipoDato}
                  onChange={(e) => cambiar({ tipoDato: e.target.value as TipoCampo }, 'tipo')}
                >
                  {TIPOS_DATO.map((t) => (
                    <option key={t.valor} value={t.valor}>
                      {t.texto}
                    </option>
                  ))}
                </select>
              </Etiquetado>
              <Etiquetado etiqueta="Longitud">
                <EntradaNumero
                  valor={elemento.longitud}
                  minimo={0}
                  maximo={32767}
                  onCambio={(n) => cambiar({ longitud: n }, 'longitud')}
                />
              </Etiquetado>
              <Etiquetado etiqueta="Decimales">
                <EntradaNumero
                  valor={elemento.decimales}
                  minimo={0}
                  maximo={31}
                  deshabilitado={!TIPOS_NUMERICOS.has(elemento.tipoDato)}
                  onCambio={(n) => cambiar({ decimales: n }, 'decimales')}
                />
              </Etiquetado>
              <Etiquetado etiqueta="Uso">
                <select
                  className="form-entrada"
                  value={elemento.uso}
                  onChange={(e) => {
                    const uso = e.target.value as UsoCampo;
                    const visible = uso !== 'oculto' && uso !== 'programa';
                    // Un campo que pasa a ser visible necesita una posición.
                    const parche: ParcheElemento =
                      visible && elemento.fila === null ? { uso, fila: 1, columna: 1 } : { uso };
                    cambiar(parche, 'uso');
                  }}
                >
                  {USOS.map((u) => (
                    <option key={u.valor} value={u.valor}>
                      {u.texto}
                    </option>
                  ))}
                </select>
              </Etiquetado>
              <Etiquetado etiqueta="Referencia" ayuda="Toma la definición de un archivo (REFFLD)">
                <input
                  type="checkbox"
                  checked={elemento.referencia}
                  onChange={(e) => cambiar({ referencia: e.target.checked }, 'referencia')}
                />
              </Etiquetado>
            </>
          )}
        </>
      )}

      <div className="form-par">
        <Etiquetado etiqueta="Fila">
          <EntradaNumero
            valor={elemento.fila}
            minimo={1}
            deshabilitado={!posicionable}
            onCambio={(n) => cambiar({ fila: n }, 'fila')}
          />
        </Etiquetado>
        <Etiquetado etiqueta="Columna">
          <EntradaNumero
            valor={elemento.columna}
            minimo={1}
            deshabilitado={!posicionable}
            onCambio={(n) => cambiar({ columna: n }, 'columna')}
          />
        </Etiquetado>
      </div>

      <fieldset className="form-grupo">
        <legend>Atributos de pantalla</legend>
        {atributos.map((a) => (
          <label className="form-check" key={a}>
            <input
              type="checkbox"
              checked={tieneAtributo(elemento, a)}
              onChange={() => modificar((p) => alternarAtributo(p, regId, elemento.id, a))}
            />
            <code>{a}</code> {NOMBRE_ATRIBUTO[a]}
          </label>
        ))}
      </fieldset>

      <Etiquetado etiqueta="Color">
        <select
          className="form-entrada"
          value={colorDe(elemento) ?? ''}
          onChange={(e) =>
            modificar((p) => establecerColor(p, regId, elemento.id, e.target.value || null))
          }
        >
          <option value="">Sin color fijo</option>
          {COLORES.map((c) => (
            <option key={c} value={c}>
              {NOMBRE_COLOR[c]} ({c})
            </option>
          ))}
        </select>
      </Etiquetado>

      <Etiquetado
        etiqueta="Indicadores"
        ayuda="Hasta 3 por condición; espacio = Y, | = O (p.ej. N30 99 | 40)"
      >
        <EntradaIndicadores
          valor={{ indicadores: elemento.indicadores, alternativas: elemento.alternativas }}
          onCambio={(c) => cambiar({ indicadores: c.indicadores, alternativas: c.alternativas }, 'indicadores')}
        />
      </Etiquetado>

      <h4>Keywords</h4>
      <EditorKeywords
        destino={{ tipo: 'elemento', regId, elId: elemento.id }}
        keywords={elemento.keywords}
        clave={`el:${elemento.id}`}
      />

      <div className="form-acciones">
        <button type="button" className="boton-peligro" onClick={eliminar}>
          Eliminar {elemento.tipo === 'campo' ? 'campo' : 'texto'}
        </button>
      </div>
    </div>
  );
}
