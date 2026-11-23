/**
 * Programa COBOL con SQL embebido del CRUD (formato fijo). Sigue el estilo de
 * los programas existentes: pantalla por WORKSTATION con CONTROL-AREA, copias
 * DDS-<formato>-I / -O / -INDIC, subfile cargado con un cursor y la tabla
 * accedida con SQL. Compila con CRTSQLCBL (OPM) o CRTSQLCBLI (ILE) y siempre
 * con COMMIT(*NONE).
 *
 * La lista se arma como una sola línea por registro (DETSFL) a partir de una
 * tabla en memoria; así las teclas de desplazamiento muestran otras columnas
 * sin volver a leer la base de datos. Cada tecla tiene su rama en un EVALUATE
 * y las personalizadas llaman a un párrafo ACCION-Fnn vacío.
 */

import { expresionAsignar, expresionLeer, tokensFormato } from './fechaHora';
import { nombreLlaveOculta, nombresRegistros } from './generadorPantallaCrud';
import { LARGO_CODIGO_AYUDA, LARGO_DESCRIPCION_AYUDA, ajustarEncabezado, textoSimple } from './planCrud';
import type { AccionTecla, AyudaPlan, CampoCrud, ModoDetalle, PlanCrud, TeclaCrud } from './planCrud';
import { LARGO_MINIMO_EMAIL } from './validacionesCrud';
import type { ValidacionPlan } from './validacionesCrud';

/** Última columna que se puede usar (de la 73 en adelante es el área de identificación). */
export const COLUMNA_MAXIMA = 72;

/** Texto desde la columna 8 (área A). */
const areaA = (texto: string): string => `       ${texto}`;
/** Texto desde la columna 12 (área B) más `nivel` sangrías de 3 columnas. */
const areaB = (texto: string, nivel = 0): string => `           ${'   '.repeat(nivel)}${texto}`;
/** Comentario: asterisco en la columna 7. */
const comentario = (texto = ''): string => `      *${texto}`;

const sufijo = (c: CampoCrud, s: 'WS' | 'SQ' | 'LW' | 'ED'): string => `${c.nombrePantalla}-${s}`;

function pic(c: CampoCrud): string {
  if (c.clase === 'A') return `X(${c.longitud})`;
  if (c.decimales === 0) return `S9(${c.longitud})`;
  const enteros = c.longitud - c.decimales;
  return enteros <= 0 ? `SV9(${c.decimales})` : `S9(${enteros})V9(${c.decimales})`;
}

/** PIC editado con que un número se pasa a la línea de la lista. */
function picEditado(c: CampoCrud): string {
  const enteros = Math.max(c.longitud - c.decimales, 1);
  return `-(${enteros})9${c.decimales > 0 ? `.9(${c.decimales})` : ''}`;
}

/** Elemento de un grupo: `05 NOMBRE   PIC ...`. */
function elemento(nivel: string, nombre: string, picture: string, sangria = 10): string {
  return `${' '.repeat(sangria)}${nivel} ${nombre.padEnd(20)} PIC ${picture}.`;
}

/** Parte una expresión larga después de cada `+`, sin pasar de `ancho` caracteres por trozo. */
function partirLargo(texto: string, ancho: number): string[] {
  const lineas: string[] = [];
  let actual = '';
  for (const parte of texto.split(/(?<=\+)/)) {
    if (actual !== '' && actual.length + parte.length > ancho) {
      lineas.push(actual);
      actual = parte;
    } else {
      actual += parte;
    }
  }
  if (actual !== '') lineas.push(actual);
  return lineas;
}

/** Reparte una lista separada por comas en líneas de hasta `ancho` caracteres. */
function envolver(items: string[], ancho: number): string[] {
  const lineas: string[] = [];
  let actual = '';
  items.forEach((item, i) => {
    const ficha = i < items.length - 1 ? `${item},` : item;
    if (ficha.length > ancho) {
      if (actual !== '') lineas.push(actual);
      lineas.push(...partirLargo(ficha, ancho));
      actual = '';
      return;
    }
    if (actual !== '' && actual.length + 1 + ficha.length > ancho) {
      lineas.push(actual);
      actual = ficha;
    } else {
      actual = actual === '' ? ficha : `${actual} ${ficha}`;
    }
  });
  if (actual !== '') lineas.push(actual);
  return lineas;
}

/** Primera línea con `prefijo` y las siguientes alineadas debajo, con `sufijoFinal` en la última. */
function listaConPrefijo(items: string[], prefijo: string, ancho: number, sufijoFinal = ''): string[] {
  const lineas = envolver(items, ancho - prefijo.length - sufijoFinal.length);
  return lineas.map((l, i) => {
    const inicio = i === 0 ? prefijo : ' '.repeat(prefijo.length);
    return `${inicio}${l}${i === lineas.length - 1 ? sufijoFinal : ''}`;
  });
}

/** `MOVE "texto" TO destino`, partido en trozos si el texto no cabe en una línea. */
function mover(texto: string, destino: string, nivel = 0): string[] {
  const t = textoSimple(texto);
  if (t === '') return [areaB(`MOVE SPACES TO ${destino}`, nivel)];
  const trozos = t.match(/.{1,38}/g) ?? [''];
  if (trozos.length === 1) return [areaB(`MOVE "${trozos[0]}"`, nivel), areaB(`TO ${destino}`, nivel + 3)];
  return [
    areaB(`MOVE SPACES TO ${destino}`, nivel),
    ...trozos.flatMap((trozo, i) => [
      areaB(`MOVE "${trozo}"`, nivel),
      areaB(`TO ${destino}(${i * 38 + 1}:${trozo.length})`, nivel + 3),
    ]),
  ];
}

function parrafo(nombre: string): string[] {
  return [areaA(`${nombre}.`), comentario('-'.repeat(nombre.length))];
}

const vaciar = (grupo: string, nivel = 0): string[] => [
  areaB(`INITIALIZE ${grupo}`, nivel),
  areaB('REPLACING ALPHANUMERIC DATA BY SPACES', nivel + 2),
  areaB('NUMERIC DATA BY ZEROES', nivel + 4),
];

// ---------------------------------------------------------------------------
// Fechas y horas
// ---------------------------------------------------------------------------

const almacenamientoDe = (c: CampoCrud): string | null => c.fechaHora?.almacenamiento ?? null;

function ft(campo: CampoCrud): string {
  return sufijo(campo, 'WS');
}

/** Pasa el valor del campo (ya en su variable) a FECHA-TRABAJO. */
function fechaAFt(c: CampoCrud): string[] {
  const v = ft(c);
  switch (almacenamientoDe(c)) {
    case 'N8':
      return [
        areaB(`MOVE ${v} TO NUM8-WS`),
        areaB('MOVE N8-AAAA TO FT-AAAA'),
        areaB('MOVE N8-MM   TO FT-MM'),
        areaB('MOVE N8-DD   TO FT-DD'),
      ];
    case 'N6':
      return [
        areaB(`MOVE ${v} TO NUM6-WS`),
        areaB('IF NUM6-WS NOT = ZEROES'),
        areaB('MOVE N6-MM TO FT-MM', 1),
        areaB('MOVE N6-DD TO FT-DD', 1),
        areaB('IF N6-AA > 50', 1),
        areaB('COMPUTE FT-AAAA = 1900 + N6-AA', 2),
        areaB('ELSE', 1),
        areaB('COMPUTE FT-AAAA = 2000 + N6-AA', 2),
        areaB('END-IF', 1),
        areaB('END-IF'),
      ];
    case 'L':
      return [
        areaB(`IF ${v}(1:4) NUMERIC`),
        areaB(`AND ${v}(6:2) NUMERIC`, 2),
        areaB(`AND ${v}(9:2) NUMERIC`, 2),
        areaB(`MOVE ${v}(1:4) TO FT-AAAA`, 1),
        areaB(`MOVE ${v}(6:2) TO FT-MM`, 1),
        areaB(`MOVE ${v}(9:2) TO FT-DD`, 1),
        areaB('IF FT-AAAA = 1 AND FT-MM = 1 AND FT-DD = 1', 1),
        areaB('MOVE ZEROES TO FECHA-TRABAJO', 2),
        areaB('END-IF', 1),
        areaB('END-IF'),
      ];
    default:
      return [
        areaB(`IF ${v}(1:4) NUMERIC`),
        areaB(`AND ${v}(5:2) NUMERIC`, 2),
        areaB(`AND ${v}(7:2) NUMERIC`, 2),
        areaB(`MOVE ${v}(1:4) TO FT-AAAA`, 1),
        areaB(`MOVE ${v}(5:2) TO FT-MM`, 1),
        areaB(`MOVE ${v}(7:2) TO FT-DD`, 1),
        areaB('END-IF'),
      ];
  }
}

/** Guarda FECHA-TRABAJO en la variable del campo, con su almacenamiento. */
function fechaDesdeFt(c: CampoCrud): string[] {
  const v = ft(c);
  switch (almacenamientoDe(c)) {
    case 'N8':
      return [
        areaB('MOVE FT-AAAA TO N8-AAAA'),
        areaB('MOVE FT-MM   TO N8-MM'),
        areaB('MOVE FT-DD   TO N8-DD'),
        areaB(`MOVE NUM8-WS TO ${v}`),
      ];
    case 'N6':
      return [
        areaB('MOVE FT-AAAA(3:2) TO N6-AA'),
        areaB('MOVE FT-MM        TO N6-MM'),
        areaB('MOVE FT-DD        TO N6-DD'),
        areaB(`MOVE NUM6-WS      TO ${v}`),
      ];
    case 'L':
      return [
        areaB(`MOVE SPACES TO ${v}`),
        areaB('STRING FT-AAAA "-" FT-MM "-" FT-DD'),
        areaB('DELIMITED BY SIZE', 4),
        areaB(`INTO ${v} END-STRING`, 4),
      ];
    default:
      return [
        areaB(`MOVE FT-AAAA TO ${v}(1:4)`),
        areaB(`MOVE FT-MM   TO ${v}(5:2)`),
        areaB(`MOVE FT-DD   TO ${v}(7:2)`),
      ];
  }
}

function fechaVacia(c: CampoCrud): string {
  const v = ft(c);
  switch (almacenamientoDe(c)) {
    case 'L':
      return `MOVE "0001-01-01" TO ${v}`;
    case 'A8':
      return `MOVE "00000000" TO ${v}`;
    default:
      return `MOVE ZEROES TO ${v}`;
  }
}

