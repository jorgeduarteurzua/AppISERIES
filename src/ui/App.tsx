import { useEffect } from 'react';
import { useNavegacion, type Seccion } from './estado/navegacion';
import { useStore } from './estado/store';
import { useTablas } from './estado/storeTablas';
import { SeccionPantallas } from './SeccionPantallas';
import { SeccionTablas } from './SeccionTablas';
import { SeccionProgramas } from './SeccionProgramas';
import { useProgramas } from './estado/storeProgramas';
import { guardarPantalla, guardarPrograma, guardarTabla } from './estado/guardado';
import { useAs400 } from './estado/as400';
import { iniciarVigilancia } from './estado/carpetas';
import { DialogoAyuda, useAyuda } from './componentes/DialogoAyuda';
import { DialogoConexionAs400 } from './as400/DialogoConexionAs400';
import { DialogoEnvioAs400 } from './as400/DialogoEnvioAs400';
import { DialogoTraerAs400 } from './as400/DialogoTraerAs400';
import './estilos/app.css';

const SECCIONES: { id: Seccion; texto: string }[] = [
  { id: 'pantallas', texto: 'Pantallas' },
  { id: 'tablas', texto: 'Tablas' },
  { id: 'programas', texto: 'Programas' },
];

/** Aplicación: selector de sección y la sección activa. Los datos de cada sección se conservan al cambiar. */
export function App() {
  const seccion = useNavegacion((s) => s.seccion);
  const setSeccion = useNavegacion((s) => s.irA);
  const pantallasModificadas = useStore((s) => s.modificado);
  const tablasModificadas = useTablas((s) => s.modificado);
  const programasModificados = useProgramas((s) => s.modificado);

  // Conexión guardada al AS400 (sin la contraseña).
  useEffect(() => {
    void useAs400.getState().cargar();
    // Las carpetas abiertas se actualizan solas cuando cambia un archivo.
    iniciarVigilancia();
    // Opciones del menú Ayuda.
    return window.api.alAyuda?.((s) => useAyuda.getState().abrir(s));
  }, []);

  // El proceso principal pregunta antes de cerrar si algo está sin guardar, en cualquier sección.
  const hayCambios = pantallasModificadas || tablasModificadas || programasModificados;
  useEffect(() => {
    window.api.notificarModificado(hayCambios);
  }, [hayCambios]);

  // Ctrl+S guarda lo que se está editando en la sección activa; Ctrl+Mayús+S pide otro nombre.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      void (seccion === 'pantallas' ? guardarPantalla(e.shiftKey) : seccion === 'tablas' ? guardarTabla(e.shiftKey) : guardarPrograma(e.shiftKey));
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [seccion]);

  return (
    <div className="shell">
      <nav className="shell-nav" aria-label="Secciones">
        <span className="shell-marca">AppISERIES</span>
        {SECCIONES.map((s) => {
          const conCambios = s.id === 'pantallas' ? pantallasModificadas : s.id === 'tablas' ? tablasModificadas : programasModificados;
          return (
            <button
              key={s.id}
              type="button"
              className={seccion === s.id ? 'shell-seccion activa' : 'shell-seccion'}
              aria-current={seccion === s.id ? 'page' : undefined}
              onClick={() => setSeccion(s.id)}
            >
              {s.texto}
              {conCambios && <span aria-label="con cambios sin guardar"> ●</span>}
            </button>
          );
        })}
      </nav>
      <div className="shell-contenido">
        {seccion === 'pantallas' ? <SeccionPantallas /> : seccion === 'tablas' ? <SeccionTablas /> : <SeccionProgramas />}
      </div>
      <DialogoEnvioAs400 />
      <DialogoTraerAs400 />
      <DialogoConexionAs400 />
      <DialogoAyuda />
    </div>
  );
}
