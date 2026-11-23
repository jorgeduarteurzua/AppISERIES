/**
 * Pantalla (DSPF) del CRUD, construida como modelo `PantallaDSPF` para poder
 * generar el DDS con `generarDspf` y abrirla después en el editor visual.
 *
 * Nombres de los registros (XX es un correlativo):
 *   RXX registro · SXX subfile · CXX control del subfile · FCXX mensaje y teclas del control
 *   WXX window · WSXX subfile de window · WCXX control de window · FWCXX mensaje y teclas del WCXX
 *
 * En pantalla normal: S01, C01, FC01, R01 (detalle) y W01 (ayuda).
 * En ventanas: WS01, WC01, FWC01 (WINDOW(WC01) y OVERLAY), W01 (detalle), W02 (ayuda) y R99 (registro ficticio de ASSUME).
 *
 * El mensaje y las teclas van siempre en un registro aparte (FC/FWC) para que el
 * control del subfile no pise las filas de la página del subfile.
 *
 * Indicadores: 30 SFLDSP, 31 SFLDSPCTL, 32 SFLCLR, 40 detalle sin edición (consulta
 * y eliminación), 41 llaves protegidas (modificación) y 50 a 99 campos con error de validación.
 */

import { nuevoId } from '../modelo/ids';
import type { Campo, Constante, Elemento, Keyword, PantallaDSPF, Registro } from '../modelo/pantalla';
import {
  COLUMNA_LISTA,
  COLUMNA_OPCION,
  COLUMNA_POSICION,
  DESCRIPCION_ACCION,
  textoSimple,
} from './planCrud';
import type { CampoCrud, PlanCrud, VentanaPlan } from './planCrud';

export interface NombresRegistros {
  sfl: string;
  control: string;
  mensaje: string;
  detalle: string;
  ayuda: string;
  /** Registro ficticio con ASSUME, solo en ventanas. */
  ficticio: string | null;
}

export function nombresRegistros(ventana: boolean): NombresRegistros {
  return ventana
    ? { sfl: 'WS01', control: 'WC01', mensaje: 'FWC01', detalle: 'W01', ayuda: 'W02', ficticio: 'R99' }
    : { sfl: 'S01', control: 'C01', mensaje: 'FC01', detalle: 'R01', ayuda: 'W01', ficticio: null };
}

function kw(
  nombre: string,
  parametros = '',
  indicadores: number[] = [],
  alternativas: number[][] = [],
): Keyword {
  const k: Keyword = {
    nombre,
    parametros,
    indicadores: indicadores.map((numero) => ({ numero, negado: false })),
  };
  if (alternativas.length > 0) {
    k.alternativas = alternativas.map((g) => g.map((numero) => ({ numero, negado: false })));
  }
  return k;
}

function cte(fila: number, columna: number, texto: string, keywords: Keyword[] = []): Constante {
  return { tipo: 'constante', id: nuevoId('cte'), fila, columna, texto, keywords, indicadores: [] };
}

function campo(
  nombre: string,
  longitud: number,
  decimales: number,
  tipoDato: 'A' | 'S',
  uso: Campo['uso'],
  fila: number | null,
  columna: number | null,
  keywords: Keyword[] = [],
): Campo {
  return {
    tipo: 'campo',
    id: nuevoId('campo'),
    nombre,
    longitud,
    decimales,
    tipoDato,
    uso,
    fila,
    columna,
    keywords,
    indicadores: [],
    referencia: false,
  };
}

function campoSistema(nombre: 'DATE' | 'TIME', fila: number, columna: number): Campo {
  return {
    tipo: 'campo',
    id: nuevoId('campo'),
    nombre,
    longitud: 8,
    decimales: 0,
    tipoDato: 'A',
    uso: 'salida',
    fila,
    columna,
    keywords: [kw(nombre)],
    indicadores: [],
    referencia: false,
    sistema: true,
  };
}