function horaAHt(c: CampoCrud): string[] {
  const v = ft(c);
  switch (almacenamientoDe(c)) {
    case 'N6':
      return [
        areaB(`MOVE ${v} TO NUM6H-WS`),
        areaB('MOVE H6-HH TO HT-HH'),
        areaB('MOVE H6-MI TO HT-MI'),
        areaB('MOVE H6-SS TO HT-SS'),
      ];
    case 'N4':
      return [areaB(`MOVE ${v} TO NUM4H-WS`), areaB('MOVE H4-HH TO HT-HH'), areaB('MOVE H4-MI TO HT-MI')];
    case 'N8':
      return [
        areaB(`MOVE ${v} TO NUM8H-WS`),
        areaB('MOVE H8-HH TO HT-HH'),
        areaB('MOVE H8-MI TO HT-MI'),
        areaB('MOVE H8-SS TO HT-SS'),
      ];
    case 'T':
      return [
        areaB(`IF ${v}(1:2) NUMERIC`),
        areaB(`AND ${v}(4:2) NUMERIC`, 2),
        areaB(`AND ${v}(7:2) NUMERIC`, 2),
        areaB(`MOVE ${v}(1:2) TO HT-HH`, 1),
        areaB(`MOVE ${v}(4:2) TO HT-MI`, 1),
        areaB(`MOVE ${v}(7:2) TO HT-SS`, 1),
        areaB('END-IF'),
      ];
    default:
      return [
        areaB(`IF ${v}(1:2) NUMERIC`),
        areaB(`AND ${v}(3:2) NUMERIC`, 2),
        areaB(`AND ${v}(5:2) NUMERIC`, 2),
        areaB(`MOVE ${v}(1:2) TO HT-HH`, 1),
        areaB(`MOVE ${v}(3:2) TO HT-MI`, 1),
        areaB(`MOVE ${v}(5:2) TO HT-SS`, 1),
        areaB('END-IF'),
      ];
  }
}

function horaDesdeHt(c: CampoCrud): string[] {
  const v = ft(c);
  switch (almacenamientoDe(c)) {
    case 'N6':
      return [
        areaB('MOVE HT-HH TO H6-HH'),
        areaB('MOVE HT-MI TO H6-MI'),
        areaB('MOVE HT-SS TO H6-SS'),
        areaB(`MOVE NUM6H-WS TO ${v}`),
      ];
    case 'N4':
      return [areaB('MOVE HT-HH TO H4-HH'), areaB('MOVE HT-MI TO H4-MI'), areaB(`MOVE NUM4H-WS TO ${v}`)];
    case 'N8':
      return [
        areaB('MOVE HT-HH TO H8-HH'),
        areaB('MOVE HT-MI TO H8-MI'),
        areaB('MOVE HT-SS TO H8-SS'),
        areaB('MOVE ZEROES TO H8-CC'),
        areaB(`MOVE NUM8H-WS TO ${v}`),
      ];
    case 'T':
      return [
        areaB(`MOVE SPACES TO ${v}`),
        areaB('STRING HT-HH "." HT-MI "." HT-SS'),
        areaB('DELIMITED BY SIZE', 4),
        areaB(`INTO ${v} END-STRING`, 4),
      ];
    default:
      return [
        areaB(`MOVE HT-HH TO ${v}(1:2)`),
        areaB(`MOVE HT-MI TO ${v}(3:2)`),
        areaB(`MOVE HT-SS TO ${v}(5:2)`),
      ];
  }
}

/** Párrafos FMT-xxx (de la variable al texto de la pantalla) y PRS-xxx (del texto a la variable). */
function parrafosFechaHora(c: CampoCrud, ctlDet: string, indicador: number | null): string[] {
  const fh = c.fechaHora;
  if (!fh) return [];
  const esFecha = fh.tipo === 'fecha';
  const tokens = tokensFormato(fh.tipo, fh.formato) ?? [];
  const txt = esFecha ? 'TXT-FECHA' : 'TXT-HORA';
  const largo = fh.formato.length;
  const v = ft(c);
  const t: string[] = [];

  // --- De la variable al texto ---
  t.push(...parrafo(`FMT-${c.nombrePantalla}`), areaB(`MOVE SPACES TO ${txt}`));
  if (esFecha) {
    t.push(areaB('MOVE ZEROES TO FECHA-TRABAJO'), ...fechaAFt(c));
    t.push(areaB('IF FT-AAAA = 0 AND FT-MM = 0 AND FT-DD = 0'), areaB('CONTINUE', 1), areaB('ELSE'));
    for (const k of tokens) {
      const destino = `${txt}(${k.inicio}:${k.largo})`;
      const origen =
        k.clave === 'DD' ? 'FT-DD' : k.clave === 'MM' ? 'FT-MM' : k.clave === 'YYYY' ? 'FT-AAAA' : k.clave === 'YY' ? 'FT-AAAA(3:2)' : null;
      t.push(areaB(origen ? `MOVE ${origen} TO ${destino}` : `MOVE "${k.texto}" TO ${destino}`, 1));
    }
    t.push(areaB('END-IF.'), comentario());
  } else {
    t.push(areaB('MOVE ZEROES TO HORA-TRABAJO'), ...horaAHt(c));
    for (const k of tokens) {
      const destino = `${txt}(${k.inicio}:${k.largo})`;
      const origen = k.clave === 'HH' ? 'HT-HH' : k.clave === 'MI' ? 'HT-MI' : k.clave === 'SS' ? 'HT-SS' : null;
      t.push(areaB(origen ? `MOVE ${origen} TO ${destino}` : `MOVE "${k.texto}" TO ${destino}`));
    }
    t[t.length - 1] += '.';
    t.push(comentario());
  }

  // --- Del texto a la variable ---
  const nombreTexto = esFecha ? 'fecha' : 'hora';
  t.push(
    ...parrafo(`PRS-${c.nombrePantalla}`),
    areaB(`MOVE ${c.nombrePantalla} OF ${ctlDet}-II TO ${txt}`),
    areaB(esFecha ? 'MOVE ZEROES TO FECHA-TRABAJO' : 'MOVE ZEROES TO HORA-TRABAJO'),
    areaB('MOVE "S" TO FT-VALIDA'),
    areaB(`IF ${txt}(1:${largo}) = SPACES`),
    areaB(fechaVacia(c), 1),
    areaB('ELSE'),
  );
  // Separadores y dígitos.
  const condiciones = tokens.map((k) =>
    k.clave === 'LIT' ? `${txt}(${k.inicio}:1) NOT = "${k.texto}"` : `${txt}(${k.inicio}:${k.largo}) NOT NUMERIC`,
  );
  condiciones.forEach((cond, i) => t.push(areaB(`${i === 0 ? 'IF' : 'OR'} ${cond}`, i === 0 ? 1 : 3)));
  t.push(areaB('MOVE "N" TO FT-VALIDA', 2), areaB('END-IF', 1));
  t.push(areaB('IF FT-VALIDA = "S"', 1));
  for (const k of tokens) {
    const origen = `${txt}(${k.inicio}:${k.largo})`;
    if (k.clave === 'DD') t.push(areaB(`MOVE ${origen} TO FT-DD`, 2));
    else if (k.clave === 'MM') t.push(areaB(`MOVE ${origen} TO FT-MM`, 2));
    else if (k.clave === 'YYYY') t.push(areaB(`MOVE ${origen} TO FT-AAAA`, 2));
    else if (k.clave === 'YY') {
      t.push(
        areaB(`MOVE ${origen} TO FT-AA`, 2),
        areaB('IF FT-AA > 50', 2),
        areaB('COMPUTE FT-AAAA = 1900 + FT-AA', 3),
        areaB('ELSE', 2),
        areaB('COMPUTE FT-AAAA = 2000 + FT-AA', 3),
        areaB('END-IF', 2),
      );
    } else if (k.clave === 'HH') t.push(areaB(`MOVE ${origen} TO HT-HH`, 2));
    else if (k.clave === 'MI') t.push(areaB(`MOVE ${origen} TO HT-MI`, 2));
    else if (k.clave === 'SS') t.push(areaB(`MOVE ${origen} TO HT-SS`, 2));
  }
  t.push(areaB(esFecha ? 'PERFORM VALIDA-FECHA' : 'PERFORM VALIDA-HORA', 2), areaB('END-IF', 1));
  t.push(areaB('IF FT-VALIDA = "S"', 1));
  for (const l of esFecha ? fechaDesdeFt(c) : horaDesdeHt(c)) t.push(`      ${l}`);
  t.push(
    areaB('ELSE', 1),
    areaB('MOVE "S" TO ERROR-WS', 2),
    ...(indicador ? [areaB(`MOVE I-ON TO IN${indicador} OF ${ctlDet}-O-INDIC`, 2)] : []),
    areaB('IF MENSAJE-WS = SPACES', 2),
    ...mover(`${nombreTexto === 'fecha' ? 'Fecha' : 'Hora'} no valida: ${c.etiqueta}`, 'MENSAJE-WS', 3),
    areaB('END-IF', 2),
    areaB('END-IF', 1),
    areaB('END-IF.'),
    comentario(),
  );
  void v;
  return t;
}

// ---------------------------------------------------------------------------
// Validaciones de los campos del detalle
// ---------------------------------------------------------------------------

const indicadoresError = (plan: PlanCrud): number[] =>
  plan.validaciones.flatMap((v) => (v.indicador ? [v.indicador] : []));

/** Receptores de un MOVE I-OFF que ya empezó: los indicadores de error desde `desde`. */
function apagarErrores(plan: PlanCrud, det: string, nivel: number, desde = 0): string[] {
  return indicadoresError(plan)
    .slice(desde)
    .map((n) => areaB(`IN${n} OF ${det}-O-INDIC`, nivel));
}

/** MOVE I-OFF a todos los indicadores de error (nada si no hay). */
function apagarTodosLosErrores(plan: PlanCrud, det: string): string[] {
  const ind = indicadoresError(plan);
  if (ind.length === 0) return [];
  return [areaB(`MOVE I-OFF TO IN${ind[0]} OF ${det}-O-INDIC`), ...apagarErrores(plan, det, 6, 1)];
}

const largoEmail = (plan: PlanCrud): number =>
  Math.max(0, ...plan.validaciones.filter((v) => v.regla?.tipo === 'email').map((v) => v.campo.longitud));

