import { describe, it, expect } from 'vitest';
import {
  actualizarCampo,
  actualizarKeyword,
  actualizarSeleccion,
  agregarCampo,
  agregarKeyword,
  agregarLlave,
  agregarSeleccion,
  alternarDescendente,
  aliasDe,
  comparacionesDe,
  crearTabla,
  duplicarCampo,
  eliminarElemento,
  encabezadosDe,
  establecerAlias,
  establecerComparaciones,
  establecerEncabezados,
  establecerFisico,
  establecerNulos,
  establecerPorDefecto,
  establecerRango,
  establecerTexto,
  establecerTextoRegistro,
  establecerUnico,
  establecerValores,
  literalDds,
  moverCampo,
  moverLlave,
  permiteNulos,
  porDefectoDe,
  quitarKeyword,
  rangoDe,
  renombrarRegistro,
  textoDe,
  tipoCondicion,
  valoresDe,
} from './operacionesTabla';
import { camposDe, llavesDe, tipoDeTabla } from './modelo';
import { generarTabla } from './generadorTabla';
import { parsearTabla } from './parserTabla';

const nuevo = () => crearTabla('clientes');
const reg = (t: ReturnType<typeof nuevo>) => t.registros[0].id;
const campo = (t: ReturnType<typeof nuevo>, i: number) => camposDe(t.registros[0])[i];

describe('crearTabla', () => {
  it('un físico nuevo tiene un registro y un campo de ejemplo', () => {
    const t = nuevo();
    expect(t.nombre).toBe('CLIENTES');
    expect(t.registros[0].nombre).toBe('RCLIENTES');
    expect(camposDe(t.registros[0])).toMatchObject([{ nombre: 'CAMPO01', longitud: 10, tipoDato: 'A' }]);
    expect(tipoDeTabla(t)).toBe('PF');
  });

  it('un lógico nuevo apunta a un físico y hereda sus campos', () => {
    const t = crearTabla('clil01', 'LF', 'clientes');
    expect(tipoDeTabla(t)).toBe('LF');
    expect(t.registros[0].keywords).toEqual([{ nombre: 'PFILE', parametros: 'CLIENTES', indicadores: [] }]);
    expect(camposDe(t.registros[0])).toHaveLength(0);
  });

  it('el DDS de una tabla nueva se vuelve a leer igual', () => {
    const t = nuevo();
    const dds = generarTabla(t);
    expect(dds).toContain('     A          R RCLIENTES');
    expect(dds).toContain('     A            CAMPO01       10A');
    expect(parsearTabla(dds).registros[0].nombre).toBe('RCLIENTES');
  });
});

describe('inmutabilidad', () => {
  it('ninguna operación modifica la tabla original', () => {
    const t = nuevo();
    const copia = JSON.stringify(t);
    const { tabla, elementoId } = agregarCampo(t, reg(t), { nombre: 'x' });
    actualizarCampo(tabla, reg(t), elementoId, { longitud: 5 });
    agregarLlave(tabla, reg(t), 'X');
    moverCampo(tabla, reg(t), elementoId, -1);
    eliminarElemento(tabla, reg(t), elementoId);
    establecerUnico(tabla, true);
    expect(JSON.stringify(t)).toBe(copia);
  });
});

