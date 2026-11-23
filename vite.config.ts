import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { builtinModules } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Módulos que no deben empaquetarse en los bundles de main y preload:
//  - 'electron' lo provee el runtime de Electron.
//  - los módulos nativos de Node (con y sin prefijo `node:`).
//  - las dependencias de node_modules (p.ej. iconv-lite) se cargan vía require
//    en tiempo de ejecución; empaquetarlas en CJS daba errores de sintaxis.
const nodeExternos = [
  'electron',
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  'iconv-lite',
  'basic-ftp',
];

// Política de contenido de la versión compilada (en desarrollo Vite necesita scripts en línea y eval).
// Solo se carga lo que viene con la aplicación: sin red, sin eval. Monaco necesita estilos en línea,
// sus trabajadores (worker-src) y su fuente de íconos.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function politicaDeContenido(): Plugin {
  return {
    name: 'appiseries-csp',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  };
}

export default defineConfig({
  // Rutas relativas: la app empaquetada carga index.html con file://, donde "/assets/..." no existe.
  base: './',
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@ui': resolve(__dirname, 'src/ui'),
    },
  },
  plugins: [
    react(),
    politicaDeContenido(),
    electron([
      {
        // Proceso principal de Electron
        entry: 'electron/main/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron/main',
            lib: {
              entry: 'electron/main/main.ts',
              formats: ['cjs'],
              // El plugin añade el formato 'es' además de 'cjs'; si ambos se
              // llamaran igual se pisarían y dejarían el archivo corrupto.
              fileName: (formato: string) =>
                formato === 'cjs' ? 'main.cjs' : 'main.mjs',
            },
            rollupOptions: {
              external: nodeExternos,
            },
          },
        },
      },
      {
        // Script de precarga (puente seguro renderer <-> main).
        // Debe compilarse a CommonJS (.cjs): Electron carga los preload en
        // CommonJS, no en ESM. Si se compila como ESM, window.api queda
        // undefined porque el `import` del preload no resuelve.
        entry: 'electron/preload/preload.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron/preload',
            lib: {
              entry: 'electron/preload/preload.ts',
              formats: ['cjs'],
              fileName: (formato: string) =>
                formato === 'cjs' ? 'preload.cjs' : 'preload.mjs',
            },
            rollupOptions: {
              external: nodeExternos,
            },
          },
        },
      },
    ]),
    renderer(),
  ],
});