/** Variables de trabajo de las validaciones. */
function areasValidacion(plan: PlanCrud): string[] {
  const t: string[] = [];
  if (plan.validaciones.some((v) => v.regla?.tipo === 'existe')) {
    t.push(comentario(' Validacion: el valor existe en otra tabla'), areaA('77 CUENTA-WS             PIC S9(9) COMP-3.'), '');
  }
  const largo = largoEmail(plan);
  if (largo > 0) {
    t.push(
      comentario(' Validacion de email'),
      areaA(`77 EM-TEXTO              PIC X(${largo}).`),
      areaA('77 EM-LARGO              PIC 9(4).'),
      areaA('77 EM-I                  PIC 9(4).'),
      areaA('77 EM-J                  PIC 9(4).'),
      areaA('77 EM-ARROBAS            PIC 9(4).'),
      areaA('77 EM-POS-ARROBA         PIC 9(4).'),
      areaA('77 EM-POS-PUNTO          PIC 9(4).'),
      areaA('77 EM-VALIDA             PIC X(1).'),
      areaA('01 EM-CAR                PIC X(1).'),
      // Por tramos: en EBCDIC las letras no son contiguas (A-I, J-R, S-Z).
      areaA('   88 EM-CAR-VALIDO      VALUE "A" THRU "I" "J" THRU "R"'),
      areaA('                               "S" THRU "Z" "a" THRU "i"'),
      areaA('                               "j" THRU "r" "s" THRU "z"'),
      areaA('                               "0" THRU "9" "-" "_" "+".'),
      '',
    );
  }
  return t;
}

/** Marca el campo con error y deja el mensaje si es el primero. */
function errorDeCampo(v: ValidacionPlan, det: string, mensaje: string, nivel: number): string[] {
  return [
    areaB('MOVE "S" TO ERROR-WS', nivel),
    ...(v.indicador ? [areaB(`MOVE I-ON TO IN${v.indicador} OF ${det}-O-INDIC`, nivel)] : []),
    areaB('IF MENSAJE-WS = SPACES', nivel),
    ...mover(mensaje, 'MENSAJE-WS', nivel + 1),
    areaB('END-IF', nivel),
  ];
}

/** Condición que se cumple cuando el campo no tiene valor, según lo obligatorio. */
function condicionVacio(v: ValidacionPlan, det: string): string {
  const c = v.campo;
  if (c.fechaHora) return `${c.nombrePantalla} OF ${det}-II = SPACES`;
  const variable = sufijo(c, 'WS');
  if (c.clase === 'A') return `${variable} = SPACES`;
  return v.requerido === 'mayorCero' ? `${variable} NOT > 0` : `${variable} = 0`;
}

function mensajeRequerido(v: ValidacionPlan): string {
  const e = v.campo.etiqueta;
  if (v.requerido === 'mayorCero') return `${e} debe ser mayor a 0.`;
  if (v.requerido === 'distintoCero') return `${e} no puede ser 0.`;
  return `Ingrese ${e}.`;
}

/** Revisión de la regla de un campo con valor. */
function revisarRegla(v: ValidacionPlan, det: string, nivel: number): string[] {
  const c = v.campo;
  const variable = sufijo(c, 'WS');
  const regla = v.regla;
  if (!regla) return [];
  const e = c.etiqueta;
  switch (regla.tipo) {
    case 'email':
      return [
        areaB(`MOVE ${variable} TO EM-TEXTO`, nivel),
        areaB('PERFORM VALIDA-EMAIL', nivel),
        areaB('IF EM-VALIDA = "N"', nivel),
        ...errorDeCampo(v, det, `Email no valido: ${e}.`, nivel + 1),
        areaB('END-IF', nivel),
      ];
    case 'rango':
      return [
        areaB(`IF ${variable} < ${regla.minimo}`, nivel),
        areaB(`OR ${variable} > ${regla.maximo}`, nivel + 1),
        ...errorDeCampo(v, det, `${e} debe estar entre ${regla.minimo} y ${regla.maximo}.`, nivel + 1),
        areaB('END-IF', nivel),
      ];
    case 'valores': {
      const literal = (x: string) => (c.clase === 'A' ? `"${x}"` : x);
      return [
        ...regla.valores.map((x, i) =>
          areaB(`${i === 0 ? 'IF' : 'AND'} ${variable} NOT = ${literal(x)}`, i === 0 ? nivel : nivel + 1),
        ),
        ...errorDeCampo(v, det, `${e}: use ${regla.valores.join(', ')}.`, nivel + 1),
        areaB('END-IF', nivel),
      ];
    }
    case 'existe':
      return [
        areaB('MOVE ZEROES TO CUENTA-WS', nivel),
        areaB('EXEC SQL', nivel),
        areaB('SELECT COUNT(*) INTO :CUENTA-WS', nivel + 1),
        areaB(`FROM ${regla.tablaSql}`, nivel + 2),
        areaB(`WHERE ${regla.columna} = :${variable}`, nivel + 2),
        areaB('END-EXEC', nivel),
        areaB('IF SQLCODE NOT = 0 OR CUENTA-WS = 0', nivel),
        ...errorDeCampo(v, det, `${e} no existe en ${regla.tabla}.`, nivel + 1),
        areaB('END-IF', nivel),
      ];
  }
}

/** VALIDAR-DETALLE (después de PANTALLA-A-REGISTRO) y VALIDA-EMAIL si hace falta. */
function parrafosValidacion(plan: PlanCrud, det: string): string[] {
  const t: string[] = [
    ...parrafo('VALIDAR-DETALLE'),
    comentario(' Revisa los campos antes de grabar. Marca cada campo con error'),
    comentario(' y deja en MENSAJE-WS el primero.'),
  ];
  for (const v of plan.validaciones) {
    if (v.requerido === 'no' && !v.regla) continue;
    t.push(comentario(` ${v.campo.nombrePantalla}`));
    const vacio = condicionVacio(v, det);
    const regla = revisarRegla(v, det, 1);
    if (v.requerido !== 'no') {
      t.push(areaB(`IF ${vacio}`), ...errorDeCampo(v, det, mensajeRequerido(v), 1));
    } else {
      t.push(areaB(`IF ${vacio}`), areaB('CONTINUE', 1));
    }
    if (regla.length > 0) t.push(areaB('ELSE'), ...regla);
    t.push(areaB('END-IF'));
  }
  t.push(areaB('CONTINUE.'), comentario());
  if (largoEmail(plan) > 0) {
    t.push(
      ...parrafo('VALIDA-EMAIL'),
      comentario(' Una sola @, que no vaya al inicio; un punto despues de la @;'),
      comentario(' sin puntos seguidos, ni junto a la @, ni al inicio o al final;'),
      comentario(' solo letras, numeros y - _ + . @ (sin espacios intermedios).'),
      areaB('MOVE "S" TO EM-VALIDA'),
      areaB('MOVE ZEROES TO EM-LARGO EM-ARROBAS EM-POS-ARROBA EM-POS-PUNTO'),
      areaB(`PERFORM VARYING EM-I FROM ${largoEmail(plan)} BY -1`),
      areaB('UNTIL EM-I < 1 OR EM-LARGO > 0', 3),
      areaB('IF EM-TEXTO(EM-I:1) NOT = SPACE', 1),
      areaB('MOVE EM-I TO EM-LARGO', 2),
      areaB('END-IF', 1),
      areaB('END-PERFORM'),
      areaB(`IF EM-LARGO < ${LARGO_MINIMO_EMAIL}`),
      areaB('MOVE "N" TO EM-VALIDA', 1),
      areaB('END-IF'),
      areaB('PERFORM VARYING EM-I FROM 1 BY 1'),
      areaB('UNTIL EM-I > EM-LARGO OR EM-VALIDA = "N"', 3),
      areaB('MOVE EM-TEXTO(EM-I:1) TO EM-CAR', 1),
      areaB('COMPUTE EM-J = EM-I - 1', 1),
      areaB('IF EM-CAR = "@"', 1),
      areaB('ADD 1 TO EM-ARROBAS', 2),
      areaB('MOVE EM-I TO EM-POS-ARROBA', 2),
      areaB('IF EM-I > 1', 2),
      areaB('IF EM-TEXTO(EM-J:1) = "."', 3),
      areaB('MOVE "N" TO EM-VALIDA', 4),
      areaB('END-IF', 3),
      areaB('END-IF', 2),
      areaB('ELSE', 1),
      areaB('IF EM-CAR = "."', 2),
      areaB('IF EM-I = 1 OR EM-I = EM-LARGO', 3),
      areaB('MOVE "N" TO EM-VALIDA', 4),
      areaB('ELSE', 3),
      areaB('IF EM-TEXTO(EM-J:1) = "."', 4),
      areaB('OR EM-TEXTO(EM-J:1) = "@"', 5),
      areaB('MOVE "N" TO EM-VALIDA', 5),
      areaB('END-IF', 4),
      areaB('IF EM-POS-ARROBA > 0', 4),
      areaB('MOVE EM-I TO EM-POS-PUNTO', 5),
      areaB('END-IF', 4),
      areaB('END-IF', 3),
      areaB('ELSE', 2),
      areaB('IF NOT EM-CAR-VALIDO', 3),
      areaB('MOVE "N" TO EM-VALIDA', 4),
      areaB('END-IF', 3),
      areaB('END-IF', 2),
      areaB('END-IF', 1),
      areaB('END-PERFORM'),
      areaB('IF EM-ARROBAS NOT = 1 OR EM-POS-ARROBA = 1'),
      areaB('OR EM-POS-PUNTO = 0', 1),
      areaB('MOVE "N" TO EM-VALIDA', 1),
      areaB('END-IF.'),
      comentario(),
    );
  }
  return t;
}

// ---------------------------------------------------------------------------
// Programa
// ---------------------------------------------------------------------------

const MODOS: ModoDetalle[] = ['A', 'M', 'C', 'E'];
const TITULO_MODO: Record<ModoDetalle, string> = {
  A: 'Agregar registro',
  M: 'Modificar registro',
  C: 'Consultar registro',
  E: 'Eliminar registro',
};

/**
 * Párrafo de la ayuda de un campo: llama al programa de ayuda con el código actual y su descripción,
 * y si vuelve un código lo deja en el campo. Sin programa, el CALL queda para que lo escriba el programador.
 */