function registro(nombre: string, clase: Registro['clase'], keywords: Keyword[], elementos: Elemento[]): Registro {
  return { id: nuevoId('reg'), nombre, clase, keywords, elementos, indicadores: [] };
}

const tipoDspf = (c: { clase: 'A' | 'N' }): 'A' | 'S' => (c.clase === 'A' ? 'A' : 'S');

/** Nombre del campo oculto que guarda la llave n (0 = primera) en el subfile. */
export function nombreLlaveOculta(n: number): string {
  return `HK${String(n + 1).padStart(2, '0')}`;
}

/** Keywords que definen una ventana; los registros de una misma ventana llevan exactamente las mismas. */
function keywordsVentana(v: VentanaPlan, titulo: string): Keyword[] {
  return [
    kw('WINDOW', `${v.fila} ${v.columna} ${v.alto} ${v.ancho}`),
    kw('WDWBORDER', "(*COLOR BLU) (*DSPATR RI) (*CHAR '        ')"),
    kw('WDWTITLE', `(*TEXT '${titulo}') (*COLOR WHT)`),
    kw('USRRSTDSP'),
  ];
}

const centrado = (ancho: number, largo: number): number => Math.max(1, Math.floor((ancho - largo) / 2) + 1);

/** Líneas de la ayuda: lo que hace cada tecla y las opciones de la lista. */
export function lineasAyuda(plan: PlanCrud): string[] {
  const lineas: string[] = [];
  const tecla = (n: number): string => `F${n}`.padEnd(5);
  lineas.push('Teclas');
  for (const t of plan.teclas) {
    const texto = t.accion === 'personalizada' ? t.texto : DESCRIPCION_ACCION[t.accion];
    if (t.accion === 'modificar' && !plan.modificable) continue;
    lineas.push(`${tecla(t.numero)}${texto}`);
  }
  lineas.push('');
  lineas.push('Opciones en la lista');
  lineas.push(plan.modificable ? '2=Modificar   4=Eliminar   5=Consultar' : '4=Eliminar   5=Consultar');
  if (plan.diseno.desplaza) {
    lineas.push('');
    lineas.push('Hay mas columnas de las que caben: use las teclas de desplazamiento.');
  }
  return lineas;
}

