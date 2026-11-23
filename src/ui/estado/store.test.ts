import { describe, it, expect, beforeEach } from 'vitest';
import { registroDe, useStore } from './store';
import { agregarConstante, moverElemento } from '@core/edicion/operaciones';
import { ID_TODOS } from '@core/render/lienzo';

const estado = () => useStore.getState();
const reg = () => estado().pantalla!.registros[0];

beforeEach(() => {
  estado().nuevaPantalla('PRUEBA');
});

describe('nuevaPantalla', () => {
  it('crea una pantalla en modo edición con el primer registro seleccionado', () => {
    expect(estado().pantalla?.nombre).toBe('PRUEBA');
    expect(estado().modoEdicion).toBe(true);
    expect(estado().modificado).toBe(true);
    expect(estado().registroSeleccionado).toBe(reg().id);
    expect(estado().historial.pasado).toHaveLength(0);
  });
});

describe('modificar / deshacer / rehacer', () => {
  it('cada cambio se puede deshacer y rehacer', () => {
    const id = reg().id;
    estado().modificar((p) => agregarConstante(p, id, 1, 1, 'A').pantalla);
    estado().modificar((p) => agregarConstante(p, id, 2, 1, 'B').pantalla);
    expect(reg().elementos).toHaveLength(2);

    estado().deshacer();
    expect(reg().elementos).toHaveLength(1);
    estado().deshacer();
    expect(reg().elementos).toHaveLength(0);
    estado().deshacer(); // no hay más: no hace nada
    expect(reg().elementos).toHaveLength(0);

    estado().rehacer();
    estado().rehacer();
    expect(reg().elementos).toHaveLength(2);
  });

  it('los cambios seguidos con la misma clave son un solo paso de deshacer', () => {
    const id = reg().id;
    const r = agregarConstante(estado().pantalla!, id, 1, 1, 'A');
    estado().aplicar(r.pantalla, { seleccionar: r.elementoId });
    const antes = estado().historial.pasado.length;

    for (let fila = 2; fila <= 6; fila++) {
      estado().modificar((p) => moverElemento(p, id, r.elementoId, fila, 1), { clave: `arrastre:${r.elementoId}` });
    }
    expect(estado().historial.pasado.length).toBe(antes + 1);
    expect(reg().elementos[0].fila).toBe(6);

    estado().deshacer();
    expect(reg().elementos[0].fila).toBe(1); // vuelve a donde estaba antes de arrastrar
  });

  it('una operación que falla deja la pantalla intacta y muestra el error', () => {
    const antes = estado().pantalla;
    estado().modificar(() => {
      throw new Error('Ya existe el registro X.');
    });
    expect(estado().pantalla).toBe(antes);
    expect(estado().error).toBe('Ya existe el registro X.');
    estado().limpiarError();
    expect(estado().error).toBeNull();
  });

  it('aplicar puede seleccionar el elemento nuevo y cambiar de registro', () => {
    const id = reg().id;
    const r = agregarConstante(estado().pantalla!, id, 1, 1, 'A');
    estado().aplicar(r.pantalla, { seleccionar: r.elementoId, registro: id });
    expect(estado().seleccionElemento).toBe(r.elementoId);
  });

  it('al deshacer se quita la selección de un elemento que ya no existe', () => {
    const id = reg().id;
    const r = agregarConstante(estado().pantalla!, id, 1, 1, 'A');
    estado().aplicar(r.pantalla, { seleccionar: r.elementoId });
    estado().deshacer();
    expect(estado().seleccionElemento).toBeNull();
  });
});

describe('selección y herramientas', () => {
  it('cambiar de registro limpia la selección y la herramienta', () => {
    estado().elegirHerramienta('campo');
    estado().seleccionarElemento('x');
    estado().seleccionarRegistro(reg().id);
    expect(estado().seleccionElemento).toBeNull();
    expect(estado().herramienta).toBeNull();
  });

  it('elegir una herramienta quita la selección', () => {
    estado().seleccionarElemento('x');
    estado().elegirHerramienta('texto');
    expect(estado().seleccionElemento).toBeNull();
    expect(estado().herramienta).toBe('texto');
  });

  it('al entrar en edición desde la vista «Todos» se elige un registro concreto', () => {
    estado().alternarEdicion(); // sale de edición
    expect(estado().modoEdicion).toBe(false);
    estado().seleccionarRegistro(ID_TODOS);
    estado().alternarEdicion();
    expect(estado().modoEdicion).toBe(true);
    expect(registroDe(estado().pantalla, estado().registroSeleccionado)).not.toBeNull();
  });

  it('marcarGuardado quita el indicador de cambios', () => {
    expect(estado().modificado).toBe(true);
    estado().marcarGuardado();
    expect(estado().modificado).toBe(false);
  });
});