function parrafoAyuda(a: AyudaPlan): string[] {
  const c = a.campo;
  const variable = sufijo(c, 'WS');
  const numerico = c.clase === 'N';
  const lineas: string[] = [
    ...parrafo(a.parrafo),
    comentario(` Ayuda del campo ${c.nombre}. El programa de ayuda recibe y devuelve:`),
    comentario(` 1) codigo X(${LARGO_CODIGO_AYUDA}): entra el valor actual y sale el elegido.`),
    comentario('    Si vuelve en blancos, no se eligio nada.'),
    comentario(` 2) descripcion X(${LARGO_DESCRIPCION_AYUDA}): sale la descripcion de lo elegido.`),
    areaB('MOVE SPACES TO AYU-CODIGO AYU-DESCRIP'),
    ...(numerico
      ? [areaB(`MOVE ${variable} TO AYU-NUM-ED`), areaB('MOVE AYU-NUM-ED TO AYU-CODIGO')]
      : [areaB(`MOVE ${variable} TO AYU-CODIGO`)]),
  ];
  // Qué hacer con lo que devuelve la ayuda.
  const usar = (n: number): string[] => [
    areaB('IF AYU-CODIGO NOT = SPACES', n),
    ...(numerico
      ? [
          areaB('MOVE ZEROES TO AYU-ACUM', n + 1),
          areaB(`PERFORM VARYING AYU-I FROM 1 BY 1 UNTIL AYU-I > ${LARGO_CODIGO_AYUDA}`, n + 1),
          areaB('IF AYU-CODIGO(AYU-I:1) NUMERIC', n + 2),
          areaB('MOVE AYU-CODIGO(AYU-I:1) TO AYU-DIG', n + 3),
          areaB('COMPUTE AYU-ACUM = AYU-ACUM * 10 + AYU-DIG', n + 3),
          areaB('END-IF', n + 2),
          areaB('END-PERFORM', n + 1),
          areaB(`COMPUTE ${variable} = AYU-ACUM`, n + 1),
          areaB('ON SIZE ERROR', n + 2),
          ...mover('El codigo elegido no cabe en el campo.', 'MENSAJE-WS', n + 3),
          areaB('NOT ON SIZE ERROR', n + 2),
          areaB('MOVE AYU-DESCRIP TO MENSAJE-WS', n + 3),
          areaB('END-COMPUTE', n + 1),
        ]
      : [
          areaB(`MOVE AYU-CODIGO(1:${c.longitud}) TO ${variable}`, n + 1),
          areaB('MOVE AYU-DESCRIP TO MENSAJE-WS', n + 1),
        ]),
    areaB('END-IF', n),
  ];
  if (a.programa === '') {
    lineas.push(
      comentario(' Escriba aqui el CALL a su programa de ayuda:'),
      comentario('     CALL "SUPROGRAMA" USING AYU-CODIGO AYU-DESCRIP'),
      ...usar(0),
    );
    lineas[lineas.length - 1] += '.';
  } else {
    lineas.push(
      areaB(`CALL "${a.programa}"`),
      areaB('USING AYU-CODIGO AYU-DESCRIP', 3),
      areaB('ON EXCEPTION', 1),
      ...mover('No se pudo llamar a la ayuda.', 'MENSAJE-WS', 2),
      areaB('NOT ON EXCEPTION', 1),
      ...usar(2),
      areaB('END-CALL.'),
    );
  }
  lineas.push(comentario());
  return lineas;
}