describe('campos', () => {
  it('agrega campos con nombres distintos, después del último campo y antes de las llaves', () => {
    let t = nuevo();
    t = agregarLlave(t, reg(t), 'CAMPO01').tabla;
    t = agregarCampo(t, reg(t)).tabla;
    t = agregarCampo(t, reg(t), { nombre: 'mi campo', longitud: 5, tipoDato: 'S', decimales: 0 }).tabla;
    expect(camposDe(t.registros[0]).map((c) => c.nombre)).toEqual(['CAMPO01', 'CAMPO02', 'MI_CAMPO']);
    expect(t.registros[0].elementos.map((e) => e.tipo)).toEqual(['campo', 'campo', 'campo', 'llave']);
  });

  it('puede insertar después de un campo concreto', () => {
    let t = nuevo();
    t = agregarCampo(t, reg(t), { nombre: 'B' }).tabla;
    const primero = campo(t, 0).id;
    t = agregarCampo(t, reg(t), { nombre: 'A', despuesDe: primero }).tabla;
    expect(camposDe(t.registros[0]).map((c) => c.nombre)).toEqual(['CAMPO01', 'A', 'B']);
  });

  it('al renombrar un campo se actualizan las llaves y selecciones que lo usan', () => {
    let t = nuevo();
    t = agregarLlave(t, reg(t), 'CAMPO01').tabla;
    t = agregarSeleccion(t, reg(t), 'seleccion', 'CAMPO01').tabla;
    t = actualizarCampo(t, reg(t), campo(t, 0).id, { nombre: 'codigo' });
    expect(camposDe(t.registros[0])[0].nombre).toBe('CODIGO');
    expect(llavesDe(t.registros[0])[0].nombre).toBe('CODIGO');
    expect(t.registros[0].elementos.at(-1)).toMatchObject({ tipo: 'seleccion', nombre: 'CODIGO' });
  });

  it('al cambiar el tipo se ajustan los decimales y la longitud', () => {
    let t = nuevo();
    const id = campo(t, 0).id;
    t = actualizarCampo(t, reg(t), id, { tipoDato: 'p' });
    expect(campo(t, 0)).toMatchObject({ tipoDato: 'P', decimales: 0, longitud: 10 });
    t = actualizarCampo(t, reg(t), id, { decimales: 2 });
    t = actualizarCampo(t, reg(t), id, { tipoDato: 'A' });
    expect(campo(t, 0).decimales).toBeNull();
    t = actualizarCampo(t, reg(t), id, { tipoDato: 'L' });
    expect(campo(t, 0)).toMatchObject({ tipoDato: 'L', longitud: null, decimales: null });
    t = actualizarCampo(t, reg(t), id, { tipoDato: 'S' });
    expect(campo(t, 0)).toMatchObject({ tipoDato: 'S', decimales: 0, longitud: 10 });
  });

  it('eliminar un campo quita también sus llaves', () => {
    let t = nuevo();
    t = agregarLlave(t, reg(t), 'CAMPO01').tabla;
    t = eliminarElemento(t, reg(t), campo(t, 0).id);
    expect(t.registros[0].elementos).toHaveLength(0);
    expect(() => eliminarElemento(t, reg(t), 'no-existe')).toThrow();
  });

  it('sube y baja campos sin tocar las llaves', () => {
    let t = nuevo();
    t = agregarCampo(t, reg(t), { nombre: 'B' }).tabla;
    t = agregarCampo(t, reg(t), { nombre: 'C' }).tabla;
    t = agregarLlave(t, reg(t), 'B').tabla;
    t = moverCampo(t, reg(t), campo(t, 2).id, -1);
    expect(camposDe(t.registros[0]).map((c) => c.nombre)).toEqual(['CAMPO01', 'C', 'B']);
    t = moverCampo(t, reg(t), campo(t, 0).id, -1); // ya es el primero
    expect(camposDe(t.registros[0])[0].nombre).toBe('CAMPO01');
    expect(t.registros[0].elementos.at(-1)?.tipo).toBe('llave');
  });

  it('duplica un campo con otro nombre y sin comentarios', () => {
    let t = nuevo();
    t = actualizarCampo(t, reg(t), campo(t, 0).id, { comentarios: ['nota'], longitud: 7 });
    const r = duplicarCampo(t, reg(t), campo(t, 0).id);
    const campos = camposDe(r.tabla.registros[0]);
    expect(campos).toHaveLength(2);
    expect(campos[1]).toMatchObject({ longitud: 7, comentarios: [], id: r.elementoId });
    expect(campos[1].nombre).not.toBe(campos[0].nombre);
  });
});

