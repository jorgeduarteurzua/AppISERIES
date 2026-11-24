import { beforeEach, describe, expect, it } from 'vitest';
import { parsearTabla } from '@core/tablas/parserTabla';
import { fuentesDeTabla } from './fuentesEnvio';
import { useTablas } from './storeTablas';

const PF = parsearTabla(
  ['     A          R RTABLA1', "     A            RUT           10S 0       TEXT('RUT')", "     A            NOMBRES       30A         TEXT('NOMBRES')", '     A          K RUT'].join('\n') + '\n',
  'TABLA1.pf',
);
const LF1 = parsearTabla(['     A          R RTABLA1                   PFILE(TABLA1)', '     A          K NOMBRES'].join('\n') + '\n', 'TABLA1L1.lf');
const LF_OTRO = parsearTabla(['     A          R ROTRO                     PFILE(OTRA)', '     A          K NOMBRES'].join('\n') + '\n', 'OTROL1.lf');

describe('fuentesDeTabla: físico con lógicos', () => {
  beforeEach(() => {
    useTablas.setState({ ...useTablas.getInitialState(), catalogo: { TABLA1: PF, TABLA1L1: LF1, OTROL1: LF_OTRO }, tabla: PF, nombreArchivoActual: 'TABLA1.pf' }, true);
  });

  it('ofrece el físico, sus lógicos (marcados) y el script SQL (sin marcar), sin los lógicos de otros físicos', () => {
    const f = fuentesDeTabla()!;
    expect(f.map((x) => `${x.tipo}:${x.miembro}:${x.incluido}`)).toEqual(['PF:TABLA1:true', 'LF:TABLA1L1:true', 'SQL:TABLA1:false']);
    expect(f[1].texto).toContain('PFILE(TABLA1)');
  });

  it('un lógico abierto se ofrece solo, sin buscar lógicos', () => {
    useTablas.setState({ tabla: LF1, nombreArchivoActual: 'TABLA1L1.lf' });
    expect(fuentesDeTabla()!.map((x) => x.tipo)).toEqual(['LF', 'SQL']);
  });
});
