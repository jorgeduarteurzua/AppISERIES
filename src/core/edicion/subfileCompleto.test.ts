import { describe, expect, it } from 'vitest';
import { agregarRegistro, completarSubfile, crearPantalla, TEXTO_OPCIONES_SUBFILE } from './operaciones';
import { incorporarCampos } from './camposDeArchivo';
import { validar } from './validacion';
import { generarDspf } from '../generador/generadorDspf';
import { parsearDspf } from '../parser/parserDspf';
import { parsearTabla } from '../tablas/parserTabla';
import type { Campo } from '../modelo/pantalla';

const TABLA1 = parsearTabla(
  [
    '     A                                      UNIQUE',
    '     A          R RTABLA1',
    "     A            RUT           10S 0       TEXT('RUT')",
    "     A            DV             1A         TEXT('DV')",
    "     A            NOMBRES       30A         TEXT('NOMBRES')",
    "     A            APEPAT        30A         TEXT('AP.PAT')",
    '     A          K RUT',
  ].join('\n') + '\n',
  'TABLA1.pf',
);

/** PANTALLA1 de «Fuentes Generador»: un subfile con *SCRBAR y APEPAT hasta la columna 78. */
const PANTALLA1 = [
  '     A                                      DSPSIZ(24 80 *DS3)',
  '     A                                      INDARA',
  '     A          R WS01                      SFL',
  '     A            RUT       R   10S 0O  8  4REFFLD(RUT TABLA1)',
  '     A            DV        R    1A  O  8 15REFFLD(DV TABLA1)',
  '     A            NOMBRES   R   30A  O  8 18REFFLD(NOMBRES TABLA1)',
  '     A            APEPAT    R   30A  O  8 49REFFLD(APEPAT TABLA1)',
  '     A          R WC01                      SFLCTL(WS01)',
  '     A                                      SFLSIZ(0100)',
  '     A                                      SFLPAG(0010)',
  '     A  30                                  SFLDSP',
  '     A  31                                  SFLDSPCTL',
  '     A  32                                  SFLCLR',
  '     A  30                                  SFLEND(*SCRBAR *SCRBAR)',
  "     A                                  5  4'Rut'",
].join('\n') + '\n';

const campo = (r: { elementos: unknown[] }, nombre: string) => (r.elementos as Campo[]).find((e) => e.tipo === 'campo' && e.nombre === nombre);

describe('barra de desplazamiento (SFLEND *SCRBAR)', () => {
  it('avisa el campo que llega a la barra (el error CPD8186 de PANTALLA1), sin moverlo', () => {
    const p = parsearDspf(PANTALLA1, 'PANTALLA1');
    const errores = validar(p).filter((x) => x.nivel === 'error').map((x) => x.mensaje);
    expect(errores.join('\n')).toMatch(/APEPAT.*termina en la columna 78.*columna 77 o antes \(CPD8186\)/);
    expect(errores.filter((m) => /CPD8186/.test(m))).toHaveLength(1);
    expect(generarDspf(p)).toContain('APEPAT    R   30A  O  8 49');
  });
  it('marca un campo del subfile que empieza en la columna 1 (OPCION 1A B 6 1)', () => {
    const dds = PANTALLA1.replace(
      "     A            RUT       R   10S 0O  8  4REFFLD(RUT TABLA1)",
      "     A            OPCION         1A  B  8  1\n     A            RUT       R   10S 0O  8  4REFFLD(RUT TABLA1)",
    );
    const p = parsearDspf(dds, 'PANTALLA1');
    const errores = validar(p).filter((x) => x.nivel === 'error').map((x) => x.mensaje);
    expect(errores.some((m) => /OPCION/.test(m) && /columna 1/.test(m))).toBe(true);
  });
  it('sin *SCRBAR no hay aviso', () => {
    const p = parsearDspf(PANTALLA1.replace('SFLEND(*SCRBAR *SCRBAR)', 'SFLEND(*MORE)'), 'PANTALLA1');
    expect(validar(p).some((x) => /CPD8186/.test(x.mensaje))).toBe(false);
  });
});

