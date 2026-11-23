import {
  colorCss,
  type AtributosCelda,
  type Celda,
  type MatrizLienzo,
} from '@core/render/lienzo';

interface Tramo {
  texto: string;
  attr: AtributosCelda;
}

function mismoEstilo(a: AtributosCelda, b: AtributosCelda): boolean {
  return (
    a.color === b.color &&
    a.altaIntensidad === b.altaIntensidad &&
    a.subrayado === b.subrayado &&
    a.inverso === b.inverso &&
    a.noVisible === b.noVisible
  );
}

/** Agrupa celdas consecutivas con el mismo estilo en un solo tramo de texto. */
function agruparTramos(fila: Celda[]): Tramo[] {
  const tramos: Tramo[] = [];
  for (const celda of fila) {
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && mismoEstilo(ultimo.attr, celda.attr)) ultimo.texto += celda.caracter;
    else tramos.push({ texto: celda.caracter, attr: celda.attr });
  }
  return tramos;
}

function estiloTramo(a: AtributosCelda): React.CSSProperties {
  const color = colorCss(a);
  return {
    color: a.inverso ? '#000' : color,
    background: a.inverso ? color : 'transparent',
    fontWeight: a.altaIntensidad ? 700 : 400,
    textDecoration: a.subrayado ? 'underline' : 'none',
    opacity: a.noVisible ? 0 : 1,
  };
}

/**
 * Filas de la pantalla 5250. Cada fila es texto continuo (sin ancho fijo por
 * celda) para que los subrayados y fondos no tengan cortes.
 */
export function FilasLienzo({ matriz }: { matriz: MatrizLienzo }) {
  return (
    <>
      {matriz.celdas.map((fila, f) => (
        <div className="pantalla5250-fila" key={f}>
          {agruparTramos(fila).map((t, i) => (
            <span style={estiloTramo(t.attr)} key={i}>
              {t.texto}
            </span>
          ))}
        </div>
      ))}
    </>
  );
}
