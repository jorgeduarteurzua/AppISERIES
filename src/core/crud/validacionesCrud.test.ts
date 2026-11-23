import { describe, expect, it } from 'vitest';
import { validar } from '../edicion/validacion';
import { parsearDspf } from '../parser/parserDspf';
import { parsearTabla } from '../tablas/parserTabla';
import type { Tabla } from '../tablas/modelo';
import { generarCrud } from './crud';
import type { OpcionesCrud, ValidacionCampo } from './crud';
import { COLUMNA_MAXIMA } from './generadorCobolCrud';
import { pareceEmail, reglasPosibles, requeridosPosibles } from './validacionesCrud';

/** [nombre, longitud, tipo, decimales] */
function tablaDe(campos: Array<[string, number, string, number?]>, llaves: string[]): Tabla {
  const lineas = ['     A          R REG1'];
  for (const [n, l, t, d] of campos) {
    const dec = d === undefined ? '  ' : String(d).padStart(2);
    lineas.push(`     A            ${n.padEnd(10)} ${String(l).padStart(5)}${t}${dec}`);
  }
  for (const k of llaves) lineas.push(`     A          K ${k}`);
  return parsearTabla(lineas.join('\n') + '\n', 'CLIENTES');
}

const tabla = tablaDe(
  [
    ['RUT', 9, 'S', 0],
    ['NOMBRE', 40, 'A'],
    ['EMAIL', 60, 'A'],
    ['EDAD', 3, 'S', 0],
    ['SALDO', 9, 'S', 2],
    ['ESTADO', 1, 'A'],
    ['COMUNA', 5, 'S', 0],
    ['FECNAC', 8, 'S', 0],
  ],
  ['RUT'],
);

function opciones(validaciones: Record<string, ValidacionCampo>, extra: Partial<OpcionesCrud> = {}): OpcionesCrud {
  return {
    nombreTabla: 'CLIENTES',
    nombrePantalla: 'CLIENTED',
    nombrePrograma: 'CLIENTEP',
    tipoCobol: 'SQLCBL',
    titulo: 'Clientes',
    autor: '',
    bibliotecaTabla: 'MIBIB',
    camposFechaHora: { FECNAC: { tipo: 'fecha', formato: 'DD/MM/YYYY', almacenamiento: 'N8' } },
    validacionesCampo: validaciones,
    ...extra,
  };
}

const completo: Record<string, ValidacionCampo> = {
  NOMBRE: { requerido: 'si' },
  EMAIL: { requerido: 'no', regla: { tipo: 'email' } },
  EDAD: { requerido: 'mayorCero', regla: { tipo: 'rango', minimo: '18', maximo: '120' } },
  SALDO: { requerido: 'distintoCero' },
  ESTADO: { requerido: 'si', regla: { tipo: 'valores', valores: 'a, i' } },
  COMUNA: { regla: { tipo: 'existe', tabla: 'COMUNAS', columna: 'codcom' } },
  FECNAC: { requerido: 'si' },
};

/** Texto de un párrafo, hasta el siguiente (línea del área A con un nombre y punto). */
const parrafo = (cobol: string, nombre: string): string => {
  const i = cobol.indexOf(`\n       ${nombre}.\n`);
  if (i < 0) return '';
  const resto = cobol.slice(i + 1);
  const fin = resto.slice(1).search(/\n {7}[A-Z][A-Z0-9-]*\.\n/);
  return fin < 0 ? resto : resto.slice(0, fin + 1);
};

