// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import iconv from 'iconv-lite';
import { SeccionTablas } from '../SeccionTablas';
import { App } from '../App';
import { useTablas } from '../estado/storeTablas';
import { camposDe, llavesDe } from '@core/tablas/modelo';
import { dirFuentesTablas } from '@core/tablas/fuentesPrueba';

type ApiFalsa = Record<string, unknown>;
const ponerApi = (api: ApiFalsa) => {
  (window as unknown as { api: ApiFalsa }).api = api;
};

const tabla = () => useTablas.getState().tabla!;
const campos = () => camposDe(tabla().registros[0]);

beforeEach(() => {
  localStorage.clear();
  useTablas.setState(useTablas.getInitialState(), true);
  window.confirm = () => true;
  ponerApi({ notificarModificado: vi.fn() });
});

afterEach(() => cleanup());

/** El elemento de la lista de archivos (el nombre también sale en la cabecera cuando está abierto). */
function itemDeLista(nombre: string): HTMLElement {
  const el = screen.getAllByText(nombre).find((x) => x.closest('li'));
  if (!el) throw new Error(`No está ${nombre} en la lista de archivos.`);
  return el;
}

/** Crea una tabla nueva usando el formulario, como lo haría el usuario. */
function crearDesdeFormulario(nombre: string, tipo: 'PF' | 'LF' = 'PF', fisico = '') {
  fireEvent.click(screen.getByRole('button', { name: 'Nueva tabla…' }));
  const dialogo = screen.getByRole('dialog', { name: 'Nueva tabla' });
  fireEvent.change(within(dialogo).getByDisplayValue('TABLA1'), { target: { value: nombre } });
  if (tipo === 'LF') {
    fireEvent.change(within(dialogo).getByDisplayValue('Archivo físico (PF)'), { target: { value: 'LF' } });
    fireEvent.change(within(dialogo).getByPlaceholderText('Archivo físico (PFILE)'), { target: { value: fisico } });
  }
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Crear' }));
}

describe('crear una tabla', () => {
  it('el formulario crea un físico con un campo de ejemplo y marca cambios sin guardar', () => {
    render(<SeccionTablas />);
    crearDesdeFormulario('clientes');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('Nombre del campo 1')).toHaveProperty('value', 'CAMPO01');
    expect(screen.getByLabelText('con cambios sin guardar')).toBeTruthy();
    expect(tabla().nombre).toBe('CLIENTES');
    expect(tabla().registros[0].nombre).toBe('RCLIENTES');
  });

  it('un lógico indica que hereda los campos del físico', () => {
    render(<SeccionTablas />);
    crearDesdeFormulario('clil01', 'LF', 'clientes');
    expect(screen.getByText(/hereda todos los del físico CLIENTES/)).toBeTruthy();
    // En un lógico aparece la selección y omisión.
    fireEvent.click(screen.getByText(/^Llave y selección$/));
    expect(screen.getByRole('button', { name: '+ Seleccionar' })).toBeTruthy();
  });
});

