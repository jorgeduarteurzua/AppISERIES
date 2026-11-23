// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import iconv from 'iconv-lite';
import { dirFuentesTablas } from '@core/tablas/fuentesPrueba';
import { parsearTabla } from '@core/tablas/parserTabla';
import { DialogoCrud } from './DialogoCrud';
import { SeccionTablas } from '../SeccionTablas';
import { fuentesDelConjunto, guardarEdicionAhora, useConjuntoCrud } from '../estado/conjuntoCrud';
import { leerCrudGuardado } from '../estado/crudGuardado';
import { useAs400 } from '../estado/as400';
import { useNavegacion } from '../estado/navegacion';
import { useStore } from '../estado/store';
import { useTablas } from '../estado/storeTablas';

const archivo = readdirSync(dirFuentesTablas).find((n) => n.endsWith('ASQRY03F.TXT'))!;
const tabla = parsearTabla(iconv.decode(readFileSync(join(dirFuentesTablas, archivo)), 'windows-1252'), archivo);

const dds = async () => (await screen.findByLabelText(/^Fuente DDS/)).textContent ?? '';
const abrir = () => render(<DialogoCrud tabla={tabla} nombre="ASQRY03F" onCerrar={() => undefined} />);
const generar = () => fireEvent.click(screen.getByRole('button', { name: /^Generar( de nuevo)?$/ }));
const cobol = () => {
  fireEvent.click(screen.getByRole('tab', { name: 'Programa (COBOL)' }));
  return screen.getByLabelText('Fuente COBOL generado').textContent ?? '';
};

/** Simula cerrar la aplicación: se pierde todo lo que está en memoria, queda el localStorage. */
function reiniciarAplicacion() {
  cleanup();
  useConjuntoCrud.setState({ conjunto: null });
  useStore.setState(useStore.getInitialState(), true);
  useTablas.setState(useTablas.getInitialState(), true);
}

beforeEach(() => {
  localStorage.clear();
  useAs400.setState(useAs400.getInitialState(), true);
  useNavegacion.setState(useNavegacion.getInitialState(), true);
  useStore.setState(useStore.getInitialState(), true);
  useTablas.setState(useTablas.getInitialState(), true);
  useConjuntoCrud.setState({ conjunto: null });
  window.confirm = () => true;
});
afterEach(() => cleanup());

describe('validaciones en el diálogo del CRUD', () => {
  it('por omisión no se valida nada; la llave es obligatoria y no se puede cambiar', () => {
    abrir();
    expect(screen.getByText('Sí (llave)')).toBeTruthy();
    expect((screen.getByLabelText('Obligatorio DESEVE') as HTMLSelectElement).value).toBe('no');
    expect((screen.getByLabelText('Validación de DESEVE') as HTMLSelectElement).value).toBe('');
  });

  it('obligatorio y email llegan a la pantalla y al programa', async () => {
    abrir();
    fireEvent.change(screen.getByLabelText('Obligatorio DESEVE'), { target: { value: 'si' } });
    fireEvent.change(screen.getByLabelText('Validación de DESEVE'), { target: { value: 'email' } });
    generar();
    const texto = await dds();
    expect(texto).toContain('CHECK(LC)');
    expect(texto).toContain('DSPATR(RI PC)');
    const programa = cobol();
    expect(programa).toContain('IF DESEVE-WS = SPACES');
    expect(programa).toContain('PERFORM VALIDA-EMAIL');
  });

  it('valores permitidos y existe en tabla piden sus datos', async () => {
    abrir();
    fireEvent.change(screen.getByLabelText('Validación de USRCRE'), { target: { value: 'valores' } });
    fireEvent.change(screen.getByLabelText('Valores permitidos de USRCRE'), { target: { value: 'jduarte,admin' } });
    fireEvent.change(screen.getByLabelText('Validación de DESEVE'), { target: { value: 'existe' } });
    fireEvent.change(screen.getByLabelText('Tabla de DESEVE'), { target: { value: 'eventos' } });
    fireEvent.change(screen.getByLabelText('Columna de DESEVE'), { target: { value: 'deseve' } });
    generar();
    await dds();
    const programa = cobol();
    expect(programa).toMatch(/IF USRCRE-WS NOT = "JDUARTE"\n +AND USRCRE-WS NOT = "ADMIN"/);
    expect(programa).toContain('FROM EVENTOS');
  });

  it('un error de la validación se muestra sin generar', async () => {
    abrir();
    fireEvent.change(screen.getByLabelText('Validación de USRCRE'), { target: { value: 'valores' } });
    generar();
    expect(await screen.findByText(/Indique los valores permitidos de USRCRE/)).toBeTruthy();
  });
});

