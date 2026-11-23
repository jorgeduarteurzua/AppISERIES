/**
 * Programa COBOL que atiende una pantalla cualquiera (formato fijo, columnas 8 a 72).
 *
 * - Esqueleto: la pantalla por WORKSTATION con CONTROL-AREA, las copias DDS de cada formato,
 *   un párrafo MOSTRAR-<formato> por formato con su ciclo de teclas, y por cada subfile su carga
 *   (CARGAR-<sfl>) y la lectura de las opciones (PROCESAR-<sfl>). Cada tecla deja un párrafo para
 *   completar. Se parte por el formato que se elija.
 * - Acceso a los datos: los campos con REFFLD(CAMPO ARCHIVO) se leen y graban en ese archivo,
 *   con E/S nativa de COBOL (CBL, CBLLE) o con SQL incorporado (SQLCBL, SQLCBLLE), según el tipo.
 *   En un formato normal se lee por la llave del archivo (si la pantalla tiene sus campos);
 *   en un subfile se cargan los registros del archivo.
 */
import { archivoDeReferencia, camposDelArchivo } from '../edicion/camposDeArchivo';
import type { CampoDeArchivo, ResolverArchivo } from '../edicion/camposDeArchivo';
import type { Campo, IndicadorCond, Keyword, PantallaDSPF, Registro } from '../modelo/pantalla';
import { parametroDe } from '../tablas/modelo';

export type TipoProgramaPantalla = 'CBL' | 'CBLLE' | 'SQLCBL' | 'SQLCBLLE';

export interface OpcionesProgramaPantalla {
  nombrePrograma: string;
  /** Miembro de la pantalla (DSPF). */
  nombrePantalla: string;
  tipo: TipoProgramaPantalla;
  autor: string;
  /** Formato por el que parte el programa (un formato normal o el control de un subfile). */
  formatoInicial: string;
  /** Biblioteca de los archivos en el SQL (vacío = lista de bibliotecas). */
  bibliotecaDatos?: string;
  resolverArchivo?: ResolverArchivo;
}

export interface ResultadoProgramaPantalla {
  cobol: string;
  advertencias: string[];
}

