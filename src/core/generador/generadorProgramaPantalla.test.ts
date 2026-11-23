import { describe, expect, it } from 'vitest';
import { formatosIniciales, generarProgramaPantalla } from './generadorProgramaPantalla';
import type { OpcionesProgramaPantalla, TipoProgramaPantalla } from './generadorProgramaPantalla';
import { parsearDspf } from '../parser/parserDspf';
import { parsearTabla } from '../tablas/parserTabla';

const PF = parsearTabla(
  [
    '     A          R RCLIENTE',
    '     A            RUT            9S 0',
    '     A            NOMBRE        40A',
    '     A            SALDO         11P 2',
    '     A          K RUT',
  ].join('\n') + '\n',
  'CLIENTES',
);
const resolver = (n: string) => (n === 'CLIENTES' ? PF : null);

// Pantalla con un subfile de clientes, su control, un pie de teclas y un detalle por RUT.
const DDS = [
  '     A                                      DSPSIZ(24 80 *DS3)',
  '     A                                      INDARA',
  "     A                                      CF03(03 'Salir')",
  "     A                                      CF05(05 'Renovar')",
  "     A                                      CF06(06 'Nuevo')",
  "     A                                      CF12(12 'Volver')",
  '     A          R S01                       SFL',
  '     A            OPC            1A  B  6  2',
  '     A            RUT       R        O  6  5REFFLD(RUT CLIENTES)',
  '     A            NOMBRE    R        O  6 16REFFLD(NOMBRE CLIENTES)',
  '     A          R C01                       SFLCTL(S01)',
  '     A                                      SFLSIZ(0500)',
  '     A                                      SFLPAG(0012)',
  '     A                                      OVERLAY',
  '     A  30                                  SFLDSP',
  '     A  31                                  SFLDSPCTL',
  '     A  32                                  SFLCLR',
  '     A  30                                  SFLEND(*MORE)',
  "     A                                  1  2'Clientes'",
  '     A          R P01                       OVERLAY',
  "     A                                 23  2'F3=Salir  F5=Renovar'",
  '     A          R R01',
  '     A            RUT       R        B  4 20REFFLD(RUT CLIENTES)',
  '     A            NOMBRE    R        B  5 20REFFLD(NOMBRE CLIENTES)',
  '     A            SALDO     R        O  6 20REFFLD(SALDO CLIENTES)',
  '     A            MENSAJE       70A  O 22  2',
].join('\n') + '\n';
const pantalla = parsearDspf(DDS, 'CLIENTED');

const opciones = (tipo: TipoProgramaPantalla, extra: Partial<OpcionesProgramaPantalla> = {}): OpcionesProgramaPantalla => ({
  nombrePrograma: 'clientep',
  nombrePantalla: 'CLIENTED',
  tipo,
  autor: 'Jorge Duarte',
  formatoInicial: 'C01',
  resolverArchivo: resolver,
  ...extra,
});

/** Texto de un párrafo, hasta el siguiente. */
const parrafo = (cobol: string, nombre: string): string => {
  const i = cobol.indexOf(`\n       ${nombre}.\n`);
  if (i < 0) return '';
  const resto = cobol.slice(i + 1);
  const fin = resto.slice(1).search(/\n {7}[A-Z][A-Z0-9-]*\.\n/);
  return fin < 0 ? resto : resto.slice(0, fin + 1);
};

