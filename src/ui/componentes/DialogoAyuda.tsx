import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { ACERCA_DE, AUTOR, NOMBRE_APP, REFERENCIAS_COBOL } from '@core/acerca';
import type { SeccionAyuda } from '@core/acerca';

/** Qué diálogo del menú Ayuda está abierto. */
export const useAyuda = create<{ seccion: SeccionAyuda | null; abrir: (s: SeccionAyuda) => void; cerrar: () => void }>((set) => ({
  seccion: null,
  abrir: (seccion) => set({ seccion }),
  cerrar: () => set({ seccion: null }),
}));

const PESTANAS: Array<{ id: SeccionAyuda; texto: string }> = [
  { id: 'acerca', texto: 'Acerca de' },
  { id: 'autor', texto: 'Desarrollado por' },
  { id: 'referencias', texto: 'Referencias de COBOL' },
];

function Enlace({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <a
      href={url}
      className="ayuda-enlace"
      onClick={(e) => {
        e.preventDefault();
        void window.api.abrirEnlace?.(url);
      }}
    >
      {children}
    </a>
  );
}

/** Acerca de, Desarrollado por y Referencias de COBOL (menú Ayuda). */
export function DialogoAyuda() {
  const seccion = useAyuda((s) => s.seccion);
  const abrir = useAyuda((s) => s.abrir);
  const cerrar = useAyuda((s) => s.cerrar);
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (!seccion || version) return;
    void window.api.version?.().then(setVersion).catch(() => undefined);
  }, [seccion, version]);

  useEffect(() => {
    if (!seccion) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [seccion, cerrar]);

  if (!seccion) return null;
  return (
    <div className="fondo-modal" onClick={cerrar}>
      <section className="formulario-flotante dialogo-ayuda" role="dialog" aria-label="Ayuda" onClick={(e) => e.stopPropagation()}>
        <div className="pestanas" role="tablist">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={seccion === p.id}
              className={seccion === p.id ? 'pestana activa' : 'pestana'}
              onClick={() => abrir(p.id)}
            >
              {p.texto}
            </button>
          ))}
        </div>

        {seccion === 'acerca' && (
          <div className="ayuda-cuerpo">
            <h3>
              {NOMBRE_APP} {version && <span className="tenue">versión {version}</span>}
            </h3>
            <p className="ayuda-resumen">{ACERCA_DE.resumen}</p>
            {ACERCA_DE.parrafos.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        )}

        {seccion === 'autor' && (
          <div className="ayuda-cuerpo">
            <h3>{AUTOR.nombre}</h3>
            <p className="ayuda-resumen">{AUTOR.cargo}</p>
            {AUTOR.parrafos.map((p) => (
              <p key={p}>{p}</p>
            ))}
            <ul className="ayuda-contacto">
              {AUTOR.contacto.map((c) => (
                <li key={c.url}>
                  <span className="tenue">{c.etiqueta}:</span> <Enlace url={c.url}>{c.texto ?? c.url.replace(/^https:\/\/(www\.)?/, '')}</Enlace>
                </li>
              ))}
            </ul>
          </div>
        )}

        {seccion === 'referencias' && (
          <div className="ayuda-cuerpo">
            <h3>{REFERENCIAS_COBOL.titulo}</h3>
            <ul className="ayuda-referencias">
              {REFERENCIAS_COBOL.enlaces.map((e) => (
                <li key={e.url}>
                  <Enlace url={e.url}>{e.texto}</Enlace>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="form-acciones">
          <button type="button" onClick={cerrar}>
            Cerrar
          </button>
        </div>
      </section>
    </div>
  );
}
