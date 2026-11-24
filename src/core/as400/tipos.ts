/**
 * Tipos compartidos entre la interfaz y el proceso principal para el envío de
 * fuentes al AS400 (IBM i) por FTP.
 */

/** Tipo de fuente (coincide con el SRCTYPE del miembro en el IBM i). */
export type TipoFuente =
  | 'DSPF'
  | 'PF'
  | 'LF'
  | 'SQL'
  | 'CBL'
  | 'CBLLE'
  | 'SQLCBL'
  | 'SQLCBLLE'
  | 'CLP'
  | 'CLLE';

export interface InfoTipoFuente {
  etiqueta: string;
  /** Archivo fuente habitual donde se guarda este tipo. */
  archivoPorDefecto: string;
  /** Largo máximo de una línea del fuente (SRCDTA). El registro mide 12 más. */
  maxLinea: number;
  /** Comando que compila el fuente. */
  comando: string;
}

export const TIPOS_FUENTE: Record<TipoFuente, InfoTipoFuente> = {
  DSPF: { etiqueta: 'Pantalla (DSPF)', archivoPorDefecto: 'QDSPSRC', maxLinea: 80, comando: 'CRTDSPF' },
  PF: { etiqueta: 'Archivo físico (PF)', archivoPorDefecto: 'QDDSSRC', maxLinea: 80, comando: 'CRTPF' },
  LF: { etiqueta: 'Archivo lógico (LF)', archivoPorDefecto: 'QDDSSRC', maxLinea: 80, comando: 'CRTLF' },
  SQL: { etiqueta: 'Script SQL', archivoPorDefecto: 'QSQLSRC', maxLinea: 100, comando: 'RUNSQLSTM' },
  CBL: { etiqueta: 'COBOL (OPM)', archivoPorDefecto: 'QCBLSRC', maxLinea: 80, comando: 'CRTCBLPGM' },
  CBLLE: { etiqueta: 'COBOL ILE', archivoPorDefecto: 'QCBLSRC', maxLinea: 80, comando: 'CRTBNDCBL' },
  SQLCBL: { etiqueta: 'COBOL con SQL (OPM)', archivoPorDefecto: 'QCBLSRC', maxLinea: 80, comando: 'CRTSQLCBL' },
  SQLCBLLE: { etiqueta: 'COBOL ILE con SQL', archivoPorDefecto: 'QCBLSRC', maxLinea: 80, comando: 'CRTSQLCBLI' },
  CLP: { etiqueta: 'CL (OPM)', archivoPorDefecto: 'QCLSRC', maxLinea: 80, comando: 'CRTCLPGM' },
  CLLE: { etiqueta: 'CL ILE', archivoPorDefecto: 'QCLSRC', maxLinea: 80, comando: 'CRTBNDCL' },
};

/** Lo que se envía al AS400: el fuente y dónde dejarlo y compilarlo. */
export interface PeticionEnvio {
  tipo: TipoFuente;
  /** Nombre del miembro; el objeto compilado tendrá el mismo nombre. */
  miembro: string;
  texto: string;
  /** Texto descriptivo del miembro (opcional). */
  descripcion: string;
  bibliotecaFuente: string;
  archivoFuente: string;
  /** Biblioteca donde queda el objeto compilado. */
  bibliotecaObjeto: string;
  compilar: boolean;
  /**
   * Reemplazar el objeto si ya existe. En un PF o LF (que no tienen REPLACE) se borra el archivo
   * y se crea de nuevo; en un PF eso borra sus datos.
   */
  reemplazar: boolean;
  /** Solo borrar el archivo (PF o LF) si existe, sin enviar el fuente ni compilar. */
  soloBorrar?: boolean;
  /** Crear el archivo fuente si no existe. */
  crearArchivoFuente: boolean;
  /** Bibliotecas que se agregan a la lista antes de compilar (p.ej. donde está la tabla). */
  bibliotecasExtra: string[];
}

export interface PasoEnvio {
  nombre: string;
  ok: boolean;
  mensaje: string;
  /** Paso secundario: si falla no hace fallar el envío. */
  aviso?: boolean;
}

export interface ResultadoEnvio {
  ok: boolean;
  pasos: PasoEnvio[];
  /** Listado del compilador, si se pudo traer. */
  listado: string | null;
  /** Ruta IFS del miembro enviado. */
  rutaMiembro: string;
}

/** Destino que se recuerda entre sesiones. */
export interface DestinoGuardado {
  bibliotecaFuente: string;
  bibliotecaObjeto: string;
  /** Archivo fuente por tipo; si falta se usa el habitual. */
  archivoFuente: Partial<Record<TipoFuente, string>>;
  bibliotecasExtra: string[];
}

export const DESTINO_VACIO: DestinoGuardado = {
  bibliotecaFuente: '',
  bibliotecaObjeto: '',
  archivoFuente: {},
  bibliotecasExtra: [],
};

/** Conexión sin la contraseña: es lo único que ve la interfaz. */
export interface ConexionPublica {
  host: string;
  puerto: number;
  usuario: string;
  /** FTP sobre TLS (FTPS explícito). */
  seguro: boolean;
  /** Hay una contraseña guardada (cifrada) o en memoria. */
  tienePassword: boolean;
  /** La contraseña solo vive en esta sesión porque el sistema no puede cifrarla. */
  passwordSoloSesion: boolean;
  /** El sistema puede cifrar la contraseña (safeStorage). */
  cifradoDisponible: boolean;
  destino: DestinoGuardado;
}

export interface EntradaConexion {
  host: string;
  puerto: number;
  usuario: string;
  seguro: boolean;
  /** Si viene, reemplaza la contraseña guardada. Si no viene, se conserva. */
  password?: string;
}
