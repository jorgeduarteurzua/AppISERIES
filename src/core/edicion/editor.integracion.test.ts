import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import iconv from 'iconv-lite';
import {
  actualizarElemento,
  agregarCampo,
  agregarConstante,
  agregarRegistro,
  agregarTecla,
  alternarAtributo,
  crearPantalla,
  establecerColor,
  establecerTituloVentana,
  moverElemento,
  renombrarRegistro,
  ventanaPorDefecto,
} from './operaciones';
import { validar, hayErrores } from './validacion';
import { generarDspf } from '../generador/generadorDspf';
import { parsearDspf } from '../parser/parserDspf';
import { construirLienzo } from '../render/lienzo';
import type { PantallaDSPF } from '../modelo/pantalla';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dirFuentes = join(__dirname, '../../../QDSPSRC');

/** Modelo sin ids ni la posición de las teclas (que solo conoce el parser). */
function comparable(p: PantallaDSPF): unknown {
  return JSON.parse(
    JSON.stringify(p, (k, v) => (k === 'id' || k === 'posicion' ? undefined : v)),
  );
}

function texto(p: PantallaDSPF, nombreRegistro: string): string[] {
  const reg = p.registros.find((r) => r.nombre === nombreRegistro)!;
  return construirLienzo(p, reg).celdas.map((f) => f.map((c) => c.caracter).join('').trimEnd());
}

describe('pantalla construida desde cero', () => {
  function construir(): PantallaDSPF {
    let p = crearPantalla('CLIENTES');
    p = agregarTecla(p, { tipo: 'CF', numero: 3, texto: 'Salir' });
    p = agregarTecla(p, { tipo: 'CF', numero: 12, texto: 'Anterior' });

    // Registro de mantenimiento con ventana y dos títulos.
    const reg = p.registros[0];
    p = renombrarRegistro(p, reg.id, 'CLI01');
    p = agregarRegistro(p, {
      tipo: 'normal',
      nombre: 'MANT',
      ventana: ventanaPorDefecto(p),
      tituloArriba: 'MANTENIMIENTO DE CLIENTES',
      tituloAbajo: 'F3-Salir F12-Anterior',
    }).pantalla;
    const mant = p.registros.find((r) => r.nombre === 'MANT')!;

    const t = agregarConstante(p, mant.id, 2, 2, 'Código . . :');
    p = alternarAtributo(t.pantalla, mant.id, t.elementoId, 'HI');
    const c1 = agregarCampo(p, mant.id, {
      nombre: 'CODCLI',
      fila: 2,
      columna: 16,
      longitud: 6,
      decimales: 0,
      tipoDato: 'S',
      uso: 'ambos',
    });
    p = actualizarElemento(c1.pantalla, mant.id, c1.elementoId, {
      keywords: [{ nombre: 'EDTCDE', parametros: 'Z', indicadores: [] }],
    });
    const t2 = agregarConstante(p, mant.id, 3, 2, 'Nombre . . :');
    const c2 = agregarCampo(t2.pantalla, mant.id, {
      nombre: 'NOMCLI',
      fila: 3,
      columna: 16,
      longitud: 30,
      uso: 'ambos',
    });
    p = establecerColor(c2.pantalla, mant.id, c2.elementoId, 'TRQ');
    p = agregarCampo(p, mant.id, { nombre: 'MENSAJE', fila: 19, columna: 2, longitud: 60, uso: 'salida' }).pantalla;
    p = agregarCampo(p, mant.id, { nombre: 'ULTIMO', fila: null, columna: null, uso: 'oculto', longitud: 10 }).pantalla;

    // Subfile con control en ventana.
    p = agregarRegistro(p, {
      tipo: 'subfile',
      nombre: 'WS01',
      nombreControl: 'WC01',
      ventana: ventanaPorDefecto(p),
      tituloArriba: 'LISTA',
    }).pantalla;
    return p;
  }

  it('no tiene errores de validación', () => {
    const p = construir();
    const errores = validar(p).filter((x) => x.nivel === 'error');
    expect(errores).toEqual([]);
    expect(hayErrores(validar(p))).toBe(false);
  });

  it('el DDS generado se vuelve a leer como la misma pantalla', () => {
    const p = construir();
    const dds = generarDspf(p);
    const releida = parsearDspf(dds, p.nombre);
    expect(releida.advertencias).toEqual([]);
    expect(comparable(releida)).toEqual(comparable(p));
  });

  it('el DDS tiene el formato esperado', () => {
    const dds = generarDspf(construir());
    const lineas = dds.split('\n');
    expect(lineas[0]).toBe('     A                                      DSPSIZ(24 80 *DS3)');
    expect(dds).toContain("CF03(03 'Salir')");
    expect(dds).toMatch(/R MANT\s+WINDOW\(2 2 20 74\)/);
    expect(dds).toContain('*BOTTOM');
    expect(dds).toContain('     A            CODCLI         6S 0B  2 16EDTCDE(Z)');
    expect(dds).toContain('     A            ULTIMO        10A  H');
    for (const l of lineas) expect(l.length).toBeLessThanOrEqual(80);
  });

  it('se dibuja con la ventana, los títulos y los marcadores de campo', () => {
    const p = construir();
    const filas = texto(p, 'MANT');
    expect(filas[0]).toContain('MANTENIMIENTO DE CLIENTES'); // título arriba (centrado)
    // La ventana (2,2) de 20 x 74 ocupa las filas 2-21; su borde inferior es la fila 22.
    expect(filas[21]).toMatch(/^└ F3-Salir F12-Anterior ─+┘$/); // título abajo, a la izquierda
    // El texto ocupa las columnas 2-13 de la ventana y el campo empieza en la 16.
    expect(filas[2]).toContain('Código . . :  999999'); // numérico de entrada y salida
    expect(filas[3]).toContain('Nombre . . :  BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'); // alfanumérico B
    expect(filas[19]).toContain('O'.repeat(60)); // salida (fila 19 de la ventana = fila 20)
  });
});

