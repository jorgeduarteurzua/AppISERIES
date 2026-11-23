// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import iconv from 'iconv-lite';
import type { ConexionPublica, PeticionEnvio, ResultadoEnvio } from '@core/as400/tipos';
import { dirFuentesTablas } from '@core/tablas/fuentesPrueba';
import { parsearTabla } from '@core/tablas/parserTabla';
import { DialogoConexionAs400 } from './DialogoConexionAs400';
import { DialogoEnvioAs400 } from './DialogoEnvioAs400';
import { DialogoTraerAs400 } from './DialogoTraerAs400';
import { App } from '../App';
import { DialogoCrud, migrarTeclas, sugerirNombres } from '../tablas/DialogoCrud';
import { SeccionTablas } from '../SeccionTablas';
import { fuentesDelConjunto, useConjuntoCrud } from '../estado/conjuntoCrud';
import { useAs400 } from '../estado/as400';
import type { FuenteEnvio } from '../estado/as400';
import { useNavegacion } from '../estado/navegacion';
import { useStore } from '../estado/store';
import { useTablas } from '../estado/storeTablas';

function conexion(extra: Partial<ConexionPublica> = {}): ConexionPublica {
  return {
    host: '10.0.0.5',
    puerto: 21,
    usuario: 'JDUARTE',
    seguro: false,
    tienePassword: true,
    passwordSoloSesion: false,
    cifradoDisponible: true,
    destino: { bibliotecaFuente: 'MIFUENTES', bibliotecaObjeto: 'MIOBJ', archivoFuente: {}, bibliotecasExtra: [] },
    ...extra,
  };
}

const ok = (nombre: string) => ({ nombre, ok: true, mensaje: 'ok' });
function resultado(okEnvio: boolean, listado: string | null = null): ResultadoEnvio {
  return {
    ok: okEnvio,
    pasos: [okEnvio ? ok('Compilar') : { nombre: 'Compilar', ok: false, mensaje: 'CPF fallo' }],
    listado,
    rutaMiembro: '/QSYS.LIB/X.LIB/Y.FILE/Z.MBR',
  };
}

type Api = {
  as400: {
    leer: ReturnType<typeof vi.fn>;
    guardar: ReturnType<typeof vi.fn>;
    olvidarPassword: ReturnType<typeof vi.fn>;
    guardarDestino: ReturnType<typeof vi.fn>;
    probar: ReturnType<typeof vi.fn>;
    enviar: ReturnType<typeof vi.fn>;
    listarMiembros: ReturnType<typeof vi.fn>;
    traer: ReturnType<typeof vi.fn>;
  };
  listarCarpeta: ReturnType<typeof vi.fn>;
  guardarFuente: ReturnType<typeof vi.fn>;
  guardarEnCarpeta: ReturnType<typeof vi.fn>;
};
let api: Api;

beforeEach(() => {
  useAs400.setState(useAs400.getInitialState(), true);
  useNavegacion.setState(useNavegacion.getInitialState(), true);
  useStore.setState(useStore.getInitialState(), true);
  useTablas.setState(useTablas.getInitialState(), true);
  window.confirm = () => true;
  api = {
    as400: {
      leer: vi.fn().mockResolvedValue({ conexion: conexion(), error: null }),
      guardar: vi.fn().mockImplementation(async (e) => ({ conexion: conexion({ ...e, password: undefined }), error: null })),
      olvidarPassword: vi.fn().mockResolvedValue({ conexion: conexion({ tienePassword: false }), error: null }),
      guardarDestino: vi.fn().mockImplementation(async (d) => ({ conexion: conexion({ destino: d }), error: null })),
      probar: vi.fn().mockResolvedValue([ok('Conexión'), ok('Sistema')]),
      enviar: vi.fn().mockResolvedValue(resultado(true)),
      listarMiembros: vi.fn().mockResolvedValue({
        ok: true,
        miembros: [
          { nombre: 'ANCALCIO', fecha: '2026-07-13 14:52' },
          { nombre: 'PGMREF', fecha: '2025-06-25' },
          { nombre: 'SI1118PRG2', fecha: null },
        ],
        pasos: [],
      }),
      traer: vi.fn().mockResolvedValue({
        carpeta: 'C:/fuentes',
        ok: true,
        pasos: [],
        resultados: [{ miembro: 'PGMREF', ok: true, omitido: false, archivo: 'PGMREF.cbl', copia: null, mensaje: 'Guardado.' }],
      }),
    },
    listarCarpeta: vi.fn().mockResolvedValue([{ nombre: 'PGMREF.cbl', ruta: 'C:/fuentes/PGMREF.cbl' }]),
    guardarFuente: vi.fn().mockResolvedValue('C:/salida/x.dspf'),
    guardarEnCarpeta: vi.fn().mockImplementation(async (archivos: Array<{ nombre: string }>) => ({
      carpeta: 'C:/fuentes',
      rutas: archivos.map((a) => `C:/fuentes/${a.nombre}`),
      copias: [],
    })),
  };
  localStorage.clear();
  (window as unknown as { api: Api }).api = api;
});

afterEach(() => cleanup());

