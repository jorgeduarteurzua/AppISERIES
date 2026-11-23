// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import iconv from 'iconv-lite';
import { App } from '../App';
import { useStore } from './store';
import { useTablas, type ArchivoTabla } from './storeTablas';
import { useGuardado } from './guardado';
import { useNavegacion } from './navegacion';
import { agregarCampo, agregarConstante, actualizarElemento } from '@core/edicion/operaciones';
import { actualizarCampo } from '@core/tablas/operacionesTabla';
import { parsearDspf } from '@core/parser/parserDspf';
import { generarDspf } from '@core/generador/generadorDspf';
import { generarTabla } from '@core/tablas/generadorTabla';
import { parsearTabla } from '@core/tablas/parserTabla';
import { dirFuentesTablas } from '@core/tablas/fuentesPrueba';

const dirPantallas = join(dirFuentesTablas, '../QDSPSRC');

type Api = {
  escribirFuente: ReturnType<typeof vi.fn>;
  guardarFuente: ReturnType<typeof vi.fn>;
  notificarModificado: ReturnType<typeof vi.fn>;
  leerFuente: ReturnType<typeof vi.fn>;
};
let api: Api;

beforeEach(() => {
  localStorage.clear();
  useStore.setState(useStore.getInitialState(), true);
  useTablas.setState(useTablas.getInitialState(), true);
  useNavegacion.setState(useNavegacion.getInitialState(), true);
  useGuardado.setState({ mensaje: null, tipo: 'ok', ocupado: false });
  window.confirm = () => true;
  api = {
    escribirFuente: vi.fn().mockResolvedValue(null),
    guardarFuente: vi.fn().mockResolvedValue('C:/salida/PANTALLA1.dspf'),
    notificarModificado: vi.fn(),
    leerFuente: vi.fn().mockImplementation(async (ruta: string) => iconv.decode(readFileSync(ruta), 'windows-1252')),
  };
  (window as unknown as { api: Api }).api = api;
});

afterEach(() => cleanup());

/** Aviso de guardado junto a los botones (la interfaz tiene otros avisos con role="status"). */
const mensajeGuardado = () => document.querySelector('.guardar-mensaje')?.textContent ?? null;
const boton = (nombre: string | RegExp) => screen.getByRole('button', { name: nombre }) as HTMLButtonElement;
const guardar = () => boton(/^Guardar$/);
const guardarComo = () => screen.getAllByRole('button', { name: 'Guardar como…' })[0] as HTMLButtonElement;

