import { app, BrowserWindow, Menu, ipcMain, dialog, safeStorage, shell } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import { ENLACES_PERMITIDOS, REPOSITORIO } from '../../src/core/acerca';
import type { SeccionAyuda } from '../../src/core/acerca';
import { join, resolve } from 'node:path';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import iconv from 'iconv-lite';
import { CODIFICACION_FUENTES, archivosValidos, escribirFuenteConCopia } from './escritura';
import { abrirSesionBasicFtp } from './as400/clienteFtp';
import { AlmacenConexion } from './as400/configuracion';
import { registrarIpcAs400 } from './as400/ipc';

// main se compila a CommonJS (.cjs), por lo que __dirname está disponible de
// forma nativa. No se usa import.meta.url (que solo existe en ESM).

// En desarrollo Vite sirve el renderer; en producción se carga el index.html empaquetado.
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;

/**
 * Rutas que el usuario eligió o que salieron de una carpeta que abrió. La
 * interfaz solo puede sobrescribir archivos de esta lista: así un fallo o un
 * contenido malicioso en la interfaz no puede escribir en cualquier parte.
 */
const rutasAutorizadas = new Set<string>();

function clave(ruta: string): string {
  const r = resolve(ruta);
  return process.platform === 'win32' ? r.toLowerCase() : r;
}

function autorizar(ruta: string): void {
  rutasAutorizadas.add(clave(ruta));
}
/** Carpetas que la interfaz listó (las únicas que se pueden vigilar) y sus vigilantes. */
const carpetasListadas = new Set<string>();
const vigilantes = new Map<string, FSWatcher>();
const MAX_VIGILANTES = 6;

// Lo informa la interfaz: si es true, se pregunta antes de cerrar la ventana.
let hayCambiosSinGuardar = false;

/** Abre en el navegador solo los enlaces conocidos del menú Ayuda. */
function abrirEnlace(url: string): void {
  if (ENLACES_PERMITIDOS.has(url)) void shell.openExternal(url);
}

