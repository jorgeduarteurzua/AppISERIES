// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SeccionProgramas } from '../SeccionProgramas';
import { App } from '../App';
import { useAs400 } from '../estado/as400';
import { fuentesDelConjunto, useConjuntoCrud } from '../estado/conjuntoCrud';
import { leerCrudGuardado } from '../estado/crudGuardado';
import { useNavegacion } from '../estado/navegacion';
import { useProgramas } from '../estado/storeProgramas';
import { useStore } from '../estado/store';
import { useTablas } from '../estado/storeTablas';

const COBOL = [
  '       IDENTIFICATION DIVISION.',
  '       PROGRAM-ID.  TABLA1P.',
  '       PROCEDURE DIVISION.',
  '       PRINCIPAL.',
  '           PERFORM INICIO',
  '           GOBACK.',
  '       INICIO.',
  '           CONTINUE.',
].join('\r\n');

const LISTADO_CL = [
  '    100-      PGM',
  '    500-         CHGVAR VAR(&MEN) VALUE(1)',
  '* CPD0727 40  Se ha hecho referencia a la variable &MEN pero no se ha declarado.',
  '                       * * * * *   F I N   D E   F U E N T E   * * * * *',
  '* CPD0791 00  No se ha utilizado ninguna etiqueta en el programa.',
].join('\n');

let api: Record<string, ReturnType<typeof vi.fn> | Record<string, ReturnType<typeof vi.fn>>>;

beforeEach(() => {
  localStorage.clear();
  window.confirm = () => true;
  useProgramas.setState(useProgramas.getInitialState(), true);
  useAs400.setState(useAs400.getInitialState(), true);
  useNavegacion.setState(useNavegacion.getInitialState(), true);
  useStore.setState(useStore.getInitialState(), true);
  useTablas.setState(useTablas.getInitialState(), true);
  useConjuntoCrud.setState({ conjunto: null });
  api = {
    abrirCarpeta: vi.fn().mockResolvedValue('C:/fuentes'),
    listarCarpeta: vi.fn().mockResolvedValue([
      { nombre: 'TABLA1P.sqlcbl', ruta: 'C:/fuentes/TABLA1P.sqlcbl' },
      { nombre: 'PGMERR.clp', ruta: 'C:/fuentes/PGMERR.clp' },
      { nombre: 'TABLA1D.dspf', ruta: 'C:/fuentes/TABLA1D.dspf' },
      { nombre: 'VIEJO.rpgle', ruta: 'C:/fuentes/VIEJO.rpgle' },
    ]),
    leerFuente: vi.fn().mockImplementation(async (ruta: string) =>
      ruta.endsWith('.clp') ? '             PGM\r\n             ENDPGM\r\n' : ruta.endsWith('.rpgle') ? '**free\r\n' : COBOL,
    ),
    escribirFuente: vi.fn().mockResolvedValue(null),
    guardarFuente: vi.fn().mockResolvedValue('C:/fuentes/NUEVO.clp'),
    notificarModificado: vi.fn(),
    as400: { leer: vi.fn().mockResolvedValue({ conexion: null, error: null }) },
  };
  (window as unknown as { api: typeof api }).api = api;
});
afterEach(() => cleanup());

const fuente = () => screen.getByLabelText('Fuente del programa') as HTMLTextAreaElement;

async function abrirCarpetaYPrograma(nombre = 'TABLA1P') {
  render(<SeccionProgramas />);
  fireEvent.click(screen.getByRole('button', { name: 'Abrir carpeta…' }));
  fireEvent.click(await screen.findByText(nombre));
  await screen.findByLabelText('Fuente del programa');
}

