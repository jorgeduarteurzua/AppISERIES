import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import iconv from 'iconv-lite';
import { generarDspf } from './generadorDspf';
import { parsearDspf } from '../parser/parserDspf';
import type { PantallaDSPF } from '../modelo/pantalla';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dirFuentes = join(__dirname, '../../../QDSPSRC');

/** Modelo sin ids (se regeneran en cada parseo) para poder compararlo. */
function sinIds(p: PantallaDSPF): unknown {
  return JSON.parse(JSON.stringify(p, (k, v) => (k === 'id' ? undefined : v)));
}

function esFuenteDds(texto: string): boolean {
  const lineas = texto.split('\n').filter((l) => l.trim().length > 0);
  if (lineas.length === 0) return false;
  return lineas.filter((l) => l[5] === 'A' || l[5] === 'a').length / lineas.length > 0.5;
}

describe('generarDspf: formato de columnas', () => {
  it('genera un registro, una constante y un campo en sus columnas', () => {
    const p = parsearDspf(
      [
        '     A                                      DSPSIZ(24 80 *DS3)',
        '     A          R PANT01',
        "     A                                  2  2'Hola'",
        '     A                                      DSPATR(HI)',
        "     A            NOMBRE        10A  B  4  2VALUES('A' 'B')",
      ].join('\n'),
    );
    const lineas = generarDspf(p).split('\n');
    expect(lineas[0]).toBe('     A                                      DSPSIZ(24 80 *DS3)');
    expect(lineas[1]).toBe('     A          R PANT01');
    expect(lineas[2]).toBe("     A                                  2  2'Hola'");
    expect(lineas[3]).toBe('     A                                      DSPATR(HI)');
    expect(lineas[4]).toBe("     A            NOMBRE        10A  B  4  2VALUES('A' 'B')");
  });

  it('escribe los indicadores en las columnas 8-16', () => {
    const fuente = [
      '     A          R REG',
      '     A N30                                  ERASE(WS00)',
      '     A  99                                  DSPATR(UL)',
    ].join('\n');
    const lineas = generarDspf(parsearDspf(fuente)).split('\n');
    expect(lineas[1]).toBe('     A N30                                  ERASE(WS00)');
    expect(lineas[2]).toBe('     A  99                                  DSPATR(UL)');
  });

  it('duplica las comillas de una constante', () => {
    const p = parsearDspf("     A          R REG\n     A                                  1  1'It''s'");
    expect(p.registros[0].elementos[0]).toMatchObject({ texto: "It's" });
    expect(generarDspf(p)).toContain("1  1'It''s'");
  });

  it('parte las líneas largas con continuación y conserva los espacios', () => {
    const texto = 'A'.repeat(10) + ' '.repeat(40) + 'Z'.repeat(10);
    const p = parsearDspf(`     A          R REG\n     A                                  1  1'${texto}'`);
    const lineas = generarDspf(p).split('\n').filter((l) => l.trim());
    expect(lineas.length).toBeGreaterThan(2);
    for (const l of lineas) expect(l.length).toBeLessThanOrEqual(80);
    expect(lineas[1].endsWith('-')).toBe(true);
    // Al volver a leerlo se recupera exactamente el mismo texto.
    const otra = parsearDspf(generarDspf(p));
    expect(otra.registros[0].elementos[0]).toMatchObject({ texto });
  });

  it('rechaza nombres de más de 10 caracteres y más de 3 indicadores', () => {
    const p = parsearDspf("     A          R REG\n     A            CAMPO          5A  B  1  1");
    const campo = p.registros[0].elementos[0];
    if (campo.tipo !== 'campo') throw new Error('se esperaba un campo');
    campo.nombre = 'NOMBREDEMASIADOLARGO';
    expect(() => generarDspf(p)).toThrow(/10 caracteres/);
    campo.nombre = 'CAMPO';
    campo.indicadores = [1, 2, 3, 4].map((numero) => ({ numero, negado: false }));
    expect(() => generarDspf(p)).toThrow(/indicadores/);
  });

  it('conserva el orden de las teclas de función entre las keywords de archivo', () => {
    const fuente = [
      '     A                                      DSPSIZ(24 80 *DS3)',
      "     A                                      CF12(12 'Anterior')",
      "     A                                      PAGEUP(90 'Arriba')",
      '     A          R REG',
    ].join('\n');
    const lineas = generarDspf(parsearDspf(fuente)).split('\n');
    expect(lineas[1]).toContain('CF12');
    expect(lineas[2]).toContain('PAGEUP');
  });

  it('agrega DSPSIZ si el tamaño no es el estándar y no está declarado', () => {
    const p = parsearDspf('     A          R REG');
    p.tamano = { filas: 27, columnas: 132, codigo: '*DS4' };
    expect(generarDspf(p)).toContain('DSPSIZ(27 132 *DS4)');
  });
});

describe('ida y vuelta con las fuentes reales de QDSPSRC', () => {
  const archivos = readdirSync(dirFuentes).filter((f) => f.toUpperCase().endsWith('.TXT'));

  for (const archivo of archivos) {
    const texto = iconv.decode(readFileSync(join(dirFuentes, archivo)), 'windows-1252');
    if (!esFuenteDds(texto)) continue; // p.ej. ASQRY23.TXT es COBOL

    describe(archivo, () => {
      const m1 = parsearDspf(texto, archivo);
      const t1 = generarDspf(m1);
      const m2 = parsearDspf(t1, archivo);

      it('el fuente generado vuelve a dar el mismo modelo', () => {
        expect(sinIds(m2)).toEqual(sinIds(m1));
      });

      it('generar es estable (generar(parsear(generar(m))) == generar(m))', () => {
        expect(generarDspf(m2)).toBe(t1);
      });

      it('ninguna línea supera las 80 columnas y no hay advertencias', () => {
        for (const l of t1.split('\n')) expect(l.length).toBeLessThanOrEqual(80);
        expect(m1.advertencias).toEqual([]);
        expect(m2.advertencias).toEqual([]);
      });
    });
  }
});