describe('validaciones del CRUD: plan', () => {
  it('sin pedir nada solo valida la llave (> 0) y las fechas, con indicadores desde el 50', () => {
    const r = generarCrud(tabla, opciones({}));
    expect(r.plan.validaciones.map((v) => [v.campo.nombre, v.requerido, v.indicador])).toEqual([
      ['RUT', 'mayorCero', 50],
      ['FECNAC', 'no', 51],
    ]);
  });
  it('la llave siempre es obligatoria, aunque se pida otra cosa', () => {
    const r = generarCrud(tabla, opciones({ RUT: { requerido: 'no' } }));
    expect(r.plan.validaciones[0]).toMatchObject({ requerido: 'mayorCero' });
    const alfa = tablaDe([['CODIGO', 5, 'A'], ['NOMBRE', 20, 'A']], ['CODIGO']);
    expect(generarCrud(alfa, { ...opciones({}), camposFechaHora: {} }).plan.validaciones[0]).toMatchObject({ requerido: 'si' });
  });
  it('resuelve las reglas: valores en mayúsculas, la tabla calificada con la biblioteca', () => {
    const r = generarCrud(tabla, opciones(completo));
    const v = (n: string) => r.plan.validaciones.find((x) => x.campo.nombre === n)!;
    expect(v('ESTADO').regla).toEqual({ tipo: 'valores', valores: ['A', 'I'] });
    expect(v('COMUNA').regla).toEqual({ tipo: 'existe', tablaSql: 'MIBIB/COMUNAS', tabla: 'COMUNAS', columna: 'CODCOM' });
    expect(v('EDAD').regla).toEqual({ tipo: 'rango', minimo: '18', maximo: '120' });
  });
  it('rechaza combinaciones que no tienen sentido', () => {
    expect(() => generarCrud(tabla, opciones({ EDAD: { regla: { tipo: 'email' } } }))).toThrow(/numérico: no puede ser un email/);
    expect(() => generarCrud(tabla, opciones({ NOMBRE: { requerido: 'mayorCero' } }))).toThrow(/no es numérico/);
    expect(() => generarCrud(tabla, opciones({ EDAD: { requerido: 'si' } }))).toThrow(/mayor a 0/);
    expect(() => generarCrud(tabla, opciones({ EDAD: { regla: { tipo: 'rango', minimo: '50', maximo: '10' } } }))).toThrow(/mínimo/);
    expect(() => generarCrud(tabla, opciones({ EDAD: { regla: { tipo: 'rango', minimo: '0', maximo: '5000' } } }))).toThrow(/no cabe/);
    expect(() => generarCrud(tabla, opciones({ ESTADO: { regla: { tipo: 'valores', valores: 'SI,NO' } } }))).toThrow(/no cabe/);
    expect(() => generarCrud(tabla, opciones({ ESTADO: { regla: { tipo: 'valores', valores: ' , ' } } }))).toThrow(/Indique/);
    expect(() => generarCrud(tabla, opciones({ FECNAC: { regla: { tipo: 'valores', valores: '1' } } }))).toThrow(/fecha u hora/);
    expect(() => generarCrud(tabla, opciones({ COMUNA: { regla: { tipo: 'existe', tabla: 'MAL-NOMBRE', columna: 'X' } } }))).toThrow(
      /tabla donde debe existir/,
    );
    expect(() => generarCrud(tabla, opciones({ NOEXISTE: { requerido: 'si' } }))).toThrow(/no está en el detalle/);
  });
  it('opciones posibles y sugerencia de email', () => {
    expect(requeridosPosibles({ numerico: true, fechaHora: false })).toEqual(['no', 'mayorCero', 'distintoCero']);
    expect(requeridosPosibles({ numerico: false, fechaHora: false })).toEqual(['no', 'si']);
    expect(reglasPosibles({ numerico: false, fechaHora: false, longitud: 60 })).toContain('email');
    expect(reglasPosibles({ numerico: false, fechaHora: false, longitud: 3 })).not.toContain('email');
    expect(reglasPosibles({ numerico: true, fechaHora: false, longitud: 3 })).toEqual(['rango', 'valores', 'existe']);
    expect(pareceEmail('EMAIL')).toBe(true);
    expect(pareceEmail('CORREOE')).toBe(true);
    expect(pareceEmail('NOMBRE')).toBe(false);
  });
});

describe('validaciones del CRUD: pantalla', () => {
  const r = generarCrud(tabla, opciones(completo));
  it('cada campo validado lleva DSPATR(RI PC) con su indicador y el email CHECK(LC)', () => {
    expect(r.dds).toMatch(/RUT +9S 0B[^\n]*\n(?:[^\n]*\n)*? {5}A  50 +DSPATR\(RI PC\)/);
    const email = r.dds.slice(r.dds.indexOf(' EMAIL '), r.dds.indexOf(' EDAD '));
    expect(email).toContain('CHECK(LC)');
    expect(email).toMatch(/A  5\d +DSPATR\(RI PC\)/);
    expect(r.dds).not.toMatch(/NOMBRE[^\n]*\n[^\n]*CHECK\(LC\)/);
  });
  it('la pantalla valida sin errores y se vuelve a leer igual', () => {
    expect(validar(r.pantalla).filter((p) => p.nivel === 'error')).toEqual([]);
    expect(parsearDspf(r.dds, 'X').advertencias).toEqual([]);
  });
});

