import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import iconv from 'iconv-lite';
import { generarDspf } from '../generador/generadorDspf';
import { parsearDspf } from '../parser/parserDspf';
import { validar } from '../edicion/validacion';
import { dirFuentesTablas } from '../tablas/fuentesPrueba';
import { nombreArchivoTabla, tipoDeTabla } from '../tablas/modelo';
import type { Tabla } from '../tablas/modelo';
import { parsearTabla } from '../tablas/parserTabla';
import { generarCrud } from './crud';
import type { OpcionesCrud, TeclaCrud } from './crud';
import { COLUMNA_MAXIMA } from './generadorCobolCrud';
import { nombresRegistros } from './generadorPantallaCrud';
import { TECLAS_POR_DEFECTO, calcularPasos } from './planCrud';

function leerReal(sufijo: string): Tabla {
  const f = readdirSync(dirFuentesTablas).find((n) => n.endsWith(sufijo))!;
  return parsearTabla(iconv.decode(readFileSync(join(dirFuentesTablas, f)), 'windows-1252'), f);
}

function opciones(nombre: string, extra: Partial<OpcionesCrud> = {}): OpcionesCrud {
  return {
    nombreTabla: nombre,
    nombrePantalla: `${nombre.slice(0, 7)}D`,
    nombrePrograma: `${nombre.slice(0, 7)}P`,
    tipoCobol: 'SQLCBL',
    titulo: `Mantencion de ${nombre}`,
    autor: 'Jorge Duarte',
    bibliotecaTabla: '',
    ...extra,
  };
}

/** Texto DDS de una tabla con los campos y llaves dados: [nombre, longitud, tipo, decimales, colhdg]. */
function tablaDe(campos: Array<[string, number, string, number?, string?]>, llaves: string[]): Tabla {
  const lineas = ['     A          R REG1'];
  for (const [n, l, t, d, h] of campos) {
    const dec = d === undefined ? '  ' : String(d).padStart(2);
    lineas.push(
      `     A            ${n.padEnd(10)} ${String(l).padStart(5)}${t}${dec}       ${h ? `COLHDG('${h}')` : ''}`.trimEnd(),
    );
  }
  for (const k of llaves) lineas.push(`     A          K ${k}`);
  return parsearTabla(lineas.join('\n') + '\n', 'PRUEBA');
}

const sinErrores = (r: ReturnType<typeof generarCrud>) => validar(r.pantalla).filter((p) => p.nivel === 'error');

describe('CRUD en pantalla normal (ASQRY03F)', () => {
  const tabla = leerReal('ASQRY03F.TXT');
  const r = generarCrud(tabla, opciones('ASQRY03F'));

  it('arma el plan: llave, detalle, lista y tamaño', () => {
    expect(r.plan.llaves.map((c) => c.nombre)).toEqual(['CODEVE']);
    expect(r.plan.detalle.map((c) => c.nombre)).toEqual([
      'CODEVE', 'DESEVE', 'FECCRE', 'HORCRE', 'USRCRE', 'FECMOD', 'HORMOD', 'USRMOD',
    ]);
    expect(r.plan.tamano).toMatchObject({ filas: 24, columnas: 80 });
    expect(r.plan.posicionable).toBe(true);
    expect(r.plan.tablaSql).toBe('ASQRY03F');
  });

  it('los registros usan la nomenclatura S, C, FC, R y W', () => {
    expect(r.pantalla.registros.map((x) => x.nombre)).toEqual(['S01', 'C01', 'FC01', 'R01', 'W01']);
    expect(r.pantalla.registros.map((x) => x.clase)).toEqual(['subfile', 'control-subfile', 'normal', 'normal', 'normal']);
  });

  it('el subfile siempre tiene 12 líneas por página', () => {
    expect(r.dds).toContain('SFLPAG(0012)');
    expect(r.dds).toMatch(/SFLSIZ\(0500\)/);
  });

  it('el mensaje y las teclas están en FC01, no en el control del subfile', () => {
    const c01 = r.pantalla.registros.find((x) => x.nombre === 'C01')!;
    const fc01 = r.pantalla.registros.find((x) => x.nombre === 'FC01')!;
    expect(c01.elementos.some((e) => e.tipo === 'campo' && e.nombre === 'MENSAJE')).toBe(false);
    expect(c01.elementos.filter((e) => e.tipo === 'constante').every((e) => e.tipo === 'constante' && e.fila < 7)).toBe(true);
    expect(fc01.elementos.some((e) => e.tipo === 'campo' && e.nombre === 'MENSAJE')).toBe(true);
    const textos = fc01.elementos.flatMap((e) => (e.tipo === 'constante' ? [e.texto] : [])).join(' ');
    for (const t of ['F3=Salir', 'F1=Ayuda', 'F5=Renovar', 'F6=Insertar', 'F8=Modificar', 'F12=Volver', 'F23=Eliminar']) {
      expect(textos).toContain(t);
    }
    // El mensaje queda debajo de la última fila de la página del subfile (7 a 18).
    const mensaje = fc01.elementos.find((e) => e.tipo === 'campo' && e.nombre === 'MENSAJE');
    expect((mensaje as { fila: number }).fila).toBeGreaterThan(18);
  });

  it('el control del subfile devuelve la fila del cursor y se sobrepone a FC01', () => {
    expect(r.dds).toMatch(/SFLCSRRRN\(&REGREL\)/);
    expect(r.dds).toMatch(/REGREL +5S 0H/);
    expect(r.pantalla.registros[1].keywords.some((k) => k.nombre === 'OVERLAY')).toBe(true);
    expect(r.pantalla.registros[2].keywords.some((k) => k.nombre === 'OVERLAY')).toBe(false);
  });

  it('declara las teclas pedidas', () => {
    for (const t of ["CF03(03 'Salir')", "CF01(01 'Ayuda')", "CF05(05 'Renovar')", "CF06(06 'Insertar')", "CF08(08 'Modificar')", "CF09(09 'Grabar')", "CF12(12 'Volver')", "CF23(23 'Eliminar')"]) {
      expect(r.dds).toContain(t);
    }
    // Las ocho columnas de la lista no caben en 72: se agregan las teclas de desplazamiento.
    expect(r.dds).toContain("CF19(19 'Izquierda')");
    expect(r.dds).toContain("CF20(20 'Derecha')");
  });

  it('las llaves se protegen con una sola condición 40 O 41', () => {
    expect(r.dds).toMatch(/ A  40\n {5}AO 41 +DSPATR\(PR\)/);
    expect(r.dds.match(/DSPATR\(PR\)/g)).toHaveLength(8);
    expect(sinErrores(r)).toEqual([]);
  });

  it('la pantalla se lee de vuelta sin advertencias y es estable', () => {
    const vuelta = parsearDspf(r.dds, 'X');
    expect(vuelta.advertencias).toEqual([]);
    expect(generarDspf(vuelta)).toBe(r.dds);
    expect(vuelta.teclasFuncion.map((t) => t.numero)).toEqual([1, 3, 5, 6, 8, 9, 12, 19, 20, 23]);
  });

  it('el programa usa SQL, el subfile y la pantalla con los nombres del plan', () => {
    expect(r.cobol).toContain('PROGRAM-ID.  ASQRY03P.');
    expect(r.cobol).toContain('AUTHOR. JORGE DUARTE.');
    expect(r.cobol).toContain('ASSIGN        TO WORKSTATION-ASQRY03D-SI');
    expect(r.cobol).toContain('COPY DDS-C01-I       OF ASQRY03D.');
    expect(r.cobol).toContain('COPY DDS-R01-INDIC   OF ASQRY03D.');
    expect(r.cobol).toContain('COPY DDS-FC01-O       OF ASQRY03D.');
    expect(r.cobol).toContain('DECLARE C1 CURSOR FOR');
    expect(r.cobol).toContain('WHERE CODEVE >= :POSICION-WS');
    expect(r.cobol).toContain('INSERT INTO ASQRY03F');
    expect(r.cobol).toContain('UPDATE ASQRY03F');
    expect(r.cobol).toContain('DELETE FROM ASQRY03F');
    expect(r.cobol).toContain('WRITE SUBFILE R-PANTALLA FROM S01-OO FORMAT "S01"');
    expect(r.cobol).toContain('READ SUBFILE PANTALLA NEXT MODIFIED INTO S01-II');
    expect(r.cobol).toContain('COMMIT(*NONE)');
  });

  it('escribe FC01 antes del control en cada ciclo', () => {
    const proceso = r.cobol.slice(r.cobol.indexOf('       PROCESO.'), r.cobol.indexOf('       TERMINO.'));
    expect(proceso.indexOf('FORMAT "FC01"')).toBeGreaterThan(0);
    expect(proceso.indexOf('FORMAT "FC01"')).toBeLessThan(proceso.indexOf('FORMAT "C01"'));
  });

  it('cada tecla tiene su rama: F1, F3, F5, F6, F8, F12 y F23 en la lista', () => {
    const proceso = r.cobol.slice(r.cobol.indexOf('       PROCESO.'), r.cobol.indexOf('       TERMINO.'));
    for (const t of ['F1', 'F3', 'F5', 'F6', 'F8', 'F12', 'F19', 'F20', 'F23']) expect(proceso).toContain(`WHEN ${t}\n`);
    expect(proceso).toContain('PERFORM MUESTRA-AYUDA');
    expect(proceso).toContain('PERFORM CREAR-REGISTRO');
    expect(proceso).toContain('WHEN INTRO');
  });

  it('F9 graba, F8 pasa a modificar y F23 elimina en el detalle', () => {
    const detalle = r.cobol.slice(r.cobol.indexOf('       MOSTRAR-DETALLE.'), r.cobol.indexOf('       RENOVAR-DETALLE.'));
    expect(detalle).toMatch(/WHEN F9\n\s+IF MODO-WS = "A" OR MODO-WS = "M"\n\s+PERFORM GRABAR-DETALLE/);
    expect(detalle).toMatch(/WHEN F8\n\s+IF MODO-WS = "C"/);
    expect(detalle).toMatch(/WHEN F23\n\s+IF MODO-WS = "E"\n\s+PERFORM ELIMINAR-REGISTRO/);
    // Enter no graba.
    expect(detalle).not.toMatch(/WHEN INTRO[\s\S]*GRABAR/);
  });

  it('el UPDATE no toca la llave y usa la llave original en el WHERE', () => {
    const update = r.cobol.slice(r.cobol.indexOf('UPDATE ASQRY03F'), r.cobol.indexOf('END-EXEC', r.cobol.indexOf('UPDATE ASQRY03F')));
    expect(update).not.toMatch(/SET\s+CODEVE/);
    expect(update).toContain('DESEVE = :DESEVE-WS');
    expect(update).toContain('WHERE CODEVE = :CODEVE-LW');
  });

  it('la lista se arma como una línea y se muestra una parte con OFFSET-WS', () => {
    expect(r.cobol).toContain('MOVE FL-LINEA(I)(OFFSET-WS:ANCHO-VIS)');
    expect(r.cobol).toContain('ENCAB-LINEA(OFFSET-WS:ANCHO-VIS)');
    expect(r.cobol).toContain('MOVE REGREL OF C01-II TO I');
  });
});

