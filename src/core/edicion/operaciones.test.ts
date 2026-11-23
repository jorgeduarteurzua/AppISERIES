import { describe, it, expect } from 'vitest';
import {
  actualizarElemento,
  actualizarKeyword,
  actualizarTecla,
  agregarCampo,
  agregarConstante,
  agregarKeyword,
  agregarRegistro,
  agregarTecla,
  alternarAtributo,
  cambiarTamano,
  colorDe,
  crearPantalla,
  eliminarElemento,
  eliminarRegistro,
  establecerColor,
  establecerTituloVentana,
  establecerVentana,
  leerTituloVentana,
  leerVentana,
  moverElemento,
  nombreLibre,
  normalizarNombre,
  quitarKeyword,
  quitarTecla,
  renombrarRegistro,
  tieneAtributo,
  textoLegibleTecla,
} from './operaciones';
import { TAMANO_27X132 } from '../modelo/pantalla';
import type { Campo, Constante } from '../modelo/pantalla';

const base = () => crearPantalla('PANT1');
const idReg = (p: ReturnType<typeof base>) => p.registros[0].id;

describe('crearPantalla', () => {
  it('crea DSPSIZ, INDARA y un registro vacío REG01', () => {
    const p = base();
    expect(p.keywordsArchivo.map((k) => k.nombre)).toEqual(['DSPSIZ', 'INDARA']);
    expect(p.keywordsArchivo[0].parametros).toBe('24 80 *DS3');
    expect(p.registros).toHaveLength(1);
    expect(p.registros[0]).toMatchObject({ nombre: 'REG01', clase: 'normal', elementos: [] });
  });
});

describe('inmutabilidad', () => {
  it('ninguna operación modifica la pantalla original', () => {
    const p = base();
    const copia = JSON.stringify(p);
    const { pantalla: p2, elementoId } = agregarConstante(p, idReg(p), 2, 2, 'Hola');
    moverElemento(p2, idReg(p), elementoId, 5, 5);
    actualizarElemento(p2, idReg(p), elementoId, { texto: 'Otro' });
    alternarAtributo(p2, idReg(p), elementoId, 'HI');
    eliminarElemento(p2, idReg(p), elementoId);
    renombrarRegistro(p2, idReg(p), 'OTRO');
    cambiarTamano(p2, TAMANO_27X132);
    expect(JSON.stringify(p)).toBe(copia);
  });
});

