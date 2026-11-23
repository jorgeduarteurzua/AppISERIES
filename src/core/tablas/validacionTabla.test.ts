import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import iconv from 'iconv-lite';
import { bytesDeCampo, hayErroresTabla, validarTabla, type ProblemaTabla } from './validacionTabla';
import {
  actualizarCampo,
  agregarCampo,
  agregarKeyword,
  agregarLlave,
  agregarSeleccion,
  crearTabla,
  establecerUnico,
} from './operacionesTabla';
import { camposDe, type Tabla } from './modelo';
import { parsearTabla } from './parserTabla';
import { dirFuentesTablas } from './fuentesPrueba';

const reg = (t: Tabla) => t.registros[0].id;
const primero = (t: Tabla) => camposDe(t.registros[0])[0].id;
const mensajes = (p: ProblemaTabla[], nivel?: ProblemaTabla['nivel']) =>
  p
    .filter((x) => !nivel || x.nivel === nivel)
    .map((x) => x.mensaje)
    .join(' | ');

/** Una tabla con un campo configurable. */
function conCampo(parche: Parameters<typeof actualizarCampo>[3]): Tabla {
  const t = crearTabla('t');
  return actualizarCampo(t, reg(t), primero(t), parche);
}

const keywordCampo = (t: Tabla, nombre: string, parametros: string) =>
  agregarKeyword(t, { tipo: 'elemento', regId: reg(t), elId: primero(t) }, nombre, parametros);

describe('físico: casos básicos', () => {
  it('una tabla nueva no tiene problemas', () => {
    expect(validarTabla(crearTabla('clientes'))).toEqual([]);
  });

  it('sin registros o sin campos es un error', () => {
    expect(mensajes(validarTabla({ ...crearTabla('t'), registros: [] }), 'error')).toMatch(/ningún registro/);
    const t = crearTabla('t');
    const vacio = { ...t, registros: [{ ...t.registros[0], elementos: [] }] };
    expect(mensajes(validarTabla(vacio), 'error')).toMatch(/no tiene campos/);
  });

  it('un físico con dos formatos es un error', () => {
    const t = crearTabla('t');
    const doble = { ...t, registros: [t.registros[0], { ...t.registros[0], id: 'otro', nombre: 'OTRO' }] };
    expect(mensajes(validarTabla(doble), 'error')).toMatch(/solo puede tener un formato/);
  });

  it('nombres inválidos o repetidos', () => {
    expect(mensajes(validarTabla(conCampo({ nombre: 'NOMBREDEMASIADOLARGO' })), 'error')).toMatch(/supera los 10/);
    expect(mensajes(validarTabla(conCampo({ nombre: '1ABC' })), 'error')).toMatch(/no puede empezar con número/);

    let t = crearTabla('t');
    t = agregarCampo(t, reg(t), { nombre: 'CAMPO01' }).tabla;
    expect(mensajes(validarTabla(t), 'error')).toMatch(/CAMPO01 está repetido/);
  });
});

