// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { crearPantalla } from '@core/edicion/operaciones';
import { generarDspf } from '@core/generador/generadorDspf';
import { parsearTabla } from '@core/tablas/parserTabla';
import { SeccionPantallas } from '../SeccionPantallas';
import { useNavegacion } from '../estado/navegacion';
import { useProgramas } from '../estado/storeProgramas';
import { useStore } from '../estado/store';
import { useTablas } from '../estado/storeTablas';

const PF = parsearTabla(
  [
    '     A                                      UNIQUE',
    "     A          R RCLIENTE",
    "     A            RUT            9S 0       TEXT('Rut')",
    "     A            NOMBRE        40A         TEXT('Nombre')",
    '     A          K RUT',
  ].join('\n') + '\n',
  'CLIENTES.pf',
);

beforeEach(() => {
  localStorage.clear();
  window.confirm = () => true;
  (window as unknown as { api: unknown }).api = { notificarModificado: vi.fn(), abrirCarpeta: vi.fn().mockResolvedValue(null) };
  useNavegacion.setState(useNavegacion.getInitialState(), true);
  useProgramas.setState(useProgramas.getInitialState(), true);
  useTablas.setState({ ...useTablas.getInitialState(), catalogo: { CLIENTES: PF } }, true);
  const pantalla = crearPantalla('CLIENTED');
  useStore.setState({ ...useStore.getInitialState(), pantalla, nombreArchivoActual: 'CLIENTED.dspf', registroSeleccionado: pantalla.registros[0].id }, true);
});
afterEach(() => cleanup());

describe('Pantallas: campos de un archivo y programa', () => {
  it('agrega campos de un archivo con REFFLD y genera el programa que los lee', () => {
    render(<SeccionPantallas />);
    fireEvent.click(screen.getByRole('button', { name: 'Campos de un archivo…' }));
    const dialogo = screen.getByRole('dialog', { name: 'Campos de un archivo' });
    fireEvent.click(within(dialogo).getByLabelText('Marcar todos'));
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Agregar 2 campos' }));
    expect(screen.queryByRole('dialog', { name: 'Campos de un archivo' })).toBeNull();
    const dds = generarDspf(useStore.getState().pantalla!);
    expect(dds).toContain('REFFLD(RUT CLIENTES)');
    expect(dds).toContain('REFFLD(NOMBRE CLIENTES)');
    expect(dds).toContain("'Nombre :'");
    expect(useStore.getState().modificado).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Generar programa…' }));
    const generar = screen.getByRole('dialog', { name: 'Generar programa' });
    expect((within(generar).getByLabelText('Nombre del programa') as HTMLInputElement).value).toBe('CLIENTEP');
    expect(within(generar).getByText(/Archivos de la pantalla: CLIENTES\./)).toBeTruthy();
    fireEvent.change(within(generar).getByLabelText('Tipo de programa'), { target: { value: 'SQLCBL' } });
    expect(within(generar).getByLabelText('Programa generado').textContent).toContain('SELECT RUT, NOMBRE');
    fireEvent.click(within(generar).getByRole('button', { name: 'Abrir en Programas' }));
    const st = useProgramas.getState();
    expect(st.miembro).toBe('CLIENTEP');
    expect(st.info?.tipo).toBe('SQLCBL');
    expect(st.texto).toContain('LEER-CLIENTES-REG01');
    expect(st.modificado).toBe(true);
    expect(useNavegacion.getState().seccion).toBe('programas');
  });

  it('sin archivos abiertos ofrece abrir la carpeta; sin campos de archivo el programa es un esqueleto', () => {
    useTablas.setState({ catalogo: {} });
    render(<SeccionPantallas />);
    fireEvent.click(screen.getByRole('button', { name: 'Campos de un archivo…' }));
    expect(screen.getByRole('button', { name: 'Abrir carpeta de archivos…' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generar programa…' }));
    expect(screen.getByText(/el programa sale como esqueleto/)).toBeTruthy();
    expect(screen.getByLabelText('Programa generado').textContent).toContain('MOSTRAR-REG01');
  });
});

describe('Pantallas: campos ocultos y completar subfile', () => {
  it('«+ Campo oculto» lo agrega sin posición, se ve en la lista y se selecciona', () => {
    useStore.setState({ modoEdicion: true });
    render(<SeccionPantallas />);
    fireEvent.click(screen.getByRole('button', { name: '+ Campo oculto' }));
    const lista = screen.getByRole('region', { name: 'Campos sin posición' });
    const boton = within(lista).getByRole('button', { name: /OCULTO/ });
    expect(boton.getAttribute('aria-pressed')).toBe('true');
    const c = useStore.getState().pantalla!.registros[0].elementos[0];
    expect(c).toMatchObject({ tipo: 'campo', uso: 'oculto', fila: null, columna: null });
    expect(generarDspf(useStore.getState().pantalla!)).toMatch(/OCULTO\w* +10A  H/);
  });

  it('«Completar subfile» agrega lo del CRUD y avisa lo que no cabe', async () => {
    const { parsearDspf } = await import('@core/parser/parserDspf');
    const p = parsearDspf(
      [
        '     A                                      INDARA',
        '     A          R WS01                      SFL',
        '     A            RUT           10S 0O  8  4',
        '     A          R WC01                      SFLCTL(WS01)',
        '     A                                      SFLSIZ(0100)',
        '     A                                      SFLPAG(0010)',
        '     A  30                                  SFLDSP',
        '     A  31                                  SFLDSPCTL',
      ].join('\n') + '\n',
      'PANTALLA1',
    );
    const ctl = p.registros.find((r) => r.nombre === 'WC01')!;
    useStore.setState({ pantalla: p, registroSeleccionado: ctl.id, modoEdicion: true });
    render(<SeccionPantallas />);
    fireEvent.click(screen.getByRole('button', { name: 'Completar subfile' }));
    const dds = generarDspf(useStore.getState().pantalla!);
    expect(dds).toContain('SFLCSRRRN(&REGREL)');
    expect(dds).toContain('SFLRCDNBR(CURSOR)');
    expect(dds).toContain('OVERLAY');
    const { useGuardado } = await import('../estado/guardado');
    expect(useGuardado.getState().mensaje).toMatch(/no hay lugar para OPCION/);
    expect(within(screen.getByRole('region', { name: 'Campos sin posición' })).getByText('REGREL')).toBeTruthy();
  });
});