describe('CRUD en ventanas', () => {
  const r = generarCrud(leerReal('ASQRY03F.TXT'), opciones('ASQRY03F', { tipoPantalla: 'window' }));

  it('usa la nomenclatura W, WS, WC, FWC y el registro ficticio', () => {
    expect(r.pantalla.registros.map((x) => x.nombre)).toEqual(['WS01', 'WC01', 'FWC01', 'W01', 'W02', 'R99']);
    expect(nombresRegistros(true)).toMatchObject({ sfl: 'WS01', control: 'WC01', mensaje: 'FWC01', detalle: 'W01', ayuda: 'W02', ficticio: 'R99' });
  });

  it('FWC01 usa la ventana de WC01 (WINDOW(WC01) y OVERLAY) y el control no tiene nada bajo el subfile', () => {
    const reg = (n: string) => r.pantalla.registros.find((x) => x.nombre === n)!;
    expect(reg('FWC01').keywords.map((k) => [k.nombre, k.parametros])).toEqual([['WINDOW', 'WC01'], ['OVERLAY', '']]);
    expect(r.dds).toMatch(/R FWC01 +WINDOW\(WC01\)/);
    const textos = reg('FWC01').elementos.flatMap((e) => (e.tipo === 'constante' ? [e.texto] : [])).join(' ');
    expect(textos).toMatch(/F3=Salir/);
    const filaSfl = Math.min(...reg('WS01').elementos.flatMap((e) => (e.fila !== null ? [e.fila] : [])));
    expect(reg('WC01').elementos.every((e) => e.fila === null || e.fila < filaSfl)).toBe(true);
  });
  it('el programa escribe WC01 antes que FWC01 y luego lee WC01', () => {
    const proceso = r.cobol.slice(r.cobol.indexOf(' PROCESO.'));
    const wc = proceso.indexOf('FORMAT "WC01"');
    const fwc = proceso.indexOf('FORMAT "FWC01"');
    expect(wc).toBeGreaterThan(0);
    expect(fwc).toBeGreaterThan(wc);
    expect(proceso.indexOf('READ  PANTALLA   INTO WC01-II')).toBeGreaterThan(fwc);
  });
  it('toda la pantalla cabe en ventanas y valida sin errores', () => {
    expect(sinErrores(r)).toEqual([]);
    const vuelta = parsearDspf(r.dds, 'X');
    expect(vuelta.advertencias).toEqual([]);
    expect(generarDspf(vuelta)).toBe(r.dds);
  });

  it('el detalle es una ventana más pequeña que la lista y la ayuda otra', () => {
    const v = (n: string) => r.pantalla.registros.find((x) => x.nombre === n)!.keywords.find((k) => k.nombre === 'WINDOW')!.parametros;
    expect(new Set([v('WC01'), v('W01'), v('W02')]).size).toBe(3);
  });

  it('el programa escribe el registro ficticio y los registros de ventana', () => {
    expect(r.cobol).toContain('WRITE R-PANTALLA FORMAT "R99"');
    expect(r.cobol).toContain('COPY DDS-FWC01-O       OF ASQRY03D.');
    expect(r.cobol).toContain('FORMAT "WC01"');
    expect(r.cobol).toContain('FORMAT "W02"');
    expect(r.cobol).toContain('WRITE SUBFILE R-PANTALLA FROM WS01-OO FORMAT "WS01"');
  });
});

describe('tamaño de pantalla: 80 o 132', () => {
  it('automático usa 80 si todo cabe y 132 si no', () => {
    expect(generarCrud(leerReal('ASQRY03F.TXT'), opciones('ASQRY03F')).plan.tamano.columnas).toBe(80);
    const campos: Array<[string, number, string, number?]> = [['CODIGO', 5, 'S', 0]];
    for (let i = 1; i <= 16; i++) campos.push([`CAMPO${i}`, 10, 'A']);
    const muchos = tablaDe(campos, ['CODIGO']);
    // 17 filas no caben en las 16 de una pantalla de 24 líneas, pero sí en las 19 de una de 27.
    const r = generarCrud(muchos, opciones('MUCHOS'));
    expect(r.plan.tamano).toMatchObject({ filas: 27, columnas: 132 });
    expect(r.plan.detalle).toHaveLength(17);
    expect(r.dds).toContain('DSPSIZ(27 132 *DS4)');
    expect(r.cobol).toContain(`PIC X(${27 * 132})`);
    expect(sinErrores(r)).toEqual([]);
  });

  it('un texto largo ya no obliga a pasar a 132: se parte en filas con CNTFLD', () => {
    const ancha = tablaDe([['CODIGO', 5, 'S', 0], ['DESCRIP', 100, 'A']], ['CODIGO']);
    const r = generarCrud(ancha, opciones('ANCHA'));
    expect(r.plan.tamano.columnas).toBe(80);
    expect(r.plan.detalle.find((c) => c.nombre === 'DESCRIP')).toMatchObject({ cntfld: 50, filasDetalle: 2 });
  });

  it('se puede forzar 132 aunque quepa en 80', () => {
    const r = generarCrud(leerReal('ASQRY03F.TXT'), opciones('ASQRY03F', { ancho: 132 }));
    expect(r.plan.tamano.columnas).toBe(132);
    expect(r.plan.diseno.visible).toBe(124);
    expect(sinErrores(r)).toEqual([]);
  });

  it('forzar 80 cuando el detalle elegido no cabe da un error claro', () => {
    const campos: Array<[string, number, string, number?]> = [['CODIGO', 5, 'S', 0]];
    for (let i = 1; i <= 16; i++) campos.push([`CAMPO${i}`, 10, 'A']);
    const muchos = tablaDe(campos, ['CODIGO']);
    expect(() => generarCrud(muchos, opciones('MUCHOS', { ancho: 80, camposDetalle: campos.map(([n]) => n) }))).toThrow(
      /17 filas.*caben 16.*80 columnas/s,
    );
    // Sin elegir campos, en 80 columnas quedan fuera los que no caben y se avisa.
    const r = generarCrud(muchos, opciones('MUCHOS', { ancho: 80 }));
    expect(r.plan.detalle).toHaveLength(16);
    expect(r.plan.advertencias.join(' ')).toMatch(/No caben todos los campos.*CAMPO16/);
  });
});

describe('desplazamiento a la derecha', () => {
  it('si las columnas no caben se agregan F19 y F20 y el programa desplaza por columnas', () => {
    const r = generarCrud(leerReal('ASQRY19F.TXT'), opciones('ASQRY19F'));
    expect(r.plan.diseno.desplaza).toBe(true);
    expect(r.plan.diseno.totalLinea).toBeGreaterThan(r.plan.diseno.visible);
    expect(r.dds).toContain("CF19(19 'Izquierda')");
    expect(r.dds).toContain("CF20(20 'Derecha')");
    expect(r.cobol).toContain('DESPLAZA-DERECHA.');
    expect(r.cobol).toContain('DESPLAZA-IZQUIERDA.');
    expect(r.cobol).toContain('WHEN F20');
    expect(r.cobol).toContain('WHEN F19');
    expect(r.cobol).toMatch(/OCCURS \d+ TIMES PIC 9\(4\)/);
    const leyenda = r.pantalla.registros.find((x) => x.nombre === 'FC01')!.elementos.flatMap((e) => (e.tipo === 'constante' ? [e.texto] : [])).join(' ');
    expect(leyenda).toContain('F19=Izquierda');
    expect(leyenda).toContain('F20=Derecha');
  });

  it('las posiciones de las columnas calzan con el encabezado y la línea', () => {
    const r = generarCrud(leerReal('ASQRY19F.TXT'), opciones('ASQRY19F'));
    const cols = r.plan.diseno.columnasLista;
    cols.forEach((c, i) => {
      if (i > 0) expect(c.pos).toBe(cols[i - 1].pos + cols[i - 1].anchoColumna + 1);
    });
    const { pasos, totalLinea, visible } = r.plan.diseno;
    pasos.forEach((p, i) => expect(r.cobol).toContain(`MOVE ${p} TO COL-POS(${i + 1})`));
    expect(pasos[0]).toBe(1);
    // El último paso deja ver el final de la línea.
    expect(pasos[pasos.length - 1]).toBe(totalLinea - visible + 1);
    expect(r.cobol).toContain(`VALUE ${pasos.length}.`);
    expect([...pasos].sort((a, b) => a - b)).toEqual(pasos);
    expect(r.cobol).toContain(`TOTAL-LINEA           PIC 9(4) VALUE ${r.plan.diseno.totalLinea}.`);
  });

  it('sin desplazamiento no hay F19 ni F20', () => {
    const r = generarCrud(leerReal('ASQRY03F.TXT'), opciones('ASQRY03F', { camposLista: ['CODEVE', 'DESEVE'] }));
    expect(r.plan.diseno.desplaza).toBe(false);
    expect(r.dds).not.toContain('CF19');
    expect(r.cobol).not.toContain('DESPLAZA-DERECHA');
    expect(r.plan.teclas.map((t) => t.numero)).not.toContain(19);
  });
});

