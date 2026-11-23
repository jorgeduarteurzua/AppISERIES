import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import iconv from 'iconv-lite';
import { parsearDspf } from '@core/parser/parserDspf';
import { crearPantalla } from '@core/edicion/operaciones';
import { LienzoEditable } from './LienzoEditable';
import { VisorPantalla } from './VisorPantalla';
import { PanelDds } from './PanelDds';
import { PanelDetalle } from './PanelDetalle';
import { BarraEdicion } from './BarraEdicion';
import { FormularioNuevaPantalla } from './FormularioNuevaPantalla';
import { FormularioNuevoRegistro } from './FormularioNuevoRegistro';
import { PanelPropiedades } from './propiedades/PanelPropiedades';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dirFuentes = join(__dirname, '../../../QDSPSRC');

const noop = () => {};

/** Dibuja en el servidor y quita los comentarios que React inserta entre fragmentos de texto. */
function dibujar(elemento: React.ReactElement): string {
  return renderToString(elemento).replace(/<!-- -->/g, '');
}

function esFuenteDds(texto: string): boolean {
  const lineas = texto.split('\n').filter((l) => l.trim().length > 0);
  return lineas.length > 0 && lineas.filter((l) => l[5] === 'A').length / lineas.length > 0.5;
}

describe('los componentes se dibujan sin errores con los fuentes reales', () => {
  const archivos = readdirSync(dirFuentes).filter((f) => f.toUpperCase().endsWith('.TXT'));

  for (const archivo of archivos) {
    const texto = iconv.decode(readFileSync(join(dirFuentes, archivo)), 'windows-1252');
    if (!esFuenteDds(texto)) continue;

    it(archivo, () => {
      const p = parsearDspf(texto, archivo);

      expect(dibujar(<PanelDds pantalla={p} />)).toContain('panel-dds-texto');
      expect(dibujar(<VisorPantalla pantalla={p} registro={null} />)).toContain('pantalla5250');
      expect(dibujar(<PanelPropiedades pantalla={p} registro={null} seleccionElemento={null} />)).toContain(
        'Problemas',
      );

      for (const registro of p.registros) {
        const html = dibujar(
          <LienzoEditable
            pantalla={p}
            registro={registro}
            seleccionId={registro.elementos[0]?.id ?? null}
            herramienta={null}
            onSeleccionar={noop}
            onColocar={noop}
            onMover={noop}
            onBorrar={noop}
            onCancelarHerramienta={noop}
          />,
        );
        expect(html).toContain(registro.nombre);

        expect(dibujar(<VisorPantalla pantalla={p} registro={registro} />)).toContain('pantalla5250-fila');
        expect(dibujar(<PanelDetalle pantalla={p} registro={registro} />)).toContain('Teclas');

        // Panel de propiedades con cada elemento seleccionado (constantes y campos).
        for (const el of registro.elementos) {
          const props = dibujar(
            <PanelPropiedades pantalla={p} registro={registro} seleccionElemento={el.id} />,
          );
          expect(props).toContain(el.tipo === 'campo' ? 'Campo seleccionado' : 'Texto seleccionado');
        }
      }
    });
  }
});

describe('formularios y barra', () => {
  it('se dibujan sin errores', () => {
    const p = crearPantalla('NUEVA');
    expect(dibujar(<BarraEdicion hayRegistro />)).toContain('Editar pantalla');
    expect(dibujar(<FormularioNuevaPantalla onCerrar={noop} />)).toContain('Nueva pantalla');
    expect(dibujar(<FormularioNuevoRegistro pantalla={p} onCerrar={noop} />)).toContain('Registro nuevo');
    expect(
      dibujar(<PanelPropiedades pantalla={p} registro={p.registros[0]} seleccionElemento={null} />),
    ).toContain('Registro REG01');
  });
});
