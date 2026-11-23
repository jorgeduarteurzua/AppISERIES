/**
 * Ubicación de los fuentes DDS de ejemplo (QDDSSRC) para las pruebas.
 * Está aparte para que las pruebas no se importen entre sí.
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));

export const dirFuentesTablas = join(aqui, '../../../QDDSSRC');
