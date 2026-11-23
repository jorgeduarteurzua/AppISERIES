import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import iconv from 'iconv-lite';
import { parsearTabla } from './parserTabla';
import { camposDe, llavesDe, literalesDe, parametroDe, sinComillas, tipoDeTabla } from './modelo';
import { dirFuentesTablas } from './fuentesPrueba';

function leer(sufijo: string) {
  const f = readdirSync(dirFuentesTablas).find((n) => n.endsWith(sufijo))!;
  return parsearTabla(iconv.decode(readFileSync(join(dirFuentesTablas, f)), 'windows-1252'), f);
}

describe('parsearTabla: casos puntuales', () => {
  it('lee registro, campos, llave y keywords de campo', () => {
    const t = parsearTabla(
      [
        '     A                                      UNIQUE',
        '     A          R REG1',
        "     A            CODIGO         5S 0       COLHDG('CODIGO')",
        "     A            NOMBRE        30A         TEXT('NOMBRE CLIENTE')",
        '     A          K CODIGO',
      ].join('\n'),
      'CLI',
    );
    expect(t.keywords.map((k) => k.nombre)).toEqual(['UNIQUE']);
    expect(t.registros).toHaveLength(1);
    const r = t.registros[0];
    expect(r.nombre).toBe('REG1');
    expect(camposDe(r)).toMatchObject([
      { nombre: 'CODIGO', longitud: 5, tipoDato: 'S', decimales: 0 },
      { nombre: 'NOMBRE', longitud: 30, tipoDato: 'A', decimales: null },
    ]);
    expect(parametroDe(camposDe(r)[0].keywords, 'COLHDG')).toBe("'CODIGO'");
    expect(llavesDe(r).map((k) => k.nombre)).toEqual(['CODIGO']);
    expect(tipoDeTabla(t)).toBe('PF');
    expect(t.advertencias).toEqual([]);
  });

  it('une las keywords en varias líneas con + y quita los espacios sobrantes', () => {
    const t = parsearTabla(
      [
        '     A          R GXSMIPRU00',
        '     A            SMICOD     00004P',
        '     A                                      COLHDG(+',
        "     A                                      'smicod' +",
        '     A                                      )',
      ].join('\n'),
    );
    const campo = camposDe(t.registros[0])[0];
    expect(campo).toMatchObject({ nombre: 'SMICOD', longitud: 4, tipoDato: 'P', decimales: null });
    expect(campo.keywords).toEqual([{ nombre: 'COLHDG', parametros: "'smicod'", indicadores: [] }]);
  });

  it('reconoce un lógico por PFILE y las líneas S, O y J', () => {
    const t = parsearTabla(
      [
        '     A          R REGL                      PFILE(MAESTRO)',
        '     A            CAMPO1',
        "     A          S ESTADO                    COMP(EQ 'A')",
        '     A          O ALL',
        '     A          K CAMPO1                    DESCEND',
      ].join('\n'),
    );
    const r = t.registros[0];
    expect(tipoDeTabla(t)).toBe('LF');
    expect(r.elementos.map((e) => e.tipo)).toEqual(['campo', 'seleccion', 'omision', 'llave']);
    expect(camposDe(r)[0]).toMatchObject({ nombre: 'CAMPO1', longitud: null, tipoDato: '', decimales: null });
    expect(llavesDe(r)[0].keywords.map((k) => k.nombre)).toEqual(['DESCEND']);
  });

  it('conserva los comentarios en el elemento que sigue y al final', () => {
    const t = parsearTabla(
      [
        '     A          R REG',
        '     A*',
        '     A* ESTADO T=TRANSMITIDO -',
        '     A            ESTADO         1A',
        '     A          K ESTADO',
        '     A* fin',
      ].join('\n'),
    );
    expect(camposDe(t.registros[0])[0].comentarios).toEqual(['', ' ESTADO T=TRANSMITIDO -']);
    expect(t.comentariosFinales).toEqual([' fin']);
  });

  it('marca como referencia el campo con R en la columna 29', () => {
    const t = parsearTabla(
      ['     A          R REG', '     A            CAMPO     R               REFFLD(OTRO ARCH)'].join('\n'),
    );
    expect(camposDe(t.registros[0])[0]).toMatchObject({ nombre: 'CAMPO', referencia: true, longitud: null });
  });

  it('descarta las líneas en blanco', () => {
    const t = parsearTabla(['     A', '     A          R REG', '     A', '     A            C1  1A'].join('\n'));
    expect(t.registros[0].elementos).toHaveLength(1);
    expect(t.advertencias).toEqual([]);
  });

  it('ayudas de texto', () => {
    expect(sinComillas("'It''s'")).toBe("It's");
    expect(literalesDe("'A' 'B C' 'x''y'")).toEqual(['A', 'B C', "x'y"]);
  });
});

describe('parsearTabla con los fuentes reales de QDDSSRC', () => {
  it('lee el físico ASQRY01F', () => {
    const t = leer('ASQRY01F.TXT');
    expect(tipoDeTabla(t)).toBe('PF');
    expect(t.registros[0].nombre).toBe('RASQRY01F');
    expect(camposDe(t.registros[0])).toHaveLength(7);
    expect(llavesDe(t.registros[0]).map((k) => k.nombre)).toEqual(['WHFILE']);
  });

  it('lee el lógico ASQRY01L con PFILE, UNIQUE y dos llaves', () => {
    const t = leer('ASQRY01L.TXT');
    expect(tipoDeTabla(t)).toBe('LF');
    expect(t.keywords.map((k) => k.nombre)).toEqual(['UNIQUE']);
    expect(parametroDe(t.registros[0].keywords, 'PFILE')).toBe('ASQRY01F');
    expect(llavesDe(t.registros[0]).map((k) => k.nombre)).toEqual(['WHFILE', 'WHFLDI']);
  });

  it('un lógico sin lista de campos hereda todos (ASQRY27L01)', () => {
    const t = leer('ASQRY27L01.TXT');
    expect(tipoDeTabla(t)).toBe('LF');
    expect(camposDe(t.registros[0])).toHaveLength(0);
    expect(llavesDe(t.registros[0])).toHaveLength(5);
  });

  it('conserva el comentario que documenta STAARC en ASQRY4F', () => {
    const t = leer('ASQRY4F.TXT');
    const llaves = llavesDe(t.registros[0]);
    expect(llaves[0].comentarios.join('\n')).toContain('STAARC T=TRANSMITIDO');
  });

  it('lee los campos largos (10000A)', () => {
    const t = leer('ASQRY04F.TXT');
    expect(camposDe(t.registros[0]).find((c) => c.nombre === 'SELEJE')).toMatchObject({
      longitud: 10000,
      tipoDato: 'A',
    });
  });

  const archivos = readdirSync(dirFuentesTablas).filter((f) => f.toUpperCase().endsWith('.TXT'));

  it('hay 48 fuentes de ejemplo', () => {
    expect(archivos).toHaveLength(48);
  });

  for (const archivo of archivos) {
    it(`${archivo.slice(32)}: un registro, sin advertencias`, () => {
      const t = parsearTabla(
        iconv.decode(readFileSync(join(dirFuentesTablas, archivo)), 'windows-1252'),
        archivo,
      );
      expect(t.advertencias).toEqual([]);
      expect(t.registros).toHaveLength(1);
      expect(t.registros[0].nombre.length).toBeGreaterThan(0);
    });
  }
});
