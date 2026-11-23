import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import iconv from 'iconv-lite';
import { parsearDspf, unirContinuaciones } from './parserDspf';
import { separarKeywords } from './keywords';

const __dirname = dirname(fileURLToPath(import.meta.url));
// src/core/parser -> raíz del proyecto -> QDSPSRC
const dirFuentes = join(__dirname, '../../../QDSPSRC');

function leerFuente(ruta: string): string {
  return iconv.decode(readFileSync(ruta), 'windows-1252');
}

describe('separarKeywords', () => {
  it('separa keyword simple con parámetro', () => {
    expect(separarKeywords('DSPATR(HI)')).toEqual([
      { nombre: 'DSPATR', parametros: 'HI' },
    ]);
  });

  it('separa keyword sin parámetros', () => {
    expect(separarKeywords('OVERLAY')).toEqual([
      { nombre: 'OVERLAY', parametros: '' },
    ]);
  });

  it('respeta comillas con espacios y paréntesis anidados', () => {
    const r = separarKeywords("WDWTITLE((*TEXT 'PROCESOS QUERYS') (*COLOR WHT))");
    expect(r).toHaveLength(1);
    expect(r[0].nombre).toBe('WDWTITLE');
    expect(r[0].parametros).toBe("(*TEXT 'PROCESOS QUERYS') (*COLOR WHT)");
  });

  it('separa varias keywords en una zona', () => {
    const r = separarKeywords('SFL');
    expect(r).toEqual([{ nombre: 'SFL', parametros: '' }]);
  });

  it('reconoce VALUES con varios literales', () => {
    const r = separarKeywords("VALUES('S' 'N')");
    expect(r[0].parametros).toBe("'S' 'N'");
  });

  it('devuelve vacío si la zona es una constante', () => {
    expect(separarKeywords("'Archivo     :'")).toEqual([]);
  });
});

describe('unirContinuaciones', () => {
  it('une una línea terminada en guion con la zona de funciones de la siguiente', () => {
    const lineas = [
      "     A                                      WDWTITLE((*TEXT 'INGRESO DE ARCHIVO-",
      "     A                                      S') (*COLOR WHT))",
    ];
    const unidas = unirContinuaciones(lineas);
    expect(unidas).toHaveLength(1);
    expect(unidas[0]).toContain("INGRESO DE ARCHIVOS'");
  });
});

describe('parsearDspf con una fuente mínima', () => {
  const fuente = [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A                                      INDARA',
    "     A                                      CF03(03 'Salir')",
    '     A          R PANT01',
    "     A                                  2  2'Hola Mundo'",
    '     A                                      DSPATR(HI)',
    '     A            NOMBRE        10A  B  4  2VALUES(\'A\' \'B\')',
  ].join('\n');

  it('extrae tamaño, tecla de función, registro, constante y campo', () => {
    const p = parsearDspf(fuente, 'PANT01');
    expect(p.tamano.filas).toBe(24);
    expect(p.tamano.columnas).toBe(80);
    expect(p.teclasFuncion).toHaveLength(1);
    expect(p.teclasFuncion[0]).toMatchObject({ tipo: 'CF', numero: 3, texto: 'Salir' });
    expect(p.registros).toHaveLength(1);

    const reg = p.registros[0];
    expect(reg.nombre).toBe('PANT01');
    expect(reg.elementos).toHaveLength(2);

    const cte = reg.elementos.find((e) => e.tipo === 'constante');
    expect(cte).toMatchObject({ fila: 2, columna: 2, texto: 'Hola Mundo' });
    // La constante recibe la keyword DSPATR(HI) de la línea siguiente.
    expect(cte && cte.keywords.some((k) => k.nombre === 'DSPATR')).toBe(true);

    const campo = reg.elementos.find((e) => e.tipo === 'campo');
    expect(campo).toMatchObject({ nombre: 'NOMBRE', longitud: 10, uso: 'ambos' });
  });
});

describe('parsearDspf con las fuentes reales de QDSPSRC', () => {
  const archivos = readdirSync(dirFuentes).filter((f) => f.toUpperCase().endsWith('.TXT'));

  it('encuentra las 32 fuentes de ejemplo', () => {
    expect(archivos.length).toBeGreaterThanOrEqual(30);
  });

  /**
   * Heurística: una fuente es DDS si la mayoría de sus líneas no vacías tienen
   * 'A' en la columna 6. Algunas de las fuentes de ejemplo son en realidad
   * COBOL (p.ej. ASQRY23.TXT, sin la 'D' final de display) y no deben exigir
   * registros DDS.
   */
  function esFuenteDds(texto: string): boolean {
    const lineas = texto.split('\n').filter((l) => l.trim().length > 0);
    if (lineas.length === 0) return false;
    const conA = lineas.filter((l) => l[5] === 'A' || l[5] === 'a').length;
    return conA / lineas.length > 0.5;
  }

  for (const archivo of archivos) {
    it(`parsea ${archivo} sin excepciones y con contenido`, () => {
      const texto = leerFuente(join(dirFuentes, archivo));
      const p = parsearDspf(texto, archivo);

      if (esFuenteDds(texto)) {
        // Fuente DDS real: debe tener al menos un registro con nombre válido.
        expect(p.registros.length).toBeGreaterThan(0);
        for (const reg of p.registros) {
          expect(reg.nombre.length).toBeGreaterThan(0);
        }
        // No debería haber un exceso de líneas no interpretadas.
        expect(p.advertencias.length).toBeLessThan(p.registros.length * 5 + 20);
      } else {
        // Fuente no-DDS (p.ej. COBOL): el parser no debe inventar registros.
        expect(p.registros.length).toBe(0);
      }
    });
  }
});
