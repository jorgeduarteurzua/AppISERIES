import { describe, it, expect } from 'vitest';
import { validar, hayErrores, type Problema } from './validacion';
import {
  actualizarElemento,
  agregarCampo,
  agregarConstante,
  agregarRegistro,
  agregarTecla,
  asegurarTeclasYAyuda,
  crearPantalla,
  establecerVentana,
  moverElemento,
} from './operaciones';
import type { PantallaDSPF } from '../modelo/pantalla';

// Como una pantalla nueva: con F1, F3, F12, AYUDA y PIE (sin ellos hay avisos).
const base = () => asegurarTeclasYAyuda(crearPantalla('PANT1')).pantalla;
const regId = (p: PantallaDSPF) => p.registros[0].id;

function mensajes(problemas: Problema[], nivel?: Problema['nivel']): string[] {
  return problemas.filter((p) => !nivel || p.nivel === nivel).map((p) => p.mensaje);
}

describe('validar', () => {
  it('una pantalla con un texto y un campo bien ubicados no tiene problemas', () => {
    let p = base();
    p = agregarConstante(p, regId(p), 3, 1, 'Nombre:').pantalla;
    p = agregarCampo(p, regId(p), { fila: 3, columna: 10 }).pantalla;
    expect(validar(p)).toEqual([]);
  });

  it('una pantalla sin registros es un error', () => {
    const p = { ...base(), registros: [] };
    expect(mensajes(validar(p), 'error')).toEqual(['La pantalla no tiene ningún registro.']);
  });

  it('detecta nombres de campo demasiado largos o con caracteres inválidos', () => {
    let p = base();
    const c = agregarCampo(p, regId(p), { fila: 1, columna: 1 });
    p = actualizarElemento(c.pantalla, regId(p), c.elementoId, { nombre: 'NOMBREDEMASIADOLARGO' });
    expect(mensajes(validar(p), 'error').join(' ')).toMatch(/supera los 10 caracteres/);

    p = actualizarElemento(p, regId(p), c.elementoId, { nombre: '1ABC' });
    expect(mensajes(validar(p), 'error').join(' ')).toMatch(/no puede empezar con número/);
  });

  it('detecta campos repetidos en un registro', () => {
    let p = base();
    const a = agregarCampo(p, regId(p), { fila: 1, columna: 1 });
    const b = agregarCampo(a.pantalla, regId(p), { fila: 2, columna: 1 });
    p = actualizarElemento(b.pantalla, regId(p), b.elementoId, { nombre: 'CAMPO01' });
    expect(mensajes(validar(p), 'error').join(' ')).toMatch(/CAMPO01 está repetido/);
  });

  it('detecta registros repetidos', () => {
    const p = base();
    const copia = { ...p, registros: [...p.registros, { ...p.registros[0], id: 'otro' }] };
    expect(mensajes(validar(copia), 'error').join(' ')).toMatch(/REG01 está repetido/);
  });

  it('un campo visible necesita posición; uno oculto no debe tenerla', () => {
    let p = base();
    const c = agregarCampo(p, regId(p), { fila: 1, columna: 1 });
    p = actualizarElemento(c.pantalla, regId(p), c.elementoId, { fila: null, columna: null });
    expect(mensajes(validar(p), 'error').join(' ')).toMatch(/necesita fila y columna/);

    p = actualizarElemento(c.pantalla, regId(p), c.elementoId, { uso: 'oculto' });
    expect(validar(p)).toEqual([]);
    // Un campo oculto con posición es solo un aviso.
    const sucio = structuredClone(p);
    (sucio.registros[0].elementos[0] as { fila: number | null }).fila = 5;
    expect(mensajes(validar(sucio), 'aviso').join(' ')).toMatch(/no debe tener posición/);
  });

  it('detecta elementos fuera de la pantalla y textos que se salen', () => {
    let p = base();
    const t = agregarConstante(p, regId(p), 1, 1, 'Hola');
    p = moverElemento(t.pantalla, regId(p), t.elementoId, 30, 1);
    expect(mensajes(validar(p), 'error').join(' ')).toMatch(/fuera de la pantalla/);

    p = moverElemento(p, regId(p), t.elementoId, 1, 79);
    expect(mensajes(validar(p), 'error').join(' ')).toMatch(/se sale por el borde derecho/);
  });

  it('valida la longitud, los decimales y el máximo de dígitos', () => {
    let p = base();
    const c = agregarCampo(p, regId(p), { fila: 1, columna: 1 });
    p = actualizarElemento(c.pantalla, regId(p), c.elementoId, { longitud: 0 });
    expect(mensajes(validar(p), 'error').join(' ')).toMatch(/falta la longitud/);

    p = actualizarElemento(p, regId(p), c.elementoId, { tipoDato: 'S', longitud: 5, decimales: 6 });
    expect(mensajes(validar(p), 'error').join(' ')).toMatch(/decimales \(6\) superan/);

    p = actualizarElemento(p, regId(p), c.elementoId, { longitud: 40, decimales: 0 });
    expect(mensajes(validar(p), 'error').join(' ')).toMatch(/31 dígitos/);
  });

  it('la ventana necesita espacio para el borde', () => {
    let p = base();
    p = establecerVentana(p, regId(p), { fila: 1, columna: 2, alto: 10, ancho: 40 });
    expect(mensajes(validar(p), 'error').join(' ')).toMatch(/no cabe en la pantalla/);

    // Alto 21 en la fila 2: el borde inferior cae en la fila 24, todavía cabe.
    p = establecerVentana(p, regId(p), { fila: 2, columna: 2, alto: 21, ancho: 40 });
    expect(hayErrores(validar(p))).toBe(false);

    // Alto 22: el borde inferior necesitaría la fila 25.
    p = establecerVentana(p, regId(p), { fila: 2, columna: 2, alto: 22, ancho: 40 });
    expect(hayErrores(validar(p))).toBe(true);

    p = establecerVentana(p, regId(p), { fila: 2, columna: 2, alto: 20, ancho: 74 });
    expect(hayErrores(validar(p))).toBe(false);
  });

  it('los elementos de una ventana se miden contra la ventana', () => {
    let p = base();
    p = establecerVentana(p, regId(p), { fila: 2, columna: 2, alto: 10, ancho: 30 });
    const c = agregarCampo(p, regId(p), { fila: 11, columna: 1 });
    expect(mensajes(validar(c.pantalla), 'error').join(' ')).toMatch(/fuera de la ventana/);
  });

  it('un subfile sin control y un control sin subfile son errores', () => {
    const { pantalla } = agregarRegistro(base(), {
      tipo: 'subfile',
      nombre: 'WS01',
      nombreControl: 'WC01',
    });
    const sinControl = { ...pantalla, registros: pantalla.registros.filter((r) => r.clase !== 'control-subfile') };
    expect(mensajes(validar(sinControl), 'error').join(' ')).toMatch(/no tiene registro de control/);

    const sinSubfile = { ...pantalla, registros: pantalla.registros.filter((r) => r.clase !== 'subfile') };
    expect(mensajes(validar(sinSubfile), 'error').join(' ')).toMatch(/apunta a un subfile que no existe/);

    expect(hayErrores(validar(pantalla))).toBe(false);
  });

  it('avisa de elementos superpuestos, salvo los condicionados por indicador', () => {
    let p = base();
    p = agregarConstante(p, regId(p), 2, 2, 'AAAA').pantalla;
    const b = agregarConstante(p, regId(p), 2, 4, 'BBBB');
    expect(mensajes(validar(b.pantalla), 'aviso').join(' ')).toMatch(/se superpone/);

    const cond = actualizarElemento(b.pantalla, regId(p), b.elementoId, {
      indicadores: [{ numero: 40, negado: false }],
    });
    expect(validar(cond)).toEqual([]);
  });

  it('más de 3 indicadores es un error (el generador no los admite)', () => {
    let p = base();
    const t = agregarConstante(p, regId(p), 1, 1, 'X');
    p = actualizarElemento(t.pantalla, regId(p), t.elementoId, {
      indicadores: [1, 2, 3, 4].map((numero) => ({ numero, negado: false })),
    });
    expect(mensajes(validar(p), 'error').join(' ')).toMatch(/más de 3 indicadores/);
  });

  it('valida el número y la repetición de las teclas de función', () => {
    let p = agregarTecla(base(), { tipo: 'CF', numero: 5 });
    p = agregarTecla(p, { tipo: 'CA', numero: 5 });
    expect(mensajes(validar(p), 'aviso').join(' ')).toMatch(/05 está definida 2 veces/);

    p = agregarTecla(p, { tipo: 'CF', numero: 25 });
    expect(mensajes(validar(p), 'error').join(' ')).toMatch(/entre 1 y 24/);
  });
});