/** Menú en español. Las opciones de ayuda abren un diálogo en la interfaz. */
function crearMenu(): void {
  const ayuda = (seccion: SeccionAyuda) => () => mainWindow?.webContents.send('menu:ayuda', seccion);
  const plantilla: MenuItemConstructorOptions[] = [
    { label: 'Archivo', submenu: [{ role: 'quit', label: 'Salir' }] },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Deshacer' },
        { role: 'redo', label: 'Rehacer' },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        ...(DEV_SERVER_URL ? [{ role: 'toggleDevTools', label: 'Herramientas de desarrollo' } as MenuItemConstructorOptions] : []),
        { type: 'separator' },
        { role: 'resetZoom', label: 'Tamaño normal' },
        { role: 'zoomIn', label: 'Acercar' },
        { role: 'zoomOut', label: 'Alejar' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        { label: 'Acerca de AppISERIES', click: ayuda('acerca') },
        { label: 'Desarrollado por', click: ayuda('autor') },
        { label: 'Referencias de COBOL', click: ayuda('referencias') },
        { type: 'separator' },
        { label: 'Repositorio en GitHub', click: () => abrirEnlace(REPOSITORIO) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(plantilla));
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'AppISERIES - Generador para IBM i',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (DEV_SERVER_URL) {
    mainWindow.loadURL(DEV_SERVER_URL);
    // DevTools disponibles con F12 / Ctrl+Shift+I, pero no se abren solas.
  } else {
    mainWindow.loadFile(join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('close', (evento) => {
    if (!hayCambiosSinGuardar || !mainWindow) return;
    const respuesta = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      title: 'Cambios sin guardar',
      message: 'Hay cambios sin guardar.',
      detail: 'Si sales ahora se perderán. Vuelve y guarda con «Guardar» en la sección que tiene el punto ●.',
      buttons: ['Volver', 'Salir sin guardar'],
      defaultId: 0,
      cancelId: 0,
    });
    if (respuesta === 0) evento.preventDefault();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Lee un archivo de fuente DDS. Las fuentes exportadas del IBM i suelen venir
 * en CP850 o Latin-1, no en UTF-8, por eso se decodifica explícitamente.
 */
async function leerFuente(ruta: string, codificacion: string): Promise<string> {
  const buffer = await readFile(ruta);
  if (codificacion.toLowerCase() === 'utf-8' || codificacion.toLowerCase() === 'utf8') {
    return buffer.toString('utf-8');
  }
  return iconv.decode(buffer, codificacion);
}

function registrarIpc(): void {
  // Conexión al AS400: la contraseña se cifra con el sistema (DPAPI en Windows).
  registrarIpcAs400(
    ipcMain,
    new AlmacenConexion(join(app.getPath('userData'), 'conexion-as400.json'), {
      disponible: () => safeStorage.isEncryptionAvailable(),
      cifrar: (texto) => safeStorage.encryptString(texto).toString('base64'),
      descifrar: (base64) => safeStorage.decryptString(Buffer.from(base64, 'base64')),
    }),
    abrirSesionBasicFtp,
    {
      elegirCarpeta: async () => {
        if (!mainWindow) return null;
        const r = await dialog.showOpenDialog(mainWindow, {
          title: 'Carpeta donde dejar los fuentes que se traen del AS400',
          properties: ['openDirectory', 'createDirectory'],
        });
        return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0];
      },
      destino: (carpeta) => ({
        carpeta,
        existe: async (nombre) => {
          try {
            await access(join(carpeta, nombre));
            return true;
          } catch {
            return false;
          }
        },
        escribir: async (nombre, texto) => {
          const ruta = join(carpeta, nombre);
          const { copia } = await escribirFuenteConCopia(ruta, texto, CODIFICACION_FUENTES);
          autorizar(ruta);
          return copia;
        },
      }),
    },
  );

  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:abrirEnlace', (_evento, url: unknown) => {
    if (typeof url === 'string') abrirEnlace(url);
  });

  ipcMain.on('estado:modificado', (_evento, modificado: unknown) => {
    hayCambiosSinGuardar = modificado === true;
  });

  // Abrir un diálogo para elegir una carpeta (p.ej. QDSPSRC).
  ipcMain.handle('dialogo:abrirCarpeta', async () => {
    if (!mainWindow) return null;
    const resultado = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    if (resultado.canceled || resultado.filePaths.length === 0) return null;
    return resultado.filePaths[0];
  });

  // Abrir un diálogo para elegir uno o más archivos de fuente.
  ipcMain.handle('dialogo:abrirArchivos', async () => {
    if (!mainWindow) return null;
    const resultado = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Fuentes DDS', extensions: ['txt', 'dspf', 'pf', 'lf', 'dds'] },
        { name: 'Todos los archivos', extensions: ['*'] },
      ],
    });
    if (resultado.canceled) return null;
    resultado.filePaths.forEach(autorizar);
    return resultado.filePaths;
  });

  // Vigilar una carpeta ya listada: cuando cambia un archivo se avisa a la interfaz (con una
  // pausa breve, porque al guardar llegan varios eventos seguidos). Solo carpetas que la interfaz
  // listó; como mucho unas pocas a la vez (una por sección).
  ipcMain.handle('fs:vigilarCarpeta', async (_evento, ruta: unknown) => {
    if (typeof ruta !== 'string' || !carpetasListadas.has(clave(ruta))) return false;
    const k = clave(ruta);
    if (vigilantes.has(k)) return true;
    if (!(await stat(ruta)).isDirectory()) return false;
    while (vigilantes.size >= MAX_VIGILANTES) {
      const [primera, v] = vigilantes.entries().next().value as [string, FSWatcher];
      v.close();
      vigilantes.delete(primera);
    }
    let pausa: ReturnType<typeof setTimeout> | null = null;
    const vigilante = watch(ruta, { persistent: false }, () => {
      if (pausa) clearTimeout(pausa);
      pausa = setTimeout(() => mainWindow?.webContents.send('fs:carpetaCambio', ruta), 400);
    });
    vigilante.on('error', () => {
      vigilante.close();
      vigilantes.delete(k);
    });
    vigilantes.set(k, vigilante);
    return true;
  });

  // Listar los archivos de una carpeta.
  ipcMain.handle('fs:listarCarpeta', async (_evento, ruta: string) => {
    const entradas = await readdir(ruta, { withFileTypes: true });
    carpetasListadas.add(clave(ruta));
    const archivos = entradas
      .filter((e) => e.isFile())
      .map((e) => ({ nombre: e.name, ruta: join(ruta, e.name) }));
    archivos.forEach((a) => autorizar(a.ruta));
    return archivos;
  });

  // Sobrescribir un fuente que ya se abrió (botón «Guardar»). Deja una copia
  // `.bak` del original la primera vez. Devuelve la ruta de la copia, si se creó.
  ipcMain.handle(
    'fs:escribirFuente',
    async (_evento, ruta: string, texto: string, codificacion = CODIFICACION_FUENTES) => {
      if (typeof ruta !== 'string' || typeof texto !== 'string') throw new Error('Datos de guardado no válidos.');
      if (!rutasAutorizadas.has(clave(ruta))) {
        throw new Error('Ese archivo no se abrió desde la aplicación: usa «Guardar como…».');
      }
      const { copia } = await escribirFuenteConCopia(ruta, texto, codificacion);
      return copia;
    },
  );

  // Guardar un fuente generado en un archivo nuevo («Guardar como…»). Pide la
  // ruta con un diálogo y lo escribe en la misma codificación que las fuentes
  // de origen (Windows-1252), con CRLF.
  ipcMain.handle(
    'fs:guardarFuente',
    async (_evento, texto: string, nombreSugerido: string, codificacion = CODIFICACION_FUENTES) => {
      if (!mainWindow) return null;
      const resultado = await dialog.showSaveDialog(mainWindow, {
        defaultPath: nombreSugerido,
        filters: [
          {
            name: 'Fuentes (DDS, SQL, COBOL, CL, RPG)',
            extensions: ['dspf', 'pf', 'lf', 'sql', 'cbl', 'cblle', 'sqlcbl', 'sqlcblle', 'clp', 'clle', 'rpg', 'rpgle', 'sqlrpgle', 'txt'],
          },
          { name: 'Todos los archivos', extensions: ['*'] },
        ],
      });
      if (resultado.canceled || !resultado.filePath) return null;
      await escribirFuenteConCopia(resultado.filePath, texto, codificacion);
      autorizar(resultado.filePath);
      return resultado.filePath;
    },
  );

  // Guardar varios fuentes en una carpeta que elige el usuario (p.ej. la pantalla y el
  // programa de un CRUD). Si un archivo ya existe deja su copia `.bak`.
  ipcMain.handle('fs:guardarEnCarpeta', async (_evento, archivos: unknown, carpetaSugerida: unknown) => {
    if (!mainWindow) return null;
    const lista = archivosValidos(archivos);
    if (!lista) throw new Error('Los archivos a guardar no son válidos.');
    const resultado = await dialog.showOpenDialog(mainWindow, {
      title: 'Carpeta donde guardar los fuentes',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: typeof carpetaSugerida === 'string' && carpetaSugerida !== '' ? carpetaSugerida : undefined,
    });
    if (resultado.canceled || resultado.filePaths.length === 0) return null;
    const carpeta = resultado.filePaths[0];
    const rutas: string[] = [];
    const copias: string[] = [];
    for (const a of lista) {
      const ruta = join(carpeta, a.nombre);
      const { copia } = await escribirFuenteConCopia(ruta, a.texto, CODIFICACION_FUENTES);
      autorizar(ruta);
      rutas.push(ruta);
      if (copia) copias.push(copia);
    }
    return { carpeta, rutas, copias };
  });

  // Leer una fuente con una codificación concreta (Windows-1252 por defecto).
  ipcMain.handle(
    'fs:leerFuente',
    async (_evento, ruta: string, codificacion = 'windows-1252') => {
      return leerFuente(ruta, codificacion);
    },
  );
}

app.whenReady().then(() => {
  registrarIpc();
  crearMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