describe('llaves', () => {
  it('agrega, invierte y ordena las llaves', () => {
    let t = nuevo();
    t = agregarCampo(t, reg(t), { nombre: 'B' }).tabla;
    t = agregarLlave(t, reg(t), 'campo01').tabla;
    const b = agregarLlave(t, reg(t), 'B');
    t = b.tabla;
    expect(llavesDe(t.registros[0]).map((k) => k.nombre)).toEqual(['CAMPO01', 'B']);
    expect(() => agregarLlave(t, reg(t), 'B')).toThrow(/ya es parte/);

    t = alternarDescendente(t, reg(t), b.elementoId);
    expect(llavesDe(t.registros[0])[1].keywords.map((k) => k.nombre)).toEqual(['DESCEND']);
    t = alternarDescendente(t, reg(t), b.elementoId);
    expect(llavesDe(t.registros[0])[1].keywords).toEqual([]);

    t = moverLlave(t, reg(t), b.elementoId, -1);
    expect(llavesDe(t.registros[0]).map((k) => k.nombre)).toEqual(['B', 'CAMPO01']);
  });

  it('las llaves van antes de las selecciones', () => {
    let t = crearTabla('lf', 'LF', 'pf');
    t = agregarSeleccion(t, reg(t), 'seleccion', 'ESTADO', [{ nombre: 'COMP', parametros: "EQ 'A'", indicadores: [] }]).tabla;
    t = agregarLlave(t, reg(t), 'CODIGO').tabla;
    expect(t.registros[0].elementos.map((e) => e.tipo)).toEqual(['llave', 'seleccion']);
  });

  it('activa y desactiva UNIQUE', () => {
    let t = establecerUnico(nuevo(), true);
    expect(t.keywords.map((k) => k.nombre)).toEqual(['UNIQUE']);
    t = establecerUnico(t, true);
    expect(t.keywords).toHaveLength(1);
    expect(establecerUnico(t, false).keywords).toHaveLength(0);
  });
});

describe('selección y omisión', () => {
  it('agrega, cambia y arma el DDS de un lógico con S y O', () => {
    let t = crearTabla('lf', 'LF', 'pf');
    const s = agregarSeleccion(t, reg(t), 'seleccion', 'estado', [{ nombre: 'COMP', parametros: "EQ 'A'", indicadores: [] }]);
    t = s.tabla;
    t = agregarSeleccion(t, reg(t), 'omision', 'ALL').tabla;
    t = actualizarSeleccion(t, reg(t), s.elementoId, { nombre: 'tipo' });
    expect(generarTabla(t)).toContain("S TIPO                      COMP(EQ 'A')");
    expect(generarTabla(t)).toContain('O ALL');
  });

  it('actualizarSeleccion rechaza un elemento que no es una selección', () => {
    let t = nuevo();
    t = agregarLlave(t, reg(t), 'CAMPO01').tabla;
    const idLlave = llavesDe(t.registros[0])[0].id;
    expect(() => actualizarSeleccion(t, reg(t), idLlave, { nombre: 'x' })).toThrow(/no es una selección/);
  });

  it('cambia el físico de un lógico', () => {
    const base = crearTabla('lf', 'LF', 'pf');
    const cambiado = establecerFisico(base, reg(base), 'maestro');
    expect(cambiado.registros[0].keywords[0].parametros).toBe('MAESTRO');
  });
});

describe('keywords genéricas', () => {
  it('agrega, actualiza y quita en archivo, registro y campo', () => {
    let t = nuevo();
    t = agregarKeyword(t, { tipo: 'archivo' }, 'fifo');
    expect(t.keywords[0].nombre).toBe('FIFO');
    t = actualizarKeyword(t, { tipo: 'archivo' }, 0, { nombre: 'lifo' });
    expect(t.keywords[0].nombre).toBe('LIFO');
    t = quitarKeyword(t, { tipo: 'archivo' }, 0);
    expect(t.keywords).toHaveLength(0);
    expect(() => quitarKeyword(t, { tipo: 'archivo' }, 3)).toThrow();

    t = agregarKeyword(t, { tipo: 'elemento', regId: reg(t), elId: campo(t, 0).id }, 'EDTCDE', 'Z');
    expect(campo(t, 0).keywords[0]).toMatchObject({ nombre: 'EDTCDE', parametros: 'Z' });
  });
});

