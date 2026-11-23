import { create } from 'zustand';

export type Seccion = 'pantallas' | 'tablas' | 'programas';

interface EstadoNavegacion {
  seccion: Seccion;
  irA: (seccion: Seccion) => void;
}

/** Sección visible. Está en un store para que un diálogo pueda llevar al usuario a otra sección. */
export const useNavegacion = create<EstadoNavegacion>((set) => ({
  seccion: 'pantallas',
  irA: (seccion) => set({ seccion }),
}));