describe('físico: tipos, longitudes y decimales', () => {
  it('falta la longitud, salvo en fechas, horas y campos heredados', () => {
    expect(mensajes(validarTabla(conCampo({ longitud: null })), 'error')).toMatch(/falta la longitud/);
    expect(validarTabla(conCampo({ tipoDato: 'L' }))).toEqual([]);
    expect(hayErroresTabla(validarTabla(conCampo({ longitud: null, referencia: true })))).toBe(true); // sin REF
  });

  it('un campo de referencia necesita REF en el archivo o REFFLD en el campo', () => {
    let t = conCampo({ longitud: null, referencia: true });
    expect(mensajes(validarTabla(t), 'error')).toMatch(/pero no hay REFFLD/);
    t = keywordCampo(t, 'REFFLD', 'OTRO ARCH');
    expect(validarTabla(t)).toEqual([]);
    t = agregarKeyword(conCampo({ longitud: null, referencia: true }), { tipo: 'archivo' }, 'REF', 'MAESTRO');
    expect(validarTabla(t)).toEqual([]);
  });

  it.each([
    ['A', 32767, true],
    ['A', 32766, false],
    ['S', 32, true],
    ['S', 31, false],
    ['P', 32, true],
    ['B', 19, true],
    ['B', 18, false],
    ['F', 18, true],
    ['F', 17, false],
  ])('tipo %s con longitud %i -> error: %s', (tipo, longitud, hayError) => {
    const t = conCampo({ tipoDato: tipo, longitud: longitud as number, decimales: tipo === 'A' ? null : 0 });
    // El registro de 32767 también supera el máximo de registro, así que se mira el mensaje de longitud.
    expect(/longitud máxima/.test(mensajes(validarTabla(t), 'error'))).toBe(hayError);
  });

  it('un tipo desconocido es un error', () => {
    expect(mensajes(validarTabla(conCampo({ tipoDato: 'X' })), 'error')).toMatch(/el tipo «X» no es válido/);
  });

  it('decimales mayores que la longitud, o sin declarar', () => {
    expect(mensajes(validarTabla(conCampo({ tipoDato: 'S', longitud: 5, decimales: 6 })), 'error')).toMatch(
      /decimales \(6\) superan/,
    );
    expect(mensajes(validarTabla(conCampo({ tipoDato: 'S', longitud: 5, decimales: null })), 'aviso')).toMatch(
      /sin decimales declarados/,
    );
    expect(mensajes(validarTabla(conCampo({ tipoDato: 'A', decimales: 2 })), 'aviso')).toMatch(/no usa decimales/);
  });

  it('calcula los bytes de cada tipo', () => {
    const c = (tipoDato: string, longitud: number | null) =>
      bytesDeCampo({ ...(camposDe(crearTabla('t').registros[0])[0]), tipoDato, longitud });
    expect(c('A', 10)).toBe(10);
    expect(c('S', 7)).toBe(7);
    expect(c('P', 7)).toBe(4);
    expect(c('P', 8)).toBe(5);
    expect(c('B', 4)).toBe(2);
    expect(c('B', 9)).toBe(4);
    expect(c('B', 18)).toBe(8);
    expect(c('F', 9)).toBe(4);
    expect(c('F', 17)).toBe(8);
    expect(c('L', null)).toBe(10);
    expect(c('T', null)).toBe(8);
    expect(c('Z', null)).toBe(26);
  });

  it('el registro no puede pasar de 32766 bytes', () => {
    let t = conCampo({ longitud: 20000 });
    t = agregarCampo(t, reg(t), { nombre: 'B', longitud: 20000 }).tabla;
    expect(mensajes(validarTabla(t), 'error')).toMatch(/ocupa 40000 bytes y el máximo es 32766/);
  });
});

describe('físico: llaves', () => {
  it('la llave debe ser un campo del registro y no repetirse', () => {
    let t = crearTabla('t');
    t = agregarLlave(t, reg(t), 'NOEXISTE').tabla;
    expect(mensajes(validarTabla(t), 'error')).toMatch(/NOEXISTE no es un campo del registro/);

    let u = crearTabla('t');
    u = agregarLlave(u, reg(u), 'CAMPO01').tabla;
    const dup = structuredClone(u);
    dup.registros[0].elementos.push({ ...structuredClone(dup.registros[0].elementos.at(-1)!), id: 'k2' });
    expect(mensajes(validarTabla(dup), 'error')).toMatch(/CAMPO01 está repetida/);
  });

  it('la llave no puede pasar de 2000 bytes', () => {
    let t = conCampo({ longitud: 2500 });
    t = agregarLlave(t, reg(t), 'CAMPO01').tabla;
    expect(mensajes(validarTabla(t), 'error')).toMatch(/La llave ocupa 2500 bytes/);
  });

  it('UNIQUE sin llaves es un aviso', () => {
    const t = establecerUnico(crearTabla('t'), true);
    expect(mensajes(validarTabla(t), 'aviso')).toMatch(/UNIQUE pero no tiene llaves/);
  });
});