export function generarCobolCrud(plan: PlanCrud): string {
  const { opciones: o, tamano, diseno: d } = plan;
  const nom = nombresRegistros(d.ventana);
  const programa = o.nombrePrograma.toUpperCase();
  const dspf = o.nombrePantalla.toUpperCase();
  const autor = textoSimple(o.autor) || 'AppISERIES';
  const llave1 = plan.llaves[0];
  const noLlave = plan.detalle.filter((c) => !c.llave);
  const teclas = plan.teclas;
  const tecla = (a: AccionTecla): TeclaCrud | undefined => teclas.find((t) => t.accion === a);
  const personalizadas = teclas.filter((t) => t.accion === 'personalizada');
  const camposFechaHora = plan.detalle.filter((c) => c.fechaHora);
  const hayFechas = camposFechaHora.some((c) => c.fechaHora?.tipo === 'fecha');
  const hayHoras = camposFechaHora.some((c) => c.fechaHora?.tipo === 'hora');
  const almacenamientosUsados = new Set(camposFechaHora.map((c) => `${c.fechaHora?.tipo}:${c.fechaHora?.almacenamiento}`));
  // Campos que trae el cursor de la lista: los visibles y las llaves que falten.
  const sqCampos = [...plan.lista, ...plan.llaves.filter((k) => !plan.lista.includes(k))];
  const largoLinea = d.totalLinea + d.visible;
  const mensajeLargo = Math.max(d.anchoTexto, d.anchoTextoDetalle);
  const t: string[] = [];

  const colSql = (c: CampoCrud): string => expresionLeer(c.nombre, almacenamientoDe(c));
  const valorSql = (c: CampoCrud, variable: string): string =>
    expresionAsignar(variable, almacenamientoDe(c), c.fechaHora?.tipo ?? null);

  // --- Identificación y entorno ---
  t.push(
    areaA('IDENTIFICATION DIVISION.'),
    comentario('------------------------'),
    areaA(`PROGRAM-ID.  ${programa}.`),
    areaA(`AUTHOR. ${autor.toUpperCase()}.`),
    comentario(` Mantenedor de ${plan.tabla}. Generado por AppISERIES.`),
    comentario(` Pantalla ${dspf}${d.ventana ? ' (ventanas)' : ''}. Compilar con COMMIT(*NONE).`),
    areaA('ENVIRONMENT DIVISION.'),
    areaA('CONFIGURATION SECTION.'),
    areaA('SOURCE-COMPUTER.  IBM-AS400.'),
    areaA('OBJECT-COMPUTER.  IBM-AS400.'),
    areaA('INPUT-OUTPUT SECTION.'),
    areaA('FILE-CONTROL.'),
    comentario('-------------'),
    '',
    areaB(`SELECT PANTALLA   ASSIGN        TO WORKSTATION-${dspf}-SI`),
    areaB('ORGANIZATION  IS TRANSACTION', 6),
    areaB('ACCESS MODE   IS DYNAMIC', 6),
    areaB('RELATIVE KEY  IS NREL', 6),
    areaB('CONTROL-AREA  IS AREA-CONTROL', 6),
    areaB('FILE STATUS   IS FS-PANTALLA.', 6),
    '',
  );

  // --- Datos ---
  t.push(
    areaA('DATA DIVISION.'),
    areaA('FILE SECTION.'),
    comentario('-------------'),
    areaA('FD  PANTALLA LABEL RECORD STANDARD.'),
    areaA(`01  R-PANTALLA           PIC X(${tamano.filas * tamano.columnas}).`),
    '',
    areaA('WORKING-STORAGE SECTION.'),
    comentario('------------------------'),
    areaA('77 NREL                  PIC 9(4).'),
    areaA('77 I                     PIC S9(4).'),
    areaA('77 CANT-SEL              PIC 9(3).'),
    areaA('77 CANT-FILAS            PIC 9(4) VALUE 0.'),
    areaA(`77 MAX-FILAS             PIC 9(4) VALUE ${d.maxFilas}.`),
    areaA('77 MODO-WS               PIC X(1).'),
    areaA('77 SALIR-WS              PIC X(1).'),
    areaA('77 SALIR-DT              PIC X(1).'),
    areaA('77 ERROR-WS              PIC X(1).'),
    areaA('77 HAY-REG               PIC X(1).'),
    areaA('77 HAY-MAS               PIC X(1).'),
    areaA(`77 MENSAJE-WS            PIC X(${mensajeLargo}).`),
    areaA('77 SQLCODE-ED            PIC -(8)9.'),
    areaA('77 OFFSET-WS             PIC 9(4) VALUE 1.'),
    areaA(`77 ANCHO-VIS             PIC 9(4) VALUE ${d.visible}.`),
    areaA(`77 TOTAL-LINEA           PIC 9(4) VALUE ${d.totalLinea}.`),
  );
  if (d.desplaza) {
    t.push(
      areaA('77 COL-ACT               PIC 9(3) VALUE 1.'),
      areaA(`77 COL-CANT              PIC 9(3) VALUE ${d.pasos.length}.`),
    );
  }
  if (plan.posicionable) {
    t.push(
      areaA(`77 POSICION-WS           PIC ${pic(llave1)}.`),
      areaA(`77 POSICION-ANT-WS       PIC ${pic(llave1)}.`),
    );
  }
  if (plan.ayudas.length > 0) {
    // Interfaz de los programas de ayuda: código (entra el actual, sale el elegido) y descripción.
    t.push(
      areaA(`77 AYU-CODIGO            PIC X(${LARGO_CODIGO_AYUDA}).`),
      areaA(`77 AYU-DESCRIP           PIC X(${LARGO_DESCRIPCION_AYUDA}).`),
    );
    if (plan.ayudas.some((a) => a.campo.clase === 'N')) {
      t.push(
        areaA('77 AYU-NUM-ED            PIC Z(17)9.'),
        areaA('77 AYU-ACUM              PIC 9(18).'),
        areaA('77 AYU-DIG               PIC 9.'),
        areaA('77 AYU-I                 PIC 9(4).'),
      );
    }
  }
  t.push(
    areaA('77 I-ON                  PIC 1 VALUE B"1".'),
    areaA('77 I-OFF                 PIC 1 VALUE B"0".'),
    '',
    areaB('EXEC SQL'),
    areaB('INCLUDE SQLCA', 1),
    areaB('END-EXEC.'),
    '',
    areaA('01 WS-ESTADOS.'),
    areaA('   05 FS-PANTALLA         PIC X(02) VALUE "00".'),
    '',
    areaA('01 AREA-CONTROL.'),
    areaA('   05 MDTO               PIC 9(02).'),
    areaA('      88 INTRO           VALUE 00.'),
    ...teclas.map((k) => areaA(`      88 ${`F${k.numero}`.padEnd(15)}VALUE ${String(k.numero).padStart(2, '0')}.`)),
    '',
  );
  t.push(...areasValidacion(plan));

  // Fechas y horas: áreas de trabajo.
  if (hayFechas) {
    t.push(
      comentario(' Trabajo con fechas'),
      areaA('01 FECHA-TRABAJO.'),
      areaA('   05 FT-AAAA            PIC 9(4).'),
      areaA('   05 FT-MM              PIC 9(2).'),
      areaA('   05 FT-DD              PIC 9(2).'),
      areaA('77 FT-AA                 PIC 9(2).'),
      areaA('77 FT-VALIDA             PIC X(1).'),
      areaA('77 FT-Q                  PIC 9(4).'),
      areaA('77 FT-R                  PIC 9(4).'),
      areaA('77 FT-MAXDIA             PIC 9(2).'),
      areaA('77 TXT-FECHA             PIC X(10).'),
    );
    if (almacenamientosUsados.has('fecha:N8')) {
      t.push(
        areaA('01 NUM8-WS               PIC 9(8).'),
        areaA('01 NUM8-R REDEFINES NUM8-WS.'),
        areaA('   05 N8-AAAA            PIC 9(4).'),
        areaA('   05 N8-MM              PIC 9(2).'),
        areaA('   05 N8-DD              PIC 9(2).'),
      );
    }
    if (almacenamientosUsados.has('fecha:N6')) {
      t.push(
        areaA('01 NUM6-WS               PIC 9(6).'),
        areaA('01 NUM6-R REDEFINES NUM6-WS.'),
        areaA('   05 N6-AA              PIC 9(2).'),
        areaA('   05 N6-MM              PIC 9(2).'),
        areaA('   05 N6-DD              PIC 9(2).'),
      );
    }
  }
  if (hayHoras) {
    if (!hayFechas) {
      t.push(comentario(' Trabajo con horas'), areaA('77 FT-VALIDA             PIC X(1).'));
    }
    t.push(
      areaA('01 HORA-TRABAJO.'),
      areaA('   05 HT-HH              PIC 9(2).'),
      areaA('   05 HT-MI              PIC 9(2).'),
      areaA('   05 HT-SS              PIC 9(2).'),
      areaA('77 TXT-HORA              PIC X(8).'),
    );
    if (almacenamientosUsados.has('hora:N6')) {
      t.push(
        areaA('01 NUM6H-WS              PIC 9(6).'),
        areaA('01 NUM6H-R REDEFINES NUM6H-WS.'),
        areaA('   05 H6-HH              PIC 9(2).'),
        areaA('   05 H6-MI              PIC 9(2).'),
        areaA('   05 H6-SS              PIC 9(2).'),
      );
    }
    if (almacenamientosUsados.has('hora:N4')) {
      t.push(
        areaA('01 NUM4H-WS              PIC 9(4).'),
        areaA('01 NUM4H-R REDEFINES NUM4H-WS.'),
        areaA('   05 H4-HH              PIC 9(2).'),
        areaA('   05 H4-MI              PIC 9(2).'),
      );
    }
    if (almacenamientosUsados.has('hora:N8')) {
      t.push(
        areaA('01 NUM8H-WS              PIC 9(8).'),
        areaA('01 NUM8H-R REDEFINES NUM8H-WS.'),
        areaA('   05 H8-HH              PIC 9(2).'),
        areaA('   05 H8-MI              PIC 9(2).'),
        areaA('   05 H8-SS              PIC 9(2).'),
        areaA('   05 H8-CC              PIC 9(2).'),
      );
    }
  }
  if (hayFechas || hayHoras) t.push('');

  t.push(
    comentario(' Registro completo (campos del detalle)'),
    areaA('01 REGISTRO-WS.'),
    ...plan.detalle.map((c) => elemento('05', sufijo(c, 'WS'), pic(c))),
    '',
    comentario(' Llave del registro elegido'),
    areaA('01 LLAVE-WS.'),
    ...plan.llaves.map((c) => elemento('05', sufijo(c, 'LW'), pic(c))),
    '',
    comentario(' Fila de la lista (cursor C1)'),
    areaA('01 FILA-SQL.'),
    ...sqCampos.map((c) => elemento('05', sufijo(c, 'SQ'), pic(c))),
    '',
  );
  const numericosLista = d.columnasLista.filter((col) => !col.campo.fechaHora && col.campo.clase === 'N');
  if (numericosLista.length > 0) {
    t.push(comentario(' Numeros de la lista, editados'));
    for (const col of numericosLista) t.push(areaA(`77 ${sufijo(col.campo, 'ED').padEnd(21)}PIC ${picEditado(col.campo)}.`));
    t.push('');
  }
  t.push(
    comentario(' Lista completa en memoria: una linea por registro'),
    areaA(`77 ENCAB-LINEA            PIC X(${largoLinea}).`),
    areaA('01 TABLA-LISTA.'),
    areaA(`   05 FILA-LISTA OCCURS ${d.maxFilas} TIMES.`),
    elemento('10', 'FL-LINEA', `X(${largoLinea})`, 13),
    ...plan.llaves.map((c, i) => elemento('10', `FL-K${i + 1}`, pic(c), 13)),
    '',
  );
  if (d.desplaza) {
    t.push(
      comentario(' Donde empieza la linea que se ve en cada paso del desplazamiento'),
      areaA('01 TABLA-COLUMNAS.'),
      areaA(`   05 COL-POS OCCURS ${d.pasos.length} TIMES PIC 9(4).`),
      '',
    );
  }
  t.push(
    comentario(' Opciones escritas en la lista'),
    areaA('01 ARREGLO-SELECCION.'),
    areaA('   05 SEL-ENTRADA OCCURS 100 TIMES.'),
    elemento('10', 'SEL-OPC', 'X(1)', 13),
    ...plan.llaves.map((c, i) => elemento('10', `SEL-K${i + 1}`, pic(c), 13)),
    '',
  );
  const copias: Array<[string, boolean, boolean, boolean]> = [
    // formato, entrada, salida, indicadores
    [nom.control, true, true, true],
    [nom.sfl, true, true, false],
    [nom.mensaje, false, true, false],
    [nom.detalle, true, true, true],
    [nom.ayuda, true, true, false],
  ];
  for (const [f, entrada, salida, indicadores] of copias) {
    if (entrada) t.push(areaA(`01 ${f}-II.`), areaA(`   COPY DDS-${f}-I       OF ${dspf}.`));
    if (salida) t.push(areaA(`01 ${f}-OO.`), areaA(`   COPY DDS-${f}-O       OF ${dspf}.`));
    if (indicadores) t.push(areaA(`01 ${f}-IND.`), areaA(`   COPY DDS-${f}-INDIC   OF ${dspf}.`));
    t.push('');
  }

  // --- Procedimiento: control general ---
  const CTL = nom.control;
  const DET = nom.detalle;
  const SFL = nom.sfl;
  t.push(
    areaA('PROCEDURE DIVISION.'),
    comentario('-------------------'),
    // Sin un nombre de párrafo aquí, el compilador da LBL0345 (gravedad 20).
    areaA('PRINCIPAL.'),
    areaB('PERFORM INICIO'),
    areaB('PERFORM PROCESO UNTIL SALIR-WS = "S"'),
    areaB('PERFORM TERMINO'),
    areaB('GOBACK.'),
    comentario(),
    ...parrafo('INICIO'),
    areaB('OPEN I-O PANTALLA.'),
    ...[CTL, nom.mensaje, SFL, DET, nom.ayuda].flatMap((f) =>
      f === nom.mensaje ? vaciar(`${f}-OO`) : [...vaciar(`${f}-II`), ...vaciar(`${f}-OO`)],
    ),
    areaB('MOVE SPACES           TO SALIR-WS MENSAJE-WS ENCAB-LINEA'),
    areaB('MOVE ZEROES           TO MDTO CANT-FILAS'),
    areaB(`MOVE I-OFF            TO IN30 OF ${CTL}-O-INDIC`),
    areaB(`IN31 OF ${CTL}-O-INDIC`, 9),
    areaB(`IN32 OF ${CTL}-O-INDIC`, 9),
    areaB(`IN40 OF ${DET}-O-INDIC`, 9),
    areaB(`IN41 OF ${DET}-O-INDIC`, 9),
  );
  if (plan.posicionable) {
    t.push(areaB(`MOVE ${llave1.clase === 'A' ? 'SPACES' : 'ZEROES'}           TO POSICION-ANT-WS`));
  }
  if (d.desplaza) {
    d.pasos.forEach((paso, i) => t.push(areaB(`MOVE ${paso} TO COL-POS(${i + 1})`)));
  }
  for (const col of d.columnasLista) {
    const texto = ajustarEncabezado(col.campo.encabezado, col.anchoColumna);
    t.push(areaB(`MOVE "${texto}" TO ENCAB-LINEA(${col.pos}:${texto.length})`));
  }
  if (nom.ficticio) {
    t.push(comentario(' Registro ficticio: deja la pantalla de fondo para las ventanas'));
    t.push(areaB(`WRITE R-PANTALLA FORMAT "${nom.ficticio}" END-WRITE`));
  }
  t.push(areaB('PERFORM CARGAR-LISTA.'), comentario());

  // PROCESO: la lista y sus teclas.
  const ramas: string[] = [];
  const rama = (condicion: string, ...sentencias: string[]): void => {
    ramas.push(areaB(`WHEN ${condicion}`, 1), ...sentencias.map((s) => areaB(s, 2)));
  };
  const f = (a: AccionTecla): string => `F${tecla(a)?.numero}`;
  if (tecla('salir')) rama(f('salir'), 'MOVE "S" TO SALIR-WS');
  if (tecla('volver')) rama(f('volver'), 'MOVE "S" TO SALIR-WS');
  if (tecla('ayuda')) rama(f('ayuda'), 'PERFORM MUESTRA-AYUDA');
  if (tecla('renovar')) rama(f('renovar'), 'PERFORM CARGAR-LISTA');
  if (tecla('insertar')) rama(f('insertar'), 'PERFORM CREAR-REGISTRO', 'PERFORM CARGAR-LISTA');
  if (tecla('modificar') && plan.modificable) rama(f('modificar'), 'MOVE "M" TO MODO-WS', 'PERFORM ACCION-CURSOR');
  if (tecla('eliminar')) rama(f('eliminar'), 'MOVE "E" TO MODO-WS', 'PERFORM ACCION-CURSOR');
  if (d.desplaza && tecla('izquierda')) rama(f('izquierda'), 'PERFORM DESPLAZA-IZQUIERDA', 'PERFORM PINTA-LISTA');
  if (d.desplaza && tecla('derecha')) rama(f('derecha'), 'PERFORM DESPLAZA-DERECHA', 'PERFORM PINTA-LISTA');
  for (const k of personalizadas.filter((x) => x.donde !== 'detalle')) {
    rama(`F${k.numero}`, 'PERFORM REGISTRO-BAJO-CURSOR', `PERFORM ACCION-F${k.numero}`);
  }
  ramas.push(comentario(' Agregue aqui nuevas teclas: WHEN Fnn y PERFORM de su parrafo.'));
  const intro = ['PERFORM ATENDER-OPCIONES'];
  if (plan.posicionable) {
    intro.push(`IF POSICION OF ${CTL}-II NOT = POSICION-ANT-WS`, '   PERFORM CARGAR-LISTA', 'END-IF');
  }
  rama('INTRO', ...intro);
  rama('OTHER', 'CONTINUE');

  const escribirMensaje = [
    areaB(`WRITE R-PANTALLA FROM ${nom.mensaje}-OO FORMAT "${nom.mensaje}"`),
    areaB('END-WRITE', 7),
  ];
  const escribirControl = [
    areaB(`WRITE R-PANTALLA FROM ${CTL}-OO FORMAT "${CTL}"`),
    areaB(`INDICATORS ARE ${CTL}-O-INDIC END-WRITE`, 7),
  ];
  t.push(
    ...parrafo('PROCESO'),
    areaB(`MOVE MENSAJE-WS TO MENSAJE OF ${nom.mensaje}-OO`),
    areaB('MOVE SPACES     TO MENSAJE-WS'),
    // En ventanas el control va primero: FWC usa la ventana de WC (WINDOW(WC)).
    ...(nom.ficticio ? [...escribirControl, ...escribirMensaje] : [...escribirMensaje, ...escribirControl]),
    areaB(`READ  PANTALLA   INTO ${CTL}-II FORMAT "${CTL}"`),
    areaB(`INDICATORS ARE ${CTL}-I-INDIC END-READ`, 7),
  );
  if (plan.posicionable) t.push(areaB(`MOVE POSICION OF ${CTL}-II TO POSICION OF ${CTL}-OO`));
  t.push(areaB('EVALUATE TRUE'), ...ramas, areaB('END-EVALUATE.'), comentario());

  t.push(...parrafo('TERMINO'), areaB('CLOSE PANTALLA.'), comentario());

  // --- Lista ---
  const columnasSql = d.columnasLista.length === 0 ? [] : sqCampos.map(colSql);
  const cursorCols = listaConPrefijo(columnasSql, 'SELECT ', 55);
  const ordenar = listaConPrefijo(
    plan.llaves.map((k) => `${k.nombre}${k.descendente ? ' DESC' : ''}`),
    ' ORDER BY ',
    55,
  );
  t.push(...parrafo('CARGAR-LISTA'), areaB('MOVE ZEROES TO CANT-FILAS'));
  if (plan.posicionable) {
    t.push(
      areaB(`MOVE POSICION OF ${CTL}-II TO POSICION-WS`),
      areaB('MOVE POSICION-WS TO POSICION-ANT-WS'),
    );
  }
  t.push(
    areaB('EXEC SQL'),
    areaB('DECLARE C1 CURSOR FOR', 1),
    ...cursorCols.map((l) => areaB(l, 2)),
    areaB(`  FROM ${plan.tablaSql}`, 2),
  );
  if (plan.posicionable) t.push(areaB(` WHERE ${llave1.nombre} >= :POSICION-WS`, 2));
  t.push(
    ...ordenar.map((l) => areaB(l, 2)),
    areaB('END-EXEC'),
    areaB('EXEC SQL'),
    areaB('OPEN C1', 1),
    areaB('END-EXEC'),
    areaB('PERFORM LEER-FETCH-C1'),
    areaB('PERFORM UNTIL SQLCODE NOT = 0 OR CANT-FILAS >= MAX-FILAS'),
    areaB('ADD 1 TO CANT-FILAS', 1),
    areaB('PERFORM ARMA-FILA-LISTA', 1),
    areaB('PERFORM LEER-FETCH-C1', 1),
    areaB('END-PERFORM'),
    // Si el ciclo terminó con un registro leído, es que se llegó al tope y quedan más.
    areaB('IF SQLCODE = 0'),
    areaB('MOVE "S" TO HAY-MAS', 1),
    areaB('ELSE'),
    areaB('MOVE "N" TO HAY-MAS', 1),
    areaB('END-IF'),
    areaB('EXEC SQL'),
    areaB('CLOSE C1', 1),
    areaB('END-EXEC'),
    areaB('IF CANT-FILAS = 0 AND MENSAJE-WS = SPACES'),
    ...mover('No hay registros que mostrar.', 'MENSAJE-WS', 1),
    areaB('END-IF'),
    areaB('IF HAY-MAS = "S" AND MENSAJE-WS = SPACES'),
    ...mover(
      plan.posicionable
        ? `Se muestran ${d.maxFilas} registros: use Posicionar para ver otros.`
        : `Se muestran los primeros ${d.maxFilas} registros.`,
      'MENSAJE-WS',
      1,
    ),
    areaB('END-IF'),
    areaB('PERFORM PINTA-LISTA.'),
    comentario(),
    ...parrafo('LEER-FETCH-C1'),
    areaB('EXEC SQL'),
    areaB('FETCH NEXT FROM C1 INTO :FILA-SQL', 1),
    areaB('END-EXEC.'),
    comentario(),
  );

  // ARMA-FILA-LISTA: una línea con todas las columnas y las llaves.
  t.push(...parrafo('ARMA-FILA-LISTA'), areaB('MOVE SPACES TO FL-LINEA(CANT-FILAS)'));
  for (const col of d.columnasLista) {
    const c = col.campo;
    const destino = `FL-LINEA(CANT-FILAS)(${col.pos}:${col.ancho})`;
    if (c.fechaHora) {
      const txt = c.fechaHora.tipo === 'fecha' ? 'TXT-FECHA' : 'TXT-HORA';
      t.push(
        areaB(`MOVE ${sufijo(c, 'SQ')} TO ${sufijo(c, 'WS')}`),
        areaB(`PERFORM FMT-${c.nombrePantalla}`),
        areaB(`MOVE ${txt}(1:${col.ancho}) TO ${destino}`),
      );
    } else if (c.clase === 'N') {
      t.push(areaB(`MOVE ${sufijo(c, 'SQ')} TO ${sufijo(c, 'ED')}`), areaB(`MOVE ${sufijo(c, 'ED')} TO ${destino}`));
    } else {
      t.push(areaB(`MOVE ${sufijo(c, 'SQ')} TO ${destino}`));
    }
  }
  plan.llaves.forEach((c, i) => {
    t.push(areaB(`MOVE ${sufijo(c, 'SQ')} TO FL-K${i + 1}(CANT-FILAS)${i === plan.llaves.length - 1 ? '.' : ''}`));
  });
  t.push(comentario());

  // PINTA-LISTA: vuelve a escribir el subfile con las columnas visibles.
  t.push(
    ...parrafo('PINTA-LISTA'),
    areaB('PERFORM LIMPIA-SUBFILE'),
    areaB(`MOVE ENCAB-LINEA(OFFSET-WS:ANCHO-VIS) TO ENCAB OF ${CTL}-OO`),
    areaB('PERFORM VARYING I FROM 1 BY 1 UNTIL I > CANT-FILAS'),
    areaB(`MOVE SPACES TO OPCION OF ${SFL}-OO`, 1),
    areaB('MOVE FL-LINEA(I)(OFFSET-WS:ANCHO-VIS)', 1),
    areaB(`TO DETSFL OF ${SFL}-OO`, 4),
    ...plan.llaves.map((_, i) => areaB(`MOVE FL-K${i + 1}(I) TO ${nombreLlaveOculta(i)} OF ${SFL}-OO`, 1)),
    areaB('ADD 1 TO NREL', 1),
    areaB(`WRITE SUBFILE R-PANTALLA FROM ${SFL}-OO FORMAT "${SFL}"`, 1),
    // Sin INVALID KEY el compilador da LBL0412 (gravedad 20). La lista no pasa de SFLSIZ.
    areaB('INVALID KEY CONTINUE', 2),
    areaB('END-WRITE', 2),
    areaB('END-PERFORM'),
    areaB('IF NREL > 0'),
    areaB(`MOVE I-ON            TO IN30 OF ${CTL}-O-INDIC`, 1),
    areaB(`IN31 OF ${CTL}-O-INDIC`, 9),
    areaB(`MOVE I-OFF           TO IN32 OF ${CTL}-O-INDIC`, 1),
    areaB(`MOVE 1               TO POSCUR OF ${CTL}-OO`, 1),
    areaB('ELSE'),
    areaB(`MOVE I-ON            TO IN31 OF ${CTL}-O-INDIC`, 1),
    areaB(`MOVE I-OFF           TO IN30 OF ${CTL}-O-INDIC`, 1),
    areaB(`IN32 OF ${CTL}-O-INDIC`, 9),
    areaB('END-IF.'),
    comentario(),
    ...parrafo('LIMPIA-SUBFILE'),
    areaB(`MOVE I-ON            TO IN32 OF ${CTL}-O-INDIC`),
    areaB(`MOVE I-OFF           TO IN30 OF ${CTL}-O-INDIC`),
    areaB(`IN31 OF ${CTL}-O-INDIC`, 9),
    areaB('MOVE ZEROES          TO NREL'),
    areaB(`WRITE R-PANTALLA FROM ${CTL}-OO FORMAT "${CTL}"`),
    areaB(`INDICATORS ARE ${CTL}-O-INDIC END-WRITE.`, 7),
    comentario(),
  );

  if (d.desplaza) {
    t.push(
      ...parrafo('DESPLAZA-DERECHA'),
      areaB('IF COL-ACT < COL-CANT'),
      areaB('ADD 1 TO COL-ACT', 1),
      areaB('MOVE COL-POS(COL-ACT) TO OFFSET-WS', 1),
      areaB('END-IF.'),
      comentario(),
      ...parrafo('DESPLAZA-IZQUIERDA'),
      areaB('IF COL-ACT > 1'),
      areaB('SUBTRACT 1 FROM COL-ACT', 1),
      areaB('MOVE COL-POS(COL-ACT) TO OFFSET-WS', 1),
      areaB('END-IF.'),
      comentario(),
    );
  }

  // --- Opciones de la lista y teclas sobre el cursor ---
  const leerSeleccion = (nivel: number): string[] => [
    areaB(`READ SUBFILE PANTALLA NEXT MODIFIED INTO ${SFL}-II`, nivel),
    areaB(`FORMAT "${SFL}" END-READ`, nivel + 8),
  ];
  t.push(
    ...parrafo('ATENDER-OPCIONES'),
    areaB('MOVE ZEROES TO CANT-SEL'),
    ...leerSeleccion(0),
    areaB('PERFORM UNTIL FS-PANTALLA NOT = "00" OR CANT-SEL >= 100'),
    areaB(`IF OPCION OF ${SFL}-II NOT = SPACES`, 1),
    areaB('ADD 1 TO CANT-SEL', 2),
    areaB(`MOVE OPCION OF ${SFL}-II TO SEL-OPC(CANT-SEL)`, 2),
    ...plan.llaves.map((_, i) =>
      areaB(`MOVE ${nombreLlaveOculta(i)} OF ${SFL}-II TO SEL-K${i + 1}(CANT-SEL)`, 2),
    ),
    areaB('END-IF', 1),
    ...leerSeleccion(1),
    areaB('END-PERFORM'),
    areaB('IF CANT-SEL > 0'),
    areaB('PERFORM EJECUTA-OPCION VARYING I FROM 1 BY 1', 1),
    areaB('UNTIL I > CANT-SEL', 9),
    areaB('PERFORM CARGAR-LISTA', 1),
    areaB('END-IF.'),
    comentario(),
    ...parrafo('EJECUTA-OPCION'),
    ...plan.llaves.map((c, i) => areaB(`MOVE SEL-K${i + 1}(I) TO ${sufijo(c, 'LW')}`)),
    areaB('EVALUATE SEL-OPC(I)'),
    areaB('WHEN "2"', 1),
    ...(plan.modificable
      ? [areaB('MOVE "M" TO MODO-WS', 2), areaB('PERFORM ABRIR-REGISTRO', 2)]
      : [...mover('Tabla solo de llaves: no se puede modificar.', 'MENSAJE-WS', 2)]),
    areaB('WHEN "4"', 1),
    areaB('MOVE "E" TO MODO-WS', 2),
    areaB('PERFORM ABRIR-REGISTRO', 2),
    areaB('WHEN "5"', 1),
    areaB('MOVE "C" TO MODO-WS', 2),
    areaB('PERFORM ABRIR-REGISTRO', 2),
    areaB('WHEN OTHER', 1),
    ...mover('Opcion no valida: use 2, 4 o 5.', 'MENSAJE-WS', 2),
    areaB('END-EVALUATE.'),
    comentario(),
    ...parrafo('REGISTRO-BAJO-CURSOR'),
    areaB('MOVE "N" TO HAY-REG'),
    areaB(`IF REGREL OF ${CTL}-II > 0`),
    areaB(`AND REGREL OF ${CTL}-II <= CANT-FILAS`, 2),
    areaB(`MOVE REGREL OF ${CTL}-II TO I`, 1),
    ...plan.llaves.map((c, i) => areaB(`MOVE FL-K${i + 1}(I) TO ${sufijo(c, 'LW')}`, 1)),
    areaB('MOVE "S" TO HAY-REG', 1),
    areaB('ELSE'),
    ...mover('Ubique el cursor sobre un registro.', 'MENSAJE-WS', 1),
    areaB('END-IF.'),
    comentario(),
    ...parrafo('ACCION-CURSOR'),
    areaB('PERFORM REGISTRO-BAJO-CURSOR'),
    areaB('IF HAY-REG = "S"'),
    areaB('PERFORM ABRIR-REGISTRO', 1),
    areaB('PERFORM CARGAR-LISTA', 1),
    areaB('END-IF.'),
    comentario(),
  );

  // --- Leer un registro y mostrar el detalle ---
  const columnasDetalle = plan.detalle.map(colSql);
  t.push(
    ...parrafo('LEE-REGISTRO'),
    areaB('EXEC SQL'),
    ...listaConPrefijo(columnasDetalle, 'SELECT ', 58).map((l) => areaB(l, 1)),
    areaB('  INTO :REGISTRO-WS', 1),
    areaB(`  FROM ${plan.tablaSql}`, 1),
    ...plan.llaves.map((k, i) =>
      areaB(`${i === 0 ? ' WHERE' : '   AND'} ${k.nombre} = ${valorSql(k, `:${sufijo(k, 'LW')}`)}`, 1),
    ),
    areaB('END-EXEC.'),
    comentario(),
    ...parrafo('ABRIR-REGISTRO'),
    areaB('PERFORM LEE-REGISTRO'),
    areaB('IF SQLCODE = 0'),
    areaB('PERFORM REGISTRO-A-PANTALLA', 1),
    areaB('PERFORM MOSTRAR-DETALLE', 1),
    areaB('ELSE'),
    areaB('IF SQLCODE = 100', 1),
    ...mover('El registro ya no existe.', 'MENSAJE-WS', 2),
    areaB('ELSE', 1),
    areaB('PERFORM ARMA-ERROR-SQL', 2),
    areaB('END-IF', 1),
    areaB('END-IF.'),
    comentario(),
    ...parrafo('CREAR-REGISTRO'),
    areaB('MOVE "A" TO MODO-WS'),
    ...vaciar('REGISTRO-WS'),
    areaB('PERFORM REGISTRO-A-PANTALLA'),
    areaB('PERFORM MOSTRAR-DETALLE.'),
    comentario(),
  );

  // CONFIGURA-DETALLE: indicadores, título y leyenda según el modo.
  const modoConfig = (m: ModoDetalle): string[] => {
    const lineas: string[] = [areaB(`WHEN "${m}"`, 1)];
    if (m === 'M') lineas.push(areaB(`MOVE I-ON TO IN41 OF ${DET}-O-INDIC`, 2));
    if (m === 'C' || m === 'E') lineas.push(areaB(`MOVE I-ON TO IN40 OF ${DET}-O-INDIC`, 2));
    lineas.push(...mover(TITULO_MODO[m], `TITULO OF ${DET}-OO`, 2));
    const leyendas = d.leyendasDetalle[m];
    for (let i = 0; i < d.nLineasLeyendaDetalle; i++) {
      lineas.push(...mover(leyendas[i] ?? '', `${i === 0 ? 'LEYENDA' : 'LEYENDA2'} OF ${DET}-OO`, 2));
    }
    return lineas;
  };
  t.push(
    ...parrafo('CONFIGURA-DETALLE'),
    areaB(`MOVE I-OFF TO IN40 OF ${DET}-O-INDIC`),
    areaB(`IN41 OF ${DET}-O-INDIC`, 6),
    ...apagarErrores(plan, DET, 6),
    areaB('EVALUATE MODO-WS'),
    ...MODOS.flatMap(modoConfig),
    areaB('END-EVALUATE.'),
    comentario(),
  );

  // MOSTRAR-DETALLE: las teclas del detalle.
  const ramasDet: string[] = [];
  const ramaDet = (condicion: string, ...sentencias: string[]): void => {
    ramasDet.push(areaB(`WHEN ${condicion}`, 2), ...sentencias.map((s) => areaB(s, 3)));
  };
  if (tecla('salir')) ramaDet(f('salir'), 'MOVE "S" TO SALIR-DT SALIR-WS');
  if (tecla('volver')) ramaDet(f('volver'), 'MOVE "S" TO SALIR-DT');
  if (tecla('ayuda')) ramaDet(f('ayuda'), 'PERFORM MUESTRA-AYUDA');
  if (tecla('renovar')) ramaDet(f('renovar'), 'PERFORM RENOVAR-DETALLE');
  if (tecla('ayudaCampo') && plan.ayudas.length > 0) {
    ramaDet(f('ayudaCampo'), 'IF MODO-WS = "A" OR MODO-WS = "M"', '   PERFORM AYUDA-CAMPO', 'END-IF');
  }
  if (tecla('modificar') && plan.modificable) {
    ramaDet(f('modificar'), 'IF MODO-WS = "C"', '   MOVE "M" TO MODO-WS', '   PERFORM CONFIGURA-DETALLE', 'END-IF');
  }
  if (tecla('grabar')) {
    ramaDet(
      f('grabar'),
      plan.modificable ? 'IF MODO-WS = "A" OR MODO-WS = "M"' : 'IF MODO-WS = "A"',
      '   PERFORM GRABAR-DETALLE',
      'END-IF',
    );
  }
  if (tecla('eliminar')) {
    ramaDet(
      f('eliminar'),
      'IF MODO-WS = "E"',
      '   PERFORM ELIMINAR-REGISTRO',
      'ELSE',
      '   IF MODO-WS NOT = "A"',
      '      MOVE "E" TO MODO-WS',
      '      PERFORM CONFIGURA-DETALLE',
      '   END-IF',
      'END-IF',
    );
  }
  for (const k of personalizadas.filter((x) => x.donde !== 'lista')) ramaDet(`F${k.numero}`, `PERFORM ACCION-F${k.numero}`);
  ramasDet.push(comentario(' Agregue aqui nuevas teclas: WHEN Fnn y PERFORM de su parrafo.'));
  ramaDet('OTHER', 'IF MODO-WS = "A" OR MODO-WS = "M"', '   PERFORM PANTALLA-A-REGISTRO', '   PERFORM REGISTRO-A-PANTALLA', 'END-IF');

  t.push(
    ...parrafo('MOSTRAR-DETALLE'),
    areaB('PERFORM CONFIGURA-DETALLE'),
    areaB('MOVE "N" TO SALIR-DT'),
    areaB('PERFORM UNTIL SALIR-DT = "S"'),
    areaB(`MOVE MENSAJE-WS TO MENSAJE OF ${DET}-OO`, 1),
    areaB('MOVE SPACES     TO MENSAJE-WS', 1),
    areaB(`WRITE R-PANTALLA FROM ${DET}-OO FORMAT "${DET}"`, 1),
    areaB(`INDICATORS ARE ${DET}-O-INDIC END-WRITE`, 8),
    areaB(`READ  PANTALLA   INTO ${DET}-II FORMAT "${DET}"`, 1),
    areaB(`INDICATORS ARE ${DET}-I-INDIC END-READ`, 8),
    areaB('EVALUATE TRUE', 1),
    ...ramasDet,
    areaB('END-EVALUATE', 1),
    areaB('END-PERFORM'),
    areaB('MOVE ZEROES TO MDTO.'),
    comentario(),
    ...parrafo('RENOVAR-DETALLE'),
    areaB('IF MODO-WS = "A"'),
    ...vaciar('REGISTRO-WS', 1),
    areaB('ELSE'),
    areaB('PERFORM LEE-REGISTRO', 1),
    areaB('END-IF'),
    areaB('PERFORM REGISTRO-A-PANTALLA.'),
    comentario(),
    ...parrafo('GRABAR-DETALLE'),
    areaB('PERFORM PANTALLA-A-REGISTRO'),
    areaB('PERFORM VALIDAR-DETALLE'),
    areaB('IF ERROR-WS = "N"'),
    areaB('IF MODO-WS = "A"', 1),
    areaB('PERFORM GRABAR-ALTA', 2),
    ...(plan.modificable ? [areaB('ELSE', 1), areaB('PERFORM GRABAR-MODIFICACION', 2)] : []),
    areaB('END-IF', 1),
    areaB('END-IF.'),
    comentario(),
  );

  // --- Grabar, modificar y eliminar ---
  const errorSql = (nivel: number): string[] => [areaB('PERFORM ARMA-ERROR-SQL', nivel)];
  const columnasInsert = [...columnasDetalle.map((_, i) => plan.detalle[i].nombre), ...plan.alAgregar.map((v) => v.columna)];
  const valoresInsert = [
    ...plan.detalle.map((c) => valorSql(c, `:${sufijo(c, 'WS')}`)),
    ...plan.alAgregar.map((v) => v.expresion),
  ];
  const asignaciones = [
    ...noLlave.map((c) => `${c.nombre} = ${valorSql(c, `:${sufijo(c, 'WS')}`)}`),
    ...plan.alModificar.map((v) => `${v.columna} = ${v.expresion}`),
  ];
  const condicionLlave = (): string[] =>
    plan.llaves.map((k, i) => areaB(`${i === 0 ? ' WHERE' : '   AND'} ${k.nombre} = ${valorSql(k, `:${sufijo(k, 'LW')}`)}`, 1));

  t.push(
    // Las llaves vacías (o en 0) las detiene VALIDAR-DETALLE antes de llegar aquí.
    ...parrafo('GRABAR-ALTA'),
    areaB('EXEC SQL'),
    areaB(`INSERT INTO ${plan.tablaSql}`, 1),
    ...listaConPrefijo(columnasInsert, '       (', 55, ')').map((l) => areaB(l, 1)),
    ...listaConPrefijo(valoresInsert, 'VALUES (', 55, ')').map((l) => areaB(l, 1)),
    areaB('END-EXEC'),
    areaB('IF SQLCODE = 0'),
    areaB('MOVE "S" TO SALIR-DT', 1),
    ...mover('Registro agregado.', 'MENSAJE-WS', 1),
    areaB('ELSE'),
    areaB('IF SQLCODE = -803', 1),
    ...mover('Ya existe un registro con esa llave.', 'MENSAJE-WS', 2),
    areaB('ELSE', 1),
    ...errorSql(2),
    areaB('END-IF', 1),
    areaB('END-IF.'),
    comentario(),
  );
  if (plan.modificable) {
    t.push(
      ...parrafo('GRABAR-MODIFICACION'),
      areaB('EXEC SQL'),
      areaB(`UPDATE ${plan.tablaSql}`, 1),
      ...listaConPrefijo(asignaciones, '   SET ', 58).map((l) => areaB(l, 1)),
      ...condicionLlave(),
      areaB('END-EXEC'),
      areaB('IF SQLCODE = 0'),
      areaB('MOVE "S" TO SALIR-DT', 1),
      ...mover('Registro modificado.', 'MENSAJE-WS', 1),
      areaB('ELSE'),
      areaB('IF SQLCODE = 100', 1),
      areaB('MOVE "S" TO SALIR-DT', 2),
      ...mover('El registro ya no existe.', 'MENSAJE-WS', 2),
      areaB('ELSE', 1),
      ...errorSql(2),
      areaB('END-IF', 1),
      areaB('END-IF.'),
      comentario(),
    );
  }
  t.push(
    ...parrafo('ELIMINAR-REGISTRO'),
    areaB('EXEC SQL'),
    areaB(`DELETE FROM ${plan.tablaSql}`, 1),
    ...condicionLlave(),
    areaB('END-EXEC'),
    areaB('IF SQLCODE = 0'),
    areaB('MOVE "S" TO SALIR-DT', 1),
    ...mover('Registro eliminado.', 'MENSAJE-WS', 1),
    areaB('ELSE'),
    areaB('IF SQLCODE = 100', 1),
    areaB('MOVE "S" TO SALIR-DT', 2),
    ...mover('El registro ya no existe.', 'MENSAJE-WS', 2),
    areaB('ELSE', 1),
    ...errorSql(2),
    areaB('END-IF', 1),
    areaB('END-IF.'),
    comentario(),
    ...parrafo('ARMA-ERROR-SQL'),
    areaB('MOVE SQLCODE TO SQLCODE-ED'),
    areaB('MOVE SPACES  TO MENSAJE-WS'),
    areaB('STRING "Error SQL " SQLCODE-ED DELIMITED BY SIZE'),
    areaB('INTO MENSAJE-WS', 7),
    areaB('END-STRING.'),
    comentario(),
  );

  // --- Registro <-> pantalla ---
  const aPantalla = (c: CampoCrud, ultimo: boolean): string[] => {
    const fin = ultimo ? '.' : '';
    if (c.fechaHora) {
      const txt = c.fechaHora.tipo === 'fecha' ? 'TXT-FECHA' : 'TXT-HORA';
      return [
        areaB(`PERFORM FMT-${c.nombrePantalla}`),
        areaB(`MOVE ${txt}(1:${c.pantalla.longitud}) TO ${c.nombrePantalla} OF ${DET}-OO${fin}`),
      ];
    }
    return [areaB(`MOVE ${sufijo(c, 'WS')} TO ${c.nombrePantalla} OF ${DET}-OO${fin}`)];
  };
  const dePantalla = (c: CampoCrud, ultimo: boolean): string[] => {
    const fin = ultimo ? '.' : '';
    if (c.fechaHora) return [areaB(`PERFORM PRS-${c.nombrePantalla}${fin}`)];
    return [areaB(`MOVE ${c.nombrePantalla} OF ${DET}-II TO ${sufijo(c, 'WS')}${fin}`)];
  };
  t.push(
    ...parrafo('REGISTRO-A-PANTALLA'),
    ...plan.detalle.flatMap((c, i, todos) => aPantalla(c, i === todos.length - 1)),
    comentario(),
    ...parrafo('PANTALLA-A-REGISTRO'),
    areaB('MOVE "N" TO ERROR-WS'),
    ...apagarTodosLosErrores(plan, DET),
    ...plan.detalle.flatMap((c, i, todos) => dePantalla(c, i === todos.length - 1)),
    comentario(),
  );
  for (const c of camposFechaHora) {
    t.push(...parrafosFechaHora(c, DET, plan.validaciones.find((v) => v.campo === c)?.indicador ?? null));
  }
  t.push(...parrafosValidacion(plan, DET));
  if (hayFechas) {
    t.push(
      ...parrafo('VALIDA-FECHA'),
      areaB('MOVE "S" TO FT-VALIDA'),
      areaB('IF FT-MM < 1 OR FT-MM > 12'),
      areaB('OR FT-DD < 1 OR FT-AAAA < 1', 2),
      areaB('MOVE "N" TO FT-VALIDA', 1),
      areaB('ELSE'),
      areaB('EVALUATE FT-MM', 1),
      areaB('WHEN 4', 2),
      areaB('WHEN 6', 2),
      areaB('WHEN 9', 2),
      areaB('WHEN 11', 2),
      areaB('MOVE 30 TO FT-MAXDIA', 3),
      areaB('WHEN 2', 2),
      areaB('MOVE 28 TO FT-MAXDIA', 3),
      areaB('DIVIDE FT-AAAA BY 4 GIVING FT-Q', 3),
      areaB('REMAINDER FT-R', 10),
      areaB('IF FT-R = 0', 3),
      areaB('MOVE 29 TO FT-MAXDIA', 4),
      areaB('DIVIDE FT-AAAA BY 100 GIVING FT-Q', 4),
      areaB('REMAINDER FT-R', 11),
      areaB('IF FT-R = 0', 4),
      areaB('DIVIDE FT-AAAA BY 400 GIVING FT-Q', 5),
      areaB('REMAINDER FT-R', 12),
      areaB('IF FT-R NOT = 0', 5),
      areaB('MOVE 28 TO FT-MAXDIA', 6),
      areaB('END-IF', 5),
      areaB('END-IF', 4),
      areaB('END-IF', 3),
      areaB('WHEN OTHER', 2),
      areaB('MOVE 31 TO FT-MAXDIA', 3),
      areaB('END-EVALUATE', 1),
      areaB('IF FT-DD > FT-MAXDIA', 1),
      areaB('MOVE "N" TO FT-VALIDA', 2),
      areaB('END-IF', 1),
      areaB('END-IF.'),
      comentario(),
    );
  }
  if (hayHoras) {
    t.push(
      ...parrafo('VALIDA-HORA'),
      areaB('MOVE "S" TO FT-VALIDA'),
      areaB('IF HT-HH > 23 OR HT-MI > 59 OR HT-SS > 59'),
      areaB('MOVE "N" TO FT-VALIDA', 1),
      areaB('END-IF.'),
      comentario(),
    );
  }

  // --- Ayuda ---
  t.push(
    ...parrafo('MUESTRA-AYUDA'),
    areaB(`MOVE SPACES TO PAUSA OF ${nom.ayuda}-OO`),
    areaB(`WRITE R-PANTALLA FROM ${nom.ayuda}-OO FORMAT "${nom.ayuda}"`),
    areaB('END-WRITE', 7),
    areaB(`READ  PANTALLA   INTO ${nom.ayuda}-II FORMAT "${nom.ayuda}"`),
    areaB('END-READ', 7),
    areaB('MOVE ZEROES TO MDTO.'),
    comentario(),
  );

  // --- Ayuda de campo: qué campo tiene el cursor y el párrafo de cada ayuda ---
  if (plan.ayudas.length > 0) {
    t.push(
      ...parrafo('AYUDA-CAMPO'),
      comentario(' Ayuda de campo: llama al parrafo del campo donde esta el cursor.'),
      areaB('PERFORM PANTALLA-A-REGISTRO'),
      areaB(`EVALUATE FLDNAM OF ${DET}-II`),
      ...plan.ayudas.flatMap((a) => {
        const llamada = areaB(`PERFORM ${a.parrafo}`, a.campo.llave ? 3 : 2);
        return [
          areaB(`WHEN "${a.campo.nombrePantalla}"`, 1),
          // Una llave solo se puede escribir al agregar.
          ...(a.campo.llave ? [areaB('IF MODO-WS = "A"', 2), llamada, areaB('END-IF', 2)] : [llamada]),
        ];
      }),
      areaB('WHEN OTHER', 1),
      ...mover('Este campo no tiene ayuda.', 'MENSAJE-WS', 2),
      areaB('END-EVALUATE'),
      areaB('PERFORM REGISTRO-A-PANTALLA.'),
      comentario(),
    );
    for (const a of plan.ayudas) t.push(...parrafoAyuda(a));
  }

  // --- Teclas personalizadas: párrafos para completar ---
  for (const k of personalizadas) {
    t.push(
      ...parrafo(`ACCION-F${k.numero}`),
      comentario(` Tecla F${k.numero} (${k.texto}): escriba aqui lo que debe hacer.`),
      comentario(` Disponibles: MODO-WS, REGISTRO-WS y LLAVE-WS (la llave del`),
      comentario(` registro bajo el cursor o del que se esta viendo), HAY-REG`),
      comentario(` ("S" si hay registro bajo el cursor) y MENSAJE-WS para avisar.`),
      areaB('CONTINUE.'),
      comentario(),
    );
  }

  return t.map((l) => l.trimEnd()).join('\n') + '\n';
}