describe('teclas de función', () => {
  const tabla = leerReal('ASQRY03F.TXT');

  it('una tecla personalizada deja un párrafo vacío para programar', () => {
    const teclas: TeclaCrud[] = [...TECLAS_POR_DEFECTO, { numero: 10, texto: 'Imprimir', accion: 'personalizada', donde: 'ambas' }];
    const r = generarCrud(tabla, opciones('ASQRY03F', { teclas }));
    expect(r.dds).toContain("CF10(10 'Imprimir')");
    expect(r.cobol).toContain('ACCION-F10.');
    expect(r.cobol).toMatch(/ACCION-F10\.\n\s+\*-+\n\s+\* Tecla F10 \(Imprimir\)[\s\S]*?CONTINUE\./);
    const proceso = r.cobol.slice(r.cobol.indexOf('       PROCESO.'), r.cobol.indexOf('       TERMINO.'));
    expect(proceso).toMatch(/WHEN F10\n\s+PERFORM REGISTRO-BAJO-CURSOR\n\s+PERFORM ACCION-F10/);
    const detalle = r.cobol.slice(r.cobol.indexOf('       MOSTRAR-DETALLE.'), r.cobol.indexOf('       RENOVAR-DETALLE.'));
    expect(detalle).toMatch(/WHEN F10\n\s+PERFORM ACCION-F10/);
    expect(r.cobol).toContain('Agregue aqui nuevas teclas');
    expect(sinErrores(r)).toEqual([]);
  });

  it('una personalizada solo de la lista no aparece en el detalle', () => {
    const teclas: TeclaCrud[] = [...TECLAS_POR_DEFECTO, { numero: 11, texto: 'Resumen', accion: 'personalizada', donde: 'lista' }];
    const r = generarCrud(tabla, opciones('ASQRY03F', { teclas }));
    const detalle = r.cobol.slice(r.cobol.indexOf('       MOSTRAR-DETALLE.'), r.cobol.indexOf('       RENOVAR-DETALLE.'));
    expect(detalle).not.toContain('F11');
    expect(r.cobol.slice(r.cobol.indexOf('       PROCESO.'))).toContain('WHEN F11');
  });

  it('se pueden cambiar los números y los textos', () => {
    const teclas = TECLAS_POR_DEFECTO.map((t) => (t.accion === 'eliminar' ? { ...t, numero: 24, texto: 'Borrar' } : t));
    const r = generarCrud(tabla, opciones('ASQRY03F', { teclas }));
    expect(r.dds).toContain("CF24(24 'Borrar')");
    expect(r.dds).not.toContain('CF23');
    expect(r.cobol).toContain('88 F24');
  });

  it('exige una tecla para salir y no admite teclas repetidas', () => {
    const sinSalir = TECLAS_POR_DEFECTO.filter((t) => t.accion !== 'salir' && t.accion !== 'volver');
    expect(() => generarCrud(tabla, opciones('ASQRY03F', { teclas: sinSalir }))).toThrow(/salir/);
    const repetida = [...TECLAS_POR_DEFECTO, { numero: 3, texto: 'Otra', accion: 'personalizada' as const, donde: 'ambas' as const }];
    expect(() => generarCrud(tabla, opciones('ASQRY03F', { teclas: repetida }))).toThrow(/F3 está repetida/);
    const mal = [{ numero: 30, texto: 'X', accion: 'salir' as const, donde: 'ambas' as const }];
    expect(() => generarCrud(tabla, opciones('ASQRY03F', { teclas: mal }))).toThrow(/no es válida/);
  });
});

describe('fecha y hora con formato', () => {
  const tabla = tablaDe(
    [
      ['CODIGO', 5, 'S', 0],
      ['FECNAC', 8, 'S', 0],
      ['FECCON', 6, 'S', 0],
      ['FECDATE', 10, 'L'],
      ['HORINI', 6, 'S', 0],
      ['HORFIN', 8, 'T'],
      ['NOMBRE', 20, 'A'],
    ],
    ['CODIGO'],
  );
  const fh = {
    FECNAC: { tipo: 'fecha' as const, formato: 'DD/MM/YYYY', almacenamiento: 'N8' },
    FECCON: { tipo: 'fecha' as const, formato: 'DD/MM/YY', almacenamiento: 'N6' },
    HORINI: { tipo: 'hora' as const, formato: 'HH:MM', almacenamiento: 'N6' },
  };
  const r = generarCrud(tabla, opciones('FECHAS', { camposFechaHora: fh }));

  it('en pantalla el campo es texto con el largo del formato; en el programa conserva su tipo', () => {
    const vuelta = parsearDspf(r.dds, 'X');
    const det = vuelta.registros.find((x) => x.nombre === 'R01')!;
    const campo = (n: string) => det.elementos.find((e) => e.tipo === 'campo' && e.nombre === n) as { longitud: number; tipoDato: string };
    expect(campo('FECNAC')).toMatchObject({ longitud: 10, tipoDato: 'A' });
    expect(campo('FECCON')).toMatchObject({ longitud: 8, tipoDato: 'A' });
    expect(campo('HORINI')).toMatchObject({ longitud: 5, tipoDato: 'A' });
    expect(r.cobol).toMatch(/FECNAC-WS +PIC S9\(8\)\./);
    expect(r.cobol).toMatch(/FECCON-WS +PIC S9\(6\)\./);
    expect(r.cobol).toMatch(/HORINI-WS +PIC S9\(6\)\./);
  });

  it('los campos de tipo DATE y TIME se editan como fecha y hora sin pedirlo', () => {
    expect(r.plan.detalle.find((c) => c.nombre === 'FECDATE')?.fechaHora).toMatchObject({ tipo: 'fecha', almacenamiento: 'L' });
    expect(r.plan.detalle.find((c) => c.nombre === 'HORFIN')?.fechaHora).toMatchObject({ tipo: 'hora', almacenamiento: 'T' });
    expect(r.cobol).toMatch(/FECDATE-WS +PIC X\(10\)\./);
    expect(r.cobol).toMatch(/HORFIN-WS +PIC X\(8\)\./);
  });

  it('el SQL lee DATE y TIME en ISO y los asigna con DATE() y TIME()', () => {
    expect(r.cobol).toContain('CHAR(FECDATE, ISO)');
    expect(r.cobol).toContain('CHAR(HORFIN, ISO)');
    expect(r.cobol).toContain('DATE(:FECDATE-WS)');
    expect(r.cobol).toContain('TIME(:HORFIN-WS)');
    // Los numéricos van tal cual.
    expect(r.cobol).toContain(':FECNAC-WS');
    expect(r.cobol).not.toContain('DATE(:FECNAC-WS)');
  });

  it('convierte y valida la fecha con el formato elegido', () => {
    const prs = r.cobol.slice(r.cobol.indexOf('       PRS-FECNAC.'), r.cobol.indexOf('       FMT-FECCON.'));
    expect(prs).toContain('MOVE TXT-FECHA(1:2) TO FT-DD');
    expect(prs).toContain('MOVE TXT-FECHA(4:2) TO FT-MM');
    expect(prs).toContain('MOVE TXT-FECHA(7:4) TO FT-AAAA');
    expect(prs).toContain('TXT-FECHA(3:1) NOT = "/"');
    expect(prs).toContain('PERFORM VALIDA-FECHA');
    expect(prs).toContain('MOVE NUM8-WS TO FECNAC-WS');
    expect(prs).toContain('MOVE ZEROES TO FECNAC-WS');
    const fmt = r.cobol.slice(r.cobol.indexOf('       FMT-FECNAC.'), r.cobol.indexOf('       PRS-FECNAC.'));
    expect(fmt).toContain('MOVE FT-DD TO TXT-FECHA(1:2)');
    expect(fmt).toContain('MOVE FT-AAAA TO TXT-FECHA(7:4)');
  });

  it('el año de 2 dígitos usa 50 como pivote y el almacenamiento AAMMDD', () => {
    const prs = r.cobol.slice(r.cobol.indexOf('       PRS-FECCON.'), r.cobol.indexOf('       FMT-HORINI.'));
    expect(prs).toContain('MOVE TXT-FECHA(7:2) TO FT-AA');
    expect(prs).toContain('COMPUTE FT-AAAA = 1900 + FT-AA');
    expect(prs).toContain('COMPUTE FT-AAAA = 2000 + FT-AA');
    expect(prs).toContain('MOVE FT-AAAA(3:2) TO N6-AA');
    expect(prs).toContain('MOVE NUM6-WS      TO FECCON-WS');
  });

  it('valida la hora y convierte según el almacenamiento', () => {
    expect(r.cobol).toContain('IF HT-HH > 23 OR HT-MI > 59 OR HT-SS > 59');
    const prs = r.cobol.slice(r.cobol.indexOf('       PRS-HORINI.'), r.cobol.indexOf('       PRS-HORFIN.'));
    expect(prs).toContain('MOVE NUM6H-WS TO HORINI-WS');
    const t = r.cobol.slice(r.cobol.indexOf('       PRS-HORFIN.'), r.cobol.indexOf('       VALIDA-FECHA.'));
    expect(t).toContain('STRING HT-HH "." HT-MI "." HT-SS');
  });

  it('valida los días de cada mes y los años bisiestos', () => {
    expect(r.cobol).toContain('DIVIDE FT-AAAA BY 400 GIVING FT-Q');
    expect(r.cobol).toContain('MOVE 30 TO FT-MAXDIA');
    expect(r.cobol).toContain('MOVE 29 TO FT-MAXDIA');
  });

  it('un error de fecha impide grabar y avisa', () => {
    const grabar = r.cobol.slice(r.cobol.indexOf('       GRABAR-DETALLE.'), r.cobol.indexOf('       GRABAR-ALTA.'));
    expect(grabar).toContain('PERFORM PANTALLA-A-REGISTRO');
    expect(grabar).toContain('IF ERROR-WS = "N"');
    expect(r.cobol).toContain('MOVE "Fecha no valida: ');
  });

  it('la lista muestra las fechas con su formato', () => {
    expect(r.cobol).toMatch(/PERFORM FMT-FECNAC\n\s+MOVE TXT-FECHA\(1:10\) TO FL-LINEA/);
  });

  it('rechaza un formato o un almacenamiento que el campo no admite', () => {
    const mal = (cfg: object) => () => generarCrud(tabla, opciones('FECHAS', { camposFechaHora: { FECNAC: cfg as never } }));
    expect(mal({ tipo: 'fecha', formato: 'dd/mm/aaaa', almacenamiento: 'N8' })).toThrow(/formato dd\/mm\/aaaa no es válido/);
    expect(mal({ tipo: 'fecha', formato: 'DD/MM/YYYY', almacenamiento: 'L' })).toThrow(/no puede guardar una fecha como L/);
    expect(mal({ tipo: 'hora', formato: 'HH:MM:SS', almacenamiento: 'N8' })).not.toThrow();
    expect(() => generarCrud(tabla, opciones('FECHAS', { camposFechaHora: { NOMBRE: { tipo: 'fecha', formato: 'DD/MM/YYYY', almacenamiento: 'A8' } } }))).toThrow(
      /no puede guardar/,
    );
    expect(() => generarCrud(tabla, opciones('FECHAS', { camposFechaHora: { NOEXISTE: { tipo: 'fecha', formato: 'DD/MM/YYYY', almacenamiento: 'N8' } } }))).toThrow(
      /no existe/,
    );
  });
});