describe('validaciones del CRUD: programa', () => {
  const r = generarCrud(tabla, opciones(completo));
  const cobol = r.cobol;
  it('graba solo si VALIDAR-DETALLE no encontró errores', () => {
    const grabar = parrafo(cobol, 'GRABAR-DETALLE');
    expect(grabar.indexOf('PERFORM PANTALLA-A-REGISTRO')).toBeLessThan(grabar.indexOf('PERFORM VALIDAR-DETALLE'));
    expect(grabar.indexOf('PERFORM VALIDAR-DETALLE')).toBeLessThan(grabar.indexOf('IF ERROR-WS = "N"'));
  });
  it('apaga los indicadores de error al leer la pantalla y al cambiar de modo', () => {
    for (const p of ['PANTALLA-A-REGISTRO', 'CONFIGURA-DETALLE']) {
      const texto = parrafo(cobol, p);
      expect(texto, p).toMatch(/MOVE I-OFF TO IN(40|50) OF R01-O-INDIC/);
      for (const n of r.plan.validaciones.map((v) => v.indicador)) expect(texto, `${p} IN${n}`).toContain(`IN${n} OF R01-O-INDIC`);
    }
  });
  it('obligatorios: texto no vacío, llave y numéricos > 0 o distinto de 0, fecha no vacía', () => {
    const v = parrafo(cobol, 'VALIDAR-DETALLE');
    expect(v).toContain('IF RUT-WS NOT > 0');
    expect(v).toContain('"RUT debe ser mayor a 0."');
    expect(v).toContain('IF NOMBRE-WS = SPACES');
    expect(v).toContain('IF SALDO-WS = 0');
    expect(v).toContain('IF FECNAC OF R01-II = SPACES');
    expect(v).toMatch(/MOVE "S" TO ERROR-WS\n +MOVE I-ON TO IN50 OF R01-O-INDIC/);
  });
  it('reglas: email, rango, valores y existe (solo si el campo tiene valor)', () => {
    const v = parrafo(cobol, 'VALIDAR-DETALLE');
    expect(v).toMatch(/IF EMAIL-WS = SPACES\n +CONTINUE\n +ELSE\n +MOVE EMAIL-WS TO EM-TEXTO\n +PERFORM VALIDA-EMAIL/);
    expect(v).toMatch(/IF EDAD-WS < 18\n +OR EDAD-WS > 120/);
    expect(v).toMatch(/IF ESTADO-WS NOT = "A"\n +AND ESTADO-WS NOT = "I"/);
    expect(v).toMatch(/SELECT COUNT\(\*\) INTO :CUENTA-WS\n +FROM MIBIB\/COMUNAS\n +WHERE CODCOM = :COMUNA-WS/);
    expect(v).toContain('IF SQLCODE NOT = 0 OR CUENTA-WS = 0');
    expect(cobol).toContain('77 CUENTA-WS             PIC S9(9) COMP-3.');
    expect(cobol).toContain('77 EM-TEXTO              PIC X(60).');
    expect(cobol).toContain('88 EM-CAR-VALIDO');
    expect(parrafo(cobol, 'VALIDA-EMAIL')).toContain('IF EM-ARROBAS NOT = 1 OR EM-POS-ARROBA = 1');
  });
  it('una fecha no válida también marca su campo', () => {
    const ind = r.plan.validaciones.find((x) => x.campo.nombre === 'FECNAC')!.indicador;
    expect(parrafo(cobol, 'PRS-FECNAC')).toContain(`MOVE I-ON TO IN${ind} OF R01-O-INDIC`);
  });
  it('ya no queda el aviso viejo de llave en GRABAR-ALTA', () => {
    expect(cobol).not.toContain('Ingrese todos los campos de la llave.');
  });
  it('ninguna línea pasa de la columna 72', () => {
    for (const l of cobol.split('\n')) expect(l.length, l).toBeLessThanOrEqual(COLUMNA_MAXIMA);
  });
  it('sin email ni existe no se declaran sus áreas', () => {
    const simple = generarCrud(tabla, opciones({})).cobol;
    expect(simple).not.toContain('EM-TEXTO');
    expect(simple).not.toContain('CUENTA-WS');
    expect(simple).toContain('VALIDAR-DETALLE.');
  });
});

/**
 * Simula VALIDA-EMAIL en JavaScript, paso a paso como el COBOL generado, para revisar
 * el algoritmo con varios casos.
 */
function validaEmail(texto: string, largoCampo = 60): boolean {
  const t = texto.padEnd(largoCampo).slice(0, largoCampo);
  let valida = true;
  let largo = 0;
  for (let i = largoCampo; i >= 1 && largo === 0; i--) if (t[i - 1] !== ' ') largo = i;
  if (largo < 5) valida = false;
  let arrobas = 0;
  let posArroba = 0;
  let posPunto = 0;
  const valido = /[A-Za-z0-9\-_+]/;
  for (let i = 1; i <= largo && valida; i++) {
    const car = t[i - 1];
    const ant = t[i - 2];
    if (car === '@') {
      arrobas++;
      posArroba = i;
      if (i > 1 && ant === '.') valida = false;
    } else if (car === '.') {
      if (i === 1 || i === largo) valida = false;
      else {
        if (ant === '.' || ant === '@') valida = false;
        if (posArroba > 0) posPunto = i;
      }
    } else if (!valido.test(car)) valida = false;
  }
  if (arrobas !== 1 || posArroba === 1 || posPunto === 0) valida = false;
  return valida;
}

describe('algoritmo de VALIDA-EMAIL', () => {
  it.each(['juan@empresa.cl', 'j.perez+x@mail.empresa.com', 'a_b-c@d.co'])('acepta %s', (e) => {
    expect(validaEmail(e)).toBe(true);
  });
  it.each(['', 'juan', 'juan@empresa', '@empresa.cl', 'juan@@empresa.cl', 'juan@.cl', 'juan.@empresa.cl', 'juan@empresa.', 'ju an@empresa.cl', 'juan..p@empresa.cl', ' juan@empresa.cl', 'juañ@empresa.cl'])(
    'rechaza «%s»',
    (e) => {
      expect(validaEmail(e)).toBe(false);
    },
  );
});
