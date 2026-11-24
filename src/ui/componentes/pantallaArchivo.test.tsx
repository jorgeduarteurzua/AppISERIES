// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

describe('Pantallas: Teclas y ayuda', () => {
  it('agrega F1, F3 y F12, AYUDA y PIE; al repetir con una tecla nueva la lista en ambos', () => {
    useStore.setState({ modoEdicion: true });
    render(<SeccionPantallas />);
    fireEvent.click(screen.getByRole('button', { name: 'Teclas y ayuda' }));
    let dds = generarDspf(useStore.getState().pantalla!);
    for (const n of ['01', '03', '12']) expect(dds).toContain(`CF${n}(${n}`);
    expect(dds).toMatch(/R AYUDA +WINDOW\(/);
    expect(dds).toMatch(/R PIE +OVERLAY/);
    expect(useStore.getState().modificado).toBe(true);

    const p = useStore.getState().pantalla!;
    act(() => useStore.getState().aplicar({ ...p, teclasFuncion: [...p.teclasFuncion, { tipo: 'CF', numero: 5, respuestaInd: 5, texto: 'Renovar' }] }));
    fireEvent.click(screen.getByRole('button', { name: 'Teclas y ayuda' }));
    dds = generarDspf(useStore.getState().pantalla!);
    expect(dds.match(/F5=Renovar/g)?.length).toBeGreaterThanOrEqual(2);
    expect(dds).toContain('F5=Renovar');
    expect(dds.match(/R AYUDA/g)).toHaveLength(1);
    expect(dds.match(/R PIE/g)).toHaveLength(1);
  });
});

describe('Pantallas: generar programa sin el archivo abierto en Tablas', () => {
  it('ofrece buscar el archivo en la carpeta de la pantalla y lo usa en el programa', async () => {
    const { parsearDspf } = await import('@core/parser/parserDspf');
    const p = parsearDspf(
      [
        '     A                                      INDARA',
        '     A          R REG01',
        '     A            RUT       R        B  4 20REFFLD(RUT CLIENTES)',
        '     A            NOMBRE    R        B  5 20REFFLD(NOMBRE CLIENTES)',
      ].join('\n') + '\n',
      'CLIENTED',
    );
    const api = window.api as unknown as Record<string, unknown>;
    api.listarCarpeta = vi.fn().mockResolvedValue([{ nombre: 'CLIENTES.pf', ruta: 'C:/f/CLIENTES.pf' }]);
    api.leerFuente = vi.fn().mockResolvedValue(
      ['     A                                      UNIQUE', '     A          R RCLIENTE', '     A            RUT            9S 0', '     A            NOMBRE        40A', '     A          K RUT'].join('\n') + '\n',
    );
    useTablas.setState({ catalogo: {} });
    useStore.setState({ pantalla: p, carpeta: 'C:/f', registroSeleccionado: p.registros[0].id });
    render(<SeccionPantallas />);
    fireEvent.click(screen.getByRole('button', { name: 'Generar programa…' }));
    const generar = screen.getByRole('dialog', { name: 'Generar programa' });
    expect(within(generar).getByText(/CLIENTES \(no está abierto en Tablas\)/)).toBeTruthy();
    expect(within(generar).getByLabelText('Programa generado').textContent).not.toContain('SELECT CLIENTES');

    fireEvent.click(within(generar).getByRole('button', { name: 'Buscar en la carpeta de la pantalla' }));
    expect(await within(generar).findByText('Archivos encontrados.')).toBeTruthy();
    expect(within(generar).queryByText(/no está abierto en Tablas/)).toBeNull();
    expect(within(generar).getByLabelText('Programa generado').textContent).toContain('SELECT CLIENTES');
  });
});

describe('Pantallas: Teclas y ayuda con un AYUDA propio', () => {
  it('pide confirmacion antes de reemplazarlo y no cambia nada si se rechaza', () => {
    useStore.setState({ modoEdicion: true });
    render(<SeccionPantallas />);
    fireEvent.click(screen.getByRole('button', { name: 'Teclas y ayuda' }));
    const p = useStore.getState().pantalla!;
    const propia = structuredClone(p);
    const ayuda = propia.registros.find((r) => r.nombre === 'AYUDA')!;
    ayuda.elementos = ayuda.elementos.filter((e) => !(e.tipo === 'constante' && e.texto === 'F3=Salir'));
    act(() => useStore.getState().aplicar(propia));
    const antes = generarDspf(useStore.getState().pantalla!);

    const confirmar = vi.fn(() => false);
    window.confirm = confirmar;
    fireEvent.click(screen.getByRole('button', { name: 'Teclas y ayuda' }));
    expect(confirmar).toHaveBeenCalledTimes(1);
    expect(generarDspf(useStore.getState().pantalla!)).toBe(antes);

    window.confirm = () => true;
    fireEvent.click(screen.getByRole('button', { name: 'Teclas y ayuda' }));
    expect(generarDspf(useStore.getState().pantalla!)).toContain('F3=Salir');
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