describe('editar un fuente real y volver a generarlo', () => {
  const archivo = readdirSync(dirFuentes).find((f) => f.endsWith('ASQRY01D.TXT'))!;
  const original = parsearDspf(
    iconv.decode(readFileSync(join(dirFuentes, archivo)), 'windows-1252'),
    archivo,
  );

  it('mover un elemento y renombrar un registro solo cambia eso', () => {
    const wc01 = original.registros.find((r) => r.nombre === 'WC01')!;
    const campo = wc01.elementos.find((e) => e.tipo === 'campo' && e.nombre === 'NOMARC')!;
    const filaAntes = campo.fila!;

    let editada = moverElemento(original, wc01.id, campo.id, filaAntes + 1, campo.columna! + 2);
    editada = renombrarRegistro(editada, wc01.id, 'WC99');
    // WS01 sigue siendo el subfile de WC01: el rename del control no lo afecta.

    const releida = parsearDspf(generarDspf(editada), archivo);
    expect(comparable(releida)).toEqual(comparable(editada));

    const nuevo = releida.registros
      .find((r) => r.nombre === 'WC99')!
      .elementos.find((e) => e.tipo === 'campo' && e.nombre === 'NOMARC')!;
    expect(nuevo.fila).toBe(filaAntes + 1);
    expect(nuevo.columna).toBe(campo.columna! + 2);

    // El resto de la pantalla queda igual que en el original.
    const sinCambios = (p: PantallaDSPF) =>
      JSON.stringify(
        p.registros
          .filter((r) => r.nombre !== 'WC99' && r.nombre !== 'WC01')
          .map((r) => comparable({ ...p, registros: [r] })),
      );
    expect(sinCambios(releida)).toBe(sinCambios(original));
  });

  it('agregar un título de abajo a una ventana existente', () => {
    const wc01 = original.registros.find((r) => r.nombre === 'WC01')!;
    const editada = establecerTituloVentana(original, wc01.id, 'abajo', 'F3-Salir');
    const releida = parsearDspf(generarDspf(editada), archivo);
    const filas = construirLienzo(releida, releida.registros.find((r) => r.nombre === 'WC01')!).celdas.map(
      (f) => f.map((c) => c.caracter).join(''),
    );
    expect(filas.some((l) => l.includes('└ F3-Salir'))).toBe(true);
  });
});