describe('el CRUD se recuerda por tabla', () => {
  it('al volver a abrir el diálogo quedan las opciones marcadas y el último CRUD generado', async () => {
    abrir();
    fireEvent.change(screen.getByLabelText('Tipo de pantalla', { exact: false }) as HTMLElement, { target: { value: 'window' } });
    fireEvent.change(screen.getByLabelText('Obligatorio DESEVE'), { target: { value: 'si' } });
    fireEvent.click(screen.getByLabelText('USRCRE en el detalle'));
    generar();
    const primero = await dds();
    reiniciarAplicacion();

    abrir();
    expect((screen.getByLabelText('Obligatorio DESEVE') as HTMLSelectElement).value).toBe('si');
    expect((screen.getByLabelText('USRCRE en el detalle') as HTMLInputElement).checked).toBe(false);
    // Sin pulsar Generar, ya se ve lo último.
    expect(await dds()).toBe(primero);
    expect(primero).toContain('WINDOW(');
  });

  it('lo marcado se guarda aunque no se genere', () => {
    abrir();
    fireEvent.change(screen.getByLabelText('Obligatorio DESEVE'), { target: { value: 'si' } });
    reiniciarAplicacion();
    abrir();
    expect((screen.getByLabelText('Obligatorio DESEVE') as HTMLSelectElement).value).toBe('si');
    expect(screen.queryByLabelText(/^Fuente DDS/)).toBeNull();
  });

  it('al abrir la tabla en la sección Tablas se recupera el CRUD para enviarlo', async () => {
    abrir();
    generar();
    await dds();
    reiniciarAplicacion();
    act(() => useTablas.setState({ tabla, nombreArchivoActual: archivo }));
    render(<SeccionTablas />);
    expect(useConjuntoCrud.getState().conjunto?.nombrePantalla).toBe('ASQRY03D');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar el CRUD…' }));
    expect(useAs400.getState().envio!.map((x) => x.miembro)).toEqual(['ASQRY03F', 'ASQRY03D', 'ASQRY03P']);
  });

  it('la pantalla editada en el editor se guarda y se recupera después de cerrar', async () => {
    abrir();
    generar();
    await dds();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir pantalla en el editor' }));
    act(() =>
      useStore.setState((s) => ({
        pantalla: {
          ...s.pantalla!,
          registros: s.pantalla!.registros.map((r, i) =>
            i === 0 ? { ...r, keywords: [...r.keywords, { nombre: 'ALARM', parametros: '', indicadores: [] }] } : r,
          ),
        },
      })),
    );
    act(() => guardarEdicionAhora());
    expect(leerCrudGuardado('ASQRY03F')?.ddsEditada).toContain('ALARM');
    reiniciarAplicacion();

    expect(useConjuntoCrud.getState().restaurar('ASQRY03F')).toBe(true);
    const pantalla = fuentesDelConjunto(useConjuntoCrud.getState().conjunto!)[1];
    expect(pantalla.etiqueta).toBe('Pantalla (editada)');
    expect(pantalla.texto).toContain('ALARM');

    // El diálogo muestra la editada y pide confirmar antes de reemplazarla.
    abrir();
    expect(await screen.findByLabelText('Fuente DDS (pantalla editada en el editor)')).toBeTruthy();
    const confirmar = vi.fn(() => false);
    window.confirm = confirmar;
    generar();
    expect(confirmar).toHaveBeenCalledWith(expect.stringMatching(/se editó en el editor/));
    expect(leerCrudGuardado('ASQRY03F')?.ddsEditada).toContain('ALARM');

    // Abrir en el editor abre la editada.
    fireEvent.click(screen.getByRole('button', { name: 'Abrir pantalla en el editor' }));
    expect(useStore.getState().pantalla!.registros[0].keywords.some((k) => k.nombre === 'ALARM')).toBe(true);
  });

  it('generar de nuevo (confirmando) reemplaza la pantalla editada guardada', async () => {
    abrir();
    generar();
    await dds();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir pantalla en el editor' }));
    act(() =>
      useStore.setState((s) => ({
        pantalla: { ...s.pantalla!, registros: s.pantalla!.registros.map((r, i) => (i === 0 ? { ...r, keywords: [...r.keywords, { nombre: 'ALARM', parametros: '', indicadores: [] }] } : r)) },
      })),
    );
    act(() => guardarEdicionAhora());
    cleanup();
    abrir();
    generar();
    expect(await screen.findByLabelText('Fuente DDS generado')).toBeTruthy();
    expect(leerCrudGuardado('ASQRY03F')?.ddsEditada).toBeNull();
  });
});

describe('pestañas del diálogo del CRUD', () => {
  it('empieza en General; Resultado se habilita al generar y se abre solo', async () => {
    abrir();
    expect(screen.getByRole('tab', { name: 'General' }).getAttribute('aria-selected')).toBe('true');
    expect((screen.getByRole('tab', { name: 'Resultado' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('tab', { name: 'Validaciones' }));
    expect(screen.getByRole('tabpanel', { name: 'Validaciones' })).toBeTruthy();
    expect(screen.queryByRole('tabpanel', { name: 'General' })).toBeNull();
    // Solo los campos del detalle tienen validación.
    const panel = screen.getByRole('tabpanel', { name: 'Validaciones' });
    expect(within(panel).getByText('DESEVE')).toBeTruthy();
    generar();
    await dds();
    expect(screen.getByRole('tab', { name: 'Resultado' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: 'Abrir pantalla en el editor' })).toBeTruthy();
  });
});
