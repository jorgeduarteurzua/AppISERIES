/**
 * Esqueleto del programa de ayuda de campo (COBOL, sin SQL). Todos los programas de ayuda tienen la
 * misma interfaz, así el CRUD llama a cualquiera igual: código (entra el actual y sale el elegido) y
 * descripción de lo elegido. El esqueleto no muestra nada: el programador escribe la lista de opciones.
 */

import { LARGO_CODIGO_AYUDA, LARGO_DESCRIPCION_AYUDA, textoSimple } from './planCrud';
import type { PlanCrud } from './planCrud';

export interface EsqueletoAyuda {
  /** Nombre del programa y del miembro. */
  programa: string;
  /** CBL, o CBLLE si el programa del CRUD es ILE. */
  tipo: 'CBL' | 'CBLLE';
  /** Campos del CRUD que lo usan. */
  campos: string[];
  texto: string;
}

const areaA = (texto: string): string => `       ${texto}`;
const areaB = (texto: string, nivel = 0): string => `           ${'   '.repeat(nivel)}${texto}`;
const comentario = (texto = ''): string => `      *${texto}`;

/** Un esqueleto por cada programa de ayuda distinto que usa el CRUD (los campos sin programa no tienen). */
export function generarEsqueletosAyuda(plan: PlanCrud): EsqueletoAyuda[] {
  const o = plan.opciones;
  const porPrograma = new Map<string, string[]>();
  for (const a of plan.ayudas) {
    if (a.programa === '') continue;
    porPrograma.set(a.programa, [...(porPrograma.get(a.programa) ?? []), a.campo.nombre]);
  }
  const autor = (textoSimple(o.autor) || 'AppISERIES').toUpperCase();
  return [...porPrograma].map(([programa, campos]) => {
    const texto = [
      areaA('IDENTIFICATION DIVISION.'),
      comentario('------------------------'),
      areaA(`PROGRAM-ID.  ${programa}.`),
      areaA(`AUTHOR. ${autor}.`),
      comentario(` Ayuda de campo para ${campos.join(', ')} de ${plan.tabla}. Generado por AppISERIES.`),
      comentario(` Lo llama el programa ${o.nombrePrograma.toUpperCase()} con:`),
      comentario(`     CALL "${programa}" USING CODIGO DESCRIPCION`),
      comentario(' Todas las ayudas reciben y devuelven lo mismo:'),
      comentario(`   LK-CODIGO  PIC X(${LARGO_CODIGO_AYUDA})  entra el valor actual del campo;`),
      comentario('              sale el codigo elegido, o blancos si no eligio.'),
      comentario(`   LK-DESCRIP PIC X(${LARGO_DESCRIPCION_AYUDA})  sale la descripcion de lo elegido.`),
      comentario(' Un campo numerico llega con los digitos a la derecha y debe'),
      comentario(' volver con los digitos del codigo (se ignora lo demas).'),
      areaA('ENVIRONMENT DIVISION.'),
      areaA('CONFIGURATION SECTION.'),
      areaA('SOURCE-COMPUTER.  IBM-AS400.'),
      areaA('OBJECT-COMPUTER.  IBM-AS400.'),
      areaA('DATA DIVISION.'),
      areaA('WORKING-STORAGE SECTION.'),
      comentario('------------------------'),
      areaA('77 ELEGIDO-WS            PIC X(1) VALUE "N".'),
      '',
      areaA('LINKAGE SECTION.'),
      comentario('------------------------'),
      areaA(`01 LK-CODIGO             PIC X(${LARGO_CODIGO_AYUDA}).`),
      areaA(`01 LK-DESCRIP            PIC X(${LARGO_DESCRIPCION_AYUDA}).`),
      '',
      areaA('PROCEDURE DIVISION USING LK-CODIGO LK-DESCRIP.'),
      comentario('------------------------'),
      areaA('INICIO.'),
      comentario('-----'),
      areaB('MOVE "N" TO ELEGIDO-WS'),
      comentario(' 1) Muestre las opciones (por ejemplo con un subfile de su'),
      comentario('    pantalla) y deje elegir una; LK-CODIGO trae el valor'),
      comentario('    actual para posicionar la lista.'),
      comentario(' 2) Si elige una, haga:'),
      comentario('        MOVE codigo-elegido      TO LK-CODIGO'),
      comentario('        MOVE descripcion-elegida TO LK-DESCRIP'),
      comentario('        MOVE "S" TO ELEGIDO-WS'),
      areaB('IF ELEGIDO-WS = "N"'),
      areaB('MOVE SPACES TO LK-CODIGO LK-DESCRIP', 1),
      areaB('END-IF'),
      areaB('GOBACK.'),
      '',
    ].join('\n');
    return { programa, tipo: o.tipoCobol === 'SQLCBLLE' ? 'CBLLE' : 'CBL', campos, texto };
  });
}