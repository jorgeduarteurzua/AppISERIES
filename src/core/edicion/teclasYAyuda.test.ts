import { describe, expect, it } from 'vitest';
import { asegurarTeclasYAyuda, crearPantalla, formatoDeAyuda } from './operaciones';
import { validar } from './validacion';

function conTeclas() {
  return asegurarTeclasYAyuda(crearPantalla('P1')).pantalla;
}

describe('asegurarTeclasYAyuda', () => {
  it('agrega F1, F3 y F12 como CF, el formato AYUDA y el PIE', () => {
    const p = conTeclas();
    for (const n of [1, 3, 12]) {
      expect(p.teclasFuncion.find((t) => t.numero === n)).toMatchObject({ tipo: 'CF', respuestaInd: n });
    }
    expect(formatoDeAyuda(p)?.nombre).toBe('AYUDA');
    expect(p.registros.some((r) => r.nombre === 'PIE')).toBe(true);
  });

  it('no duplica nada al repetirse', () => {
    const a = conTeclas();
    const b = asegurarTeclasYAyuda(a).pantalla;
    expect(b.registros.map((r) => r.nombre)).toEqual(a.registros.map((r) => r.nombre));
    expect(b.teclasFuncion).toEqual(a.teclasFuncion);
    expect(b.registros.map((r) => r.elementos.length)).toEqual(a.registros.map((r) => r.elementos.length));
  });

  it('no deja problemas de error en la pantalla resultante', () => {
    const errores = validar(conTeclas()).filter((x) => x.nivel === 'error');
    expect(errores).toEqual([]);
  });
});
