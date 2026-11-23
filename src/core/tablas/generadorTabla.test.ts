import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import iconv from 'iconv-lite';
import { generarTabla } from './generadorTabla';
import { parsearTabla, prepararLineas } from './parserTabla';
import { separarKeywords } from '../parser/keywords';
import { dirFuentesTablas } from './fuentesPrueba';
import type { Tabla } from './modelo';

/** Modelo sin ids, para poder compararlo. */
function sinIds(t: Tabla): unknown {
  return JSON.parse(JSON.stringify(t, (k, v) => (k === 'id' ? undefined : v)));
}

/**
 * Lista plana de lo que dice un fuente, independiente de cómo se reparta en
 * líneas: comentarios, definiciones (marca, nombre, longitud, tipo...) y cada
 * keyword con sus parámetros normalizados.
 */
function items(texto: string): string[] {
  const res: string[] = [];
  const num = (s: string) => (s.trim() === '' ? '-' : String(parseInt(s, 10)));
  for (const it of prepararLineas(texto)) {
    if (it.tipo === 'comentario') {
      res.push(`C:${it.texto}`);
      continue;
    }
    const l = it.texto;
    if (l.slice(6).trim() === '') continue;
    const partes = [
      l.slice(16, 17).trim(), // marca
      l.slice(18, 28).trim(), // nombre
      l.slice(28, 29).trim(), // referencia
      num(l.slice(29, 34)), // longitud
      l.slice(34, 35).trim(), // tipo
      num(l.slice(35, 37)), // decimales
      l.slice(37, 38).trim(), // uso
    ];
    // Una línea solo de keywords no define nada.
    if (partes.some((p) => p !== '' && p !== '-')) res.push(`D:${partes.join('|')}`);
    for (const k of separarKeywords(l.length >= 45 ? l.slice(44) : '')) {
      res.push(`K:${k.nombre}(${k.parametros.trim()})`);
    }
  }
  return res;
}

describe('generarTabla: formato de columnas', () => {
  it('escribe registro, campos, llave y keywords en sus columnas', () => {
    const t = parsearTabla(
      [
        '     A                                      UNIQUE',
        '     A          R REG1                      TEXT(\'CLIENTES\')',
        "     A            CODIGO         5S 0       COLHDG('CODIGO')",
        '     A            NOMBRE        30A',
        '     A          K CODIGO',
      ].join('\n'),
    );
    expect(generarTabla(t).split('\n')).toEqual([
      '     A                                      UNIQUE',
      "     A          R REG1                      TEXT('CLIENTES')",
      "     A            CODIGO         5S 0       COLHDG('CODIGO')",
      '     A            NOMBRE        30A',
      '     A          K CODIGO',
      '',
    ]);
  });

  it('escribe comentarios, selección, omisión y unión', () => {
    const fuente = [
      '     A* cabecera',
      '     A          R REGL                      PFILE(MAESTRO)',
      '     A            CAMPO1',
      "     A          S ESTADO                    COMP(EQ 'A')",
      '     A          O ALL',
      '     A          K CAMPO1                    DESCEND',
      '     A* fin',
    ].join('\n');
    expect(generarTabla(parsearTabla(fuente))).toBe(fuente + '\n');
  });

  it('parte las keywords largas con continuación y las recupera igual', () => {
    const colhdg = "COLHDG('PRIMERA LINEA LARGA' 'SEGUNDA LINEA LARGA' 'TERCERA LINEA')";
    const t = parsearTabla(['     A          R REG', '     A            CAMPO1        10A         ' + colhdg].join('\n'));
    const dds = generarTabla(t);
    for (const l of dds.split('\n')) expect(l.length).toBeLessThanOrEqual(80);
    expect(dds.split('\n').filter((l) => l.endsWith('-')).length).toBeGreaterThan(0);
    expect(sinIds(parsearTabla(dds))).toEqual(sinIds(t));
  });

  it('rechaza nombres de más de 10 caracteres', () => {
    const t = parsearTabla('     A          R REG\n     A            CAMPO1        10A');
    (t.registros[0].elementos[0] as { nombre: string }).nombre = 'NOMBREDEMASIADOLARGO';
    expect(() => generarTabla(t)).toThrow(/10 caracteres/);
  });
});

describe('ida y vuelta con los fuentes reales de QDDSSRC', () => {
  const archivos = readdirSync(dirFuentesTablas).filter((f) => f.toUpperCase().endsWith('.TXT'));

  for (const archivo of archivos) {
    const original = iconv.decode(readFileSync(join(dirFuentesTablas, archivo)), 'windows-1252');

    describe(archivo.slice(32), () => {
      const m1 = parsearTabla(original, archivo);
      const t1 = generarTabla(m1);
      const m2 = parsearTabla(t1, archivo);

      it('el fuente generado vuelve a dar el mismo modelo', () => {
        expect(sinIds(m2)).toEqual(sinIds(m1));
      });

      it('generar es estable', () => {
        expect(generarTabla(m2)).toBe(t1);
      });

      it('dice lo mismo que el original, token a token', () => {
        const esperado = items(original);
        expect(esperado.some((i) => i.startsWith('D:R|'))).toBe(true); // la comparación no es vacía
        expect(items(t1)).toEqual(esperado);
      });

      it('ninguna línea supera las 80 columnas', () => {
        for (const l of t1.split('\n')) expect(l.length).toBeLessThanOrEqual(80);
      });
    });
  }
});