// --- Formato fijo ---
const areaA = (t: string): string => `       ${t}`;
const areaB = (t: string, nivel = 0): string => `           ${'   '.repeat(nivel)}${t}`;
const comentario = (t = ''): string => `      *${t}`;
const parrafo = (nombre: string): string[] => [areaA(`${nombre}.`), comentario('-'.repeat(nombre.length))];
const RE_NOMBRE = /^[A-Z$#@][A-Z0-9$#@_]{0,9}$/;

/** Reparte palabras en líneas del área B sin pasar de la columna 72. */
function envolver(palabras: string[], nivel: number, primera = ''): string[] {
  const ancho = 72 - 11 - nivel * 3;
  const lineas: string[] = [];
  let actual = primera;
  for (const p of palabras) {
    if (actual !== '' && actual.length + 1 + p.length > ancho) {
      lineas.push(actual);
      actual = `   ${p}`;
    } else actual = actual === '' ? p : `${actual} ${p}`;
  }
  if (actual !== '') lineas.push(actual);
  return lineas.map((l) => areaB(l, nivel));
}

const usoEntrada = (c: Campo) => c.uso === 'entrada' || c.uso === 'ambos' || c.uso === 'oculto';
const usoSalida = (c: Campo) => c.uso === 'salida' || c.uso === 'ambos' || c.uso === 'oculto' || c.uso === 'programa';
const camposDe = (r: Registro): Campo[] => r.elementos.filter((e): e is Campo => e.tipo === 'campo' && !e.sistema && e.nombre !== '');

function indicadoresDe(r: Registro): number[] {
  const n = new Set<number>();
  const agregar = (l: IndicadorCond[], a?: IndicadorCond[][]) => {
    for (const i of l) n.add(i.numero);
    for (const g of a ?? []) for (const i of g) n.add(i.numero);
  };
  agregar(r.indicadores, r.alternativas);
  for (const k of r.keywords) agregar(k.indicadores, k.alternativas);
  for (const e of r.elementos) {
    agregar(e.indicadores, e.alternativas);
    if (e.tipo === 'campo') for (const k of e.keywords) agregar(k.indicadores, k.alternativas);
  }
  return [...n].sort((a, b) => a - b);
}

/** Indicador que condiciona una keyword del registro (sin negar), o null. */
function indicadorDe(r: Registro, nombre: string): IndicadorCond | null {
  const k = r.keywords.find((x: Keyword) => x.nombre === nombre);
  return k?.indicadores[0] ?? null;
}

/** PIC de una variable de trabajo para un campo del archivo. */
function picDe(c: CampoDeArchivo): string {
  if (c.tipo === 'L') return 'X(10)';
  if (c.tipo === 'T') return 'X(8)';
  if (c.tipo === 'Z') return 'X(26)';
  if (c.tipo === 'A' || c.tipo === '') return `X(${c.longitud})`;
  const enteros = c.longitud - c.decimales;
  if (c.decimales === 0) return `S9(${c.longitud})`;
  return enteros > 0 ? `S9(${enteros})V9(${c.decimales})` : `SV9(${c.decimales})`;
}

/** Uso de un archivo en un formato: los campos de la pantalla que vienen de él. */
interface UsoArchivo {
  archivo: string;
  registro: Registro;
  /** Campo de la pantalla y el campo del archivo del que viene. */
  campos: Array<{ pantalla: Campo; archivo: CampoDeArchivo }>;
  llaves: CampoDeArchivo[];
}

export function generarProgramaPantalla(p: PantallaDSPF, op: OpcionesProgramaPantalla): ResultadoProgramaPantalla {
  const adv: string[] = [];
  const programa = op.nombrePrograma.trim().toUpperCase();
  const dspf = op.nombrePantalla.trim().toUpperCase();
  if (!RE_NOMBRE.test(programa)) throw new Error('El nombre del programa no es válido (máximo 10 caracteres: A-Z, 0-9, $ # @ _).');
  if (!RE_NOMBRE.test(dspf)) throw new Error('El nombre de la pantalla no es válido.');
  const sql = op.tipo === 'SQLCBL' || op.tipo === 'SQLCBLLE';
  const indara = p.keywordsArchivo.some((k) => k.nombre === 'INDARA');
  if (!indara) adv.push('La pantalla no tiene INDARA: el programa no maneja indicadores. Se recomienda agregar INDARA a la pantalla.');

  const formatos = p.registros.filter((r) => r.clase !== 'subfile');
  const inicial = formatos.find((r) => r.nombre.toUpperCase() === op.formatoInicial.toUpperCase());
  if (!inicial) throw new Error(`El formato ${op.formatoInicial} no está en la pantalla (debe ser un formato normal o el control de un subfile).`);
  const sflDe = (c: Registro): Registro | null =>
    c.clase === 'control-subfile' ? (p.registros.find((r) => r.clase === 'subfile' && r.nombre === c.subfileControlado) ?? null) : null;

  // Formatos que solo se escriben (sin entrada, con OVERLAY): mensajes y teclas.
  const soloEscritura = (r: Registro) =>
    r.clase === 'normal' && r !== inicial && camposDe(r).every((c) => !usoEntrada(c)) && r.keywords.some((k) => k.nombre === 'OVERLAY');
  const tieneEntrada = (r: Registro) => camposDe(r).some(usoEntrada);
  const tieneSalida = (r: Registro) => camposDe(r).some(usoSalida);
  const conIndicadores = (r: Registro) => indara && indicadoresDe(r).length > 0;

  // --- Archivos de los campos con REFFLD ---
  const usos: UsoArchivo[] = [];
  const archivos = new Map<string, CampoDeArchivo[]>();
  const unicos = new Set<string>();
  for (const r of p.registros) {
    const porArchivo = new Map<string, Campo[]>();
    for (const c of camposDe(r)) {
      const ref = archivoDeReferencia(c);
      if (!ref) continue;
      porArchivo.set(ref.archivo, [...(porArchivo.get(ref.archivo) ?? []), c]);
    }
    for (const [archivo, campos] of porArchivo) {
      if (!RE_NOMBRE.test(archivo)) continue;
      const tabla = op.resolverArchivo?.(archivo) ?? null;
      if (!tabla) {
        adv.push(`El archivo ${archivo} (de los campos de ${r.nombre}) no está abierto en Tablas: no se genera su acceso.`);
        continue;
      }
      const deArchivo = camposDelArchivo(tabla, op.resolverArchivo);
      archivos.set(archivo, deArchivo);
      if (tabla.keywords.some((k) => k.nombre === 'UNIQUE')) unicos.add(archivo);
      const pares = campos.flatMap((c) => {
        const ref = archivoDeReferencia(c)!;
        const a = deArchivo.find((x) => x.nombre === ref.campo);
        if (!a) adv.push(`El campo ${ref.campo} no está en ${archivo}.`);
        return a ? [{ pantalla: c, archivo: a }] : [];
      });
      usos.push({ archivo, registro: r, campos: pares, llaves: deArchivo.filter((x) => x.llave) });
    }
  }
  const usoDe = (r: Registro) => usos.filter((u) => u.registro === r);
  const tablaSql = (a: string) => (op.bibliotecaDatos?.trim() ? `${op.bibliotecaDatos.trim().toUpperCase()}/${a}` : a);
  const hv = (c: CampoDeArchivo, a: string) => `${c.nombre}-${a}`.slice(0, 30);

  const teclas = [...p.teclasFuncion].sort((a, b) => a.numero - b.numero);
  const hayTecla = (n: number) => teclas.some((t) => t.numero === n);

  const t: string[] = [];
  // --- Identificación y entorno ---
  t.push(
    areaA('IDENTIFICATION DIVISION.'),
    comentario('------------------------'),
    areaA(`PROGRAM-ID.  ${programa}.`),
    areaA(`AUTHOR. ${(op.autor.trim() || 'APPISERIES').toUpperCase().replace(/[^A-Z0-9 ]/g, '')}.`),
    comentario(` Programa de la pantalla ${dspf}. Generado por AppISERIES.`),
    comentario(sql ? ' COBOL con SQL: compilar con COMMIT(*NONE).' : ' COBOL con E/S nativa.'),
    areaA('ENVIRONMENT DIVISION.'),
    areaA('CONFIGURATION SECTION.'),
    areaA('SOURCE-COMPUTER.  IBM-AS400.'),
    areaA('OBJECT-COMPUTER.  IBM-AS400.'),
    areaA('INPUT-OUTPUT SECTION.'),
    areaA('FILE-CONTROL.'),
    comentario('-------------'),
    areaB(`SELECT PANTALLA   ASSIGN        TO WORKSTATION-${dspf}-SI`),
    areaB('ORGANIZATION  IS TRANSACTION', 6),
    areaB('ACCESS MODE   IS DYNAMIC', 6),
    areaB('RELATIVE KEY  IS NREL', 6),
    areaB('CONTROL-AREA  IS AREA-CONTROL', 6),
    areaB('FILE STATUS   IS FS-PANTALLA.', 6),
  );
  if (!sql) {
    for (const a of archivos.keys()) {
      t.push(
        areaB(`SELECT ${a.padEnd(10)} ASSIGN        TO DATABASE-${a}`),
        areaB('ORGANIZATION  IS INDEXED', 6),
        areaB('ACCESS MODE   IS DYNAMIC', 6),
        areaB('RECORD KEY    IS EXTERNALLY-DESCRIBED-KEY', 6),
        ...(unicos.has(a) ? [] : [areaB('WITH DUPLICATES', 9)]),
        areaB(`FILE STATUS   IS FS-${a}.`, 6),
      );
    }
  }
  t.push(
    areaA('DATA DIVISION.'),
    areaA('FILE SECTION.'),
    comentario('-------------'),
    areaA('FD  PANTALLA LABEL RECORD STANDARD.'),
    areaA(`01  R-PANTALLA           PIC X(${p.tamano.filas * p.tamano.columnas}).`),
  );
  if (!sql) {
    for (const a of archivos.keys()) {
      t.push(areaA(`FD  ${a} LABEL RECORD STANDARD.`), areaA(`01  REG-${a}.`), areaB(`COPY DDS-ALL-FORMATS OF ${a}.`));
    }
  }
  t.push(
    areaA('WORKING-STORAGE SECTION.'),
    comentario('-----------------------'),
    areaA('77 NREL                  PIC 9(4).'),
    areaA('77 SALIR-WS              PIC X(1).'),
    areaA('77 HAY-REG               PIC X(1).'),
    areaA('77 MENSAJE-WS            PIC X(78).'),
    areaA('77 I-ON                  PIC 1 VALUE B"1".'),
    areaA('77 I-OFF                 PIC 1 VALUE B"0".'),
    ...formatos.filter((r) => !soloEscritura(r)).map((r) => areaA(`77 ${`FIN-${r.nombre}`.padEnd(21)} PIC X(1).`)),
  );
  if (sql) {
    t.push(areaA('77 SQLCODE-ED            PIC -(8)9.'), areaB('EXEC SQL'), areaB('INCLUDE SQLCA', 1), areaB('END-EXEC.'));
    for (const [a, campos] of archivos) {
      t.push(comentario(` Variables de ${a}`), areaA(`01 ${a}-WS.`));
      for (const c of campos) t.push(areaA(`   05 ${hv(c, a).padEnd(25)} PIC ${picDe(c)}.`));
    }
  }
  t.push(
    areaA('01 WS-ESTADOS.'),
    areaA('   05 FS-PANTALLA         PIC X(02) VALUE "00".'),
    ...(sql ? [] : [...archivos.keys()].map((a) => areaA(`   05 ${`FS-${a}`.padEnd(18)} PIC X(02) VALUE "00".`))),
    areaA('01 AREA-CONTROL.'),
    areaA('   05 MDTO               PIC 9(02).'),
    areaA('      88 INTRO           VALUE 00.'),
    ...teclas.map((k) => areaA(`      88 ${`F${k.numero}`.padEnd(15)}VALUE ${String(k.numero).padStart(2, '0')}.`)),
  );
  // Copias de la pantalla: entrada, salida e indicadores de cada formato que los tiene.
  for (const r of p.registros) {
    const f = r.nombre;
    if (tieneEntrada(r)) t.push(areaA(`01 ${f}-II.`), areaA(`   COPY DDS-${f}-I       OF ${dspf}.`));
    if (tieneSalida(r)) t.push(areaA(`01 ${f}-OO.`), areaA(`   COPY DDS-${f}-O       OF ${dspf}.`));
    if (conIndicadores(r)) t.push(areaA(`01 ${f}-IND.`), areaA(`   COPY DDS-${f}-INDIC   OF ${dspf}.`));
  }

  // --- Procedimiento ---
  t.push(
    areaA('PROCEDURE DIVISION.'),
    comentario('-------------------'),
    areaA('PRINCIPAL.'),
    areaB('PERFORM INICIO'),
    areaB(`PERFORM MOSTRAR-${inicial.nombre}`),
    areaB('PERFORM TERMINO'),
    areaB('GOBACK.'),
    comentario(),
    ...parrafo('INICIO'),
    areaB('OPEN I-O PANTALLA'),
    ...(sql ? [] : [...archivos.keys()].map((a) => areaB(`OPEN I-O ${a}`))),
    areaB('MOVE "N"    TO SALIR-WS'),
    areaB('MOVE SPACES TO MENSAJE-WS'),
    ...p.registros.flatMap((r) => [
      ...(tieneEntrada(r) ? [areaB(`INITIALIZE ${r.nombre}-II`)] : []),
      ...(tieneSalida(r) ? [areaB(`INITIALIZE ${r.nombre}-OO`)] : []),
    ]),
  );
  t[t.length - 1] += '.';
  t.push(
    comentario(),
    ...parrafo('TERMINO'),
    areaB(`CLOSE PANTALLA${sql ? '' : [...archivos.keys()].map((a) => ` ${a}`).join('')}.`),
    comentario(),
  );

  const escribir = (r: Registro, nivel: number): string[] => {
    const desde = tieneSalida(r) ? ` FROM ${r.nombre}-OO` : '';
    const lineas = [areaB(`WRITE R-PANTALLA${desde} FORMAT "${r.nombre}"`, nivel)];
    lineas.push(conIndicadores(r) ? areaB(`INDICATORS ARE ${r.nombre}-O-INDIC END-WRITE`, nivel + 2) : areaB('END-WRITE', nivel + 2));
    return lineas;
  };
  const leer = (r: Registro, nivel: number): string[] => {
    const into = tieneEntrada(r) ? ` INTO ${r.nombre}-II` : '';
    return [
      areaB(`READ PANTALLA${into} FORMAT "${r.nombre}"`, nivel),
      conIndicadores(r) ? areaB(`INDICATORS ARE ${r.nombre}-I-INDIC END-READ`, nivel + 2) : areaB('END-READ', nivel + 2),
    ];
  };
  const indicador = (r: Registro, ind: IndicadorCond | null, encendido: boolean, nivel: number): string[] => {
    if (!ind || !conIndicadores(r)) return [];
    const valor = encendido !== ind.negado ? 'I-ON ' : 'I-OFF';
    return [areaB(`MOVE ${valor} TO IN${String(ind.numero).padStart(2, '0')} OF ${r.nombre}-O-INDIC`, nivel)];
  };
  const mensajeEn = (r: Registro) => camposDe(r).find((c) => /^(MENSAJE|MSG|MENSAJ)/i.test(c.nombre) && usoSalida(c));

  // Formatos que solo se escriben: antes del inicial, o después si usan su ventana (WINDOW(inicial)).
  const escritos = p.registros.filter(soloEscritura);
  const despues = (r: Registro) => parametroDe(r.keywords, 'WINDOW')?.trim().toUpperCase() === inicial.nombre.toUpperCase();
  for (const r of escritos) {
    const lineas = escribir(r, 0);
    lineas[lineas.length - 1] += '.';
    t.push(...parrafo(`ESCRIBIR-${r.nombre}`), ...lineas, comentario());
  }

  for (const r of formatos.filter((x) => !soloEscritura(x))) {
    const f = r.nombre;
    const sfl = sflDe(r);
    const msg = mensajeEn(r);
    const ramas: string[] = [];
    const rama = (cond: string, ...sentencias: string[]) => ramas.push(areaB(`WHEN ${cond}`, 2), ...sentencias.map((s) => areaB(s, 3)));
    if (hayTecla(3)) rama('F3', 'MOVE "S" TO SALIR-WS');
    if (hayTecla(12)) rama('F12', `MOVE "S" TO FIN-${f}`);
    if (sfl && hayTecla(5)) rama('F5', `PERFORM CARGAR-${sfl.nombre}`);
    for (const k of teclas.filter((x) => ![3, 12].includes(x.numero) && !(sfl && x.numero === 5))) {
      rama(`F${k.numero}`, `PERFORM TECLA-F${k.numero}-${f}`.slice(0, 41));
    }
    rama('INTRO', `PERFORM PROCESAR-${sfl ? sfl.nombre : f}`);
    rama('OTHER', 'CONTINUE');
    t.push(
      ...parrafo(`MOSTRAR-${f}`),
      ...(sfl ? [areaB(`PERFORM CARGAR-${sfl.nombre}`)] : []),
      areaB(`MOVE "N" TO FIN-${f}`),
      areaB(`PERFORM UNTIL FIN-${f} = "S" OR SALIR-WS = "S"`),
      ...(msg ? [areaB(`MOVE MENSAJE-WS TO ${msg.nombre} OF ${f}-OO`, 1), areaB('MOVE SPACES     TO MENSAJE-WS', 1)] : []),
      ...(r === inicial ? escritos.filter((x) => !despues(x)).map((x) => areaB(`PERFORM ESCRIBIR-${x.nombre}`, 1)) : []),
      ...escribir(r, 1),
      ...(r === inicial ? escritos.filter(despues).map((x) => areaB(`PERFORM ESCRIBIR-${x.nombre}`, 1)) : []),
      ...leer(r, 1),
      areaB('EVALUATE TRUE', 1),
      ...ramas,
      areaB('END-EVALUATE', 1),
      areaB('END-PERFORM.'),
      comentario(),
    );
    // Teclas: un párrafo para completar.
    for (const k of teclas.filter((x) => ![3, 12].includes(x.numero) && !(sfl && x.numero === 5))) {
      t.push(
        ...parrafo(`TECLA-F${k.numero}-${f}`),
        comentario(` F${k.numero}${k.texto ? ` (${k.texto.replace(/[^A-Za-z0-9 ]/g, '').slice(0, 14)})` : ''} en ${f}: escriba aqui lo que hace.`),
        ...formatos
          .filter((x) => x !== r && !soloEscritura(x))
          .slice(0, 1)
          .map((x) => comentario(` Por ejemplo, para ir a otro formato: PERFORM MOSTRAR-${x.nombre}`)),
        areaB('CONTINUE.'),
        comentario(),
      );
    }
    if (!sfl) {
      // INTRO en un formato normal: leer los datos por la llave (si la pantalla tiene sus campos).
      const leibles = usoDe(r).filter((u) => u.llaves.length > 0 && u.llaves.every((k) => u.campos.some((c) => c.archivo.nombre === k.nombre && usoEntrada(c.pantalla))));
      for (const u of usoDe(r).filter((x) => !leibles.includes(x))) {
        adv.push(`${f}: no tiene como entrada todos los campos de la llave de ${u.archivo} (${u.llaves.map((k) => k.nombre).join(', ') || 'sin llave'}); no se genera su lectura por llave.`);
      }
      t.push(
        ...parrafo(`PROCESAR-${f}`),
        comentario(` INTRO en ${f}: valide los datos y haga lo que corresponde.`),
        ...leibles.map((u) => areaB(`PERFORM LEER-${u.archivo}-${f}`)),
        areaB('CONTINUE.'),
        comentario(),
      );
      for (const u of leibles) t.push(...accesoPorLlave(u, f));
    } else {
      t.push(...subfile(r, sfl));
    }
  }

  // --- Acceso a datos por la llave (formato normal) ---
  function accesoPorLlave(u: UsoArchivo, f: string): string[] {
    const a = u.archivo;
    const o: string[] = [];
    const deArchivoAPantalla = u.campos
      .filter((c) => usoSalida(c.pantalla))
      .map((c) => (sql ? areaB(`MOVE ${hv(c.archivo, a)} TO ${c.pantalla.nombre} OF ${f}-OO`, 1) : areaB(`MOVE ${c.archivo.nombre} OF REG-${a} TO ${c.pantalla.nombre} OF ${f}-OO`, 1)));
    const dePantallaAArchivo = (nivel: number) =>
      u.campos
        .filter((c) => usoEntrada(c.pantalla))
        .map((c) => (sql ? areaB(`MOVE ${c.pantalla.nombre} OF ${f}-II TO ${hv(c.archivo, a)}`, nivel) : areaB(`MOVE ${c.pantalla.nombre} OF ${f}-II TO ${c.archivo.nombre} OF REG-${a}`, nivel)));
    const llavePantalla = (k: CampoDeArchivo) => u.campos.find((c) => c.archivo.nombre === k.nombre)!.pantalla.nombre;
    o.push(...parrafo(`LEER-${a}-${f}`), comentario(` Lee ${a} por su llave y muestra sus datos en ${f}.`));
    if (sql) {
      for (const k of u.llaves) o.push(areaB(`MOVE ${llavePantalla(k)} OF ${f}-II TO ${hv(k, a)}`));
      const columnas = u.campos.map((c) => c.archivo.nombre);
      o.push(
        areaB('EXEC SQL'),
        ...envolver(columnas.map((c, i) => `${c}${i < columnas.length - 1 ? ',' : ''}`), 1, 'SELECT'),
        ...envolver(u.campos.map((c, i) => `:${hv(c.archivo, a)}${i < u.campos.length - 1 ? ',' : ''}`), 2, 'INTO'),
        areaB(`FROM ${tablaSql(a)}`, 1),
        ...u.llaves.map((k, i) => areaB(`${i === 0 ? 'WHERE' : '  AND'} ${k.nombre} = :${hv(k, a)}`, 1)),
        areaB('END-EXEC'),
        areaB('IF SQLCODE = 0'),
        areaB('MOVE "S" TO HAY-REG', 1),
        ...deArchivoAPantalla,
        areaB('ELSE'),
        areaB('MOVE "N" TO HAY-REG', 1),
        areaB('IF SQLCODE = 100', 1),
        areaB(`MOVE "No existe en ${a}." TO MENSAJE-WS`, 2),
        areaB('ELSE', 1),
        areaB('MOVE SQLCODE TO SQLCODE-ED', 2),
        areaB('STRING "Error SQL " SQLCODE-ED DELIMITED BY SIZE', 2),
        areaB('INTO MENSAJE-WS END-STRING', 4),
        areaB('END-IF', 1),
        areaB('END-IF.'),
        comentario(),
      );
      // Agregar y modificar: quedan listos para llamarlos desde PROCESAR-f.
      const enEntrada = u.campos.filter((c) => usoEntrada(c.pantalla));
      if (enEntrada.length > 0) {
        o.push(
          ...parrafo(`AGREGAR-${a}-${f}`),
          ...dePantallaAArchivo(0),
          areaB('EXEC SQL'),
          areaB(`INSERT INTO ${tablaSql(a)}`, 1),
          ...envolver(enEntrada.map((c, i) => `${c.archivo.nombre}${i < enEntrada.length - 1 ? ',' : ')'}`), 2, '('),
          ...envolver(enEntrada.map((c, i) => `:${hv(c.archivo, a)}${i < enEntrada.length - 1 ? ',' : ')'}`), 2, 'VALUES ('),
          areaB('END-EXEC'),
          areaB('IF SQLCODE NOT = 0'),
          areaB('MOVE SQLCODE TO SQLCODE-ED', 1),
          areaB('STRING "Error SQL " SQLCODE-ED DELIMITED BY SIZE', 1),
          areaB('INTO MENSAJE-WS END-STRING', 3),
          areaB('END-IF.'),
          comentario(),
        );
        const noLlave = enEntrada.filter((c) => !c.archivo.llave);
        if (noLlave.length > 0) {
          o.push(
            ...parrafo(`MODIFICAR-${a}-${f}`),
            ...dePantallaAArchivo(0),
            areaB('EXEC SQL'),
            areaB(`UPDATE ${tablaSql(a)}`, 1),
            ...noLlave.map((c, i) => areaB(`${i === 0 ? '   SET' : '      '} ${c.archivo.nombre} = :${hv(c.archivo, a)}${i < noLlave.length - 1 ? ',' : ''}`, 1)),
            ...u.llaves.map((k, i) => areaB(`${i === 0 ? ' WHERE' : '   AND'} ${k.nombre} = :${hv(k, a)}`, 1)),
            areaB('END-EXEC'),
            areaB('IF SQLCODE NOT = 0'),
            areaB('MOVE SQLCODE TO SQLCODE-ED', 1),
            areaB('STRING "Error SQL " SQLCODE-ED DELIMITED BY SIZE', 1),
            areaB('INTO MENSAJE-WS END-STRING', 3),
            areaB('END-IF.'),
            comentario(),
          );
        }
      }
    } else {
      for (const k of u.llaves) o.push(areaB(`MOVE ${llavePantalla(k)} OF ${f}-II TO ${k.nombre} OF REG-${a}`));
      o.push(
        areaB(`READ ${a} KEY IS EXTERNALLY-DESCRIBED-KEY`),
        areaB('INVALID KEY', 1),
        areaB('MOVE "N" TO HAY-REG', 2),
        areaB(`MOVE "No existe en ${a}." TO MENSAJE-WS`, 2),
        areaB('NOT INVALID KEY', 1),
        areaB('MOVE "S" TO HAY-REG', 2),
        ...deArchivoAPantalla.map((l) => `   ${l}`),
        areaB('END-READ.'),
        comentario(),
      );
      const enEntrada = u.campos.filter((c) => usoEntrada(c.pantalla));
      if (enEntrada.length > 0) {
        o.push(
          ...parrafo(`AGREGAR-${a}-${f}`),
          areaB(`INITIALIZE REG-${a}`),
          ...dePantallaAArchivo(0),
          areaB(`WRITE REG-${a}`),
          areaB('INVALID KEY', 1),
          areaB(`MOVE "Ya existe en ${a}." TO MENSAJE-WS`, 2),
          areaB('END-WRITE.'),
          comentario(),
          ...parrafo(`MODIFICAR-${a}-${f}`),
          comentario(` Antes lea con LEER-${a}-${f} (bloquea el registro).`),
          ...dePantallaAArchivo(0),
          areaB(`REWRITE REG-${a}`),
          areaB('INVALID KEY', 1),
          areaB(`MOVE "No se pudo modificar ${a}." TO MENSAJE-WS`, 2),
          areaB('END-REWRITE.'),
          comentario(),
        );
      }
    }
    return o;
  }

  // --- Subfile: carga y opciones ---
  function subfile(ctl: Registro, sfl: Registro): string[] {
    const s = sfl.nombre;
    const maximo = Number(parametroDe(ctl.keywords, 'SFLSIZ') ?? '') || 9999;
    const o: string[] = [...parrafo(`CARGAR-${s}`)];
    // Limpiar: SFLCLR encendido, SFLDSP y SFLDSPCTL apagados.
    o.push(
      ...indicador(ctl, indicadorDe(ctl, 'SFLCLR'), true, 0),
      ...indicador(ctl, indicadorDe(ctl, 'SFLDSP'), false, 0),
      ...indicador(ctl, indicadorDe(ctl, 'SFLDSPCTL'), false, 0),
      ...escribir(ctl, 0),
      ...indicador(ctl, indicadorDe(ctl, 'SFLCLR'), false, 0),
      areaB('MOVE ZEROES TO NREL'),
    );
    const u = usoDe(sfl)[0];
    if (usoDe(sfl).length > 1) adv.push(`${s}: tiene campos de varios archivos; la carga lee solo ${u.archivo}.`);
    const aSubfile = (nivel: number) =>
      u
        ? u.campos
            .filter((x) => usoSalida(x.pantalla))
            .map((x) => (sql ? areaB(`MOVE ${hv(x.archivo, u.archivo)} TO ${x.pantalla.nombre} OF ${s}-OO`, nivel) : areaB(`MOVE ${x.archivo.nombre} OF REG-${u.archivo} TO ${x.pantalla.nombre} OF ${s}-OO`, nivel)))
        : [];
    const escribirFila = (nivel: number) => [
      areaB('ADD 1 TO NREL', nivel),
      areaB(`WRITE SUBFILE R-PANTALLA${tieneSalida(sfl) ? ` FROM ${s}-OO` : ''} FORMAT "${s}"`, nivel),
      areaB('INVALID KEY CONTINUE', nivel + 2),
      areaB('END-WRITE', nivel + 2),
    ];
    if (u && sql) {
      const a = u.archivo;
      const cursor = `C-${a}`.slice(0, 18);
      o.push(
        areaB('EXEC SQL'),
        areaB(`DECLARE ${cursor} CURSOR FOR`, 1),
        ...envolver(u.campos.map((x, i) => `${x.archivo.nombre}${i < u.campos.length - 1 ? ',' : ''}`), 1, 'SELECT'),
        areaB(`FROM ${tablaSql(a)}`, 1),
        ...(u.llaves.length > 0 ? envolver(u.llaves.map((k, i) => `${k.nombre}${i < u.llaves.length - 1 ? ',' : ''}`), 1, 'ORDER BY') : []),
        areaB('END-EXEC'),
        areaB('EXEC SQL'),
        areaB(`OPEN ${cursor}`, 1),
        areaB('END-EXEC'),
        areaB(`PERFORM UNTIL SQLCODE NOT = 0 OR NREL >= ${maximo}`),
        areaB('EXEC SQL', 1),
        areaB(`FETCH ${cursor}`, 2),
        ...envolver(u.campos.map((x, i) => `:${hv(x.archivo, a)}${i < u.campos.length - 1 ? ',' : ''}`), 3, 'INTO'),
        areaB('END-EXEC', 1),
        areaB('IF SQLCODE = 0', 1),
        ...aSubfile(2),
        ...escribirFila(2),
        areaB('END-IF', 1),
        areaB('END-PERFORM'),
        areaB('EXEC SQL'),
        areaB(`CLOSE ${cursor}`, 1),
        areaB('END-EXEC'),
      );
    } else if (u) {
      const a = u.archivo;
      o.push(
        areaB(`INITIALIZE REG-${a}`),
        areaB(`MOVE "S" TO HAY-REG`),
        areaB(`START ${a} KEY IS NOT LESS THAN EXTERNALLY-DESCRIBED-KEY`),
        areaB('INVALID KEY MOVE "N" TO HAY-REG', 1),
        areaB('END-START'),
        areaB(`PERFORM UNTIL HAY-REG = "N" OR NREL >= ${maximo}`),
        areaB(`READ ${a} NEXT RECORD`, 1),
        areaB('AT END MOVE "N" TO HAY-REG', 2),
        areaB('END-READ', 1),
        areaB('IF HAY-REG = "S"', 1),
        ...aSubfile(2),
        ...escribirFila(2),
        areaB('END-IF', 1),
        areaB('END-PERFORM'),
      );
    } else {
      o.push(
        comentario(` Cargue aqui las filas de ${s}: por cada una, llene ${s}-OO`),
        comentario(' y escriba la fila:'),
        ...escribirFila(0).map((l) => `      *${l.slice(7)}`),
      );
    }
    // SFLEND: solo si hay filas y ya no quedan datos por cargar.
    const fin = u ? (sql ? 'SQLCODE NOT = 0' : 'HAY-REG = "N"') : null;
    const sflend = indicador(ctl, indicadorDe(ctl, 'SFLEND'), true, fin ? 2 : 1);
    const sflendNo = indicador(ctl, indicadorDe(ctl, 'SFLEND'), false, 2);
    o.push(
      areaB('IF NREL > 0'),
      ...indicador(ctl, indicadorDe(ctl, 'SFLDSP'), true, 1),
      ...(sflend.length > 0 && fin ? [areaB(`IF ${fin}`, 1), ...sflend, areaB('ELSE', 1), ...sflendNo, areaB('END-IF', 1)] : sflend),
      areaB('ELSE'),
      ...indicador(ctl, indicadorDe(ctl, 'SFLDSP'), false, 1),
      areaB(`MOVE "No hay datos para mostrar." TO MENSAJE-WS`, 1),
      areaB('END-IF'),
      ...indicador(ctl, indicadorDe(ctl, 'SFLDSPCTL'), true, 0),
    );
    if (o[o.length - 1].trim() === '') o.pop();
    o[o.length - 1] += '.';
    o.push(comentario());
    // Opciones: las filas que el usuario cambió.
    o.push(
      ...parrafo(`PROCESAR-${s}`),
      comentario(` Filas de ${s} que el usuario modifico (una opcion, p.ej.).`),
      areaB(`READ SUBFILE PANTALLA NEXT MODIFIED${tieneEntrada(sfl) ? ` INTO ${s}-II` : ''}`),
      areaB(`FORMAT "${s}"`, 4),
      areaB('END-READ'),
      areaB('PERFORM UNTIL FS-PANTALLA NOT = "00"'),
      comentario(`    Haga aqui lo que corresponde a la fila (${s}-II).`),
      areaB(`READ SUBFILE PANTALLA NEXT MODIFIED${tieneEntrada(sfl) ? ` INTO ${s}-II` : ''}`, 1),
      areaB(`FORMAT "${s}"`, 5),
      areaB('END-READ', 1),
      areaB('END-PERFORM.'),
      comentario(),
    );
    return o;
  }

  const largas = t.filter((l) => l.length > 72);
  if (largas.length > 0) adv.push(`${largas.length} líneas pasan de la columna 72; revíselas en el editor.`);
  return { cobol: `${t.join('\n')}\n`, advertencias: adv };
}

/** Formatos por los que puede partir el programa (normales y controles de subfile). */
export function formatosIniciales(p: PantallaDSPF): string[] {
  return p.registros.filter((r) => r.clase !== 'subfile').map((r) => r.nombre);
}
