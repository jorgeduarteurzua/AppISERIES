import { validar } from '../edicion/validacion';
import type { Problema } from '../edicion/validacion';
import { generarDspf } from '../generador/generadorDspf';
import type { PantallaDSPF } from '../modelo/pantalla';
import type { Tabla } from '../tablas/modelo';
import { generarCobolCrud } from './generadorCobolCrud';
import { generarEsqueletosAyuda } from './generadorAyudaCrud';
import type { EsqueletoAyuda } from './generadorAyudaCrud';
import { crearPantallaCrud } from './generadorPantallaCrud';
import { planificarCrud } from './planCrud';
import type { OpcionesCrud, PlanCrud } from './planCrud';

export type { EsqueletoAyuda } from './generadorAyudaCrud';
export type {
  AccionTecla,
  AyudaCampo,
  AyudaPlan,
  AnchoPantallaCrud,
  CampoCrud,
  DondeTecla,
  OpcionesCrud,
  PlanCrud,
  TeclaCrud,
  TipoCobolCrud,
  TipoPantallaCrud,
  ValorAuto,
} from './planCrud';
export { TECLAS_POR_DEFECTO, sugerirFechaHora } from './planCrud';
export type { ReglaCampo, RequeridoCampo, ValidacionCampo, ValidacionPlan } from './validacionesCrud';
export { pareceEmail, reglasPosibles, requeridosPosibles, requeridoDeLlave } from './validacionesCrud';

export interface ResultadoCrud {
  plan: PlanCrud;
  pantalla: PantallaDSPF;
  /** Fuente DDS de la pantalla. */
  dds: string;
  /** Fuente COBOL con SQL. */
  cobol: string;
  /** Esqueletos de los programas de ayuda de campo (uno por programa distinto). */
  ayudas: EsqueletoAyuda[];
  /** Avisos del plan y de la validación de la pantalla. */
  advertencias: string[];
}

const NOMBRE_OBJETO = /^[A-Z$#@][A-Z0-9$#@_]{0,9}$/;

/** Genera la pantalla y el programa de mantención de una tabla. Lanza un Error con el motivo si no se puede. */
export function generarCrud(tabla: Tabla, opciones: OpcionesCrud): ResultadoCrud {
  const normalizadas: OpcionesCrud = {
    ...opciones,
    nombreTabla: opciones.nombreTabla.trim().toUpperCase(),
    nombrePantalla: opciones.nombrePantalla.trim().toUpperCase(),
    nombrePrograma: opciones.nombrePrograma.trim().toUpperCase(),
  };
  if (!NOMBRE_OBJETO.test(normalizadas.nombrePantalla)) {
    throw new Error('El nombre de la pantalla no es válido (máximo 10 caracteres: A-Z, 0-9, $ # @ _).');
  }
  if (!NOMBRE_OBJETO.test(normalizadas.nombrePrograma)) {
    throw new Error('El nombre del programa no es válido (máximo 10 caracteres: A-Z, 0-9, $ # @ _).');
  }
  if (normalizadas.nombrePantalla === normalizadas.nombrePrograma) {
    throw new Error('La pantalla y el programa necesitan nombres distintos.');
  }

  const plan = planificarCrud(tabla, normalizadas);
  const advertencias = [...plan.advertencias];
  if (!/^[A-Z][A-Z0-9]*$/.test(normalizadas.nombrePrograma)) {
    advertencias.push('El nombre del programa tiene caracteres que COBOL puede no aceptar en PROGRAM-ID.');
  }
  for (const a of plan.ayudas) {
    if (a.programa === normalizadas.nombrePrograma || a.programa === normalizadas.nombrePantalla) {
      throw new Error(`El programa de ayuda de ${a.campo.nombre} (${a.programa}) no puede llamarse como la pantalla o el programa del CRUD.`);
    }
    if (a.programa === normalizadas.nombreTabla) {
      throw new Error(`El programa de ayuda de ${a.campo.nombre} (${a.programa}) no puede llamarse como la tabla.`);
    }
  }
  const pantalla = crearPantallaCrud(plan);
  const problemas: Problema[] = validar(pantalla);
  for (const p of problemas) advertencias.push(`Pantalla: ${p.mensaje}`);
  return {
    plan,
    pantalla,
    dds: generarDspf(pantalla),
    cobol: generarCobolCrud(plan),
    ayudas: generarEsqueletosAyuda(plan),
    advertencias,
  };
}