describe('programa desde una pantalla: esqueleto', () => {
  const { cobol, advertencias } = generarProgramaPantalla(pantalla, opciones('CBL'));

  it('formatos por los que se puede partir: normales y controles de subfile', () => {
    expect(formatosIniciales(pantalla)).toEqual(['C01', 'P01', 'R01']);
  });
  it('declara la pantalla, sus copias y las teclas del DSPF', () => {
    expect(cobol).toContain('PROGRAM-ID.  CLIENTEP.');
    expect(cobol).toContain('SELECT PANTALLA   ASSIGN        TO WORKSTATION-CLIENTED-SI');
    expect(cobol).toContain('COPY DDS-S01-I       OF CLIENTED.');
    expect(cobol).toContain('COPY DDS-C01-INDIC   OF CLIENTED.');
    expect(cobol).not.toContain('COPY DDS-P01-I');
    for (const n of [3, 5, 6, 12]) expect(cobol).toMatch(new RegExp(`88 F${n} +VALUE ${String(n).padStart(2, '0')}\\.`));
  });
  it('parte por el formato elegido; el pie se escribe antes; F3 sale, F12 vuelve, cada tecla tiene su párrafo', () => {
    expect(parrafo(cobol, 'PRINCIPAL')).toContain('PERFORM MOSTRAR-C01');
    const mostrar = parrafo(cobol, 'MOSTRAR-C01');
    expect(mostrar.indexOf('PERFORM CARGAR-S01')).toBeGreaterThan(0);
    expect(mostrar.indexOf('PERFORM ESCRIBIR-P01')).toBeLessThan(mostrar.indexOf('FORMAT "C01"'));
    expect(mostrar).toMatch(/WHEN F3\n +MOVE "S" TO SALIR-WS/);
    expect(mostrar).toMatch(/WHEN F12\n +MOVE "S" TO FIN-C01/);
    expect(mostrar).toMatch(/WHEN F5\n +PERFORM CARGAR-S01/);
    expect(mostrar).toMatch(/WHEN INTRO\n +PERFORM PROCESAR-S01/);
    expect(cobol).toContain('       TECLA-F6-C01.');
    expect(cobol).toContain('       TECLA-F6-R01.');
  });
  it('la carga del subfile usa sus indicadores (SFLCLR, SFLDSP, SFLDSPCTL, SFLEND)', () => {
    const cargar = parrafo(cobol, 'CARGAR-S01');
    expect(cargar).toContain('MOVE I-ON  TO IN32 OF C01-O-INDIC');
    expect(cargar).toContain('MOVE I-OFF TO IN32 OF C01-O-INDIC');
    expect(cargar).toMatch(/IF NREL > 0\n +MOVE I-ON  TO IN30 OF C01-O-INDIC/);
    expect(cargar).toContain('MOVE I-ON  TO IN31 OF C01-O-INDIC');
    expect(cargar).toContain('OR NREL >= 500');
    expect(parrafo(cobol, 'PROCESAR-S01')).toContain('READ SUBFILE PANTALLA NEXT MODIFIED INTO S01-II');
  });
  it('ninguna línea pasa de la columna 72 y las columnas 1 a 6 están limpias', () => {
    for (const l of cobol.split('\n')) {
      expect(l.length, l).toBeLessThanOrEqual(72);
      expect(l.slice(0, 6).trim(), l).toBe('');
    }
    expect(advertencias).toEqual([]);
  });
});

describe('programa desde una pantalla: E/S nativa', () => {
  const { cobol } = generarProgramaPantalla(pantalla, opciones('CBL'));
  it('el archivo se declara indexado con su copia DDS', () => {
    expect(cobol).toContain('SELECT CLIENTES   ASSIGN        TO DATABASE-CLIENTES');
    expect(cobol).toContain('RECORD KEY    IS EXTERNALLY-DESCRIBED-KEY');
    expect(cobol).toContain('COPY DDS-ALL-FORMATS OF CLIENTES.');
    expect(parrafo(cobol, 'INICIO')).toContain('OPEN I-O CLIENTES');
  });
  it('el subfile se carga leyendo el archivo desde el principio', () => {
    const cargar = parrafo(cobol, 'CARGAR-S01');
    expect(cargar).toContain('START CLIENTES KEY IS NOT LESS THAN EXTERNALLY-DESCRIBED-KEY');
    expect(cargar).toContain('READ CLIENTES NEXT RECORD');
    expect(cargar).toContain('MOVE NOMBRE OF REG-CLIENTES TO NOMBRE OF S01-OO');
  });
  it('el detalle lee por la llave (RUT es entrada) y deja agregar y modificar', () => {
    expect(parrafo(cobol, 'PROCESAR-R01')).toContain('PERFORM LEER-CLIENTES-R01');
    const leer = parrafo(cobol, 'LEER-CLIENTES-R01');
    expect(leer).toContain('MOVE RUT OF R01-II TO RUT OF REG-CLIENTES');
    expect(leer).toContain('READ CLIENTES KEY IS EXTERNALLY-DESCRIBED-KEY');
    expect(leer).toContain('MOVE SALDO OF REG-CLIENTES TO SALDO OF R01-OO');
    expect(parrafo(cobol, 'AGREGAR-CLIENTES-R01')).toContain('WRITE REG-CLIENTES');
    expect(parrafo(cobol, 'MODIFICAR-CLIENTES-R01')).toContain('REWRITE REG-CLIENTES');
    expect(cobol).not.toContain('EXEC SQL');
  });
  it('el mensaje se muestra en el campo MENSAJE del formato', () => {
    expect(parrafo(cobol, 'MOSTRAR-R01')).toContain('MOVE MENSAJE-WS TO MENSAJE OF R01-OO');
  });
});