describe('valores de los campos que no se muestran', () => {
  const tabla = leerReal('ASQRY20F.TXT');
  const base = {
    camposDetalle: ['NOMCON', 'DESCON'],
    camposFechaHora: {
      FECCRE: { tipo: 'fecha' as const, formato: 'DD/MM/YYYY', almacenamiento: 'N8' },
      HORCRE: { tipo: 'hora' as const, formato: 'HH:MM:SS', almacenamiento: 'N8' },
    },
  };

  it('los asigna dentro del INSERT y del UPDATE', () => {
    const r = generarCrud(
      tabla,
      opciones('ASQRY20F', {
        ...base,
        valoresAlAgregar: {
          USRCRE: { tipo: 'usuario' },
          FECCRE: { tipo: 'fechaActual' },
          HORCRE: { tipo: 'horaActual' },
        },
        valoresAlModificar: {
          USRMOD: { tipo: 'usuario' },
          FECMOD: { tipo: 'fechaActual' },
          HORMOD: { tipo: 'horaActual' },
        },
      }),
    );
    const insert = r.cobol.slice(r.cobol.indexOf('INSERT INTO'), r.cobol.indexOf('END-EXEC', r.cobol.indexOf('INSERT INTO')));
    expect(insert).toContain('(NOMCON, DESCON, USRCRE, FECCRE, HORCRE)');
    expect(insert).toMatch(/VALUES \(:NOMCON-WS, :DESCON-WS, USER,/);
    expect(insert).toContain('YEAR(CURRENT DATE)*10000+');
    expect(insert).toContain('HOUR(CURRENT TIME)*10000+');
    const update = r.cobol.slice(r.cobol.indexOf('UPDATE ASQRY20F'), r.cobol.indexOf('END-EXEC', r.cobol.indexOf('UPDATE ASQRY20F')));
    expect(update).toContain('SET DESCON = :DESCON-WS,');
    expect(update).toContain('USRMOD = USER');
    expect(update).toContain('FECMOD = YEAR(CURRENT DATE)*10000+');
    expect(update).not.toContain('USRCRE');
    expect(r.plan.alAgregar.map((v) => v.columna)).toEqual(['USRCRE', 'FECCRE', 'HORCRE']);
    expect(r.plan.alModificar.map((v) => v.columna)).toEqual(['USRMOD', 'FECMOD', 'HORMOD']);
  });

  it('un valor fijo de texto se escribe entre comillas y uno numérico tal cual', () => {
    const r = generarCrud(
      tabla,
      opciones('ASQRY20F', {
        ...base,
        valoresAlAgregar: { USRCRE: { tipo: 'fijo', valor: "O'BRIEN" }, FECCRE: { tipo: 'fijo', valor: '19000101' } },
      }),
    );
    expect(r.plan.alAgregar).toEqual([
      { columna: 'USRCRE', expresion: "'O''BRIEN'" },
      { columna: 'FECCRE', expresion: '19000101' },
    ]);
  });

  it('la fecha actual respeta el almacenamiento del campo', () => {
    const t = tablaDe([['CODIGO', 5, 'S', 0], ['FECDATE', 10, 'L'], ['FECSEIS', 6, 'S', 0], ['NOMBRE', 20, 'A']], ['CODIGO']);
    const r = generarCrud(
      t,
      opciones('PRUEBA', {
        camposDetalle: ['CODIGO', 'NOMBRE'],
        valoresAlAgregar: { FECDATE: { tipo: 'fechaActual' }, FECSEIS: { tipo: 'fechaActual' } },
      }),
    );
    expect(r.plan.alAgregar).toEqual([
      { columna: 'FECDATE', expresion: 'CURRENT DATE' },
      { columna: 'FECSEIS', expresion: expect.stringContaining('MOD(YEAR(CURRENT DATE),100)*10000') },
    ]);
  });

  it('avisa de los campos que quedan con el valor por defecto', () => {
    const r = generarCrud(tabla, opciones('ASQRY20F', { ...base, valoresAlAgregar: { USRCRE: { tipo: 'usuario' } } }));
    expect(r.plan.advertencias.join(' ')).toMatch(/valor por defecto de la tabla: .*FECCRE/);
    expect(r.plan.advertencias.join(' ')).not.toMatch(/por defecto de la tabla: .*USRCRE/);
  });

  it('rechaza valores que no caben o no corresponden al campo', () => {
    const con = (v: Record<string, never>) => () => generarCrud(tabla, opciones('ASQRY20F', { ...base, valoresAlAgregar: v }));
    expect(con({ USRCRE: { tipo: 'fijo', valor: 'MUY LARGO PARA CABER' } as never })).toThrow(/no cabe en el campo USRCRE/);
    expect(con({ USRCRE: { tipo: 'fechaActual' } as never })).toThrow(/USRCRE no puede recibir la fecha actual/);
    expect(con({ FECCRE: { tipo: 'usuario' } as never })).toThrow(/FECCRE no puede recibir el usuario/);
    expect(con({ FECCRE: { tipo: 'fijo', valor: 'abc' } as never })).toThrow(/no es un número válido/);
    expect(con({ FECCRE: { tipo: 'fijo', valor: '123456789' } as never })).toThrow(/no cabe en el campo FECCRE/);
    expect(con({ NOMCON: { tipo: 'usuario' } as never })).toThrow(/se muestra en el detalle/);
    expect(con({ NOEXISTE: { tipo: 'usuario' } as never })).toThrow(/no existe/);
  });

  it('un usuario en un campo corto se recorta con SUBSTR', () => {
    const t = tablaDe([['CODIGO', 5, 'S', 0], ['USR', 4, 'A'], ['NOMBRE', 20, 'A']], ['CODIGO']);
    const r = generarCrud(t, opciones('PRUEBA', { camposDetalle: ['CODIGO', 'NOMBRE'], valoresAlAgregar: { USR: { tipo: 'usuario' } } }));
    expect(r.plan.alAgregar).toEqual([{ columna: 'USR', expresion: 'SUBSTR(USER, 1, 4)' }]);
  });
});

describe('forma del programa COBOL', () => {
  const casos: Array<[string, Tabla, Partial<OpcionesCrud>]> = [
    ['ASQRY03F normal 80', leerReal('ASQRY03F.TXT'), {}],
    ['ASQRY03F window 80', leerReal('ASQRY03F.TXT'), { tipoPantalla: 'window' }],
    ['ASQRY03F normal 132', leerReal('ASQRY03F.TXT'), { ancho: 132 }],
    ['ASQRY03F window 132', leerReal('ASQRY03F.TXT'), { tipoPantalla: 'window', ancho: 132 }],
    ['ASQRY12F llave compuesta', leerReal('ASQRY12F.TXT'), {}],
    ['ASQRY01F con biblioteca', leerReal('ASQRY01F.TXT'), { bibliotecaTabla: 'mibib' }],
    ['ASQRY19F desplaza', leerReal('ASQRY19F.TXT'), {}],
    ['ASQRY19F desplaza window', leerReal('ASQRY19F.TXT'), { tipoPantalla: 'window' }],
    ['ASQRY20F con fechas', leerReal('ASQRY20F.TXT'), {
      camposFechaHora: {
        FECCRE: { tipo: 'fecha', formato: 'YYYY-MM-DD', almacenamiento: 'N8' },
        HORCRE: { tipo: 'hora', formato: 'HH:MM:SS', almacenamiento: 'N8' },
      },
    }],
  ];

  for (const [nombre, tabla, extra] of casos) {
    describe(nombre, () => {
      const base = nombre.split(' ')[0];
      const r = generarCrud(tabla, opciones(base, extra));
      const lineas = r.cobol.split('\n');
      const codigo = lineas
        .filter((l) => l[6] !== '*')
        .join('\n')
        .replace(/"[^"]*"/g, '""');

      it('ninguna línea pasa de la columna 72 y las columnas 1 a 6 y la 7 están limpias', () => {
        for (const l of lineas) {
          expect(l.length, l).toBeLessThanOrEqual(COLUMNA_MAXIMA);
          if (l.length >= 7) expect([' ', '*']).toContain(l[6]);
          expect(l.slice(0, 6).trim()).toBe('');
        }
      });

      it('los bloques están balanceados', () => {
        const cuenta = (re: RegExp) => (codigo.match(re) ?? []).length;
        expect(cuenta(/\bEXEC SQL\b/g)).toBe(cuenta(/\bEND-EXEC\b/g));
        expect(cuenta(/(?<!END-)\bIF\b/g)).toBe(cuenta(/\bEND-IF\b/g));
        expect(cuenta(/(?<!END-)\bEVALUATE\b/g)).toBe(cuenta(/\bEND-EVALUATE\b/g));
        expect(cuenta(/\bPERFORM\s+(UNTIL|VARYING)\b/g)).toBe(cuenta(/\bEND-PERFORM\b/g));
        expect(cuenta(/(?<!END-)\bREAD\b/g)).toBe(cuenta(/\bEND-READ\b/g));
        expect(cuenta(/(?<!END-)\bWRITE\b/g)).toBe(cuenta(/\bEND-WRITE\b/g));
        expect(cuenta(/(?<!END-)\bSTRING\b/g)).toBe(cuenta(/\bEND-STRING\b/g));
      });

      it('todos los PERFORM llaman a un párrafo que existe y no hay párrafos repetidos', () => {
        const lista = [...codigo.matchAll(/^ {7}([A-Z0-9-]+)\.$/gm)].map((m) => m[1]);
        const parrafos = new Set(lista);
        expect(parrafos.size).toBe(lista.length);
        const llamados = [...codigo.matchAll(/\bPERFORM ([A-Z][A-Z0-9-]+)/g)]
          .map((m) => m[1])
          .filter((n) => n !== 'UNTIL' && n !== 'VARYING');
        expect(llamados.length).toBeGreaterThan(8);
        for (const n of llamados) expect(parrafos.has(n), n).toBe(true);
      });

      it('toda variable host de SQL está definida', () => {
        const definidas = new Set([...r.cobol.matchAll(/^ {7,}(?:\d\d|77) ([A-Z0-9-]+)[ .]/gm)].map((m) => m[1]));
        const usadas = [...r.cobol.matchAll(/ :([A-Z][A-Z0-9-]+)/g)].map((m) => m[1]);
        expect(usadas.length).toBeGreaterThan(3);
        for (const n of usadas) expect(definidas.has(n), n).toBe(true);
      });

      it('cada campo y cada formato que usa el programa existen en la pantalla', () => {
        const vuelta = parsearDspf(r.dds, 'X');
        const formatos = new Map(vuelta.registros.map((reg) => [reg.nombre, reg]));
        for (const [, formato] of r.cobol.matchAll(/FORMAT "([A-Z0-9]+)"/g)) expect(formatos.has(formato), formato).toBe(true);
        for (const reg of vuelta.registros) {
          const campos = new Set(reg.elementos.flatMap((e) => (e.tipo === 'campo' ? [e.nombre] : [])));
          const usados = [...r.cobol.matchAll(new RegExp(`([A-Z][A-Z0-9]*) OF ${reg.nombre}-(?:OO|II)`, 'g'))].map((m) => m[1]);
          for (const n of usados) expect(campos.has(n), `${n} en ${reg.nombre}`).toBe(true);
        }
        for (const [, formato] of r.cobol.matchAll(/COPY DDS-([A-Z0-9]+)-(?:I|O|INDIC) /g)) {
          expect(formatos.has(formato), `copia de ${formato}`).toBe(true);
        }
      });

      it('la pantalla pasa la validación sin errores y se lee sin advertencias', () => {
        expect(sinErrores(r)).toEqual([]);
        const vuelta = parsearDspf(r.dds, 'X');
        expect(vuelta.advertencias).toEqual([]);
        expect(generarDspf(vuelta)).toBe(r.dds);
      });

      it('FC y FWC no pisan las filas del subfile y no hay un atributo repetido', () => {
        const avisosCriticos = validar(r.pantalla).filter((p) => /CPD7812|más de una vez/.test(p.mensaje));
        expect(avisosCriticos).toEqual([]);
      });
    });
  }
});

describe('detalles del plan', () => {
  it('califica la tabla con la biblioteca', () => {
    const r = generarCrud(leerReal('ASQRY03F.TXT'), opciones('ASQRY03F', { bibliotecaTabla: 'mibib' }));
    expect(r.plan.tablaSql).toBe('MIBIB/ASQRY03F');
    expect(r.cobol).toContain('INSERT INTO MIBIB/ASQRY03F');
    expect(r.cobol).toContain('FROM MIBIB/ASQRY03F');
  });

  it('una llave compuesta numérica usa PIC con signo y una llave oculta por campo', () => {
    const r = generarCrud(leerReal('ASQRY12F.TXT'), opciones('ASQRY12F'));
    expect(r.plan.llaves.map((c) => c.nombre)).toEqual(['NROPRO', 'CORPRO', 'NOMARC']);
    expect(r.cobol).toContain('77 POSICION-WS           PIC S9(5).');
    expect(r.cobol).toContain('ORDER BY NROPRO, CORPRO, NOMARC');
    expect(r.cobol).toMatch(/WHERE NROPRO = :NROPRO-LW\n\s+AND CORPRO = :CORPRO-LW\n\s+AND NOMARC = :NOMARC-LW/);
    expect(r.dds).toMatch(/POSICION +5S 0B/);
    expect(r.dds).toMatch(/HK02 +5S 0H/);
    expect(r.dds).toMatch(/HK03 +10A +H/);
    expect(r.cobol).not.toContain('NROPRO-WS = SPACES');
    expect(r.cobol).toContain('IF NOMARC-WS = SPACES');
  });

  it('una tabla con solo campos de llave se puede agregar, consultar y eliminar, pero no modificar', () => {
    const r = generarCrud(leerReal('ASQRY12F.TXT'), opciones('ASQRY12F'));
    expect(r.plan.modificable).toBe(false);
    expect(r.cobol).not.toContain('UPDATE ');
    expect(r.cobol).not.toContain('GRABAR-MODIFICACION');
    expect(r.cobol).toContain('Tabla solo de llaves');
    expect(r.dds).toContain('Opciones: 4=Eliminar   5=Consultar');
    expect(r.plan.advertencias.join(' ')).toMatch(/no modificar/);
    const detalle = r.cobol.slice(r.cobol.indexOf('       MOSTRAR-DETALLE.'), r.cobol.indexOf('       RENOVAR-DETALLE.'));
    expect(detalle).not.toContain('WHEN F8');
  });

  it('mete los textos largos en varias filas y deja fuera lo que no cabe, con aviso', () => {
    const r = generarCrud(leerReal('ASQRY05F.TXT'), opciones('ASQRY05F'));
    const detalle = r.plan.detalle;
    expect(detalle.map((c) => c.nombre)).toContain('NOMKEYCO');
    // Con 132 columnas caben más campos: 500 se parte en 5 filas de 100.
    expect(r.plan.tamano.columnas).toBe(132);
    expect(detalle.find((c) => c.nombre === 'NOMKEYCO')).toMatchObject({ cntfld: 100, filasDetalle: 5 });
    expect(r.dds).toContain('CNTFLD(100)');
    // Son 23 filas y la pantalla más grande tiene 19: algo queda fuera.
    expect(detalle.length).toBeLessThan(11);
    expect(r.plan.advertencias.join(' ')).toMatch(/No caben todos los campos en una pantalla: quedan fuera del detalle .*\(\d+\)/);
    expect(sinErrores(r)).toEqual([]);
  });

  it('en la lista un texto se muestra completo hasta 250 caracteres y se avisa si pasa de eso', () => {
    const tabla = tablaDe([['CODIGO', 5, 'S', 0], ['DESCRIP', 50, 'A'], ['NOTA', 300, 'A']], ['CODIGO']);
    const r = generarCrud(tabla, opciones('TEXTOS'));
    const ancho = (n: string) => r.plan.diseno.columnasLista.find((c) => c.campo.nombre === n)?.ancho;
    expect(ancho('DESCRIP')).toBe(50);
    expect(ancho('NOTA')).toBe(250);
    expect(r.plan.advertencias.join(' ')).toMatch(/NOTA \(300\) se muestra cortado a 250 en la lista/);
    // El detalle sí lo muestra completo, partido en filas.
    expect(r.plan.detalle.find((c) => c.nombre === 'NOTA')).toMatchObject({ longitud: 300, cntfld: 50, filasDetalle: 6 });
  });

  it('renombra los campos que chocan con la pantalla o con COBOL', () => {
    const tabla = tablaDe(
      [['OPCION', 2, 'S', 0], ['DATE', 8, 'S', 0], ['FEC_INI', 8, 'S', 0], ['NOMBRE', 20, 'A'], ['S01', 3, 'A']],
      ['OPCION'],
    );
    const r = generarCrud(tabla, opciones('CHOQUE'));
    expect(r.plan.detalle.map((c) => [c.nombre, c.nombrePantalla])).toEqual([
      ['OPCION', 'OPCION1'],
      ['DATE', 'DATE1'],
      ['FEC_INI', 'FECINI'],
      ['NOMBRE', 'NOMBRE'],
      ['S01', 'S011'],
    ]);
    expect(r.cobol).toContain('SELECT OPCION, DATE, FEC_INI, NOMBRE, S01');
    expect(r.cobol).toContain(':DATE1-WS');
    expect(r.plan.advertencias.join('\n')).toMatch(/DATE se llama DATE1/);
  });

  it('una primera llave descendente no tiene posicionador', () => {
    const tabla = tablaDe([['CODIGO', 5, 'S', 0], ['NOMBRE', 20, 'A']], []);
    tabla.registros[0].elementos.push({
      tipo: 'llave',
      id: 'k1',
      nombre: 'CODIGO',
      keywords: [{ nombre: 'DESCEND', parametros: '', indicadores: [] }],
      comentarios: [],
    });
    const r = generarCrud(tabla, opciones('DESC'));
    expect(r.plan.posicionable).toBe(false);
    expect(r.cobol).toContain('ORDER BY CODIGO DESC');
    expect(r.cobol).not.toContain('POSICION');
    expect(r.dds).not.toContain('POSICION');
  });

  it('los campos con decimales usan PIC con V y se editan con signo en la lista', () => {
    const tabla = tablaDe([['CODIGO', 5, 'S', 0], ['MONTO', 9, 'P', 2], ['TASA', 3, 'S', 3]], ['CODIGO']);
    const r = generarCrud(tabla, opciones('MONTOS'));
    expect(r.cobol).toMatch(/MONTO-WS +PIC S9\(7\)V9\(2\)\./);
    expect(r.cobol).toMatch(/TASA-WS +PIC SV9\(3\)\./);
    expect(r.cobol).toMatch(/MONTO-ED +PIC -\(7\)9\.9\(2\)\./);
    expect(r.cobol).toMatch(/CODIGO-ED +PIC -\(5\)9\./);
  });

  it('respeta los campos elegidos para la lista y el detalle', () => {
    const r = generarCrud(
      leerReal('ASQRY03F.TXT'),
      opciones('ASQRY03F', { camposLista: ['CODEVE', 'DESEVE'], camposDetalle: ['CODEVE', 'DESEVE', 'USRCRE'] }),
    );
    expect(r.plan.lista.map((c) => c.nombre)).toEqual(['CODEVE', 'DESEVE']);
    expect(r.plan.detalle.map((c) => c.nombre)).toEqual(['CODEVE', 'DESEVE', 'USRCRE']);
    expect(r.cobol).toContain('INSERT INTO ASQRY03F');
    expect(r.cobol).not.toContain('FECCRE');
  });

  it('la fila de la lista incluye la llave aunque no se muestre', () => {
    const r = generarCrud(leerReal('ASQRY03F.TXT'), opciones('ASQRY03F', { camposLista: ['DESEVE'] }));
    expect(r.cobol).toMatch(/05 CODEVE-SQ +PIC X\(10\)\./);
    expect(r.cobol).toContain('MOVE CODEVE-SQ TO FL-K1(CANT-FILAS)');
  });
});

describe('errores claros', () => {
  it('rechaza un archivo lógico', () => {
    const lf = leerReal('ASQRY01L.TXT');
    expect(tipoDeTabla(lf)).toBe('LF');
    expect(() => generarCrud(lf, opciones('ASQRY01L'))).toThrow(/físico/);
  });

  it('rechaza una tabla sin llave', () => {
    const tabla = tablaDe([['CODIGO', 5, 'S', 0], ['NOMBRE', 20, 'A']], []);
    expect(() => generarCrud(tabla, opciones('SINLLAVE'))).toThrow(/no tiene llave/);
  });

  it('rechaza una llave de tipo no soportado', () => {
    const tabla = tablaDe([['CODIGO', 5, 'F', 2], ['NOMBRE', 20, 'A']], ['CODIGO']);
    expect(() => generarCrud(tabla, opciones('FLOTA'))).toThrow(/CODIGO/);
  });

  it('rechaza nombres no válidos o repetidos', () => {
    const t = leerReal('ASQRY03F.TXT');
    expect(() => generarCrud(t, opciones('ASQRY03F', { nombrePantalla: 'MAL NOMBRE' }))).toThrow(/pantalla/);
    expect(() => generarCrud(t, opciones('ASQRY03F', { nombrePrograma: '' }))).toThrow(/programa/);
    expect(() => generarCrud(t, opciones('ASQRY03F', { nombrePantalla: 'IGUAL', nombrePrograma: 'igual' }))).toThrow(/distintos/);
  });

  it('exige que las llaves estén en el detalle', () => {
    expect(() => generarCrud(leerReal('ASQRY03F.TXT'), opciones('ASQRY03F', { camposDetalle: ['DESEVE'] }))).toThrow(/llave CODEVE/);
  });

  it('quita campos que no caben, y si se piden todos explica por qué no cabe', () => {
    const campos: Array<[string, number, string]> = [['CODIGO', 5, 'S']];
    for (let i = 1; i <= 25; i++) campos.push([`CAMPO${i}`, 10, 'A']);
    const tabla = tablaDe(campos.map(([n, l, t]) => [n, l, t, t === 'S' ? 0 : undefined]), ['CODIGO']);
    const r = generarCrud(tabla, opciones('GRANDE'));
    expect(r.plan.detalle.length).toBeLessThanOrEqual(19);
    expect(r.plan.advertencias.join(' ')).toMatch(/No caben todos los campos/);
    expect(() => generarCrud(tabla, opciones('GRANDE', { camposDetalle: campos.map(([n]) => n) }))).toThrow(/no cabe en una pantalla/);
  });
});

describe('los 48 fuentes reales', () => {
  const archivos = readdirSync(dirFuentesTablas).filter((f) => f.toUpperCase().endsWith('.TXT'));

  for (const modo of ['normal', 'window'] as const) {
    it(`cada uno genera un CRUD válido ${modo} o un error que lo explica`, () => {
      let generados = 0;
      for (const f of archivos) {
        const tabla = parsearTabla(iconv.decode(readFileSync(join(dirFuentesTablas, f)), 'windows-1252'), f);
        const nombre = nombreArchivoTabla(f);
        let r: ReturnType<typeof generarCrud>;
        try {
          r = generarCrud(tabla, opciones(nombre, { tipoPantalla: modo }));
        } catch (e) {
          expect(String((e as Error).message), nombre).toMatch(/físico|no tiene llave|cabe/);
          continue;
        }
        generados++;
        expect(sinErrores(r), nombre).toEqual([]);
        expect(parsearDspf(r.dds, 'X').advertencias, nombre).toEqual([]);
        for (const l of r.cobol.split('\n')) expect(l.length, `${nombre}: ${l}`).toBeLessThanOrEqual(COLUMNA_MAXIMA);
      }
      expect(generados).toBeGreaterThan(15);
    });
  }
});

describe('texto largo en el detalle: CNTFLD', () => {
  const tabla = tablaDe(
    [
      ['RUT', 10, 'S', 0],
      ['APEMAT', 30, 'A'],
      ['DIRECCION', 70, 'A'],
      ['COMUNA', 20, 'A'],
    ],
    ['RUT'],
  );
  const campo = (r: ReturnType<typeof generarCrud>, n: string) => r.plan.detalle.find((c) => c.nombre === n)!;

  it('un campo de 70 que no cabe en 80 columnas se parte en 2 filas de 35 (el mayor divisor exacto)', () => {
    const r = generarCrud(tabla, opciones('DIRECC'));
    expect(r.plan.tamano.columnas).toBe(80);
    expect(campo(r, 'DIRECCION')).toMatchObject({ cntfld: 35, filasDetalle: 2 });
    expect(campo(r, 'APEMAT')).toMatchObject({ cntfld: null, filasDetalle: 1 });
    expect(r.dds).toMatch(/DIRECCION +70A +B +6 26DSPATR\(UL\)/);
    expect(r.dds).toContain('CNTFLD(035)');
    // Los campos siguientes se corren las filas que ocupa el campo largo.
    expect([campo(r, 'RUT'), campo(r, 'APEMAT'), campo(r, 'DIRECCION'), campo(r, 'COMUNA')].map((c) => c.filaDetalle)).toEqual([4, 5, 6, 8]);
    expect(r.plan.diseno.filasDetalleTotal).toBe(5);
  });

  it('la pantalla se lee de vuelta, se regenera igual y no tiene errores de validación', () => {
    const r = generarCrud(tabla, opciones('DIRECC'));
    const vuelta = parsearDspf(r.dds, 'X');
    expect(vuelta.advertencias).toEqual([]);
    expect(generarDspf(vuelta)).toBe(r.dds);
    expect(sinErrores(r)).toEqual([]);
    const det = vuelta.registros.find((x) => x.nombre === 'R01')!;
    const dir = det.elementos.find((e) => e.tipo === 'campo' && e.nombre === 'DIRECCION') as { keywords: Array<{ nombre: string; parametros: string }> };
    expect(dir.keywords.find((k) => k.nombre === 'CNTFLD')?.parametros).toBe('035');
  });

  it('el programa sigue usando el campo completo, sin partirlo', () => {
    const r = generarCrud(tabla, opciones('DIRECC'));
    expect(r.cobol).toMatch(/DIRECCION-WS +PIC X\(70\)\./);
    expect(r.cobol).toContain('MOVE DIRECCION OF R01-II TO DIRECCION-WS');
  });

  it('las llaves siguen protegidas con 40 o 41 y el campo largo con 40', () => {
    const r = generarCrud(tabla, opciones('DIRECC'));
    expect(r.dds).toMatch(/ A  40\n {5}AO 41 +DSPATR\(PR\)/);
    expect(r.dds).toMatch(/CNTFLD\(035\)/);
  });

  it('elige el mayor divisor exacto de 20 a lo que cabe: 500 en 50, 1330 en 38 y en 132 columnas en 95', () => {
    const t = tablaDe([['CODIGO', 5, 'S', 0], ['CONDICION', 500, 'A'], ['SENTENCIA', 1330, 'A']], ['CODIGO']);
    const r = generarCrud(t, opciones('LARGOS', { ancho: 80, camposDetalle: ['CODIGO', 'CONDICION'] }));
    expect(campo(r, 'CONDICION')).toMatchObject({ cntfld: 50, filasDetalle: 10 });
    const r132 = generarCrud(t, opciones('LARGOS', { ancho: 132, camposDetalle: ['CODIGO', 'SENTENCIA'] }));
    expect(campo(r132, 'SENTENCIA')).toMatchObject({ cntfld: 95, filasDetalle: 14 });
    const r80 = generarCrud(t, opciones('LARGOS', { ancho: 132, camposDetalle: ['CODIGO', 'CONDICION'] }));
    expect(campo(r80, 'CONDICION')).toMatchObject({ cntfld: 100, filasDetalle: 5 });
  });

  it('sin divisor exacto usa lo que cabe y la última fila queda más corta, con aviso', () => {
    const t = tablaDe([['CODIGO', 5, 'S', 0], ['NOTA', 97, 'A']], ['CODIGO']);
    const r = generarCrud(t, opciones('PRIMO'));
    expect(campo(r, 'NOTA')).toMatchObject({ cntfld: 53, filasDetalle: 2 });
    expect(r.plan.advertencias.join(' ')).toMatch(/NOTA \(97\) no se divide exacto en filas de 53: la última fila queda más corta/);
    expect(sinErrores(r)).toEqual([]);
  });

  it('un campo que cabe en una fila no lleva CNTFLD', () => {
    const t = tablaDe([['CODIGO', 5, 'S', 0], ['NOMBRE', 53, 'A']], ['CODIGO']);
    const r = generarCrud(t, opciones('JUSTO'));
    expect(campo(r, 'NOMBRE')).toMatchObject({ cntfld: null, filasDetalle: 1 });
    expect(r.dds).not.toContain('CNTFLD');
    const u = tablaDe([['CODIGO', 5, 'S', 0], ['NOMBRE', 54, 'A']], ['CODIGO']);
    expect(generarCrud(u, opciones('JUSTO')).plan.detalle.find((c) => c.nombre === 'NOMBRE')?.cntfld).toBe(27);
  });

  it('el ajuste se puede elegir por campo', () => {
    const r = generarCrud(tabla, opciones('DIRECC', { ajustesCntfld: { DIRECCION: 30 } }));
    expect(campo(r, 'DIRECCION')).toMatchObject({ cntfld: 30, filasDetalle: 3 });
    expect(r.dds).toContain('CNTFLD(030)');
    expect(r.plan.advertencias.join(' ')).toMatch(/DIRECCION \(70\) no se divide exacto en filas de 30/);
    // Un ajuste también puede partir un campo que cabría en una fila.
    const parte = generarCrud(tabla, opciones('DIRECC', { ajustesCntfld: { APEMAT: 15 } }));
    expect(campo(parte, 'APEMAT')).toMatchObject({ cntfld: 15, filasDetalle: 2 });
    expect(sinErrores(parte)).toEqual([]);
  });

  it('rechaza un ajuste que no sirve', () => {
    const con = (ajustes: Record<string, number>) => () => generarCrud(tabla, opciones('DIRECC', { ancho: 80, ajustesCntfld: ajustes }));
    expect(con({ DIRECCION: 70 })).toThrow(/DIRECCION debe ser un número entero menor que su largo \(70\)/);
    expect(con({ DIRECCION: 0 })).toThrow(/menor que su largo/);
    expect(con({ DIRECCION: 54 })).toThrow(/máximo 53/);
    expect(con({ DIRECCION: 12.5 })).toThrow(/número entero/);
    expect(con({ RUT: 5 })).toThrow(/RUT no es de texto/);
    expect(con({ NOEXISTE: 5 })).toThrow(/no existe/);
  });

  it('cuenta las filas: si no caben ni partiéndolos, explica cuántas faltan', () => {
    const t = tablaDe([['CODIGO', 5, 'S', 0], ['A', 500, 'A'], ['B', 500, 'A'], ['C', 500, 'A']], ['CODIGO']);
    expect(() => generarCrud(t, opciones('MUCHO', { ancho: 80, camposDetalle: ['CODIGO', 'A', 'B', 'C'] }))).toThrow(
      /31 filas y no cabe en una pantalla \(caben 16\)/,
    );
    // En 132 columnas el mismo detalle cabe: cada 500 se parte en 5 filas de 100.
    expect(generarCrud(t, opciones('MUCHO', { camposDetalle: ['CODIGO', 'A', 'B', 'C'] })).plan.tamano.columnas).toBe(132);
    const r = generarCrud(t, opciones('MUCHO', { ancho: 80 }));
    expect(r.plan.detalle.map((c) => c.nombre)).toEqual(['CODIGO', 'A']);
    expect(r.plan.advertencias.join(' ')).toMatch(/quedan fuera del detalle B \(500\), C \(500\)/);
  });

  it('en ventanas el ancho disponible es menor: 70 se parte en 35 y la ventana crece con las filas', () => {
    const r = generarCrud(tabla, opciones('DIRECC', { tipoPantalla: 'window' }));
    expect(campo(r, 'DIRECCION')).toMatchObject({ cntfld: 35, filasDetalle: 2 });
    expect(campo(r, 'COMUNA').filaDetalle).toBe(7);
    expect(r.plan.diseno.ventanaDetalle?.alto).toBe(5 + 4 + 1 + r.plan.diseno.nLineasLeyendaDetalle);
    expect(sinErrores(r)).toEqual([]);
    const w = generarCrud(tablaDe([['CODIGO', 5, 'S', 0], ['NOTA', 100, 'A']], ['CODIGO']), opciones('VENT', { tipoPantalla: 'window' }));
    expect(w.plan.detalle.find((c) => c.nombre === 'NOTA')?.cntfld).toBe(25);
  });

  it('en 132 columnas un campo de 100 cabe entero en una fila', () => {
    const t = tablaDe([['CODIGO', 5, 'S', 0], ['NOTA', 100, 'A']], ['CODIGO']);
    const r = generarCrud(t, opciones('ANCHO132', { ancho: 132 }));
    expect(r.plan.detalle.find((c) => c.nombre === 'NOTA')?.cntfld).toBeNull();
    expect(r.dds).not.toContain('CNTFLD');
  });
});

describe('desplazamiento por una columna más ancha que la pantalla', () => {
  const col = (pos: number, ancho: number) => ({ pos, fin: pos + ancho - 1 });

  it('avanza de columna en columna y termina viendo el final', () => {
    // Columnas en 1, 12, 43 y 56; línea de 139 y 72 visibles.
    const pasos = calcularPasos([col(1, 10), col(12, 30), col(43, 12), col(56, 84)], 139, 72);
    expect(pasos).toEqual([1, 12, 43, 56, 68]);
    expect(pasos[pasos.length - 1]).toBe(139 - 72 + 1);
  });

  it('una columna de 120 en 72 visibles se recorre por páginas hasta ver su final', () => {
    const pasos = calcularPasos([col(1, 10), col(12, 120)], 131, 72);
    expect(pasos).toEqual([1, 12, 60]);
    // Desde el último paso se ve la posición 131, el final del campo.
    expect(pasos[pasos.length - 1] + 72 - 1).toBeGreaterThanOrEqual(131);
  });

  it('una columna muy larga avanza con 10 caracteres de solape', () => {
    const pasos = calcularPasos([col(1, 300)], 300, 72);
    expect(pasos).toEqual([1, 63, 125, 187, 229]);
    for (let i = 1; i < pasos.length - 1; i++) expect(pasos[i] - pasos[i - 1]).toBe(62);
    expect(pasos[pasos.length - 1] + 71).toBe(300);
  });

  it('si todo cabe no hay más pasos', () => {
    expect(calcularPasos([col(1, 10), col(12, 20)], 31, 72)).toEqual([1]);
    expect(calcularPasos([col(1, 72)], 72, 72)).toEqual([1]);
  });

  it('siempre avanza, aunque las columnas sean muy angostas o estén pegadas', () => {
    const columnas = Array.from({ length: 40 }, (_, i) => col(1 + i * 5, 4));
    const pasos = calcularPasos(columnas, 199, 72);
    for (let i = 1; i < pasos.length; i++) expect(pasos[i]).toBeGreaterThan(pasos[i - 1]);
    expect(pasos[pasos.length - 1]).toBe(199 - 72 + 1);
  });

  it('el CRUD con un texto de 300 deja un paso para ver el final del campo', () => {
    const tabla = tablaDe([['CODIGO', 5, 'S', 0], ['NOTA', 300, 'A']], ['CODIGO']);
    const r = generarCrud(tabla, opciones('NOTAS', { camposLista: ['CODIGO', 'NOTA'] }));
    const { pasos, visible, totalLinea } = r.plan.diseno;
    expect(r.plan.diseno.desplaza).toBe(true);
    expect(pasos.length).toBeGreaterThan(3);
    expect(pasos[pasos.length - 1] + visible - 1).toBeGreaterThanOrEqual(totalLinea);
    expect(r.cobol).toContain(`COL-POS OCCURS ${pasos.length} TIMES`);
    expect(r.cobol).toContain('IF COL-ACT < COL-CANT');
    expect(r.dds).toContain("CF20(20 'Derecha')");
  });
});

describe('ayuda de campo (F4) y ayuda general (F1)', () => {
  const tabla = tablaDe(
    [['CODIGO', 5, 'S', 0, 'Codigo'], ['GENERO', 1, 'A', undefined, 'Genero'], ['NOMBRE', 30, 'A', undefined, 'Nombre'], ['FECNAC', 8, 'S', 0, 'Fecha']],
    ['CODIGO'],
  );
  const ayudas = { GENERO: { parrafo: 'AYUDA-GENERO', programa: 'ayugenero' } };
  const sin = generarCrud(tabla, opciones('PERSONAF'));
  const con = generarCrud(tabla, opciones('PERSONAF', { ayudasCampo: ayudas }));

  it('F1 es la ayuda general y F4 no existe si ningún campo tiene ayuda', () => {
    expect(sin.dds).toContain("CF01(01 'Ayuda')");
    expect(sin.dds).not.toContain('CF04');
    expect(sin.dds).not.toContain('RTNCSRLOC');
    expect(sin.cobol).not.toContain('AYUDA-CAMPO');
    expect(sin.cobol).toMatch(/WHEN F1\n\s+PERFORM MUESTRA-AYUDA/);
    expect(sin.ayudas).toEqual([]);
  });

  it('con ayudas, la pantalla pide el campo del cursor y declara F4', () => {
    expect(con.dds).toContain("CF04(04 'Ayuda campo')");
    expect(con.dds).toContain('RTNCSRLOC(&RCDNAM &FLDNAM)');
    expect(con.dds).toMatch(/RCDNAM +10A +H/);
    expect(con.dds).toMatch(/FLDNAM +10A +H/);
    expect(sinErrores(con)).toEqual([]);
    const vuelta = parsearDspf(con.dds, 'X');
    expect(vuelta.advertencias).toEqual([]);
    expect(generarDspf(vuelta)).toBe(con.dds);
  });

  it('F4 aparece en la leyenda del detalle solo al agregar y al modificar, y nunca en la lista', () => {
    const l = con.plan.diseno.leyendasDetalle;
    expect(l.A.join(' ')).toContain('F4=Ayuda campo');
    expect(l.M.join(' ')).toContain('F4=Ayuda campo');
    expect(l.C.join(' ')).not.toContain('F4');
    expect(l.E.join(' ')).not.toContain('F4');
    expect(con.plan.diseno.leyendaLista.join(' ')).not.toContain('F4');
    expect(con.cobol).not.toMatch(/PROCESO\.[\s\S]*WHEN F4\n[\s\S]*TERMINO\./);
  });

  it('el programa llama al programa de ayuda con código y descripción y deja el código en el campo', () => {
    const c = con.cobol;
    expect(c).toContain('77 AYU-CODIGO            PIC X(30).');
    expect(c).toContain('77 AYU-DESCRIP           PIC X(50).');
    expect(c).toMatch(/WHEN F4\n\s+IF MODO-WS = "A" OR MODO-WS = "M"\n\s+PERFORM AYUDA-CAMPO/);
    expect(c).toContain('EVALUATE FLDNAM OF R01-II');
    expect(c).toMatch(/WHEN "GENERO"\n\s+PERFORM AYUDA-GENERO/);
    expect(c).toMatch(/AYUDA-GENERO\.\n[\s\S]*MOVE GENERO-WS TO AYU-CODIGO/);
    expect(c).toMatch(/CALL "AYUGENERO"\n\s+USING AYU-CODIGO AYU-DESCRIP\n\s+ON EXCEPTION/);
    expect(c).toContain('No se pudo llamar a la ayuda.');
    expect(c).toContain('MOVE AYU-CODIGO(1:1) TO GENERO-WS');
    expect(c).toContain('END-CALL.');
    // Antes de llamar se recoge lo escrito en la pantalla y después se vuelve a mostrar.
    expect(c).toMatch(/AYUDA-CAMPO\.\n[\s\S]*PERFORM PANTALLA-A-REGISTRO\n[\s\S]*PERFORM REGISTRO-A-PANTALLA\./);
  });

  it('una llave solo tiene ayuda al agregar, y un código numérico se arma con sus dígitos', () => {
    const r = generarCrud(tabla, opciones('PERSONAF', { ayudasCampo: { CODIGO: { parrafo: 'AYUDA-CODIGO', programa: 'AYUCODIGO' } } }));
    expect(r.cobol).toMatch(/WHEN "CODIGO"\n\s+IF MODO-WS = "A"\n\s+PERFORM AYUDA-CODIGO\n\s+END-IF/);
    expect(r.cobol).toContain('77 AYU-ACUM              PIC 9(18).');
    expect(r.cobol).toContain('MOVE CODIGO-WS TO AYU-NUM-ED');
    expect(r.cobol).toContain('COMPUTE CODIGO-WS = AYU-ACUM');
    expect(r.cobol).toContain('NOT ON SIZE ERROR');
  });

  it('sin programa el CALL queda comentado para completar y no hay esqueleto', () => {
    const r = generarCrud(tabla, opciones('PERSONAF', { ayudasCampo: { GENERO: { parrafo: 'AYUDA-GENERO', programa: '' } } }));
    expect(r.cobol).toContain('CALL "SUPROGRAMA" USING AYU-CODIGO AYU-DESCRIP');
    expect(r.cobol).not.toMatch(/^ {11}CALL /m);
    expect(r.ayudas).toEqual([]);
  });

  it('genera un esqueleto por programa de ayuda, con la interfaz común', () => {
    expect(con.ayudas).toHaveLength(1);
    const a = con.ayudas[0];
    expect(a).toMatchObject({ programa: 'AYUGENERO', tipo: 'CBL', campos: ['GENERO'] });
    expect(a.texto).toContain('PROGRAM-ID.  AYUGENERO.');
    expect(a.texto).toContain('PROCEDURE DIVISION USING LK-CODIGO LK-DESCRIP.');
    expect(a.texto).toContain('01 LK-CODIGO             PIC X(30).');
    expect(a.texto).toContain('01 LK-DESCRIP            PIC X(50).');
    expect(a.texto).toContain('GOBACK.');
    const ile = generarCrud(tabla, opciones('PERSONAF', { tipoCobol: 'SQLCBLLE', ayudasCampo: ayudas }));
    expect(ile.ayudas[0].tipo).toBe('CBLLE');
  });

  it('dos campos con el mismo programa comparten esqueleto', () => {
    const r = generarCrud(
      tabla,
      opciones('PERSONAF', {
        ayudasCampo: {
          GENERO: { parrafo: 'AYUDA-GENERO', programa: 'AYUGEN' },
          NOMBRE: { parrafo: 'AYUDA-NOMBRE', programa: 'AYUGEN' },
        },
      }),
    );
    expect(r.ayudas).toHaveLength(1);
    expect(r.ayudas[0].campos).toEqual(['GENERO', 'NOMBRE']);
  });

  it('ninguna línea del programa ni del esqueleto pasa de la columna 72', () => {
    for (const texto of [con.cobol, ...con.ayudas.map((a) => a.texto)]) {
      const largas = texto.split('\n').filter((l) => l.length > COLUMNA_MAXIMA);
      expect(largas).toEqual([]);
    }
  });

  it('valida las ayudas: párrafo, programa, campo y tecla', () => {
    const g = (extra: Partial<OpcionesCrud>) => () => generarCrud(tabla, opciones('PERSONAF', extra));
    expect(g({ ayudasCampo: { GENERO: { parrafo: 'GENERO', programa: '' } } })).toThrow(/AYUDA-/);
    expect(g({ ayudasCampo: { GENERO: { parrafo: 'AYUDA GENERO', programa: '' } } })).toThrow(/párrafo/);
    expect(g({ ayudasCampo: { GENERO: { parrafo: 'AYUDA-GENERO', programa: 'AYUDA-GENERO' } } })).toThrow(/sin guiones/);
    expect(g({ ayudasCampo: { GENERO: { parrafo: 'AYUDA-GENERO', programa: 'PERSONAP' } } })).toThrow(/no puede llamarse/);
    expect(g({ ayudasCampo: { NOEXISTE: { parrafo: 'AYUDA-X', programa: '' } } })).toThrow(/no está en el detalle/);
    expect(g({ ayudasCampo: { FECNAC: { parrafo: 'AYUDA-FEC', programa: '' } }, camposFechaHora: { FECNAC: { tipo: 'fecha', formato: 'DD/MM/YYYY', almacenamiento: 'N8' } } })).toThrow(/fecha/);
    expect(
      g({
        ayudasCampo: { GENERO: { parrafo: 'AYUDA-X', programa: '' }, NOMBRE: { parrafo: 'AYUDA-X', programa: '' } },
      }),
    ).toThrow(/repetido/);
    const sinTecla = TECLAS_POR_DEFECTO.filter((k) => k.accion !== 'ayudaCampo');
    expect(g({ ayudasCampo: ayudas, teclas: sinTecla })).toThrow(/Ayuda de campo/);
  });
});
describe('CRUD: límites de lista y ventana', () => {
  it('la lista carga como máximo 500 registros y el COBOL avisa si hay más', () => {
    const r = generarCrud(leerReal('ASQRY03F.TXT'), opciones('ASQRY03F'));
    expect(r.plan.diseno.maxFilas).toBe(500);
    expect(r.cobol).toContain('HAY-MAS');
    expect(r.cobol).toContain('Se muestran');
  });
  it('en ventana ningún elemento ocupa la última línea (mensajes) y el borde cabe en 24x80', () => {
    const r = generarCrud(leerReal('ASQRY03F.TXT'), opciones('ASQRY03F', { tipoPantalla: 'window' }));
    expect(sinErrores(r)).toEqual([]);
  });
});

describe('CRUD: avisos del compilador COBOL', () => {
  const r = generarCrud(leerReal('ASQRY03F.TXT'), opciones('ASQRY03F'));
  it('PROCEDURE DIVISION va seguida de un párrafo (LBL0345)', () => {
    expect(r.cobol).toMatch(/ {7}PROCEDURE DIVISION\.\n {6}\*-+\n {7}PRINCIPAL\.\n/);
  });
  it('el WRITE SUBFILE lleva INVALID KEY (LBL0412)', () => {
    expect(r.cobol).toMatch(/WRITE SUBFILE R-PANTALLA FROM S01-OO FORMAT "S01"\n +INVALID KEY CONTINUE\n +END-WRITE/);
  });
});