describe('propiedades del campo', () => {
  it('encabezado: hasta 3 líneas, se quita si queda vacío', () => {
    let t = nuevo();
    const id = campo(t, 0).id;
    t = establecerEncabezados(t, reg(t), id, ['NOMBRE', 'DEL', 'CLIENTE', 'EXTRA']);
    expect(encabezadosDe(campo(t, 0))).toEqual(['NOMBRE', 'DEL', 'CLIENTE']);
    t = establecerEncabezados(t, reg(t), id, ['UNO', '', '']);
    expect(encabezadosDe(campo(t, 0))).toEqual(['UNO']);
    t = establecerEncabezados(t, reg(t), id, ['', '', '']);
    expect(campo(t, 0).keywords.some((k) => k.nombre === 'COLHDG')).toBe(false);
  });

  it('texto, alias, valor por defecto y nulos', () => {
    let t = nuevo();
    const id = campo(t, 0).id;
    t = establecerTexto(t, reg(t), id, "It's");
    expect(textoDe(campo(t, 0))).toBe("It's");
    expect(campo(t, 0).keywords[0].parametros).toBe("'It''s'");
    t = establecerAlias(t, reg(t), id, ' NOMBRE_LARGO ');
    expect(aliasDe(campo(t, 0))).toBe('NOMBRE_LARGO');
    t = establecerPorDefecto(t, reg(t), id, "'X'");
    expect(porDefectoDe(campo(t, 0))).toBe("'X'");
    t = establecerNulos(t, reg(t), id, true);
    expect(permiteNulos(campo(t, 0))).toBe(true);
    t = establecerNulos(t, reg(t), id, false);
    expect(permiteNulos(campo(t, 0))).toBe(false);
    t = establecerTexto(t, reg(t), id, '');
    expect(textoDe(campo(t, 0))).toBe('');
  });

  it('texto del registro', () => {
    const base = nuevo();
    const r = establecerTextoRegistro(base, reg(base), 'Datos de clientes');
    expect(r.registros[0].keywords[0]).toMatchObject({ nombre: 'TEXT', parametros: "'Datos de clientes'" });
  });

  it('renombra el registro', () => {
    const t = nuevo();
    expect(renombrarRegistro(t, reg(t), 'rcli').registros[0].nombre).toBe('RCLI');
  });
});

describe('condiciones VALUES, RANGE y COMP', () => {
  it('literalDds pone comillas a los caracteres y deja los números', () => {
    expect(literalDds('A', false)).toBe("'A'");
    expect(literalDds("it's", false)).toBe("'it''s'");
    expect(literalDds("'ya'", false)).toBe("'ya'");
    expect(literalDds(' 15 ', true)).toBe('15');
  });

  it('VALUES, RANGE y COMP se excluyen entre sí', () => {
    let t = nuevo();
    const id = campo(t, 0).id;
    expect(tipoCondicion(campo(t, 0))).toBe('ninguna');

    t = establecerValores(t, reg(t), id, ["'A'", "'B C'"]);
    expect(valoresDe(campo(t, 0))).toEqual(["'A'", "'B C'"]);
    expect(tipoCondicion(campo(t, 0))).toBe('valores');

    t = establecerRango(t, reg(t), id, { desde: '1', hasta: '255' });
    expect(rangoDe(campo(t, 0))).toEqual({ desde: '1', hasta: '255' });
    expect(valoresDe(campo(t, 0))).toEqual([]);
    expect(tipoCondicion(campo(t, 0))).toBe('rango');

    t = establecerComparaciones(t, reg(t), id, [
      { operador: 'GE', valor: '1' },
      { operador: 'LE', valor: '5000' },
    ]);
    expect(comparacionesDe(campo(t, 0))).toEqual([
      { operador: 'GE', valor: '1' },
      { operador: 'LE', valor: '5000' },
    ]);
    expect(rangoDe(campo(t, 0))).toBeNull();
    expect(tipoCondicion(campo(t, 0))).toBe('comparacion');

    t = establecerComparaciones(t, reg(t), id, []);
    expect(tipoCondicion(campo(t, 0))).toBe('ninguna');
  });

  it('las condiciones llegan al DDS y se leen de nuevo', () => {
    let t = nuevo();
    const id = campo(t, 0).id;
    t = establecerValores(t, reg(t), id, ["'S'", "'N'"]);
    const dds = generarTabla(t);
    expect(dds).toContain("VALUES('S' 'N')");
    expect(valoresDe(camposDe(parsearTabla(dds).registros[0])[0])).toEqual(["'S'", "'N'"]);
  });
});