describe('edición en la cuadrícula', () => {
  beforeEach(() => {
    render(<SeccionTablas />);
    crearDesdeFormulario('clientes');
  });

  it('el nombre se normaliza a mayúsculas', () => {
    fireEvent.change(screen.getByLabelText('Nombre del campo 1'), { target: { value: 'codigo' } });
    expect(screen.getByLabelText('Nombre del campo 1')).toHaveProperty('value', 'CODIGO');
    expect(campos()[0].nombre).toBe('CODIGO');
  });

  it('al elegir un tipo numérico se habilitan los decimales', () => {
    const decimales = () => screen.getByLabelText('Decimales del campo CAMPO01') as HTMLInputElement;
    expect(decimales().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Tipo del campo CAMPO01'), { target: { value: 'S' } });
    expect(decimales().disabled).toBe(false);
    expect(decimales().value).toBe('0');

    fireEvent.change(screen.getByLabelText('Longitud del campo CAMPO01'), { target: { value: '7' } });
    fireEvent.change(decimales(), { target: { value: '2' } });
    expect(campos()[0]).toMatchObject({ tipoDato: 'S', longitud: 7, decimales: 2 });
  });

  it('una fecha no usa longitud', () => {
    fireEvent.change(screen.getByLabelText('Tipo del campo CAMPO01'), { target: { value: 'L' } });
    expect((screen.getByLabelText('Longitud del campo CAMPO01') as HTMLInputElement).disabled).toBe(true);
    expect(campos()[0]).toMatchObject({ tipoDato: 'L', longitud: null });
  });

  it('el botón de llave agrega y quita el campo de la llave', () => {
    // El botón de la cuadrícula; en el panel lateral hay otros botones que también nombran el campo.
    const boton = () =>
      screen.getByRole('button', { name: /^(Agregar CAMPO01 a la llave|CAMPO01 es parte de la llave)/ });
    expect(boton().textContent).toBe('·');

    fireEvent.click(boton());
    expect(llavesDe(tabla().registros[0]).map((k) => k.nombre)).toEqual(['CAMPO01']);
    expect(boton().textContent).toBe('1');
    expect(boton().getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(boton());
    expect(llavesDe(tabla().registros[0])).toHaveLength(0);
  });

  it('+ Campo agrega después del seleccionado; Subir, Bajar y Eliminar reordenan', () => {
    fireEvent.click(screen.getByRole('button', { name: '+ Campo' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Campo' }));
    expect(campos().map((c) => c.nombre)).toEqual(['CAMPO01', 'CAMPO02', 'CAMPO03']);

    // El último agregado queda seleccionado: se sube una posición.
    fireEvent.click(screen.getByRole('button', { name: /Subir/ }));
    expect(campos().map((c) => c.nombre)).toEqual(['CAMPO01', 'CAMPO03', 'CAMPO02']);

    fireEvent.click(screen.getByRole('button', { name: /Bajar/ }));
    expect(campos().map((c) => c.nombre)).toEqual(['CAMPO01', 'CAMPO02', 'CAMPO03']);

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(campos().map((c) => c.nombre)).toEqual(['CAMPO01', 'CAMPO02']);
  });

  it('Subir está deshabilitado en el primer campo y Eliminar sin selección', () => {
    expect((screen.getByRole('button', { name: 'Eliminar' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Nombre del campo 1'));
    expect((screen.getByRole('button', { name: /Subir/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('deshacer y rehacer con los botones y con Ctrl+Z / Ctrl+Y', () => {
    fireEvent.click(screen.getByRole('button', { name: '+ Campo' }));
    expect(campos()).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(campos()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Rehacer' }));
    expect(campos()).toHaveLength(2);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(campos()).toHaveLength(1);
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    expect(campos()).toHaveLength(2);
  });

  it('escribir en un campo varias veces seguidas es un solo paso de deshacer', () => {
    const nombre = () => screen.getByLabelText('Nombre del campo 1');
    fireEvent.change(nombre(), { target: { value: 'C' } });
    fireEvent.change(nombre(), { target: { value: 'CO' } });
    fireEvent.change(nombre(), { target: { value: 'COD' } });
    expect(campos()[0].nombre).toBe('COD');

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(campos()[0].nombre).toBe('CAMPO01');
  });

  it('la descripción de la fila se guarda como TEXT', () => {
    fireEvent.change(screen.getByLabelText('Descripción del campo CAMPO01'), { target: { value: 'Código del cliente' } });
    expect(campos()[0].keywords).toEqual([{ nombre: 'TEXT', parametros: "'Código del cliente'", indicadores: [] }]);
  });
});

describe('propiedades del campo y condiciones', () => {
  beforeEach(() => {
    render(<SeccionTablas />);
    crearDesdeFormulario('clientes');
    fireEvent.click(screen.getByLabelText('Nombre del campo 1')); // selecciona la fila
  });

  it('seleccionar una fila muestra sus propiedades', () => {
    expect(screen.getByRole('heading', { name: 'Campo CAMPO01' })).toBeTruthy();
  });

  it('VALUES: los valores de carácter se guardan entre comillas', () => {
    fireEvent.change(screen.getByLabelText('Tipo de condición de validez'), { target: { value: 'valores' } });
    const entrada = screen.getByLabelText('Valores permitidos, separados por comas');
    fireEvent.change(entrada, { target: { value: 'S, N' } });
    fireEvent.blur(entrada);

    expect(campos()[0].keywords).toEqual([{ nombre: 'VALUES', parametros: "'S' 'N'", indicadores: [] }]);
    expect(screen.getByText("VALUES('S' 'N')")).toBeTruthy(); // columna «Validez» de la cuadrícula
  });

  it('VALUES en un campo numérico no lleva comillas', () => {
    fireEvent.change(screen.getByLabelText('Tipo del campo CAMPO01'), { target: { value: 'S' } });
    fireEvent.change(screen.getByLabelText('Tipo de condición de validez'), { target: { value: 'valores' } });
    const entrada = screen.getByLabelText('Valores permitidos, separados por comas');
    fireEvent.change(entrada, { target: { value: '1, 2, 3' } });
    fireEvent.blur(entrada);
    expect(campos()[0].keywords.find((k) => k.nombre === 'VALUES')?.parametros).toBe('1 2 3');
  });

  it('RANGE con desde y hasta', () => {
    fireEvent.change(screen.getByLabelText('Tipo del campo CAMPO01'), { target: { value: 'S' } });
    fireEvent.change(screen.getByLabelText('Tipo de condición de validez'), { target: { value: 'rango' } });
    fireEvent.change(screen.getByLabelText('Valor inicial del rango'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Valor final del rango'), { target: { value: '255' } });
    fireEvent.blur(screen.getByLabelText('Valor final del rango'));
    expect(campos()[0].keywords.find((k) => k.nombre === 'RANGE')?.parametros).toBe('1 255');
  });

  it('COMP con dos comparaciones', () => {
    fireEvent.change(screen.getByLabelText('Tipo del campo CAMPO01'), { target: { value: 'S' } });
    fireEvent.change(screen.getByLabelText('Tipo de condición de validez'), { target: { value: 'comparacion' } });
    fireEvent.change(screen.getByLabelText('Valor de la comparación 1'), { target: { value: '1' } });
    fireEvent.blur(screen.getByLabelText('Valor de la comparación 1'));
    fireEvent.click(screen.getByRole('button', { name: '+ Comparación' }));
    fireEvent.change(screen.getByLabelText('Valor de la comparación 2'), { target: { value: '5000' } });
    fireEvent.blur(screen.getByLabelText('Valor de la comparación 2'));

    const comp = campos()[0].keywords.filter((k) => k.nombre === 'COMP').map((k) => k.parametros);
    expect(comp).toEqual(['GE 1', 'LE 5000']);
  });

  it('elegir «Ninguna» quita la condición', () => {
    fireEvent.change(screen.getByLabelText('Tipo de condición de validez'), { target: { value: 'valores' } });
    const entrada = screen.getByLabelText('Valores permitidos, separados por comas');
    fireEvent.change(entrada, { target: { value: 'A' } });
    fireEvent.blur(entrada);
    expect(campos()[0].keywords.some((k) => k.nombre === 'VALUES')).toBe(true);

    fireEvent.change(screen.getByLabelText('Tipo de condición de validez'), { target: { value: 'ninguna' } });
    expect(campos()[0].keywords.some((k) => k.nombre === 'VALUES')).toBe(false);
  });

  it('cabecera, alias, valor por defecto y nulos', () => {
    fireEvent.change(screen.getByLabelText('Línea 1 del encabezado'), { target: { value: 'CODIGO' } });
    fireEvent.change(screen.getByLabelText('Línea 2 del encabezado'), { target: { value: 'CLIENTE' } });
    fireEvent.change(screen.getByPlaceholderText("'A' ó 0"), { target: { value: "'X'" } });
    fireEvent.click(screen.getByLabelText('Permite nulos (ALWNULL)'));

    const kws = campos()[0].keywords.map((k) => `${k.nombre}(${k.parametros})`);
    expect(kws).toContain("COLHDG('CODIGO' 'CLIENTE')");
    expect(kws).toContain("DFT('X')");
    expect(kws).toContain('ALWNULL()');
  });
});

describe('llave única y problemas', () => {
  it('el panel de problemas avisa y lleva al campo con el error', () => {
    render(<SeccionTablas />);
    crearDesdeFormulario('clientes');
    expect(screen.getByText(/Sin problemas/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Longitud del campo CAMPO01'), { target: { value: '' } });
    expect(screen.getByText(/1 error/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /falta la longitud/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /falta la longitud/ }));
    expect(useTablas.getState().seleccion).toBe(campos()[0].id);
  });
});

describe('pestañas DDS y SQL', () => {
  beforeEach(() => {
    render(<SeccionTablas />);
    crearDesdeFormulario('clientes');
    fireEvent.change(screen.getByLabelText('Nombre del campo 1'), { target: { value: 'estado' } });
    fireEvent.click(screen.getByLabelText('Nombre del campo 1'));
    fireEvent.change(screen.getByLabelText('Tipo de condición de validez'), { target: { value: 'valores' } });
    const v = screen.getByLabelText('Valores permitidos, separados por comas');
    fireEvent.change(v, { target: { value: 'A, B' } });
    fireEvent.blur(v);
  });

  it('muestra el DDS generado con la condición', () => {
    fireEvent.click(screen.getByRole('tab', { name: 'Fuente DDS' }));
    const dds = screen.getByLabelText('Fuente DDS generado').textContent ?? '';
    expect(dds).toContain('     A          R RCLIENTES');
    expect(dds).toMatch(/ESTADO\s+10A\s+VALUES\('A' 'B'\)/);
  });

  it('muestra el SQL y lo califica con la biblioteca, que se recuerda', () => {
    fireEvent.click(screen.getByRole('tab', { name: 'SQL' }));
    expect(screen.getByLabelText('SQL generado').textContent).toContain('CREATE TABLE CLIENTES (');

    fireEvent.change(screen.getByPlaceholderText('(sin calificar)'), { target: { value: 'milib' } });
    const sql = screen.getByLabelText('SQL generado').textContent ?? '';
    expect(sql).toContain('CREATE TABLE MILIB.CLIENTES (');
    expect(sql).toContain("CHECK (ESTADO IN ('A', 'B'))");
    expect(localStorage.getItem('appiseries.tablas.biblioteca')).toBe('milib');

    fireEvent.click(screen.getByLabelText('CREATE OR REPLACE'));
    expect(screen.getByLabelText('SQL generado').textContent).toContain('CREATE OR REPLACE TABLE MILIB.CLIENTES');
  });

  it('copiar y guardar usan la API de Electron', async () => {
    const guardarFuente = vi.fn().mockResolvedValue('C:/salida/CLIENTES.pf');
    ponerApi({ notificarModificado: vi.fn(), guardarFuente });
    fireEvent.click(screen.getByRole('tab', { name: 'Fuente DDS' }));
    expect(useTablas.getState().modificado).toBe(true);

    // El botón de la pestaña (la cabecera tiene otro «Guardar como…»).
    const pestana = within(screen.getByLabelText('Fuente DDS generado').parentElement!);
    fireEvent.click(pestana.getByRole('button', { name: 'Guardar como…' }));
    await waitFor(() => expect(useTablas.getState().modificado).toBe(false)); // guardar el DDS quita el indicador
    expect(guardarFuente).toHaveBeenCalledWith(expect.stringContaining('R RCLIENTES'), 'CLIENTES.pf');
  });

  it('guardar el SQL no quita el indicador: el fuente DDS sigue sin guardar', async () => {
    const guardarFuente = vi.fn().mockResolvedValue('C:/salida/CLIENTES.sql');
    ponerApi({ notificarModificado: vi.fn(), guardarFuente });
    fireEvent.click(screen.getByRole('tab', { name: 'SQL' }));
    const pestana = within(screen.getByLabelText('SQL generado').parentElement!);
    fireEvent.click(pestana.getByRole('button', { name: 'Guardar como…' }));
    await waitFor(() => expect(guardarFuente).toHaveBeenCalled());
    expect(useTablas.getState().modificado).toBe(true);
  });
});

describe('abrir una carpeta con fuentes reales', () => {
  const archivos = readdirSync(dirFuentesTablas).filter((f) => f.toUpperCase().endsWith('.TXT'));
  function conCarpeta() {
    ponerApi({
      notificarModificado: vi.fn(),
      abrirCarpeta: vi.fn().mockResolvedValue('C:/QDDSSRC'),
      listarCarpeta: vi.fn().mockResolvedValue([
        ...archivos.map((nombre) => ({ nombre, ruta: join(dirFuentesTablas, nombre) })),
        { nombre: 'LEEME.doc', ruta: 'C:/QDDSSRC/LEEME.doc' },
      ]),
      leerFuente: vi.fn().mockImplementation(async (ruta: string) => iconv.decode(readFileSync(ruta), 'windows-1252')),
    });
  }

  it('lista los 48 archivos con su tipo y abre uno', async () => {
    conCarpeta();
    render(<SeccionTablas />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir carpeta…' }));
    await waitFor(() => expect(screen.getByText('Archivos en carpeta (48)')).toBeTruthy());

    const item = screen.getByText('ASQRY01L').closest('li')!;
    expect(within(item).getByText('LF')).toBeTruthy();
    expect(within(screen.getByText('ASQRY01F').closest('li')!).getByText('PF')).toBeTruthy();

    fireEvent.click(screen.getByText('ASQRY01F'));
    await waitFor(() => expect(screen.getByLabelText('Nombre del campo 7')).toBeTruthy());
    expect(screen.getByLabelText('Nombre del campo 1')).toHaveProperty('value', 'WHFILE');
    expect(screen.queryByLabelText('con cambios sin guardar')).toBeNull();
  });

  it('un lógico abierto reconoce su físico: sin errores en el panel de problemas', async () => {
    conCarpeta();
    render(<SeccionTablas />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir carpeta…' }));
    await waitFor(() => screen.getByText('ASQRY27L01'));
    fireEvent.click(itemDeLista('ASQRY27L01'));
    await waitFor(() => expect(screen.getByText(/hereda todos los del físico ASQRY27F/)).toBeTruthy());
    expect(screen.getByText(/Sin problemas/)).toBeTruthy();
  });

  it('editar y volver a abrir el archivo descarta los cambios (con confirmación)', async () => {
    conCarpeta();
    const confirmar = vi.fn(() => true);
    window.confirm = confirmar;
    render(<SeccionTablas />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir carpeta…' }));
    await waitFor(() => screen.getByText('ASQRY01F'));
    fireEvent.click(itemDeLista('ASQRY01F'));
    await waitFor(() => screen.getByLabelText('Nombre del campo 1'));

    fireEvent.change(screen.getByLabelText('Nombre del campo 1'), { target: { value: 'otro' } });
    expect(useTablas.getState().modificado).toBe(true);

    fireEvent.click(itemDeLista('ASQRY01F'));
    await waitFor(() => expect(screen.getByLabelText('Nombre del campo 1')).toHaveProperty('value', 'WHFILE'));
    expect(confirmar).toHaveBeenCalled();
    expect(useTablas.getState().modificado).toBe(false);
  });

  it('si el usuario no confirma, se conservan los cambios', async () => {
    conCarpeta();
    render(<SeccionTablas />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir carpeta…' }));
    await waitFor(() => screen.getByText('ASQRY01F'));
    fireEvent.click(itemDeLista('ASQRY01F'));
    await waitFor(() => screen.getByLabelText('Nombre del campo 1'));
    fireEvent.change(screen.getByLabelText('Nombre del campo 1'), { target: { value: 'otro' } });

    window.confirm = () => false;
    fireEvent.click(itemDeLista('ASQRY02F'));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByLabelText('Nombre del campo 1')).toHaveProperty('value', 'OTRO');
  });

  it('una carpeta de pantallas (DSPF) no se confunde con tablas', async () => {
    const dirPantallas = join(dirFuentesTablas, '../QDSPSRC');
    const pantallas = readdirSync(dirPantallas).filter((f) => f.toUpperCase().endsWith('.TXT'));
    ponerApi({
      notificarModificado: vi.fn(),
      abrirCarpeta: vi.fn().mockResolvedValue('C:/QDSPSRC'),
      listarCarpeta: vi.fn().mockResolvedValue(pantallas.map((nombre) => ({ nombre, ruta: join(dirPantallas, nombre) }))),
      leerFuente: vi.fn().mockImplementation(async (ruta: string) => iconv.decode(readFileSync(ruta), 'windows-1252')),
    });
    render(<SeccionTablas />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir carpeta…' }));
    await waitFor(() => expect(useTablas.getState().carpeta).toBe('C:/QDSPSRC'));
    expect(useTablas.getState().archivos).toHaveLength(0);
    expect(screen.getByRole('alert').textContent).toMatch(/no tiene fuentes de archivos/);
  });
});

describe('contenedor con secciones', () => {
  it('cambia de Pantallas a Tablas y conserva lo que había en cada una', () => {
    const notificar = vi.fn();
    ponerApi({ notificarModificado: notificar });
    render(<App />);

    expect(screen.getByRole('button', { name: 'Pantallas' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: 'Tablas' }));
    expect(screen.getByText('Tablas (PF / LF)')).toBeTruthy();

    crearDesdeFormulario('clientes');
    // El indicador de cambios aparece en la pestaña de la sección y se avisa al proceso principal.
    expect(within(screen.getByRole('button', { name: /Tablas/ })).getByLabelText('con cambios sin guardar')).toBeTruthy();
    expect(notificar).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: /Pantallas/ }));
    expect(screen.getByText('Pantallas DSPF')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Tablas/ }));
    expect(screen.getByLabelText('Nombre del campo 1')).toHaveProperty('value', 'CAMPO01'); // sigue ahí
  });
});