describe('keywords de campo', () => {
  it('COLHDG: líneas de hasta 20 caracteres y como máximo 3', () => {
    expect(mensajes(validarTabla(keywordCampo(crearTabla('t'), 'COLHDG', `'${'X'.repeat(21)}'`)), 'error')).toMatch(
      /supera los 20/,
    );
    expect(mensajes(validarTabla(keywordCampo(crearTabla('t'), 'COLHDG', "'A' 'B' 'C' 'D'")), 'error')).toMatch(
      /como máximo 3 líneas/,
    );
    expect(mensajes(validarTabla(keywordCampo(crearTabla('t'), 'COLHDG', '')), 'error')).toMatch(/COLHDG sin texto/);
    expect(validarTabla(keywordCampo(crearTabla('t'), 'COLHDG', "'A' 'B' 'C'"))).toEqual([]);
  });

  it('TEXT de hasta 50 caracteres', () => {
    expect(mensajes(validarTabla(keywordCampo(crearTabla('t'), 'TEXT', `'${'X'.repeat(51)}'`)), 'error')).toMatch(
      /TEXT supera los 50/,
    );
    expect(validarTabla(keywordCampo(crearTabla('t'), 'TEXT', `'${'X'.repeat(50)}'`))).toEqual([]);
  });

  it('ALIAS debe ser un nombre válido', () => {
    expect(mensajes(validarTabla(keywordCampo(crearTabla('t'), 'ALIAS', 'con espacios')), 'error')).toMatch(/ALIAS/);
    expect(validarTabla(keywordCampo(crearTabla('t'), 'ALIAS', 'NOMBRE_LARGO'))).toEqual([]);
  });

  it('VALUES, RANGE y COMP mal formados', () => {
    expect(mensajes(validarTabla(keywordCampo(crearTabla('t'), 'VALUES', '')), 'error')).toMatch(/VALUES no tiene valores/);
    expect(mensajes(validarTabla(keywordCampo(crearTabla('t'), 'RANGE', "'A'")), 'error')).toMatch(/RANGE necesita dos/);
    expect(mensajes(validarTabla(keywordCampo(crearTabla('t'), 'COMP', "XX 'A'")), 'error')).toMatch(/operador válido/);
    expect(mensajes(validarTabla(keywordCampo(crearTabla('t'), 'COMP', 'EQ')), 'error')).toMatch(/necesita un valor/);
    expect(validarTabla(keywordCampo(crearTabla('t'), 'COMP', "EQ 'A'"))).toEqual([]);
  });

  it('avisa si el tipo del valor no coincide con el del campo', () => {
    const num = keywordCampo(conCampo({ tipoDato: 'S', longitud: 3, decimales: 0 }), 'VALUES', "'A' 'B'");
    expect(mensajes(validarTabla(num), 'aviso')).toMatch(/texto entre comillas en un campo numérico/);
    const car = keywordCampo(crearTabla('t'), 'RANGE', '1 5');
    expect(mensajes(validarTabla(car), 'aviso')).toMatch(/números sin comillas en un campo de carácter/);
  });
});