describe('conexión al AS400', () => {
  it('guarda los datos con la contraseña nueva y la prueba, sin mostrar la guardada', async () => {
    act(() => {
      useAs400.getState().establecerConexion(conexion({ host: '', usuario: '', tienePassword: false }));
      useAs400.getState().abrirConexion();
    });
    render(<DialogoConexionAs400 />);
    fireEvent.change(screen.getByLabelText('Servidor'), { target: { value: ' 10.0.0.9 ' } });
    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'JDUARTE' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Secreta1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y probar' }));

    await waitFor(() => expect(api.as400.probar).toHaveBeenCalled());
    expect(api.as400.guardar).toHaveBeenCalledWith({
      host: '10.0.0.9',
      puerto: 21,
      usuario: 'JDUARTE',
      seguro: false,
      password: 'Secreta1',
    });
    expect(await screen.findByText('Sistema')).toBeTruthy();
    // La contraseña escrita se borra del campo.
    expect((screen.getByLabelText('Contraseña') as HTMLInputElement).value).toBe('');
    expect(useAs400.getState().conexion?.host).toBe('10.0.0.9');
  });

  it('al cambiar otros datos no manda la contraseña guardada y permite cambiarla o borrarla', async () => {
    act(() => {
      useAs400.getState().establecerConexion(conexion());
      useAs400.getState().abrirConexion();
    });
    render(<DialogoConexionAs400 />);
    const campo = screen.getByLabelText('Contraseña') as HTMLInputElement;
    expect(campo.value).toBe('');
    expect(campo.placeholder).toMatch(/Guardada/);

    fireEvent.change(screen.getByLabelText('Puerto'), { target: { value: '2121' } });
    fireEvent.click(screen.getByRole('button', { name: /^Guardar$/ }));
    await waitFor(() => expect(api.as400.guardar).toHaveBeenCalled());
    expect(api.as400.guardar.mock.calls[0][0]).toMatchObject({ puerto: 2121, password: undefined });
    // «Guardar» cierra el diálogo.
    await waitFor(() => expect(useAs400.getState().conexionAbierta).toBe(false));

    act(() => useAs400.getState().abrirConexion());
    fireEvent.click(screen.getByRole('button', { name: 'Borrar contraseña' }));
    await waitFor(() => expect(api.as400.olvidarPassword).toHaveBeenCalled());
    await waitFor(() => expect(useAs400.getState().conexion?.tienePassword).toBe(false));
  });

  it('rechaza datos no válidos sin llamar al proceso principal', async () => {
    act(() => {
      useAs400.getState().establecerConexion(conexion());
      useAs400.getState().abrirConexion();
    });
    render(<DialogoConexionAs400 />);
    fireEvent.change(screen.getByLabelText('Servidor'), { target: { value: 'a b' } });
    fireEvent.click(screen.getByRole('button', { name: /^Guardar$/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/servidor/i);
    expect(api.as400.guardar).not.toHaveBeenCalled();
  });

  it('avisa si el sistema no puede cifrar la contraseña', () => {
    act(() => {
      useAs400.getState().establecerConexion(conexion({ cifradoDisponible: false }));
      useAs400.getState().abrirConexion();
    });
    render(<DialogoConexionAs400 />);
    expect(screen.getByText(/no puede cifrar la contraseña/)).toBeTruthy();
  });
});

describe('enviar al AS400', () => {
  const fuentes: FuenteEnvio[] = [
    { clave: 'dspf', etiqueta: 'Pantalla', tipo: 'DSPF', miembro: 'clientd', texto: '     A          R REG1\n', descripcion: '', incluido: true },
    {
      clave: 'cbl',
      etiqueta: 'Programa',
      tipo: 'SQLCBL',
      tiposPermitidos: ['SQLCBL', 'SQLCBLLE'],
      miembro: 'clientp',
      texto: '       IDENTIFICATION DIVISION.\n',
      descripcion: '',
      incluido: true,
    },
  ];

  const abrir = (c: ConexionPublica | null = conexion()) => {
    act(() => {
      if (c) useAs400.getState().establecerConexion(c);
      useAs400.getState().abrirEnvio(fuentes);
    });
    render(<DialogoEnvioAs400 />);
  };

  it('recuerda el destino, envía en orden y muestra los pasos', async () => {
    abrir();
    expect((screen.getByLabelText(/Biblioteca fuente/) as HTMLInputElement).value).toBe('MIFUENTES');
    expect((screen.getByLabelText('Archivo fuente de Pantalla') as HTMLInputElement).value).toBe('QDSPSRC');
    expect((screen.getByLabelText('Archivo fuente de Programa') as HTMLInputElement).value).toBe('QCBLSRC');

    fireEvent.click(screen.getByRole('button', { name: 'Enviar y compilar' }));
    await waitFor(() => expect(api.as400.enviar).toHaveBeenCalledTimes(2));

    const [primera, segunda] = api.as400.enviar.mock.calls.map((c) => c[0] as PeticionEnvio);
    expect(primera).toMatchObject({
      tipo: 'DSPF',
      miembro: 'CLIENTD',
      archivoFuente: 'QDSPSRC',
      bibliotecaFuente: 'MIFUENTES',
      bibliotecaObjeto: 'MIOBJ',
      compilar: true,
    });
    expect(segunda).toMatchObject({ tipo: 'SQLCBL', miembro: 'CLIENTP', archivoFuente: 'QCBLSRC' });
    expect(api.as400.guardarDestino).toHaveBeenCalledTimes(1);
    expect(api.as400.guardarDestino.mock.invocationCallOrder[0]).toBeLessThan(api.as400.enviar.mock.invocationCallOrder[0]);
    expect((await screen.findAllByText('Compilar')).length).toBe(2);
  });

  it('permite elegir COBOL OPM o ILE', async () => {
    abrir();
    fireEvent.change(screen.getByLabelText('Tipo de Programa'), { target: { value: 'SQLCBLLE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar y compilar' }));
    await waitFor(() => expect(api.as400.enviar).toHaveBeenCalledTimes(2));
    expect(api.as400.enviar.mock.calls[1][0]).toMatchObject({ tipo: 'SQLCBLLE' });
  });

  it('no sigue si el primero falla y muestra el listado del compilador', async () => {
    api.as400.enviar.mockResolvedValueOnce(resultado(false, 'SQL0204 TABLA NO ENCONTRADA'));
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar y compilar' }));
    expect(await screen.findByText(/SQL0204/)).toBeTruthy();
    expect(api.as400.enviar).toHaveBeenCalledTimes(1);
  });

  it('sin compilar no pide la biblioteca de compilación', async () => {
    abrir(conexion({ destino: { bibliotecaFuente: 'MIFUENTES', bibliotecaObjeto: '', archivoFuente: {}, bibliotecasExtra: [] } }));
    fireEvent.click(screen.getByLabelText('Compilar después de enviar'));
    expect(screen.queryByLabelText(/Biblioteca de compilación/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(api.as400.enviar).toHaveBeenCalledTimes(2));
    expect(api.as400.enviar.mock.calls[0][0]).toMatchObject({ compilar: false });
  });

  it('solo envía lo marcado', async () => {
    abrir();
    fireEvent.click(screen.getByLabelText('Pantalla'));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar y compilar' }));
    await waitFor(() => expect(api.as400.enviar).toHaveBeenCalledTimes(1));
    expect(api.as400.enviar.mock.calls[0][0]).toMatchObject({ tipo: 'SQLCBL' });
  });

  it('muestra los errores de validación sin conectarse', async () => {
    abrir(conexion({ destino: { bibliotecaFuente: '', bibliotecaObjeto: 'MIOBJ', archivoFuente: {}, bibliotecasExtra: [] } }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar y compilar' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/biblioteca del fuente/);
    expect(api.as400.enviar).not.toHaveBeenCalled();
  });

  it('pide configurar la conexión si falta', async () => {
    abrir(conexion({ tienePassword: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar y compilar' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/configura la conexión/i);
    expect(api.as400.enviar).not.toHaveBeenCalled();
  });

  it('con un PF y REPLACE pregunta antes de seguir', async () => {
    const confirmar = vi.fn().mockReturnValue(false);
    window.confirm = confirmar;
    act(() => {
      useAs400.getState().establecerConexion(conexion());
      useAs400.getState().abrirEnvio([{ ...fuentes[0], clave: 'pf', tipo: 'PF', etiqueta: 'Archivo físico' }]);
    });
    render(<DialogoEnvioAs400 />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar y compilar' }));
    await waitFor(() => expect(confirmar).toHaveBeenCalled());
    expect(String(confirmar.mock.calls[0][0])).toMatch(/borra los datos/);
    expect(api.as400.enviar).not.toHaveBeenCalled();
  });
});

describe('generar CRUD', () => {
  const f = readdirSync(dirFuentesTablas).find((n) => n.endsWith('ASQRY03F.TXT'))!;
  const tabla = parsearTabla(iconv.decode(readFileSync(join(dirFuentesTablas, f)), 'windows-1252'), f);

  it('propone los nombres a partir de la tabla', () => {
    expect(sugerirNombres('ASQRY03F')).toEqual({ pantalla: 'ASQRY03D', programa: 'ASQRY03P' });
    expect(sugerirNombres('CLIENTES')).toEqual({ pantalla: 'CLIENTESD', programa: 'CLIENTESP' });
    expect(sugerirNombres('ABCDEFGHIJ')).toEqual({ pantalla: 'ABCDEFGHID', programa: 'ABCDEFGHIP' });
  });

  it('genera la pantalla y el programa y los manda a enviar', async () => {
    const cerrar = vi.fn();
    render(<DialogoCrud tabla={tabla} nombre="ASQRY03F" onCerrar={cerrar} />);
    fireEvent.change(screen.getByLabelText('Programa'), { target: { value: 'MANTEVE' } });
    fireEvent.change(screen.getByLabelText('Autor'), { target: { value: 'Jorge Duarte' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));

    const fuente = await screen.findByLabelText('Fuente DDS generado');
    expect(fuente.textContent).toContain('R S01');
    fireEvent.click(screen.getByRole('tab', { name: 'Programa (COBOL)' }));
    const cobol = screen.getByLabelText('Fuente COBOL generado').textContent ?? '';
    expect(cobol).toContain('PROGRAM-ID.  MANTEVE.');
    expect(cobol).toContain('AUTHOR. JORGE DUARTE.');
    expect(cobol).toContain('WORKSTATION-ASQRY03D-SI');
    expect(localStorage.getItem('appiseries.autor')).toBe('Jorge Duarte');

    fireEvent.change(screen.getByLabelText('Compilar como'), { target: { value: 'SQLCBLLE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generar de nuevo' }));
    await screen.findByLabelText('Fuente COBOL generado');

    fireEvent.click(screen.getByRole('button', { name: 'Enviar los dos…' }));
    const envio = useAs400.getState().envio!;
    expect(envio.map((x) => [x.tipo, x.miembro, x.incluido])).toEqual([
      ['DSPF', 'ASQRY03D', true],
      ['SQLCBLLE', 'MANTEVE', true],
    ]);
    expect(envio[1].tiposPermitidos).toEqual(['SQLCBL', 'SQLCBLLE']);
    expect(envio[0].texto).toContain('SFLCTL(S01)');
    expect(envio[1].texto).toContain('EXEC SQL');
  });

  it('explica por qué no se puede generar si falta una llave en el detalle', async () => {
    render(<DialogoCrud tabla={tabla} nombre="ASQRY03F" onCerrar={() => undefined} />);
    fireEvent.click(screen.getByLabelText('CODEVE en el detalle'));
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/llave CODEVE debe estar en el detalle/);
  });

  it('una tabla sin llave muestra el motivo y no deja generar', () => {
    const sinLlave = parsearTabla('     A          R REG1\n     A            CAMPO1        10A\n', 'SINLLAVE');
    render(<DialogoCrud tabla={sinLlave} nombre="SINLLAVE" onCerrar={() => undefined} />);
    expect(screen.getByRole('alert').textContent).toMatch(/no tiene llave/);
    expect((screen.getByRole('button', { name: 'Generar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('abre la pantalla generada en el editor y cambia de sección', async () => {
    const cerrar = vi.fn();
    render(<DialogoCrud tabla={tabla} nombre="ASQRY03F" onCerrar={cerrar} />);
    act(() => useNavegacion.getState().irA('tablas'));
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir pantalla en el editor' }));
    expect(useStore.getState().pantalla?.registros.map((r) => r.nombre)).toEqual(['S01', 'C01', 'FC01', 'R01', 'W01']);
    expect(useStore.getState().nombreArchivoActual).toBe('ASQRY03D');
    expect(useStore.getState().modificado).toBe(true);
    expect(useNavegacion.getState().seccion).toBe('pantallas');
    expect(cerrar).toHaveBeenCalled();
  });

  it('guarda la pantalla y el programa con nombres sugeridos', async () => {
    render(<DialogoCrud tabla={tabla} nombre="ASQRY03F" onCerrar={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar pantalla…' }));
    await waitFor(() => expect(api.guardarFuente).toHaveBeenCalledTimes(1));
    expect(api.guardarFuente.mock.calls[0][1]).toBe('ASQRY03D.dspf');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar programa…' }));
    await waitFor(() => expect(api.guardarFuente).toHaveBeenCalledTimes(2));
    expect(api.guardarFuente.mock.calls[1][1]).toBe('ASQRY03P.sqlcbl');
  });
});

describe('generar CRUD: opciones nuevas', () => {
  const f = readdirSync(dirFuentesTablas).find((n) => n.endsWith('ASQRY03F.TXT'))!;
  const tabla = parsearTabla(iconv.decode(readFileSync(join(dirFuentesTablas, f)), 'windows-1252'), f);
  const generado = async () => (await screen.findByLabelText('Fuente DDS generado')).textContent ?? '';

  it('permite elegir pantalla window y 132 columnas', async () => {
    render(<DialogoCrud tabla={tabla} nombre="ASQRY03F" onCerrar={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Tipo de pantalla'), { target: { value: 'window' } });
    fireEvent.change(screen.getByLabelText('Tamaño'), { target: { value: '132' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    const dds = await generado();
    expect(dds).toContain('R FWC01');
    expect(dds).toContain('R WS01');
    expect(dds).toContain('DSPSIZ(27 132 *DS4)');
  });

  it('propone fecha y hora según el campo y deja elegir el formato', async () => {
    render(<DialogoCrud tabla={tabla} nombre="ASQRY03F" onCerrar={() => undefined} />);
    expect((screen.getByLabelText('Tipo de FECCRE') as HTMLSelectElement).value).toBe('fecha');
    expect((screen.getByLabelText('Tipo de HORCRE') as HTMLSelectElement).value).toBe('hora');
    expect((screen.getByLabelText('Tipo de DESEVE') as HTMLSelectElement).value).toBe('');
    // Un campo de texto de 50 no puede ser fecha ni hora.
    expect(Array.from((screen.getByLabelText('Tipo de DESEVE') as HTMLSelectElement).options).map((o) => o.value)).toEqual(['']);

    fireEvent.change(screen.getByLabelText('Formato de FECCRE'), { target: { value: 'YYYY-MM-DD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    await generado();
    fireEvent.click(screen.getByRole('tab', { name: 'Programa (COBOL)' }));
    const cobol = screen.getByLabelText('Fuente COBOL generado').textContent ?? '';
    expect(cobol).toContain('MOVE FT-AAAA TO TXT-FECHA(1:4)');
    expect(cobol).toContain('MOVE "-" TO TXT-FECHA(5:1)');
  });

  it('quitar el formato deja el campo como número', async () => {
    render(<DialogoCrud tabla={tabla} nombre="ASQRY03F" onCerrar={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Tipo de FECCRE'), { target: { value: '' } });
    expect(screen.queryByLabelText('Formato de FECCRE')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    await generado();
    fireEvent.click(screen.getByRole('tab', { name: 'Programa (COBOL)' }));
    expect(screen.getByLabelText('Fuente COBOL generado').textContent).not.toContain('FMT-FECCRE.');
  });

  it('asigna un valor a un campo que no se muestra', async () => {
    render(<DialogoCrud tabla={tabla} nombre="ASQRY03F" onCerrar={() => undefined} />);
    fireEvent.click(screen.getByLabelText('USRCRE en el detalle'));
    fireEvent.change(screen.getByLabelText('Valor de USRCRE al agregar'), { target: { value: 'usuario' } });
    fireEvent.change(screen.getByLabelText('Valor de USRCRE al modificar'), { target: { value: 'fijo' } });
    fireEvent.change(screen.getByLabelText('Valor fijo de USRCRE al modificar'), { target: { value: 'WEB' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    await generado();
    fireEvent.click(screen.getByRole('tab', { name: 'Programa (COBOL)' }));
    const cobol = screen.getByLabelText('Fuente COBOL generado').textContent ?? '';
    expect(cobol).toMatch(/INSERT INTO ASQRY03F[\s\S]*USRCRE[\s\S]*USER/);
    expect(cobol).toContain("USRCRE = 'WEB'");
  });

  it('los campos en el detalle no ofrecen valor automático', () => {
    render(<DialogoCrud tabla={tabla} nombre="ASQRY03F" onCerrar={() => undefined} />);
    expect(screen.queryByLabelText('Valor de DESEVE al agregar')).toBeNull();
    fireEvent.click(screen.getByLabelText('DESEVE en el detalle'));
    expect(screen.getByLabelText('Valor de DESEVE al agregar')).toBeTruthy();
  });

  it('agrega una tecla nueva y deja su párrafo en el programa', async () => {
    render(<DialogoCrud tabla={tabla} nombre="ASQRY03F" onCerrar={() => undefined} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Teclas' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Tecla' }));
    const numero = screen.getByLabelText('Número de la tecla 12') as HTMLInputElement;
    expect(numero.value).toBe('10');
    fireEvent.change(screen.getByLabelText('Texto de la tecla F10'), { target: { value: 'Imprimir' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    expect(await generado()).toContain("CF10(10 'Imprimir')");
    fireEvent.click(screen.getByRole('tab', { name: 'Programa (COBOL)' }));
    expect(screen.getByLabelText('Fuente COBOL generado').textContent).toContain('ACCION-F10.');
    // Las teclas quedan guardadas para la próxima vez.
    expect(JSON.parse(localStorage.getItem('appiseries.teclasCrud') ?? '[]').map((t: { numero: number }) => t.numero)).toContain(10);
  });

  it('cambiar el número o la acción de una tecla se refleja en la pantalla', async () => {
    render(<DialogoCrud tabla={tabla} nombre="ASQRY03F" onCerrar={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Número de la tecla 11'), { target: { value: '24' } });
    fireEvent.change(screen.getByLabelText('Texto de la tecla F24'), { target: { value: 'Borrar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    const dds = await generado();
    expect(dds).toContain("CF24(24 'Borrar')");
    expect(dds).not.toContain('CF23');
  });

  it('quitar la tecla de salir da un error claro', async () => {
    render(<DialogoCrud tabla={tabla} nombre="ASQRY03F" onCerrar={() => undefined} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Teclas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar la tecla F3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar la tecla F12' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Falta una tecla para salir/);
  });

  it('«Teclas por defecto» devuelve las teclas de siempre', () => {
    render(<DialogoCrud tabla={tabla} nombre="ASQRY03F" onCerrar={() => undefined} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Teclas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar la tecla F3' }));
    expect(screen.queryByLabelText('Texto de la tecla F3')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Teclas por defecto' }));
    expect(screen.getByLabelText('Texto de la tecla F3')).toBeTruthy();
  });

  it('«Guardar los dos…» escribe la pantalla y el programa en una carpeta y la recuerda', async () => {
    render(<DialogoCrud tabla={tabla} nombre="ASQRY03F" onCerrar={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Compilar como'), { target: { value: 'SQLCBLLE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar los dos…' }));

    await waitFor(() => expect(api.guardarEnCarpeta).toHaveBeenCalledTimes(1));
    const [archivos, sugerida] = api.guardarEnCarpeta.mock.calls[0];
    expect(archivos.map((a: { nombre: string }) => a.nombre)).toEqual(['ASQRY03D.dspf', 'ASQRY03P.sqlcblle']);
    expect(archivos[0].texto).toContain('R S01');
    expect(archivos[1].texto).toContain('PROGRAM-ID.  ASQRY03P.');
    expect(sugerida).toBe('');
    expect(await screen.findByText(/Guardado en C:\/fuentes: ASQRY03D\.dspf, ASQRY03P\.sqlcblle/)).toBeTruthy();

    // La segunda vez propone la carpeta anterior.
    fireEvent.click(screen.getByRole('button', { name: 'Guardar los dos…' }));
    await waitFor(() => expect(api.guardarEnCarpeta).toHaveBeenCalledTimes(2));
    expect(api.guardarEnCarpeta.mock.calls[1][1]).toBe('C:/fuentes');
  });

  it('si se cancela el diálogo de carpeta lo avisa', async () => {
    api.guardarEnCarpeta.mockResolvedValueOnce(null);
    render(<DialogoCrud tabla={tabla} nombre="ASQRY03F" onCerrar={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar los dos…' }));
    expect(await screen.findByText('Guardado cancelado.')).toBeTruthy();
  });
});

describe('copia local al enviar al AS400', () => {
  const fuentes: FuenteEnvio[] = [
    { clave: 'dspf', etiqueta: 'Pantalla', tipo: 'DSPF', miembro: 'clientd', texto: '     A          R REG1\n', descripcion: '', incluido: true },
    { clave: 'cbl', etiqueta: 'Programa', tipo: 'SQLCBL', miembro: 'clientp', texto: '       IDENTIFICATION DIVISION.\n', descripcion: '', incluido: true },
  ];

  it('guarda los fuentes en el equipo antes de enviarlos', async () => {
    act(() => {
      useAs400.getState().establecerConexion(conexion());
      useAs400.getState().abrirEnvio(fuentes);
    });
    render(<DialogoEnvioAs400 />);
    fireEvent.click(screen.getByLabelText('Guardar también una copia de los fuentes en mi equipo'));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar y compilar' }));
    await waitFor(() => expect(api.as400.enviar).toHaveBeenCalledTimes(2));
    expect(api.guardarEnCarpeta).toHaveBeenCalledTimes(1);
    expect(api.guardarEnCarpeta.mock.calls[0][0].map((a: { nombre: string }) => a.nombre)).toEqual(['CLIENTD.dspf', 'CLIENTP.sqlcbl']);
    expect(api.guardarEnCarpeta.mock.invocationCallOrder[0]).toBeLessThan(api.as400.enviar.mock.invocationCallOrder[0]);
  });

  it('si se cancela la copia local, el envío sigue', async () => {
    api.guardarEnCarpeta.mockResolvedValueOnce(null);
    act(() => {
      useAs400.getState().establecerConexion(conexion());
      useAs400.getState().abrirEnvio(fuentes);
    });
    render(<DialogoEnvioAs400 />);
    fireEvent.click(screen.getByLabelText('Guardar también una copia de los fuentes en mi equipo'));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar y compilar' }));
    await waitFor(() => expect(api.as400.enviar).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Guardado cancelado.')).toBeTruthy();
  });

  it('sin marcar la casilla no se guarda nada', async () => {
    act(() => {
      useAs400.getState().establecerConexion(conexion());
      useAs400.getState().abrirEnvio(fuentes);
    });
    render(<DialogoEnvioAs400 />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar y compilar' }));
    await waitFor(() => expect(api.as400.enviar).toHaveBeenCalledTimes(2));
    expect(api.guardarEnCarpeta).not.toHaveBeenCalled();
  });
});

describe('envío por separado desde el CRUD', () => {
  const f = readdirSync(dirFuentesTablas).find((n) => n.endsWith('ASQRY03F.TXT'))!;
  const tabla = parsearTabla(iconv.decode(readFileSync(join(dirFuentesTablas, f)), 'windows-1252'), f);

  it('«Enviar pantalla…» manda solo la pantalla, con su archivo fuente', async () => {
    render(<DialogoCrud tabla={tabla} nombre="ASQRY03F" onCerrar={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar pantalla…' }));
    const envio = useAs400.getState().envio!;
    expect(envio.map((x) => [x.tipo, x.miembro])).toEqual([['DSPF', 'ASQRY03D']]);
  });

  it('«Enviar programa…» manda solo el programa y deja elegir OPM o ILE', async () => {
    render(<DialogoCrud tabla={tabla} nombre="ASQRY03F" onCerrar={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar programa…' }));
    const envio = useAs400.getState().envio!;
    expect(envio.map((x) => [x.tipo, x.miembro])).toEqual([['SQLCBL', 'ASQRY03P']]);
    expect(envio[0].tiposPermitidos).toEqual(['SQLCBL', 'SQLCBLLE']);
  });

  it('en el diálogo de envío cada fuente pide su archivo según el tipo', async () => {
    act(() => useAs400.getState().establecerConexion(conexion()));
    render(<DialogoCrud tabla={tabla} nombre="ASQRY03F" onCerrar={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar los dos…' }));
    render(<DialogoEnvioAs400 />);
    expect((screen.getByLabelText('Archivo fuente de Pantalla') as HTMLInputElement).value).toBe('QDSPSRC');
    expect((screen.getByLabelText('Archivo fuente de Programa') as HTMLInputElement).value).toBe('QCBLSRC');
  });

  it('el ajuste de un texto se manda como CNTFLD', async () => {
    render(<DialogoCrud tabla={tabla} nombre="ASQRY03F" onCerrar={() => undefined} />);
    const ajuste = screen.getByLabelText('Ajuste de DESEVE') as HTMLInputElement;
    expect(ajuste.placeholder).toBe('auto');
    // Un campo numérico no se puede partir.
    expect((screen.getByLabelText('Ajuste de CODEVE') as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText('Ajuste de FECCRE') as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(ajuste, { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    expect(await screen.findByLabelText('Fuente DDS generado')).toBeTruthy();
    expect(screen.getByLabelText('Fuente DDS generado').textContent).toContain('CNTFLD(025)');
  });

  it('un ajuste que no sirve muestra el motivo', async () => {
    render(<DialogoCrud tabla={tabla} nombre="ASQRY03F" onCerrar={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Tamaño'), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText('Ajuste de DESEVE'), { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/DESEVE debe ser un número entero menor que su largo/);
  });
});

describe('traer fuentes del AS400', () => {
  const abrirTraer = (archivo = 'QCBLSRC', c: ConexionPublica | null = conexion()) => {
    act(() => {
      if (c) useAs400.getState().establecerConexion(c);
      useAs400.getState().abrirTraer(archivo);
    });
    render(<DialogoTraerAs400 />);
  };

  it('propone la biblioteca recordada y el archivo del tipo, y lista los miembros con su fecha', async () => {
    abrirTraer();
    expect((screen.getByLabelText('Biblioteca') as HTMLInputElement).value).toBe('MIFUENTES');
    expect((screen.getByLabelText('Archivo fuente') as HTMLInputElement).value).toBe('QCBLSRC');
    fireEvent.click(screen.getByRole('button', { name: 'Listar' }));
    expect(await screen.findByText('ANCALCIO')).toBeTruthy();
    expect(api.as400.listarMiembros).toHaveBeenCalledWith('MIFUENTES', 'QCBLSRC');
    expect(screen.getByText('2025-06-25')).toBeTruthy();
    expect(screen.getByText(/3 miembros en MIFUENTES\/QCBLSRC/)).toBeTruthy();
  });

  it('normaliza los nombres, recuerda la biblioteca nueva y avisa si falta algo', async () => {
    abrirTraer('QDSPSRC');
    fireEvent.change(screen.getByLabelText('Biblioteca'), { target: { value: ' libjdu ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Listar' }));
    await screen.findByText('PGMREF');
    expect(api.as400.listarMiembros).toHaveBeenCalledWith('LIBJDU', 'QDSPSRC');
    expect(api.as400.guardarDestino.mock.calls[0][0]).toMatchObject({ bibliotecaFuente: 'LIBJDU' });
    expect(useAs400.getState().conexion?.destino.bibliotecaFuente).toBe('LIBJDU');

    fireEvent.change(screen.getByLabelText('Archivo fuente'), { target: { value: 'Q) X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Listar' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/archivo fuente/);
  });

  it('permite seleccionar uno o más miembros y los trae', async () => {
    abrirTraer();
    fireEvent.click(screen.getByRole('button', { name: 'Listar' }));
    await screen.findByText('PGMREF');
    const traer = () => screen.getByRole('button', { name: /^Traer los marcados/ }) as HTMLButtonElement;
    expect(traer().disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Traer PGMREF'));
    fireEvent.click(screen.getByLabelText('Traer ANCALCIO'));
    expect(traer().textContent).toContain('(2)');
    fireEvent.click(screen.getByLabelText('Reemplazar los que ya existen en la carpeta (queda una copia .bak)'));
    fireEvent.click(traer());
    await waitFor(() => expect(api.as400.traer).toHaveBeenCalledTimes(1));
    const peticion = api.as400.traer.mock.calls[0][0];
    expect(peticion).toMatchObject({ biblioteca: 'MIFUENTES', archivoFuente: 'QCBLSRC', sobrescribir: true });
    expect([...peticion.miembros].sort()).toEqual(['ANCALCIO', 'PGMREF']);
    expect(await screen.findByText(/1 guardado.* en C:\/fuentes/)).toBeTruthy();
    expect(screen.getByText('PGMREF.cbl')).toBeTruthy();
  });

  it('filtra por nombre y marca solo los visibles', async () => {
    abrirTraer();
    fireEvent.click(screen.getByRole('button', { name: 'Listar' }));
    await screen.findByText('PGMREF');
    fireEvent.change(screen.getByLabelText('Filtrar miembros'), { target: { value: 'pgm' } });
    expect(screen.queryByText('ANCALCIO')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Marcar los visibles' }));
    expect(screen.getByRole('button', { name: /^Traer los marcados \(1\)/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filtrar miembros'), { target: { value: 'zzz' } });
    expect(screen.getByText('Ningún miembro coincide.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar marcas' }));
    expect((screen.getByRole('button', { name: /^Traer los marcados/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('muestra el error del servidor si no puede listar', async () => {
    api.as400.listarMiembros.mockResolvedValueOnce({
      ok: false,
      miembros: [],
      pasos: [{ nombre: 'LIBJDU/QCBLXXX', ok: false, mensaje: 'No se pudo abrir el archivo fuente: 550 not found' }],
    });
    abrirTraer();
    fireEvent.click(screen.getByRole('button', { name: 'Listar' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/550 not found/);
    expect(screen.queryByLabelText('Filtrar miembros')).toBeNull();
  });

  it('informa lo que no se trajo y lo que se dejó sin reemplazar', async () => {
    api.as400.traer.mockResolvedValueOnce({
      carpeta: 'C:/fuentes',
      ok: false,
      pasos: [],
      resultados: [
        { miembro: 'PGMREF', ok: true, omitido: false, archivo: 'PGMREF.cbl', copia: null, mensaje: 'Guardado.' },
        { miembro: 'ANCALCIO', ok: false, omitido: true, archivo: 'ANCALCIO.cbl', copia: null, mensaje: 'Ya existe en la carpeta: no se reemplazó.' },
        { miembro: 'MQPUTJD', ok: false, omitido: false, archivo: null, copia: null, mensaje: '426 Member MQPUTJD not found.' },
      ],
    });
    abrirTraer();
    fireEvent.click(screen.getByRole('button', { name: 'Listar' }));
    await screen.findByText('PGMREF');
    fireEvent.click(screen.getByLabelText('Traer PGMREF'));
    fireEvent.click(screen.getByRole('button', { name: /^Traer los marcados/ }));
    expect(await screen.findByText(/1 guardado, 1 sin reemplazar, 1 con error/)).toBeTruthy();
    expect(screen.getByText(/no se reemplazó/)).toBeTruthy();
    expect(screen.getByText(/426 Member MQPUTJD not found/)).toBeTruthy();
  });

  it('si se cancela la carpeta no muestra resultados', async () => {
    api.as400.traer.mockResolvedValueOnce({ carpeta: null, ok: true, pasos: [], resultados: [] });
    abrirTraer();
    fireEvent.click(screen.getByRole('button', { name: 'Listar' }));
    await screen.findByText('PGMREF');
    fireEvent.click(screen.getByLabelText('Traer PGMREF'));
    fireEvent.click(screen.getByRole('button', { name: /^Traer los marcados/ }));
    await waitFor(() => expect(api.as400.traer).toHaveBeenCalled());
    expect(screen.queryByText(/guardado/)).toBeNull();
  });

  it('abre la carpeta recién traída en Pantallas o en Tablas', async () => {
    abrirTraer();
    fireEvent.click(screen.getByRole('button', { name: 'Listar' }));
    await screen.findByText('PGMREF');
    fireEvent.click(screen.getByLabelText('Traer PGMREF'));
    fireEvent.click(screen.getByRole('button', { name: /^Traer los marcados/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir la carpeta en Tablas' }));
    await waitFor(() => expect(api.listarCarpeta).toHaveBeenCalledWith('C:/fuentes'));
    expect(useNavegacion.getState().seccion).toBe('tablas');
    expect(useAs400.getState().traer).toBeNull();
  });

  it('sin conexión configurada pide configurarla y no consulta nada', async () => {
    abrirTraer('QCBLSRC', conexion({ tienePassword: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Listar' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/configura la conexión/i);
    expect(api.as400.listarMiembros).not.toHaveBeenCalled();
  });
});

describe('botones de las secciones', () => {
  it('Pantallas envía la pantalla y trae de QDSPSRC; Tablas envía el archivo y trae de QDDSSRC', () => {
    (window.api as unknown as { notificarModificado: () => void }).notificarModificado = vi.fn();
    render(<App />);
    expect(screen.getByRole('button', { name: 'Enviar pantalla…' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Traer del AS400…' }));
    expect(useAs400.getState().traer).toEqual({ archivoSugerido: 'QDSPSRC' });
    act(() => useAs400.getState().cerrarTraer());

    fireEvent.click(screen.getByRole('button', { name: 'Tablas' }));
    expect(screen.getByRole('button', { name: 'Enviar archivo…' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Traer del AS400…' }));
    expect(useAs400.getState().traer).toEqual({ archivoSugerido: 'QDDSSRC' });
  });
});

describe('ayuda de campo (F4) y conjunto CRUD', () => {
  const f = readdirSync(dirFuentesTablas).find((n) => n.endsWith('ASQRY03F.TXT'))!;
  const tabla = parsearTabla(iconv.decode(readFileSync(join(dirFuentesTablas, f)), 'windows-1252'), f);
  const generado = async () => (await screen.findByLabelText('Fuente DDS generado')).textContent ?? '';

  beforeEach(() => {
    useConjuntoCrud.setState({ conjunto: null });
  });

  async function generarConAyuda() {
    render(<DialogoCrud tabla={tabla} nombre="ASQRY03F" onCerrar={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Párrafo de ayuda de CODEVE'), { target: { value: 'ayuda-codeve' } });
    fireEvent.change(screen.getByLabelText('Programa de ayuda de CODEVE'), { target: { value: 'ayucodeve' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    await generado();
  }

  it('las teclas guardadas con F4 como ayuda pasan a F1 y se agrega F4 de ayuda de campo', () => {
    const viejas = [
      { numero: 3, texto: 'Salir', accion: 'salir' as const, donde: 'ambas' as const },
      { numero: 4, texto: 'Ayuda', accion: 'ayuda' as const, donde: 'ambas' as const },
    ];
    expect(migrarTeclas(viejas).map((t) => [t.numero, t.accion])).toEqual([
      [3, 'salir'],
      [1, 'ayuda'],
      [4, 'ayudaCampo'],
    ]);
    // Si ya tienen la tecla nueva, no se toca nada.
    const nuevas = migrarTeclas(viejas);
    expect(migrarTeclas(nuevas)).toEqual(nuevas);
  });

  it('con el párrafo y el programa de un campo, el CRUD genera F4, la llamada y el esqueleto', async () => {
    await generarConAyuda();
    expect(await generado()).toContain("CF04(04 'Ayuda campo')");
    fireEvent.click(screen.getByRole('tab', { name: 'Programa (COBOL)' }));
    const cobol = screen.getByLabelText('Fuente COBOL generado').textContent ?? '';
    expect(cobol).toContain('AYUDA-CODEVE.');
    expect(cobol).toContain('CALL "AYUCODEVE"');
    fireEvent.click(screen.getByRole('tab', { name: 'Ayuda AYUCODEVE' }));
    expect(screen.getByLabelText('Esqueleto de AYUCODEVE').textContent).toContain('PROGRAM-ID.  AYUCODEVE.');
  });

  it('un párrafo que no empieza con AYUDA- da un error claro', async () => {
    render(<DialogoCrud tabla={tabla} nombre="ASQRY03F" onCerrar={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Párrafo de ayuda de CODEVE'), { target: { value: 'CODEVE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/AYUDA-/);
  });

  it('«Guardar todo…» incluye el esqueleto de la ayuda', async () => {
    await generarConAyuda();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar todo…' }));
    await waitFor(() => expect(api.guardarEnCarpeta).toHaveBeenCalledTimes(1));
    expect(api.guardarEnCarpeta.mock.calls[0][0].map((a: { nombre: string }) => a.nombre)).toEqual([
      'ASQRY03D.dspf',
      'ASQRY03P.sqlcbl',
      'AYUCODEVE.cbl',
    ]);
  });

  it('«Enviar los dos…» agrega el esqueleto sin marcar, para no reemplazar una ayuda que ya exista', async () => {
    await generarConAyuda();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar los dos…' }));
    const envio = useAs400.getState().envio!;
    expect(envio.map((x) => [x.miembro, x.tipo, x.incluido])).toEqual([
      ['ASQRY03D', 'DSPF', true],
      ['ASQRY03P', 'SQLCBL', true],
      ['AYUCODEVE', 'CBL', false],
    ]);
  });

  it('el CRUD generado queda guardado con el archivo, la pantalla y el programa', async () => {
    await generarConAyuda();
    const fuentes = fuentesDelConjunto(useConjuntoCrud.getState().conjunto!);
    expect(fuentes.map((x) => [x.miembro, x.tipo, x.incluido])).toEqual([
      ['ASQRY03F', 'PF', true],
      ['ASQRY03D', 'DSPF', true],
      ['ASQRY03P', 'SQLCBL', true],
      ['AYUCODEVE', 'CBL', false],
    ]);
    expect(fuentes[0].texto).toContain('CODEVE');
  });

  it('con la pantalla abierta en el editor, se envía la pantalla editada', async () => {
    await generarConAyuda();
    const original = fuentesDelConjunto(useConjuntoCrud.getState().conjunto!)[1];
    fireEvent.click(screen.getByRole('button', { name: 'Abrir pantalla en el editor' }));
    expect(useConjuntoCrud.getState().conjunto!.vinculadaAlEditor).toBe(true);
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
    const editada = fuentesDelConjunto(useConjuntoCrud.getState().conjunto!)[1];
    expect(editada.etiqueta).toBe('Pantalla (editada)');
    expect(editada.texto).toContain('ALARM');
    expect(original.texto).not.toContain('ALARM');
  });

  it('si en el editor hay otra pantalla, se envía la generada', async () => {
    await generarConAyuda();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir pantalla en el editor' }));
    act(() => useStore.setState({ nombreArchivoActual: 'OTRA' }));
    expect(fuentesDelConjunto(useConjuntoCrud.getState().conjunto!)[1].etiqueta).toBe('Pantalla');
  });

  it('generar de nuevo suelta la pantalla del editor', async () => {
    await generarConAyuda();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir pantalla en el editor' }));
    cleanup();
    await generarConAyuda();
    expect(useConjuntoCrud.getState().conjunto!.vinculadaAlEditor).toBe(false);
  });

  it('la sección Tablas ofrece «Enviar el CRUD…» y «Guardar el CRUD…» aunque el diálogo esté cerrado', async () => {
    await generarConAyuda();
    cleanup();
    render(<SeccionTablas />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar el CRUD…' }));
    expect(useAs400.getState().envio!.map((x) => x.miembro)).toEqual(['ASQRY03F', 'ASQRY03D', 'ASQRY03P', 'AYUCODEVE']);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar el CRUD…' }));
    await waitFor(() => expect(api.guardarEnCarpeta).toHaveBeenCalledTimes(1));
    expect(api.guardarEnCarpeta.mock.calls[0][0].map((a: { nombre: string }) => a.nombre)).toEqual([
      'ASQRY03F.pf',
      'ASQRY03D.dspf',
      'ASQRY03P.sqlcbl',
      'AYUCODEVE.cbl',
    ]);
  });

  it('sin CRUD generado, esos botones no aparecen', () => {
    render(<SeccionTablas />);
    expect(screen.queryByRole('button', { name: 'Enviar el CRUD…' })).toBeNull();
  });
});