describe('registros', () => {
  it('agrega un registro normal con ventana y títulos', () => {
    const { pantalla, registroId } = agregarRegistro(base(), {
      tipo: 'normal',
      nombre: 'w01',
      ventana: { fila: 2, columna: 2, alto: 10, ancho: 40 },
      tituloArriba: 'Arriba',
      tituloAbajo: 'Abajo',
    });
    const r = pantalla.registros.find((x) => x.id === registroId)!;
    expect(r.nombre).toBe('W01');
    expect(leerVentana(r)).toEqual({ fila: 2, columna: 2, alto: 10, ancho: 40 });
    expect(leerTituloVentana(r, 'arriba')).toBe('Arriba');
    expect(leerTituloVentana(r, 'abajo')).toBe('Abajo');
  });

  it('crea el par subfile + control con las keywords habituales', () => {
    const { pantalla, registroId } = agregarRegistro(base(), {
      tipo: 'subfile',
      nombre: 'WS01',
      nombreControl: 'WC01',
      paginaSubfile: 12,
      tamanoSubfile: 200,
    });
    const sfl = pantalla.registros.find((r) => r.nombre === 'WS01')!;
    const ctl = pantalla.registros.find((r) => r.id === registroId)!;
    expect(sfl.clase).toBe('subfile');
    expect(ctl).toMatchObject({ nombre: 'WC01', clase: 'control-subfile', subfileControlado: 'WS01' });
    const kw = (n: string) => ctl.keywords.find((k) => k.nombre === n);
    expect(kw('SFLCTL')?.parametros).toBe('WS01');
    expect(kw('SFLSIZ')?.parametros).toBe('0200');
    expect(kw('SFLPAG')?.parametros).toBe('0012');
    expect(kw('SFLDSP')?.indicadores).toEqual([{ numero: 30, negado: false }]);
  });

  it('rechaza nombres repetidos o vacíos', () => {
    const p = base();
    expect(() => agregarRegistro(p, { tipo: 'normal', nombre: 'reg01' })).toThrow(/Ya existe/);
    expect(() => agregarRegistro(p, { tipo: 'normal', nombre: '  ' })).toThrow(/nombre/);
    expect(() =>
      agregarRegistro(p, { tipo: 'subfile', nombre: 'AAA', nombreControl: 'AAA' }),
    ).toThrow(/distintos/);
  });

  it('eliminar un subfile elimina también su control, y al revés', () => {
    const { pantalla, registroId } = agregarRegistro(base(), {
      tipo: 'subfile',
      nombre: 'WS01',
      nombreControl: 'WC01',
    });
    const sfl = pantalla.registros.find((r) => r.nombre === 'WS01')!;
    expect(eliminarRegistro(pantalla, sfl.id).registros.map((r) => r.nombre)).toEqual(['REG01']);
    expect(eliminarRegistro(pantalla, registroId).registros.map((r) => r.nombre)).toEqual(['REG01']);
  });

  it('renombrar actualiza las referencias del control', () => {
    const { pantalla } = agregarRegistro(base(), {
      tipo: 'subfile',
      nombre: 'WS01',
      nombreControl: 'WC01',
    });
    const sfl = pantalla.registros.find((r) => r.nombre === 'WS01')!;
    const n = renombrarRegistro(pantalla, sfl.id, 'detalle');
    const ctl = n.registros.find((r) => r.clase === 'control-subfile')!;
    expect(ctl.subfileControlado).toBe('DETALLE');
    expect(ctl.keywords.find((k) => k.nombre === 'SFLCTL')?.parametros).toBe('DETALLE');
    expect(() => renombrarRegistro(n, sfl.id, 'WC01')).toThrow(/Ya existe/);
  });
});

describe('elementos', () => {
  it('agrega una constante y un campo con valores por defecto', () => {
    let p = base();
    const t = agregarConstante(p, idReg(p), 3, 4);
    p = t.pantalla;
    const c = agregarCampo(p, idReg(p), { fila: 5, columna: 6 });
    const campo = c.pantalla.registros[0].elementos.find((e) => e.id === c.elementoId) as Campo;
    expect(campo).toMatchObject({
      nombre: 'CAMPO01',
      longitud: 10,
      tipoDato: 'A',
      uso: 'ambos',
      fila: 5,
      columna: 6,
      referencia: false,
    });
    const cte = c.pantalla.registros[0].elementos.find((e) => e.id === t.elementoId) as Constante;
    expect(cte).toMatchObject({ texto: 'Texto', fila: 3, columna: 4 });
  });

  it('genera nombres de campo distintos', () => {
    let p = base();
    for (let i = 0; i < 3; i++) p = agregarCampo(p, idReg(p), { fila: i + 1, columna: 1 }).pantalla;
    const nombres = p.registros[0].elementos.map((e) => (e.tipo === 'campo' ? e.nombre : ''));
    expect(nombres).toEqual(['CAMPO01', 'CAMPO02', 'CAMPO03']);
    expect(nombreLibre(['CAMPO01'], 'CAMPO')).toBe('CAMPO02');
  });

  it('mueve, actualiza y elimina', () => {
    let p = base();
    const r = agregarCampo(p, idReg(p), { fila: 1, columna: 1 });
    p = moverElemento(r.pantalla, idReg(p), r.elementoId, 7, 9);
    p = actualizarElemento(p, idReg(p), r.elementoId, { nombre: 'mi campo', longitud: 25 });
    const campo = p.registros[0].elementos[0] as Campo;
    expect(campo).toMatchObject({ fila: 7, columna: 9, nombre: 'MI_CAMPO', longitud: 25 });
    expect(eliminarElemento(p, idReg(p), r.elementoId).registros[0].elementos).toHaveLength(0);
    expect(() => eliminarElemento(p, idReg(p), 'no-existe')).toThrow();
  });

  it('un campo que pasa a oculto pierde su posición', () => {
    let p = base();
    const r = agregarCampo(p, idReg(p), { fila: 4, columna: 4 });
    p = actualizarElemento(r.pantalla, idReg(p), r.elementoId, { uso: 'oculto' });
    expect(p.registros[0].elementos[0]).toMatchObject({ uso: 'oculto', fila: null, columna: null });
  });
});