describe('lógicos', () => {
  const maestro = parsearTabla(
    ['     A          R RMAE', '     A            CODIGO         5S 0', '     A            ESTADO         1A'].join('\n'),
    'MAESTRO',
  );
  const op = { resolverArchivo: (n: string) => (n === 'MAESTRO' ? maestro : null) };

  it('PFILE sin archivo es un error', () => {
    const t = crearTabla('lf', 'LF', '');
    t.registros[0].keywords[0].parametros = '';
    expect(mensajes(validarTabla(t), 'error')).toMatch(/PFILE no indica ningún archivo/);
  });

  it('un lógico sencillo con llaves existentes es válido', () => {
    let t = crearTabla('lf', 'LF', 'maestro');
    t = agregarLlave(t, reg(t), 'CODIGO').tabla;
    expect(validarTabla(t, op)).toEqual([]);
    // Sin poder resolver el físico no se inventan errores.
    expect(validarTabla(t)).toEqual([]);
  });

  it('comprueba llaves y campos contra el físico', () => {
    let t = crearTabla('lf', 'LF', 'maestro');
    t = agregarLlave(t, reg(t), 'NOEXISTE').tabla;
    expect(mensajes(validarTabla(t, op), 'error')).toMatch(/La llave NOEXISTE no es un campo del lógico/);

    let u = crearTabla('lf', 'LF', 'maestro');
    u = agregarCampo(u, reg(u), { nombre: 'FANTASMA', longitud: null, tipoDato: '' }).tabla;
    expect(mensajes(validarTabla(u, op), 'error')).toMatch(/El campo FANTASMA no existe en el físico/);
  });

  it('con lista de campos, la llave debe estar en esa lista aunque no se conozca el físico', () => {
    let t = crearTabla('lf', 'LF', 'maestro');
    t = agregarCampo(t, reg(t), { nombre: 'CODIGO', longitud: null, tipoDato: '' }).tabla;
    t = agregarLlave(t, reg(t), 'ESTADO').tabla;
    expect(mensajes(validarTabla(t), 'error')).toMatch(/La llave ESTADO no es un campo del lógico/);
  });

  it('selección y omisión', () => {
    const comp = [{ nombre: 'COMP', parametros: "EQ 'A'", indicadores: [] }];
    let t = crearTabla('lf', 'LF', 'maestro');
    t = agregarSeleccion(t, reg(t), 'seleccion', 'NOEXISTE', comp).tabla;
    expect(mensajes(validarTabla(t, op), 'error')).toMatch(/S NOEXISTE: el campo no existe/);

    let u = crearTabla('lf', 'LF', 'maestro');
    u = agregarSeleccion(u, reg(u), 'seleccion', 'ALL').tabla;
    expect(mensajes(validarTabla(u, op), 'error')).toMatch(/ALL solo se puede usar con O/);

    let v = crearTabla('lf', 'LF', 'maestro');
    v = agregarSeleccion(v, reg(v), 'seleccion', 'ESTADO').tabla;
    expect(mensajes(validarTabla(v, op), 'aviso')).toMatch(/S ESTADO: no tiene COMP, VALUES ni RANGE/);

    let w = crearTabla('lf', 'LF', 'maestro');
    w = agregarSeleccion(w, reg(w), 'seleccion', 'ESTADO', comp).tabla;
    w = agregarSeleccion(w, reg(w), 'omision', 'ALL').tabla;
    expect(validarTabla(w, op)).toEqual([]);
  });
});

describe('los 48 fuentes reales no tienen errores', () => {
  const archivos = readdirSync(dirFuentesTablas).filter((f) => f.toUpperCase().endsWith('.TXT'));
  const tablas = new Map(
    archivos.map((f) => [
      f.slice(32).replace(/\.TXT$/i, ''),
      parsearTabla(iconv.decode(readFileSync(join(dirFuentesTablas, f)), 'windows-1252'), f),
    ]),
  );
  const op = { resolverArchivo: (n: string) => tablas.get(n) ?? null };

  for (const [nombre, t] of tablas) {
    it(nombre, () => {
      expect(mensajes(validarTabla(t, op), 'error')).toBe('');
    });
  }

  it('el único aviso es que SMIPRU00 no declara decimales en SMICOD', () => {
    const avisos = [...tablas.values()].flatMap((t) => validarTabla(t, op)).filter((p) => p.nivel === 'aviso');
    expect(avisos.map((a) => a.mensaje)).toEqual(['Campo SMICOD: sin decimales declarados (se asumen 0).']);
  });
});
