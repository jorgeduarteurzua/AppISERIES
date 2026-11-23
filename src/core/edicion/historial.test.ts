import { describe, it, expect } from 'vitest';
import {
  deshacer,
  historialVacio,
  LIMITE_HISTORIAL,
  puedeDeshacer,
  puedeRehacer,
  rehacer,
  registrarCambio,
  VENTANA_FUSION_MS,
} from './historial';
import { crearPantalla } from './operaciones';

const version = (n: number) => crearPantalla(`V${n}`);

describe('historial', () => {
  it('registra cambios y permite deshacer y rehacer', () => {
    const v0 = version(0);
    const v1 = version(1);
    const v2 = version(2);

    let h = registrarCambio(historialVacio(), v0, undefined, 0); // v0 -> v1
    h = registrarCambio(h, v1, undefined, 10); // v1 -> v2
    expect(puedeDeshacer(h)).toBe(true);
    expect(puedeRehacer(h)).toBe(false);

    const a = deshacer(h, v2)!;
    expect(a.valor).toBe(v1);
    expect(puedeRehacer(a.historial)).toBe(true);

    const b = deshacer(a.historial, a.valor)!;
    expect(b.valor).toBe(v0);
    expect(deshacer(b.historial, b.valor)).toBeNull();

    const c = rehacer(b.historial, b.valor)!;
    expect(c.valor).toBe(v1);
    const d = rehacer(c.historial, c.valor)!;
    expect(d.valor).toBe(v2);
    expect(rehacer(d.historial, d.valor)).toBeNull();
  });

  it('un cambio nuevo descarta lo que se podía rehacer', () => {
    const v0 = version(0);
    const v1 = version(1);
    let h = registrarCambio(historialVacio(), v0, undefined, 0);
    const a = deshacer(h, v1)!;
    expect(puedeRehacer(a.historial)).toBe(true);
    h = registrarCambio(a.historial, a.valor, undefined, 5);
    expect(puedeRehacer(h)).toBe(false);
  });

  it('fusiona los cambios seguidos con la misma clave', () => {
    const v0 = version(0);
    let h = registrarCambio(historialVacio(), v0, 'nombre', 0);
    h = registrarCambio(h, version(1), 'nombre', 100);
    h = registrarCambio(h, version(2), 'nombre', 200);
    expect(h.pasado).toEqual([v0]); // una sola entrada: se vuelve a v0 de una vez
  });

  it('no fusiona si cambia la clave o pasa demasiado tiempo', () => {
    let h = registrarCambio(historialVacio(), version(0), 'a', 0);
    h = registrarCambio(h, version(1), 'b', 100);
    expect(h.pasado).toHaveLength(2);

    h = registrarCambio(h, version(2), 'b', 100 + VENTANA_FUSION_MS + 1);
    expect(h.pasado).toHaveLength(3);
  });

  it('tras deshacer, la siguiente edición no se fusiona con la anterior', () => {
    let h = registrarCambio(historialVacio(), version(0), 'k', 0);
    const a = deshacer(h, version(1))!;
    h = registrarCambio(a.historial, a.valor, 'k', 50);
    expect(h.pasado).toHaveLength(1);
    expect(h.futuro).toHaveLength(0);
  });

  it('limita el tamaño del historial', () => {
    let h = historialVacio();
    for (let i = 0; i < LIMITE_HISTORIAL + 20; i++) h = registrarCambio(h, version(i), undefined, i);
    expect(h.pasado).toHaveLength(LIMITE_HISTORIAL);
    expect(h.pasado[0].nombre).toBe('V20'); // se descartan las más antiguas
  });
});
