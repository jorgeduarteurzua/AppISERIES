// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { parsearTabla } from '@core/tablas/parserTabla';
import { tipoDeTabla } from '@core/tablas/modelo';
import { SeccionTablas } from '../SeccionTablas';
import { useConjuntoCrud } from '../estado/conjuntoCrud';
import { useTablas } from '../estado/storeTablas';

const PF = parsearTabla(
  [
    '     A          R RCLIENTE',
    '     A            RUT            9S 0',
    '     A            NOMBRE        40A',
    '     A            COMUNA         5S 0',
    '     A          K RUT',
  ].join('\n') + '\n',
  'CLIENTES.pf',
);
const LF1 = parsearTabla(['     A          R RCLIENTE                  PFILE(CLIENTES)', '     A          K NOMBRE'].join('\n') + '\n', 'CLIENTESL1.lf');

let guardarFuente: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  window.confirm = () => true;
  useConjuntoCrud.setState({ conjunto: null });
  useTablas.setState(useTablas.getInitialState(), true);
  guardarFuente = vi.fn().mockResolvedValue('C:\\datos\\CLIENTESL2.lf');
  (window as unknown as { api: unknown }).api = {
    guardarFuente,
    escribirFuente: vi.fn(),
    leerFuente: vi.fn(),
    listarCarpeta: vi.fn().mockResolvedValue([]),
    notificarModificado: vi.fn(),
  };
  useTablas.setState({
    carpeta: 'C:\\datos',
    archivos: [
      { nombre: 'CLIENTES.pf', ruta: 'C:\\datos\\CLIENTES.pf', clave: 'CLIENTES', tipo: 'PF' },
      { nombre: 'CLIENTESL1.lf', ruta: 'C:\\datos\\CLIENTESL1.lf', clave: 'CLIENTESL1', tipo: 'LF' },
    ],
    catalogo: { CLIENTES: PF, CLIENTESL1: LF1 },
    tabla: PF,
    nombreArchivoActual: 'CLIENTES.pf',
    rutaActual: 'C:\\datos\\CLIENTES.pf',
    registroId: PF.registros[0].id,
  });
});
afterEach(() => cleanup());

describe('índices del físico en Tablas', () => {
  it('muestra los lógicos del físico con su llave', () => {
    render(<SeccionTablas />);
    const lista = screen.getByRole('list', { name: 'Índices del archivo' });
    expect(within(lista).getByText('CLIENTESL1')).toBeTruthy();
    expect(within(lista).getByText('NOMBRE')).toBeTruthy();
  });

  it('crea un índice: vista previa en DDS y SQL, se abre como LF nuevo y se propone guardarlo en la carpeta', async () => {
    render(<SeccionTablas />);
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo índice…' }));
    const dialogo = screen.getByRole('dialog', { name: 'Nuevo índice' });
    expect((within(dialogo).getByDisplayValue('CLIENTESL2') as HTMLInputElement).value).toBe('CLIENTESL2');
    expect(within(dialogo).getByRole('alert').textContent).toMatch(/al menos un campo/);
    fireEvent.change(within(dialogo).getByLabelText('Agregar campo a la llave'), { target: { value: 'COMUNA' } });
    fireEvent.change(within(dialogo).getByLabelText('Agregar campo a la llave'), { target: { value: 'NOMBRE' } });
    fireEvent.click(within(dialogo).getByLabelText('NOMBRE descendente'));
    const dds = within(dialogo).getByLabelText('DDS del índice').textContent ?? '';
    expect(dds).toMatch(/PFILE\(CLIENTES\)/);
    expect(dds).toMatch(/K COMUNA\n/);
    expect(dds).toMatch(/K NOMBRE +DESCEND/);
    fireEvent.click(within(dialogo).getByRole('tab', { name: 'SQL (CREATE INDEX)' }));
    expect(within(dialogo).getByLabelText('SQL del índice').textContent).toMatch(/CREATE INDEX CLIENTESL2\s+ON CLIENTES \(COMUNA( ASC)?, NOMBRE DESC\)/);

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Crear índice' }));
    const st = useTablas.getState();
    expect(st.tabla!.nombre).toBe('CLIENTESL2');
    expect(tipoDeTabla(st.tabla!)).toBe('LF');
    expect(st.modificado).toBe(true);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    });
    await waitFor(() => expect(guardarFuente).toHaveBeenCalled());
    expect(guardarFuente.mock.calls[0][1]).toBe('C:\\datos\\CLIENTESL2.lf');
  });
});