describe('programa desde una pantalla: SQL', () => {
  const { cobol } = generarProgramaPantalla(pantalla, opciones('SQLCBL', { bibliotecaDatos: 'datos' }));
  it('variables de trabajo con la definición del archivo y sin FD del archivo', () => {
    expect(cobol).toContain('INCLUDE SQLCA');
    expect(cobol).toMatch(/05 SALDO-CLIENTES +PIC S9\(9\)V9\(2\)\./);
    expect(cobol).toMatch(/05 NOMBRE-CLIENTES +PIC X\(40\)\./);
    expect(cobol).not.toContain('DATABASE-CLIENTES');
  });
  it('el subfile se carga con un cursor ordenado por la llave', () => {
    const cargar = parrafo(cobol, 'CARGAR-S01');
    expect(cargar).toMatch(/DECLARE C-CLIENTES CURSOR FOR\n +SELECT RUT, NOMBRE\n +FROM DATOS\/CLIENTES\n +ORDER BY RUT/);
    expect(cargar).toContain('FETCH C-CLIENTES');
    expect(cargar).toContain('MOVE NOMBRE-CLIENTES TO NOMBRE OF S01-OO');
  });
  it('el detalle lee con SELECT INTO por la llave; agregar y modificar con INSERT y UPDATE', () => {
    const leer = parrafo(cobol, 'LEER-CLIENTES-R01');
    expect(leer).toMatch(/SELECT RUT, NOMBRE, SALDO\n +INTO :RUT-CLIENTES, :NOMBRE-CLIENTES, :SALDO-CLIENTES/);
    expect(leer).toContain('WHERE RUT = :RUT-CLIENTES');
    expect(leer).toContain('IF SQLCODE = 100');
    expect(parrafo(cobol, 'AGREGAR-CLIENTES-R01')).toContain('INSERT INTO DATOS/CLIENTES');
    const modificar = parrafo(cobol, 'MODIFICAR-CLIENTES-R01');
    expect(modificar).toMatch(/SET NOMBRE = :NOMBRE-CLIENTES\n +WHERE RUT = :RUT-CLIENTES/);
  });
  it('ninguna línea pasa de la columna 72', () => {
    for (const l of cobol.split('\n')) expect(l.length, l).toBeLessThanOrEqual(72);
  });
});

describe('programa desde una pantalla: casos', () => {
  it('sin el archivo abierto, sin INDARA o sin la llave en la pantalla, avisa', () => {
    const sinArchivo = generarProgramaPantalla(pantalla, opciones('CBL', { resolverArchivo: () => null }));
    expect(sinArchivo.advertencias.join(' ')).toMatch(/CLIENTES .* no está abierto en Tablas/);
    expect(sinArchivo.cobol).toContain('Cargue aqui las filas de S01');
    const sinIndara = generarProgramaPantalla(parsearDspf(DDS.replace(/.*INDARA\n/, ''), 'X'), opciones('CBL'));
    expect(sinIndara.advertencias.join(' ')).toMatch(/INDARA/);
    expect(sinIndara.cobol).not.toContain('-INDIC');
    const sinLlave = generarProgramaPantalla(parsearDspf(DDS.replace(/.*RUT       R        B  4 20.*\n/, ''), 'X'), opciones('CBL'));
    expect(sinLlave.advertencias.join(' ')).toMatch(/R01: no tiene como entrada .* llave de CLIENTES \(RUT\)/);
  });
  it('parte por un formato normal y rechaza lo que no se puede', () => {
    expect(parrafo(generarProgramaPantalla(pantalla, opciones('CBL', { formatoInicial: 'r01' })).cobol, 'PRINCIPAL')).toContain('PERFORM MOSTRAR-R01');
    expect(() => generarProgramaPantalla(pantalla, opciones('CBL', { formatoInicial: 'S01' }))).toThrow(/no está en la pantalla/);
    expect(() => generarProgramaPantalla(pantalla, opciones('CBL', { nombrePrograma: '1MAL' }))).toThrow(/no es válido/);
  });
});

describe('programa desde una pantalla: detalles', () => {
  it('SFLEND solo con filas y cuando ya no quedan datos', () => {
    const cargar = parrafo(generarProgramaPantalla(pantalla, opciones('CBL')).cobol, 'CARGAR-S01');
    expect(cargar).toMatch(/IF NREL > 0\n +MOVE I-ON  TO IN30 OF C01-O-INDIC\n +IF HAY-REG = "N"\n +MOVE I-ON  TO IN30/);
    expect(cargar).not.toMatch(/END-IF\n +MOVE I-ON  TO IN30 OF C01-O-INDIC\.?\n/);
  });
  it('un archivo UNIQUE no lleva WITH DUPLICATES', () => {
    const unico = parsearTabla(`     A                                      UNIQUE\n${'     A          R RCLIENTE\n     A            RUT            9S 0\n     A            NOMBRE        40A\n     A            SALDO         11P 2\n     A          K RUT\n'}`, 'CLIENTES');
    const { cobol } = generarProgramaPantalla(pantalla, opciones('CBL', { resolverArchivo: (n) => (n === 'CLIENTES' ? unico : null) }));
    expect(cobol).not.toContain('WITH DUPLICATES');
    expect(generarProgramaPantalla(pantalla, opciones('CBL')).cobol).toContain('WITH DUPLICATES');
  });
});
