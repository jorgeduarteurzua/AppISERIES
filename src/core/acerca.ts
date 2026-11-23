/**
 * Textos y enlaces del menú Ayuda. El proceso principal solo abre en el navegador los enlaces
 * de esta lista (ENLACES_PERMITIDOS): la interfaz no puede pedirle abrir cualquier dirección.
 */

export const NOMBRE_APP = 'AppISERIES';

export const ACERCA_DE = {
  titulo: 'Acerca de AppISERIES',
  resumen: 'Generador visual para IBM i (AS/400).',
  parrafos: [
    'AppISERIES permite diseñar pantallas (DSPF) en un editor visual tipo SDA, y crear y mantener archivos físicos y lógicos (PF/LF) con su equivalente en SQL.',
    'A partir de un archivo genera un mantenedor completo (CRUD): la pantalla con lista, alta, modificación, consulta y baja, y el programa COBOL con SQL que la atiende, con validaciones de campos, ayudas por F4 y ventanas.',
    'Incluye un editor de programas COBOL y CL con el formato de columnas del IBM i, y envía los fuentes al servidor por FTP, los compila y muestra cada mensaje del compilador en su línea.',
  ],
};

export const AUTOR = {
  titulo: 'Desarrollado por',
  nombre: 'Jorge Duarte Urzúa',
  cargo: 'Ingeniero Informático, con más de 30 años de experiencia',
  parrafos: [
    'La idea de AppISERIES es de Jorge Duarte, que ha trabajado en empresas de seguros, banca y retail. A lo largo de su carrera ha desarrollado una capacidad de abstracción y análisis que le permite abordar temas y lenguajes muy distintos.',
    'La mayor parte de su trabajo ha sido en IBM i (AS/400), programando en COBOL y RPG en sus distintas versiones. También trabaja con colas MQ (WebSphere MQ) y con WebSphere Message Broker, hoy IBM App Connect Enterprise (ACE 12), para integraciones SOA.',
  ],
  contacto: [
    { etiqueta: 'LinkedIn', url: 'https://www.linkedin.com/in/jorge-duarte-urz%C3%BAa-75532043/' },
    { etiqueta: 'Correo', url: 'mailto:jorge.duarte.urzua@gmail.com', texto: 'jorge.duarte.urzua@gmail.com' },
    { etiqueta: 'GitHub', url: 'https://github.com/jorgeduarteurzua?tab=repositories' },
  ],
};

/** Mientras no exista el repositorio del proyecto, se abre la lista de repositorios del autor. */
export const REPOSITORIO = 'https://github.com/jorgeduarteurzua?tab=repositories';

export const REFERENCIAS_COBOL = {
  titulo: 'Referencias de COBOL',
  enlaces: [
    { texto: 'COBOL sigue vivo (Think Big)', url: 'https://blogthinkbig.com/cobol-sigue-vivo' },
    { texto: 'COBCIDE: entorno de desarrollo para COBOL', url: 'https://launchpad.net/cobcide/+download' },
    {
      texto: 'Códigos de estado de archivo en COBOL (BMC)',
      url: 'https://docs.bmc.com/xwiki/bin/view/Mainframe/Storage/BMC-Compuware-IAM/bciam10/Messages-and-Codes/COBOL-File-Status-Codes-with-IAM/',
    },
    { texto: 'Documentación de IBM COBOL (IBM)', url: 'https://www.ibm.com/docs/es/cobol-linux-x86/1.2?topic=pdf-version-documentation' },
    { texto: 'ILE COBOL/400: Guía del programador V3R7 (PDF)', url: 'https://esselware.com.mx/IBMi_en_Espanol/Cobol/ile_cobol400_guia_programador_v3r7.pdf' },
    { texto: 'Db2 12 para z/OS: guía de programación de aplicaciones y SQL (PDF)', url: 'https://www.ibm.com/docs/es/SSEPEK_12.0.0/pdf/db2z_12_apsgbook.pdf' },
    { texto: 'Manuales de COBOL (Solo con Linux)', url: 'https://soloconlinux.org.es/manuales-cobol/' },
    { texto: 'Publicación de IBM sobre COBOL (PDF)', url: 'https://publibfp.dhe.ibm.com/epubs/pdf/c0926350.pdf' },
    { texto: 'IBM i 7.3: programación SQL incorporada (PDF)', url: 'https://www.ibm.com/docs/es/ssw_ibm_i_73/pdf/rzajppdf.pdf' },
  ],
};

export const ENLACES_PERMITIDOS: ReadonlySet<string> = new Set([
  ...AUTOR.contacto.map((c) => c.url),
  REPOSITORIO,
  ...REFERENCIAS_COBOL.enlaces.map((e) => e.url),
]);

export type SeccionAyuda = 'acerca' | 'autor' | 'referencias';
