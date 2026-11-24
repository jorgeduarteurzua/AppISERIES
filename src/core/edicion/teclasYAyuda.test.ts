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

  it('AYUDA cabe en la pantalla y PIE queda en las últimas filas, sobre la línea de mensajes', () => {
    for (const tam of [{ filas: 24, columnas: 80 }, { filas: 27, columnas: 132 }]) {
      const base = crearPantalla('P1');
      base.tamano = { ...base.tamano, ...tam };
      const p = asegurarTeclasYAyuda(base).pantalla;
      const ayuda = formatoDeAyuda(p)!;
      const ventana = ayuda.keywords.find((k) => k.nombre === 'WINDOW')!;
      const [fila, columna, alto, ancho] = ventana.parametros.split(/\s+/).map(Number);
      expect(fila + alto + 1).toBeLessThanOrEqual(tam.filas);
      expect(columna + ancho + 1).toBeLessThanOrEqual(tam.columnas);
      const pie = p.registros.find((r) => r.nombre === 'PIE')!;
      for (const e of pie.elementos) {
        if (e.tipo !== 'constante') continue;
        expect(e.fila!).toBeGreaterThanOrEqual(tam.filas - 2);
        expect(e.fila!).toBeLessThanOrEqual(tam.filas - 1);
        expect(e.columna! + e.texto.length).toBeLessThanOrEqual(tam.columnas - 3);
      }
    }
  });

  it('con muchas teclas el pie usa dos filas (22 y 23) y la ayuda pasa a dos columnas', () => {
    const base = crearPantalla('P1');
    for (let n = 2; n <= 11; n++) {
      if (n !== 3) base.teclasFuncion.push({ tipo: 'CF', numero: n, respuestaInd: n, texto: `Op${n}` });
    }
    const p = asegurarTeclasYAyuda(base).pantalla;
    const filas = new Set(p.registros.find((r) => r.nombre === 'PIE')!.elementos.map((e) => e.fila));
    expect([...filas].sort()).toEqual([22, 23]);
    expect(validar(p).filter((x) => x.nivel === 'error')).toEqual([]);
  });

  it('al agregar una tecla y repetir, la nueva aparece en AYUDA y en PIE', () => {
    const a = conTeclas();
    a.teclasFuncion.push({ tipo: 'CF', numero: 5, respuestaInd: 5, texto: 'Renovar' });
    const b = asegurarTeclasYAyuda(a).pantalla;
    const textos = (nombre: string) =>
      b.registros.find((r) => r.nombre === nombre)!.elementos.flatMap((e) => (e.tipo === 'constante' ? [e.texto] : []));
    expect(textos('AYUDA')).toContain('F5=Renovar');
    expect(textos('PIE').join(' ')).toContain('F5=Renovar');
    expect(b.registros.filter((r) => r.nombre === 'AYUDA')).toHaveLength(1);
  });
});

describe('asegurarTeclasYAyuda: teclas con otro tipo y formatos existentes', () => {
  it('avisa si F3 esta como CA, no la cambia y la validacion tambien avisa', () => {
    const base = crearPantalla('P1');
    base.teclasFuncion.push({ tipo: 'CA', numero: 3, respuestaInd: 3, texto: 'Salir' });
    const r = asegurarTeclasYAyuda(base);
    expect(r.avisos.join(' ')).toMatch(/F3 esta como CA/);
    expect(r.pantalla.teclasFuncion.find((t) => t.numero === 3)?.tipo).toBe('CA');
    expect(validar(r.pantalla).some((x) => x.nivel === 'aviso' && /F3 \(CA\) deben ser CF/.test(x.mensaje))).toBe(true);
    expect(asegurarTeclasYAyuda(conTeclas()).avisos).toEqual([]);
  });

  it('informa los formatos que se reemplazan solo cuando quedan distintos', () => {
    const primera = asegurarTeclasYAyuda(crearPantalla('P1'));
    expect(primera.reemplazados).toEqual([]);
    expect(asegurarTeclasYAyuda(primera.pantalla).reemplazados).toEqual([]);
    const propia = structuredClone(primera.pantalla);
    const ayuda = propia.registros.find((x) => x.nombre === 'AYUDA')!;
    ayuda.elementos = ayuda.elementos.filter((e) => !(e.tipo === 'constante' && e.texto === 'F3=Salir'));
    expect(asegurarTeclasYAyuda(propia).reemplazados).toEqual(['AYUDA']);
  });
});