describe('subfile como el del CRUD', () => {
  const r = agregarRegistro(crearPantalla('PANT'), { tipo: 'subfile', nombre: 'WS01', nombreControl: 'WC01' });
  const sfl = r.pantalla.registros.find((x) => x.nombre === 'WS01')!;
  const ctl = r.pantalla.registros.find((x) => x.nombre === 'WC01')!;

  it('nace con OVERLAY, SFLCSRRRN, POSCUR con SFLRCDNBR, OPCION y las opciones 2, 4 y 5', () => {
    expect(ctl.keywords.map((k) => k.nombre).slice(0, 5)).toEqual(['SFLCTL', 'SFLSIZ', 'SFLPAG', 'OVERLAY', 'SFLCSRRRN']);
    expect(ctl.keywords.find((k) => k.nombre === 'SFLCSRRRN')?.parametros).toBe('&REGREL');
    expect(campo(ctl, 'POSCUR')).toMatchObject({ uso: 'oculto', longitud: 4, tipoDato: 'S', keywords: [{ nombre: 'SFLRCDNBR', parametros: 'CURSOR' }] });
    expect(campo(ctl, 'REGREL')).toMatchObject({ uso: 'oculto', longitud: 5 });
    expect(campo(sfl, 'OPCION')).toMatchObject({ uso: 'ambos', fila: 5, columna: 2, longitud: 1 });
    expect(campo(sfl, 'DETSFL')?.columna).toBe(5);
    expect(ctl.elementos.some((e) => e.tipo === 'constante' && e.texto === TEXTO_OPCIONES_SUBFILE && e.fila === 3)).toBe(true);
    expect(ctl.elementos.some((e) => e.tipo === 'constante' && e.texto === 'Opc' && e.fila === 4)).toBe(true);
  });
  it('el DDS valida sin errores y se vuelve a leer igual', () => {
    expect(validar(r.pantalla).filter((x) => x.nivel === 'error')).toEqual([]);
    const dds = generarDspf(r.pantalla);
    expect(dds).toMatch(/POSCUR +4S 0H +SFLRCDNBR\(CURSOR\)/);
    expect(generarDspf(parsearDspf(dds, 'PANT'))).toBe(dds);
  });
  it('se puede pedir el subfile simple, como antes', () => {
    const simple = agregarRegistro(crearPantalla('PANT'), { tipo: 'subfile', nombre: 'WS01', nombreControl: 'WC01', completo: false });
    const c = simple.pantalla.registros.find((x) => x.nombre === 'WC01')!;
    expect(c.keywords.some((k) => k.nombre === 'OVERLAY')).toBe(false);
    expect(campo(simple.pantalla.registros.find((x) => x.nombre === 'WS01')!, 'DETSFL')?.columna).toBe(2);
  });
});

describe('completar un subfile existente (PANTALLA1)', () => {
  const p = parsearDspf(PANTALLA1, 'PANTALLA1');
  const ctlId = p.registros.find((x) => x.nombre === 'WC01')!.id;

  it('agrega lo que falta y avisa lo que no cabe, sin mover nada', () => {
    const r = completarSubfile(p, ctlId);
    const ctl = r.pantalla.registros.find((x) => x.nombre === 'WC01')!;
    const sfl = r.pantalla.registros.find((x) => x.nombre === 'WS01')!;
    expect(ctl.keywords.some((k) => k.nombre === 'OVERLAY')).toBe(true);
    expect(campo(ctl, 'REGREL')).toBeTruthy();
    expect(campo(ctl, 'POSCUR')).toBeTruthy();
    // RUT empieza en la columna 4: no hay lugar para OPCION en la 2.
    expect(campo(sfl, 'OPCION')).toBeUndefined();
    expect(r.avisos.join(' ')).toMatch(/no hay lugar para OPCION/);
    expect(campo(sfl, 'RUT')?.columna).toBe(4);
    // La fila 6 (dos arriba del subfile) está libre: va la línea de opciones.
    expect(ctl.elementos.some((e) => e.tipo === 'constante' && e.texto === TEXTO_OPCIONES_SUBFILE && e.fila === 6)).toBe(true);
  });
  it('dos veces no repite nada', () => {
    const una = completarSubfile(p, ctlId).pantalla;
    const dos = completarSubfile(una, ctlId);
    expect(dos.agregados).toEqual([]);
  });
});

describe('incorporar campos en un subfile', () => {
  const base = agregarRegistro(crearPantalla('PANT'), { tipo: 'subfile', nombre: 'WS01', nombreControl: 'WC01' }).pantalla;
  const sflId = base.registros.find((x) => x.nombre === 'WS01')!.id;

  it('agrega la llave como HK01 oculto con REFFLD', () => {
    const r = incorporarCampos(base, { archivo: 'TABLA1', tabla: TABLA1, regId: sflId, campos: ['NOMBRES'], uso: 'salida', etiqueta: 'ninguna', fila: 5, columna: 30 });
    const sfl = r.pantalla.registros.find((x) => x.nombre === 'WS01')!;
    expect(campo(sfl, 'HK01')).toMatchObject({ uso: 'oculto', fila: null, referencia: true, keywords: [{ nombre: 'REFFLD', parametros: 'RUT TABLA1' }] });
    expect(r.agregados).toContain('HK01 (llave RUT, oculto)');
    expect(generarDspf(r.pantalla)).toMatch(/HK01 +R +10S 0H +REFFLD\(RUT TABLA1\)/);
  });
  it('avisa (sin acomodar) si un campo llega a la barra de desplazamiento', () => {
    const r = incorporarCampos(base, { archivo: 'TABLA1', tabla: TABLA1, regId: sflId, campos: ['APEPAT'], uso: 'salida', etiqueta: 'ninguna', fila: 5, columna: 49 });
    expect(r.avisos.join(' ')).toMatch(/APEPAT termina en la columna 78.*77 o antes/);
    expect(campo(r.pantalla.registros.find((x) => x.nombre === 'WS01')!, 'APEPAT')?.columna).toBe(49);
  });
});