describe('pantallas: botón Guardar', () => {
  beforeEach(() => {
    render(<App />);
    act(() => useStore.getState().nuevaPantalla('PANTALLA1'));
  });

  it('una pantalla nueva pide dónde guardar, la deja guardada y recuerda el archivo', async () => {
    expect(guardar().disabled).toBe(false);
    fireEvent.click(guardar());

    await waitFor(() => expect(api.guardarFuente).toHaveBeenCalled());
    const [texto, sugerido] = api.guardarFuente.mock.calls[0];
    expect(sugerido).toBe('PANTALLA1.dspf');
    expect(texto).toBe(generarDspf(useStore.getState().pantalla!));

    await waitFor(() => expect(useStore.getState().modificado).toBe(false));
    expect(useStore.getState().rutaActual).toBe('C:/salida/PANTALLA1.dspf');
    expect(useStore.getState().nombreArchivoActual).toBe('PANTALLA1.dspf');
    expect(mensajeGuardado()).toContain('Guardado en C:/salida/PANTALLA1.dspf');
  });

  it('el segundo guardado sobrescribe el mismo archivo sin preguntar', async () => {
    fireEvent.click(guardar());
    await waitFor(() => expect(useStore.getState().rutaActual).not.toBeNull());

    const id = useStore.getState().pantalla!.registros[0].id;
    act(() => useStore.getState().modificar((p) => agregarConstante(p, id, 2, 2, 'Hola').pantalla));
    expect(guardar().disabled).toBe(false);

    fireEvent.click(guardar());
    await waitFor(() => expect(api.escribirFuente).toHaveBeenCalledTimes(1));
    expect(api.guardarFuente).toHaveBeenCalledTimes(1); // no volvió a abrir el diálogo
    const [ruta, texto] = api.escribirFuente.mock.calls[0];
    expect(ruta).toBe('C:/salida/PANTALLA1.dspf');
    expect(texto).toContain("'Hola'");
    await waitFor(() => expect(useStore.getState().modificado).toBe(false));
  });

  it('con el archivo ya guardado y sin cambios, Guardar está deshabilitado y Guardar como… no', async () => {
    fireEvent.click(guardar());
    await waitFor(() => expect(useStore.getState().modificado).toBe(false));
    expect(guardar().disabled).toBe(true);
    expect(guardarComo().disabled).toBe(false);
  });

  it('Guardar como… siempre pide ruta y cambia el archivo actual', async () => {
    fireEvent.click(guardar());
    await waitFor(() => expect(useStore.getState().rutaActual).toBe('C:/salida/PANTALLA1.dspf'));

    api.guardarFuente.mockResolvedValueOnce('C:/otra/COPIA.dspf');
    fireEvent.click(guardarComo());
    await waitFor(() => expect(api.guardarFuente).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(useStore.getState().rutaActual).toBe('C:/otra/COPIA.dspf'));
    expect(api.escribirFuente).not.toHaveBeenCalled();
  });

  it('si se cancela el diálogo no cambia nada', async () => {
    api.guardarFuente.mockResolvedValueOnce(null);
    fireEvent.click(guardar());
    await waitFor(() => expect(api.guardarFuente).toHaveBeenCalled());
    await act(async () => {});
    expect(useStore.getState().modificado).toBe(true);
    expect(useStore.getState().rutaActual).toBeNull();
    expect(mensajeGuardado()).toBeNull();
    expect(useGuardado.getState().ocupado).toBe(false);
  });

  it('un error al guardar se muestra sin el prefijo técnico de Electron y no marca como guardado', async () => {
    api.guardarFuente.mockRejectedValueOnce(
      new Error("Error invoking remote method 'fs:guardarFuente': Error: EPERM: sin permiso"),
    );
    fireEvent.click(guardar());
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toBe('No se pudo guardar: EPERM: sin permiso');
    expect(useStore.getState().modificado).toBe(true);
    expect(guardar().disabled).toBe(false); // se puede reintentar
  });

  it('con errores de validación pregunta antes; si se rechaza no escribe, y si se acepta guarda', async () => {
    const id = useStore.getState().pantalla!.registros[0].id;
    // Un campo fuera de la pantalla: error de validación, pero el DDS se puede generar.
    act(() => {
      const r = agregarCampo(useStore.getState().pantalla!, id, { fila: 30, columna: 1 });
      useStore.getState().aplicar(r.pantalla);
    });
    const confirmar = vi.fn(() => false);
    window.confirm = confirmar;

    fireEvent.click(guardar());
    await act(async () => {});
    expect(confirmar).toHaveBeenCalledWith(expect.stringMatching(/La pantalla tiene 1 error de validación/));
    expect(api.guardarFuente).not.toHaveBeenCalled();
    expect(useStore.getState().modificado).toBe(true);

    window.confirm = () => true;
    fireEvent.click(guardar());
    await waitFor(() => expect(api.guardarFuente).toHaveBeenCalledTimes(1));
  });

  it('un nombre demasiado largo impide generar el DDS y lo explica', async () => {
    const id = useStore.getState().pantalla!.registros[0].id;
    act(() => {
      const r = agregarCampo(useStore.getState().pantalla!, id, { fila: 1, columna: 1 });
      useStore.getState().aplicar(actualizarElemento(r.pantalla, id, r.elementoId, { nombre: 'NOMBREDEMASIADOLARGO' }));
    });
    fireEvent.click(guardar()); // confirm devuelve true: sigue y falla al generar
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toMatch(/No se puede generar el DDS: .*10 caracteres/);
    expect(api.guardarFuente).not.toHaveBeenCalled();
  });
});