export function crearPantallaCrud(plan: PlanCrud): PantallaDSPF {
  const d = plan.diseno;
  const { filas, columnas } = d;
  const nombres = nombresRegistros(d.ventana);
  const titulo = textoSimple(plan.opciones.titulo).slice(0, 40);
  const programa = textoSimple(plan.opciones.nombrePrograma).toUpperCase();
  const registros: Registro[] = [];

  // --- Subfile: una línea con la opción, el detalle visible y las llaves ocultas ---
  const elementosSfl: Elemento[] = [
    campo('OPCION', 1, 0, 'A', 'ambos', d.filaSubfile, COLUMNA_OPCION),
    campo('DETSFL', d.visible, 0, 'A', 'salida', d.filaSubfile, COLUMNA_LISTA),
  ];
  plan.llaves.forEach((c, i) => {
    elementosSfl.push(campo(nombreLlaveOculta(i), c.longitud, c.decimales, tipoDspf(c), 'oculto', null, null));
  });
  registros.push(registro(nombres.sfl, 'subfile', [kw('SFL')], elementosSfl));

  // --- Control del subfile: título, posicionador y encabezados; sin mensajes ni teclas ---
  const vl = d.ventanaLista;
  const cabecera: Elemento[] = d.ventana
    ? []
    : [
        cte(1, 2, programa, [kw('DSPATR', 'HI')]),
        cte(1, centrado(columnas, titulo.length), titulo, [kw('DSPATR', 'HI')]),
        campoSistema('DATE', 1, columnas - 8),
        campoSistema('TIME', 2, columnas - 8),
      ];
  const posicionador: Elemento[] = plan.posicionable
    ? [
        cte(d.filaPosicion, 2, 'Posicionar en :'),
        campo(
          'POSICION',
          plan.llaves[0].pantalla.longitud,
          plan.llaves[0].pantalla.decimales,
          tipoDspf(plan.llaves[0].pantalla),
          'ambos',
          d.filaPosicion,
          COLUMNA_POSICION,
          [kw('DSPATR', 'UL')],
        ),
      ]
    : [];
  const opciones = plan.modificable ? 'Opciones: 2=Modificar   4=Eliminar   5=Consultar' : 'Opciones: 4=Eliminar   5=Consultar';
  const control = registro(
    nombres.control,
    'control-subfile',
    [
      kw('SFLCTL', nombres.sfl),
      kw('SFLSIZ', String(d.maxFilas).padStart(4, '0')),
      kw('SFLPAG', String(d.paginaSubfile).padStart(4, '0')),
      kw('SFLCSRRRN', '&REGREL'),
      kw('OVERLAY'),
      kw('SFLDSP', '', [30]),
      kw('SFLDSPCTL', '', [31]),
      kw('SFLCLR', '', [32]),
      kw('SFLEND', '*SCRBAR *SCRBAR', [30]),
      ...(vl ? keywordsVentana(vl, titulo) : []),
    ],
    [
      campo('POSCUR', 4, 0, 'S', 'oculto', null, null, [kw('SFLRCDNBR', 'CURSOR')]),
      campo('REGREL', 5, 0, 'S', 'oculto', null, null),
      ...cabecera,
      ...posicionador,
      cte(d.filaOpciones, 2, opciones),
      cte(d.filaEncabezado, 2, 'Opc', [kw('DSPATR', 'HI')]),
      campo('ENCAB', d.visible, 0, 'A', 'salida', d.filaEncabezado, COLUMNA_LISTA, [kw('DSPATR', 'HI')]),
    ],
  );
  control.subfileControlado = nombres.sfl;
  registros.push(control);

  // --- Mensaje y teclas del control ---
  // Van en un registro aparte (FC/FWC): si estuvieran en el control, debajo del subfile,
  // CRTDSPF da CPD7812. En ventanas FWC usa WINDOW(WCxx), la ventana del control, y
  // OVERLAY; con su propia definición de WINDOW sería otra ventana encima y no se vería.
  const elementosMensaje: Elemento[] = [
    campo('MENSAJE', d.anchoTexto, 0, 'A', 'salida', d.filaMensajeLista, 2, [kw('DSPATR', 'HI'), kw('COLOR', 'RED')]),
    ...d.leyendaLista.map((linea, i) => cte(d.filaMensajeLista + 1 + i, 2, linea)),
  ];
  registros.push(
    registro(nombres.mensaje, 'normal', vl ? [kw('WINDOW', nombres.control), kw('OVERLAY')] : [], elementosMensaje),
  );

  // --- Detalle ---
  const vd = d.ventanaDetalle;
  const anchoDetalle = vd ? vd.ancho : columnas;
  const elementosDetalle: Elemento[] = d.ventana
    ? [campo('TITULO', 40, 0, 'A', 'salida', 1, centrado(anchoDetalle, 40), [kw('DSPATR', 'HI')])]
    : [
        cte(1, 2, programa, [kw('DSPATR', 'HI')]),
        campo('TITULO', 40, 0, 'A', 'salida', 1, centrado(anchoDetalle, 40), [kw('DSPATR', 'HI')]),
        campoSistema('DATE', 1, columnas - 8),
        campoSistema('TIME', 2, columnas - 8),
      ];
  plan.detalle.forEach((c: CampoCrud) => {
    const fila = c.filaDetalle;
    elementosDetalle.push(cte(fila, d.colEtiqueta, `${c.etiqueta} :`));
    // Protegido en consulta y eliminación (40); las llaves también al modificar (41).
    // Es un solo DSPATR(PR) con condición 40 O 41: repetir el atributo no compila.
    const proteccion = c.llave ? kw('DSPATR', 'PR', [40], [[41]]) : kw('DSPATR', 'PR', [40]);
    const validacion = plan.validaciones.find((v) => v.campo === c);
    elementosDetalle.push(
      campo(c.nombrePantalla, c.pantalla.longitud, c.pantalla.decimales, tipoDspf(c.pantalla), 'ambos', fila, d.colCampo, [
        kw('DSPATR', 'UL'),
        proteccion,
        // Un texto que no cabe en una fila se parte en varias del mismo largo.
        ...(c.cntfld ? [kw('CNTFLD', String(c.cntfld).padStart(3, '0'))] : []),
        // Con error: video inverso y el cursor en el campo.
        ...(validacion?.indicador ? [kw('DSPATR', 'RI PC', [validacion.indicador])] : []),
        // Un email se escribe en minúsculas: sin CHECK(LC) la pantalla lo pasa a mayúsculas.
        ...(validacion?.regla?.tipo === 'email' ? [kw('CHECK', 'LC')] : []),
      ]),
    );
  });
  elementosDetalle.push(
    campo('MENSAJE', d.anchoTextoDetalle, 0, 'A', 'salida', d.filaMensajeDetalle, 2, [kw('DSPATR', 'HI'), kw('COLOR', 'RED')]),
  );
  for (let i = 0; i < d.nLineasLeyendaDetalle; i++) {
    elementosDetalle.push(campo(i === 0 ? 'LEYENDA' : 'LEYENDA2', d.anchoTextoDetalle, 0, 'A', 'salida', d.filaLeyendaDetalle + i, 2));
  }
  if (d.nLineasLeyendaDetalle > 2) {
    throw new Error('Las teclas del detalle ocupan más de dos líneas: quite alguna tecla personalizada.');
  }
  // Con ayuda de campo, el sistema devuelve en FLDNAM el campo donde estaba el cursor al pulsar la tecla.
  const keywordsDetalle = vd ? keywordsVentana(vd, titulo) : [];
  if (plan.ayudas.length > 0) {
    elementosDetalle.push(
      campo('RCDNAM', 10, 0, 'A', 'oculto', null, null),
      campo('FLDNAM', 10, 0, 'A', 'oculto', null, null),
    );
    keywordsDetalle.push(kw('RTNCSRLOC', '&RCDNAM &FLDNAM'));
  }
  registros.push(registro(nombres.detalle, 'normal', keywordsDetalle, elementosDetalle));

  // --- Ayuda: una ventana con el texto y un campo para esperar una tecla ---
  const lineas = lineasAyuda(plan).slice(0, filas - 9);
  const va: VentanaPlan = { ...d.ventanaAyuda, alto: lineas.length + 4 };
  const elementosAyuda: Elemento[] = lineas.flatMap((l, i) =>
    l === '' ? [] : [cte(2 + i, 2, l, l === 'Teclas' || l === 'Opciones en la lista' ? [kw('DSPATR', 'HI')] : [])],
  );
  elementosAyuda.push(cte(lineas.length + 3, 2, 'Presione Enter para volver'));
  elementosAyuda.push(campo('PAUSA', 1, 0, 'A', 'ambos', lineas.length + 3, 30, [kw('DSPATR', 'ND')]));
  registros.push(registro(nombres.ayuda, 'normal', keywordsVentana(va, 'Ayuda'), elementosAyuda));

  // --- Registro ficticio: en ventanas fija la pantalla de fondo (KEEP, ASSUME y OVERLAY) ---
  if (nombres.ficticio) {
    registros.push(registro(nombres.ficticio, 'normal', [kw('KEEP'), kw('ASSUME'), kw('OVERLAY')], [cte(1, 3, ' ')]));
  }

  return {
    nombre: plan.opciones.nombrePantalla.toUpperCase(),
    tamano: plan.tamano,
    keywordsArchivo: [kw('DSPSIZ', `${filas} ${columnas} ${plan.tamano.codigo}`), kw('INDARA')],
    teclasFuncion: plan.teclas.map((t) => ({
      tipo: 'CF' as const,
      numero: t.numero,
      respuestaInd: t.numero,
      texto: t.texto,
    })),
    registros,
    advertencias: [],
  };
}
