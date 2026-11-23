// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import iconv from 'iconv-lite';
import { SeccionTablas } from '../SeccionTablas';
import { useTablas, type VistaTabla } from '../estado/storeTablas';
import { camposDe, llavesDe, type Tabla } from '@core/tablas/modelo';
import { parsearTabla } from '@core/tablas/parserTabla';
import { dirFuentesTablas } from '@core/tablas/fuentesPrueba';

const archivos = readdirSync(dirFuentesTablas).filter((f) => f.toUpperCase().endsWith('.TXT'));
const tablas = new Map<string, Tabla>(
  archivos.map((f) => [
    f.slice(32).replace(/\.TXT$/i, ''),
    parsearTabla(iconv.decode(readFileSync(join(dirFuentesTablas, f)), 'windows-1252'), f),
  ]),
);
const catalogo = Object.fromEntries(tablas);

beforeEach(() => {
  localStorage.clear();
  useTablas.setState(useTablas.getInitialState(), true);
});

afterEach(() => cleanup());

/** Cambia el estado del store como lo haría una acción de la interfaz. */
const poner = (estado: Partial<ReturnType<typeof useTablas.getState>>) => act(() => useTablas.setState(estado));
const texto = () => document.body.textContent ?? '';

describe('la sección de tablas se dibuja con los 48 fuentes reales', () => {
  for (const [nombre, tabla] of tablas) {
    it(nombre, () => {
      const registro = tabla.registros[0];
      const base = { tabla, catalogo, registroId: registro.id, nombreArchivoActual: `${nombre}.TXT` };
      const vista = (v: VistaTabla, seleccion: string | null = null) => poner({ ...base, seleccion, vista: v });

      render(<SeccionTablas />);

      // Cuadrícula, sin selección: está el título, el encabezado «Llave» y las llaves del panel lateral.
      vista('campos');
      expect(texto()).toContain('Tablas (PF / LF)');
      if (camposDe(registro).length > 0) {
        expect(document.querySelectorAll('tbody tr')).toHaveLength(camposDe(registro).length);
      } else {
        // Un lógico sin lista de campos hereda todos los del físico y no muestra cuadrícula.
        expect(document.querySelector('table')).toBeNull();
        expect(texto()).toContain('hereda todos los del físico');
      }
      for (const k of llavesDe(registro)) expect(texto()).toContain(k.nombre);

      // Con cada campo seleccionado se dibujan sus propiedades.
      for (const c of camposDe(registro)) {
        vista('campos', c.id);
        expect(document.querySelector('h3')).not.toBeNull();
        expect(texto()).toContain(`Campo ${c.nombre}`);
      }

      // Vistas de DDS y SQL.
      vista('dds');
      expect(document.querySelector('pre[aria-label="Fuente DDS generado"]')?.textContent).toContain(`R ${registro.nombre}`);
      vista('sql');
      expect(document.querySelector('pre[aria-label="SQL generado"]')?.textContent).toMatch(
        /CREATE (TABLE|UNIQUE INDEX|INDEX|VIEW)/,
      );
    });
  }
});

describe('estados vacíos', () => {
  it('sin tabla muestra la invitación a abrir o crear', () => {
    render(<SeccionTablas />);
    expect(texto()).toContain('Abre un archivo de la lista o crea una tabla nueva.');
  });
});