describe('pantallas: archivo abierto de disco', () => {
  const archivo = readdirSync(dirPantallas).find((f) => f.endsWith('ASQRY14D.TXT'))!;
  const ruta = join(dirPantallas, archivo);

  async function abrir() {
    await act(async () => {
      await useStore.getState().cargarArchivo(ruta, archivo);
    });
  }

  it('sin cambios no se puede guardar; con un cambio sobrescribe el archivo abierto y avisa de la copia', async () => {
    render(<App />);
    await abrir();
    expect(useStore.getState().rutaActual).toBe(ruta);
    expect(guardar().disabled).toBe(true);

    api.escribirFuente.mockResolvedValueOnce(`${ruta}.bak`);
    const reg = useStore.getState().pantalla!.registros.find((r) => r.clase === 'normal')!;
    act(() => useStore.getState().modificar((p) => agregarConstante(p, reg.id, 5, 5, 'Nota').pantalla));
    expect(guardar().disabled).toBe(false);

    fireEvent.click(guardar());
    await waitFor(() => expect(api.escribirFuente).toHaveBeenCalledWith(ruta, expect.any(String)));
    expect(api.guardarFuente).not.toHaveBeenCalled();
    const texto = api.escribirFuente.mock.calls[0][1] as string;
    expect(texto).toContain("'Nota'");
    // Lo que se escribe se vuelve a leer como la pantalla editada.
    expect(parsearDspf(texto).registros.find((r) => r.id !== undefined && r.nombre === reg.nombre)!.elementos.length).toBe(
      reg.elementos.length + 1,
    );
    await waitFor(() => expect(mensajeGuardado()).toContain(`El original quedó en ${ruta}.bak`));
  });
});