describe('sección Programas', () => {
  it('la carpeta muestra solo programas (COBOL, CL, RPG) con su tipo', async () => {
    render(<SeccionProgramas />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir carpeta…' }));
    expect(await screen.findByText('TABLA1P')).toBeTruthy();
    expect(screen.getByText('PGMERR')).toBeTruthy();
    expect(screen.getByText('VIEJO')).toBeTruthy();
    expect(screen.queryByText('TABLA1D')).toBeNull();
    expect(screen.getByText('SQLCBL')).toBeTruthy();
    expect(screen.getByText('CLP')).toBeTruthy();
  });

  it('abre el programa: texto, estructura con la secuencia SEU e ir a un párrafo', async () => {
    await abrirCarpetaYPrograma();
    expect(fuente().value).toBe(COBOL.replace(/\r\n/g, '\n'));
    const estructura = screen.getByRole('region', { name: 'Estructura' });
    expect(await within(estructura).findByText('PROCEDURE DIVISION')).toBeTruthy();
    expect(within(estructura).getByText('0007.00')).toBeTruthy();
    fireEvent.click(within(estructura).getByText('INICIO'));
    expect(useProgramas.getState().irA).toMatchObject({ linea: 7 });
    expect((screen.getByLabelText('Miembro') as HTMLInputElement).value).toBe('TABLA1P');
    expect((screen.getByLabelText('Tipo del programa') as HTMLSelectElement).value).toBe('SQLCBL');
  });

  it('al editar queda modificado y «Guardar» sobrescribe el archivo', async () => {
    await abrirCarpetaYPrograma();
    fireEvent.change(fuente(), { target: { value: `${fuente().value}\n      * nuevo` } });
    expect(useProgramas.getState().modificado).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.escribirFuente).toHaveBeenCalled());
    expect((api.escribirFuente as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('C:/fuentes/TABLA1P.sqlcbl');
    expect((api.escribirFuente as ReturnType<typeof vi.fn>).mock.calls[0][1]).toContain('* nuevo');
    await waitFor(() => expect(useProgramas.getState().modificado).toBe(false));
  });

  it('el panel de formato avisa del texto después de la columna 72', async () => {
    await abrirCarpetaYPrograma();
    fireEvent.change(fuente(), { target: { value: `           MOVE A TO B.${' '.repeat(49)}XXXX` } });
    const panel = screen.getByRole('region', { name: 'Problemas del programa' });
    expect(await within(panel).findByText(/después de la columna 72/)).toBeTruthy();
  });

  it('los mensajes del compilador van a su línea; los generales no tienen línea', async () => {
    await abrirCarpetaYPrograma('PGMERR');
    act(() => useProgramas.getState().registrarCompilacion(LISTADO_CL));
    const lista = screen.getByRole('list', { name: 'Mensajes del compilador' });
    const error = within(lista).getByText(/variable &MEN/).closest('button')!;
    expect(error.textContent).toContain('0005.00');
    fireEvent.click(error);
    expect(useProgramas.getState().irA).toMatchObject({ linea: 5 });
    expect((within(lista).getByText(/ninguna etiqueta/).closest('button') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/1 error \(gravedad 30 o más\)/)).toBeTruthy();
  });

  it('«Enviar programa…» propone el tipo del programa y el listado vuelve al editor', async () => {
    await abrirCarpetaYPrograma('PGMERR');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar programa…' }));
    const envio = useAs400.getState().envio!;
    expect(envio.map((f) => [f.tipo, f.miembro, f.tiposPermitidos])).toEqual([['CLP', 'PGMERR', ['CLP', 'CLLE']]]);
    act(() => envio[0].alTerminar!({ ok: false, pasos: [], listado: LISTADO_CL, rutaMiembro: '' }));
    expect(useProgramas.getState().mensajes.map((m) => m.id)).toEqual(['CPD0727', 'CPD0791']);
  });

  it('RPG se abre y se edita, pero todavía no se envía', async () => {
    await abrirCarpetaYPrograma('VIEJO');
    expect((screen.getByRole('button', { name: 'Enviar programa…' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('un programa nuevo de CL sale con su esqueleto y pide dónde guardarlo', async () => {
    render(<SeccionProgramas />);
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo programa…' }));
    const dialogo = screen.getByRole('dialog', { name: 'Nuevo programa' });
    fireEvent.change(within(dialogo).getByRole('combobox'), { target: { value: 'CLP' } });
    fireEvent.change(within(dialogo).getByRole('textbox'), { target: { value: 'nuevo' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Crear' }));
    expect(fuente().value).toContain('ENDPGM');
    expect(useProgramas.getState()).toMatchObject({ miembro: 'NUEVO', modificado: true });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.guardarFuente).toHaveBeenCalled());
    expect((api.guardarFuente as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe('NUEVO.clp');
  });

  it('el programa del CRUD se edita, se envía editado y se recuerda', async () => {
    useConjuntoCrud.getState().definir({
      tabla: 'TABLA1',
      tipoTabla: 'PF',
      ddsTabla: '',
      nombrePantalla: 'TABLA1D',
      nombrePrograma: 'TABLA1P',
      tipoCobol: 'SQLCBL',
      ddsPantalla: '     A          R R01\n',
      cobol: COBOL.replace(/\r\n/g, '\n'),
      ayudas: [],
    });
    render(<SeccionProgramas />);
    fireEvent.click(screen.getByRole('button', { name: 'Programa del CRUD' }));
    fireEvent.change(fuente(), { target: { value: `${fuente().value}\n      * ajuste a mano` } });
    expect(useProgramas.getState().modificado).toBe(false);
    const programa = fuentesDelConjunto(useConjuntoCrud.getState().conjunto!)[2];
    expect(programa.etiqueta).toBe('Programa (editado)');
    expect(programa.texto).toContain('ajuste a mano');
    expect(leerCrudGuardado('TABLA1')?.cobolEditado).toContain('ajuste a mano');
  });
});

describe('la carpeta se mantiene al día', () => {
  it('un aviso de cambio o un «Guardar como…» en la carpeta abierta agrega el archivo a la lista', async () => {
    render(<SeccionProgramas />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir carpeta…' }));
    await screen.findByText('TABLA1P');
    const listar = api.listarCarpeta as ReturnType<typeof vi.fn>;
    const actuales = await listar.mock.results[0].value;
    listar.mockResolvedValue([...actuales, { nombre: 'OTRO.clp', ruta: 'C:/fuentes/OTRO.clp' }]);
    const { refrescarCarpeta } = await import('../estado/carpetas');
    await act(() => refrescarCarpeta('C:\\fuentes\\'));
    expect(await screen.findByText('OTRO')).toBeTruthy();

    // Un programa nuevo guardado en esa carpeta aparece sin volver a abrirla.
    listar.mockResolvedValue([...actuales, { nombre: 'OTRO.clp', ruta: 'C:/fuentes/OTRO.clp' }, { nombre: 'NUEVO.clp', ruta: 'C:/fuentes/NUEVO.clp' }]);
    act(() => useProgramas.getState().nuevo('CLP', 'NUEVO'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('NUEVO', { selector: '.archivo-nombre' })).toBeTruthy();
  });
});

describe('la aplicación tiene la sección Programas', () => {
  it('se elige en la barra de secciones', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Programas' }));
    expect(await screen.findByText('Programas (COBOL / CL)')).toBeTruthy();
  });
});