describe('atributos y color', () => {
  it('activa, desactiva y combina atributos en una sola keyword', () => {
    let p = base();
    const r = agregarConstante(p, idReg(p), 1, 1, 'X');
    const id = r.elementoId;
    p = alternarAtributo(r.pantalla, idReg(p), id, 'HI');
    p = alternarAtributo(p, idReg(p), id, 'UL');
    const el = p.registros[0].elementos[0];
    expect(el.keywords.filter((k) => k.nombre === 'DSPATR')).toHaveLength(1);
    expect(el.keywords[0].parametros).toBe('HI UL');
    expect(tieneAtributo(el, 'HI')).toBe(true);

    p = alternarAtributo(p, idReg(p), id, 'HI');
    expect(p.registros[0].elementos[0].keywords[0].parametros).toBe('UL');
    p = alternarAtributo(p, idReg(p), id, 'UL');
    expect(p.registros[0].elementos[0].keywords).toHaveLength(0);
  });

  it('reconoce atributos repartidos en varias keywords DSPATR', () => {
    let p = base();
    const r = agregarConstante(p, idReg(p), 1, 1, 'X');
    p = agregarKeyword(r.pantalla, { tipo: 'elemento', regId: idReg(p), elId: r.elementoId }, { nombre: 'DSPATR', parametros: 'HI' });
    p = agregarKeyword(p, { tipo: 'elemento', regId: idReg(p), elId: r.elementoId }, { nombre: 'DSPATR', parametros: 'UL' });
    p = alternarAtributo(p, idReg(p), r.elementoId, 'UL', false);
    const el = p.registros[0].elementos[0];
    expect(tieneAtributo(el, 'UL')).toBe(false);
    expect(tieneAtributo(el, 'HI')).toBe(true);
  });

  it('ignora los DSPATR condicionados por indicador', () => {
    let p = base();
    const r = agregarConstante(p, idReg(p), 1, 1, 'X');
    p = agregarKeyword(
      r.pantalla,
      { tipo: 'elemento', regId: idReg(p), elId: r.elementoId },
      { nombre: 'DSPATR', parametros: 'RI', indicadores: [{ numero: 99, negado: false }] },
    );
    expect(tieneAtributo(p.registros[0].elementos[0], 'RI')).toBe(false);
  });

  it('establece y quita el color', () => {
    let p = base();
    const r = agregarConstante(p, idReg(p), 1, 1, 'X');
    p = establecerColor(r.pantalla, idReg(p), r.elementoId, 'RED');
    expect(colorDe(p.registros[0].elementos[0])).toBe('RED');
    p = establecerColor(p, idReg(p), r.elementoId, 'BLU');
    expect(p.registros[0].elementos[0].keywords.filter((k) => k.nombre === 'COLOR')).toHaveLength(1);
    p = establecerColor(p, idReg(p), r.elementoId, null);
    expect(colorDe(p.registros[0].elementos[0])).toBeNull();
  });
});

