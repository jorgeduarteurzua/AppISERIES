import { describe, expect, it } from 'vitest';
import {
  almacenamientosPosibles,
  expresionActual,
  expresionAsignar,
  expresionLeer,
  FORMATOS_FECHA,
  FORMATOS_HORA,
  tokensFormato,
} from './fechaHora';

const def = (tipo: string, longitud: number, decimales = 0) => ({ tipo, longitud, decimales });

describe('formatos de fecha y hora', () => {
  it('usan Y para el año, M para el mes y D para el día', () => {
    expect([...FORMATOS_FECHA]).toEqual(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'DD/MM/YY']);
    expect([...FORMATOS_HORA]).toEqual(['HH:MM:SS', 'HH:MM']);
  });

  it('parte cada formato en sus componentes con su posición', () => {
    expect(tokensFormato('fecha', 'DD/MM/YYYY')?.map((t) => [t.clave, t.inicio, t.largo])).toEqual([
      ['DD', 1, 2],
      ['LIT', 3, 1],
      ['MM', 4, 2],
      ['LIT', 6, 1],
      ['YYYY', 7, 4],
    ]);
    expect(tokensFormato('fecha', 'DD/MM/YY')?.map((t) => t.clave)).toEqual(['DD', 'LIT', 'MM', 'LIT', 'YY']);
    expect(tokensFormato('fecha', 'YYYY-MM-DD')?.map((t) => t.clave)).toEqual(['YYYY', 'LIT', 'MM', 'LIT', 'DD']);
  });

  it('en una hora, MM son los minutos', () => {
    expect(tokensFormato('hora', 'HH:MM:SS')?.map((t) => t.clave)).toEqual(['HH', 'LIT', 'MI', 'LIT', 'SS']);
    expect(tokensFormato('hora', 'HH:MM')?.map((t) => t.clave)).toEqual(['HH', 'LIT', 'MI']);
  });

  it('rechaza un formato que no es de ese tipo', () => {
    expect(tokensFormato('fecha', 'HH:MM:SS')).toBeNull();
    expect(tokensFormato('hora', 'DD/MM/YYYY')).toBeNull();
    expect(tokensFormato('fecha', 'dd/mm/aaaa')).toBeNull();
  });
});

describe('cómo se puede guardar una fecha o una hora', () => {
  it('según el tipo y el largo del campo', () => {
    expect(almacenamientosPosibles('fecha', def('S', 8))).toEqual(['N8']);
    expect(almacenamientosPosibles('fecha', def('P', 8))).toEqual(['N8']);
    expect(almacenamientosPosibles('fecha', def('S', 6))).toEqual(['N6']);
    expect(almacenamientosPosibles('fecha', def('L', 10))).toEqual(['L']);
    expect(almacenamientosPosibles('fecha', def('A', 8))).toEqual(['A8']);
    expect(almacenamientosPosibles('hora', def('S', 6))).toEqual(['N6']);
    expect(almacenamientosPosibles('hora', def('S', 4))).toEqual(['N4']);
    expect(almacenamientosPosibles('hora', def('S', 8))).toEqual(['N8']);
    expect(almacenamientosPosibles('hora', def('T', 8))).toEqual(['T']);
    expect(almacenamientosPosibles('hora', def('A', 6))).toEqual(['A6']);
  });

  it('no ofrece fecha ni hora si el campo no puede guardarla', () => {
    expect(almacenamientosPosibles('fecha', def('S', 5))).toEqual([]);
    expect(almacenamientosPosibles('fecha', def('S', 8, 2))).toEqual([]);
    expect(almacenamientosPosibles('hora', def('A', 10))).toEqual([]);
    expect(almacenamientosPosibles('fecha', def('T', 8))).toEqual([]);
  });
});

describe('expresiones SQL', () => {
  it('lee las fechas y horas en formato ISO y deja el resto igual', () => {
    expect(expresionLeer('FECHA', 'L')).toBe('CHAR(FECHA, ISO)');
    expect(expresionLeer('HORA', 'T')).toBe('CHAR(HORA, ISO)');
    expect(expresionLeer('FECCRE', 'N8')).toBe('FECCRE');
    expect(expresionLeer('X', null)).toBe('X');
  });

  it('asigna con DATE o TIME solo cuando la columna es de ese tipo', () => {
    expect(expresionAsignar(':F-WS', 'L', 'fecha')).toBe('DATE(:F-WS)');
    expect(expresionAsignar(':H-WS', 'T', 'hora')).toBe('TIME(:H-WS)');
    expect(expresionAsignar(':F-WS', 'N8', 'fecha')).toBe(':F-WS');
    expect(expresionAsignar(':X-WS', null, null)).toBe(':X-WS');
  });

  it('la fecha y la hora actuales respetan el almacenamiento del campo', () => {
    expect(expresionActual('fecha', 'N8')).toContain('YEAR(CURRENT DATE)*10000');
    expect(expresionActual('fecha', 'N6')).toContain('MOD(YEAR(CURRENT DATE),100)*10000');
    expect(expresionActual('fecha', 'L')).toBe('CURRENT DATE');
    expect(expresionActual('fecha', 'A8')).toContain('REPLACE(CHAR(CURRENT DATE, ISO)');
    expect(expresionActual('hora', 'N6')).toContain('HOUR(CURRENT TIME)*10000');
    expect(expresionActual('hora', 'N4')).toBe('HOUR(CURRENT TIME)*100+MINUTE(CURRENT TIME)');
    expect(expresionActual('hora', 'N8')).toMatch(/^\(.*\)\*100$/);
    expect(expresionActual('hora', 'T')).toBe('CURRENT TIME');
    expect(expresionActual('fecha', 'XX')).toBeNull();
    expect(expresionActual('hora', 'L')).toBeNull();
  });
});