describe('tablas: botón Guardar', () => {
  beforeEach(() => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Tablas' }));
  });

  const crear = (nombre: string, tipo: 'PF' | 'LF' = 'PF', fisico = '') =>
    act(() => useTablas.getState().nuevaTabla(nombre, tipo, fisico));

  it('una tabla nueva pide dónde guardar y sugiere .pf; un lógico, .lf', async () => {
    crear('CLIENTES');
    api.guardarFuente.mockResolvedValueOnce('C:/dds/CLIENTES.pf');
    fireEvent.click(guardar());
    await waitFor(() => expect(api.guardarFuente).toHaveBeenCalledWith(expect.stringContaining('R RCLIENTES'), 'CLIENTES.pf'));
    await waitFor(() => expect(useTablas.getState().modificado).toBe(false));
    expect(useTablas.getState().rutaActual).toBe('C:/dds/CLIENTES.pf');

    crear('CLIL01', 'LF', 'CLIENTES');
    api.guardarFuente.mockResolvedValueOnce('C:/dds/CLIL01.lf');
    fireEvent.click(guardar());
    await waitFor(() => expect(api.guardarFuente).toHaveBeenLastCalledWith(expect.stringContaining('PFILE(CLIENTES)'), 'CLIL01.lf'));
  });

  it('una tabla abierta se sobrescribe en su ruta y se puede volver a leer igual', async () => {
    const archivos = readdirSync(dirFuentesTablas).filter((f) => f.toUpperCase().endsWith('.TXT'));
    const nombre = archivos.find((f) => f.endsWith('ASQRY05F.TXT'))!;
    const rutaTabla = join(dirFuentesTablas, nombre);
    const entrada: ArchivoTabla = { nombre, ruta: rutaTabla, clave: 'ASQRY05F', tipo: 'PF' };
    await act(async () => {
      await useTablas.getState().cargarArchivo(entrada);
    });
    expect(guardar().disabled).toBe(true);

    const t = useTablas.getState().tabla!;
    act(() =>
      useTablas.getState().modificar((x) => actualizarCampo(x, t.registros[0].id, t.registros[0].elementos[0].id, { nombre: 'ayuda2' })),
    );
    fireEvent.click(guardar());
    await waitFor(() => expect(api.escribirFuente).toHaveBeenCalledWith(rutaTabla, expect.any(String)));

    const escrito = api.escribirFuente.mock.calls[0][1] as string;
    expect(escrito).toBe(generarTabla(useTablas.getState().tabla!));
    expect(parsearTabla(escrito).registros[0].elementos.some((e) => e.tipo === 'campo' && e.nombre === 'AYUDA2')).toBe(true);
    await waitFor(() => expect(useTablas.getState().modificado).toBe(false));
  });

  it('la pestaña Fuente DDS guarda con «Guardar como…» y el archivo actual pasa a ser el nuevo', async () => {
    crear('CLIENTES');
    fireEvent.click(screen.getByRole('tab', { name: 'Fuente DDS' }));
    api.guardarFuente.mockResolvedValueOnce('C:/dds/NUEVO.pf');
    const dentro = within(screen.getByLabelText('Fuente DDS generado').parentElement!);
    fireEvent.click(dentro.getByRole('button', { name: 'Guardar como…' }));
    await waitFor(() => expect(useTablas.getState().rutaActual).toBe('C:/dds/NUEVO.pf'));
    expect(useTablas.getState().modificado).toBe(false);
  });

  it('la pestaña SQL guarda solo el texto: no cambia el archivo ni quita el indicador', async () => {
    crear('CLIENTES');
    fireEvent.click(screen.getByRole('tab', { name: 'SQL' }));
    api.guardarFuente.mockResolvedValueOnce('C:/sql/CLIENTES.sql');
    const dentro = within(screen.getByLabelText('SQL generado').parentElement!);
    fireEvent.click(dentro.getByRole('button', { name: 'Guardar como…' }));
    await waitFor(() => expect(api.guardarFuente).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE'), 'CLIENTES.sql'));
    expect(useTablas.getState().rutaActual).toBeNull();
    expect(useTablas.getState().modificado).toBe(true);
  });
});

describe('atajos de teclado', () => {
  it('Ctrl+S guarda en la sección activa y Ctrl+Mayús+S pide otro nombre', async () => {
    render(<App />);
    act(() => useStore.getState().nuevaPantalla('PANTALLA1'));

    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(api.guardarFuente).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(useStore.getState().modificado).toBe(false));

    // Sin cambios, Ctrl+S sobrescribe de todos modos el archivo ya conocido (no hay botón, pero el atajo es explícito).
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(api.escribirFuente).toHaveBeenCalledTimes(1));

    fireEvent.keyDown(window, { key: 'S', ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(api.guardarFuente).toHaveBeenCalledTimes(2));
  });

  it('en la sección Tablas, Ctrl+S guarda la tabla y no la pantalla', async () => {
    render(<App />);
    act(() => useStore.getState().nuevaPantalla('PANTALLA1'));
    fireEvent.click(screen.getByRole('button', { name: 'Tablas' }));
    act(() => useTablas.getState().nuevaTabla('CLIENTES', 'PF'));

    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(api.guardarFuente).toHaveBeenCalledTimes(1));
    expect(api.guardarFuente.mock.calls[0][1]).toBe('CLIENTES.pf');
    expect(useStore.getState().modificado).toBe(true); // la pantalla sigue sin guardar
  });

  it('Ctrl+S sin nada abierto no hace nada', async () => {
    render(<App />);
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await act(async () => {});
    expect(api.guardarFuente).not.toHaveBeenCalled();
    expect(api.escribirFuente).not.toHaveBeenCalled();
  });
});

describe('los botones sin nada abierto', () => {
  it('Guardar y Guardar como… están deshabilitados', () => {
    render(<App />);
    expect(guardar().disabled).toBe(true);
    expect(guardarComo().disabled).toBe(true);
  });
});