describe('keywords genéricas', () => {
  it('agrega, actualiza y quita en archivo, registro y elemento', () => {
    let p = base();
    const regId = idReg(p);
    p = agregarKeyword(p, { tipo: 'archivo' }, { nombre: 'print' });
    expect(p.keywordsArchivo.at(-1)?.nombre).toBe('PRINT');
    p = agregarKeyword(p, { tipo: 'registro', regId }, { nombre: 'overlay' });
    p = actualizarKeyword(p, { tipo: 'registro', regId }, 0, { parametros: 'X', nombre: 'erase' });
    expect(p.registros[0].keywords[0]).toMatchObject({ nombre: 'ERASE', parametros: 'X' });
    p = quitarKeyword(p, { tipo: 'registro', regId }, 0);
    expect(p.registros[0].keywords).toHaveLength(0);
    expect(() => quitarKeyword(p, { tipo: 'registro', regId }, 5)).toThrow();
  });
});

describe('ventana y títulos', () => {
  it('establece y quita la ventana con sus keywords asociadas', () => {
    let p = base();
    const regId = idReg(p);
    p = establecerVentana(p, regId, { fila: 3, columna: 4, alto: 10, ancho: 30 });
    expect(leerVentana(p.registros[0])).toEqual({ fila: 3, columna: 4, alto: 10, ancho: 30 });
    expect(p.registros[0].keywords.map((k) => k.nombre)).toEqual(['WINDOW', 'WDWBORDER', 'USRRSTDSP']);
    p = establecerVentana(p, regId, { fila: 5, columna: 5, alto: 8, ancho: 20 });
    expect(p.registros[0].keywords.filter((k) => k.nombre === 'WINDOW')).toHaveLength(1);
    p = establecerVentana(p, regId, null);
    expect(p.registros[0].keywords).toHaveLength(0);
  });

  it('el título de abajo lleva *BOTTOM y el de arriba no', () => {
    let p = base();
    const regId = idReg(p);
    p = establecerVentana(p, regId, { fila: 2, columna: 2, alto: 10, ancho: 40 });
    p = establecerTituloVentana(p, regId, 'arriba', "Título d'prueba");
    p = establecerTituloVentana(p, regId, 'abajo', 'F3-Salir');
    const titulos = p.registros[0].keywords.filter((k) => k.nombre === 'WDWTITLE');
    expect(titulos).toHaveLength(2);
    expect(titulos[0].parametros).not.toContain('*BOTTOM');
    expect(titulos[1].parametros).toContain('*BOTTOM');
    expect(titulos[0].parametros).toContain("d''prueba"); // comilla duplicada
    expect(leerTituloVentana(p.registros[0], 'arriba')).toBe("Título d'prueba");
    p = establecerTituloVentana(p, regId, 'abajo', '');
    expect(p.registros[0].keywords.filter((k) => k.nombre === 'WDWTITLE')).toHaveLength(1);
  });
});

describe('teclas de función', () => {
  it('agrega, edita y quita; el indicador sigue al número', () => {
    let p = base();
    p = agregarTecla(p, { tipo: 'CF', numero: 3, texto: "Sal'ir" });
    expect(p.teclasFuncion[0]).toMatchObject({ tipo: 'CF', numero: 3, respuestaInd: 3, texto: "Sal''ir" });
    expect(textoLegibleTecla(p.teclasFuncion[0])).toBe("Sal'ir");
    p = actualizarTecla(p, 0, { numero: 12, tipo: 'CA' });
    expect(p.teclasFuncion[0]).toMatchObject({ tipo: 'CA', numero: 12, respuestaInd: 12 });
    p = actualizarTecla(p, 0, { texto: '' });
    expect(p.teclasFuncion[0].texto).toBeUndefined();
    expect(quitarTecla(p, 0).teclasFuncion).toHaveLength(0);
  });
});

describe('tamaño de pantalla', () => {
  it('mantiene sincronizado DSPSIZ', () => {
    const p = cambiarTamano(base(), TAMANO_27X132);
    expect(p.tamano).toEqual(TAMANO_27X132);
    expect(p.keywordsArchivo.find((k) => k.nombre === 'DSPSIZ')?.parametros).toBe('27 132 *DS4');
  });
});

describe('normalizarNombre', () => {
  it('pasa a mayúsculas y cambia espacios por _', () => {
    expect(normalizarNombre('  mi campo  uno ')).toBe('MI_CAMPO_UNO');
  });
});
