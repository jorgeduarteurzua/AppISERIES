/**
 * Carga Monaco (el editor de VS Code) y registra COBOL, CL y RPG. Se importa de forma diferida
 * desde el editor de programas; sin red: todo viene de node_modules.
 */
import * as monaco from './monacoNucleo';
// El paquete exporta ./* como ./esm/vs/*.js.
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { CL, COBOL, ID_LENGUAJE, RPG } from './lenguajesMonaco';

// Solo hace falta el trabajador base: no se usan los servicios de TypeScript, CSS, HTML ni JSON.
(self as unknown as { MonacoEnvironment: { getWorker: () => Worker } }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

// Qué es una palabra en cada lenguaje (para autocompletar, renombrar e ir a la definición).
const PALABRA: Record<string, RegExp> = {
  cobol: /[A-Za-z0-9][A-Za-z0-9-]*/,
  cl: /&?[A-Za-z@#$][A-Za-z0-9@#]*/,
  rpg: /[A-Za-z@#$][A-Za-z0-9@#]*/,
};

for (const [lenguaje, definicion] of [
  ['cobol', COBOL],
  ['cl', CL],
  ['rpg', RPG],
] as const) {
  const id = ID_LENGUAJE[lenguaje];
  if (!monaco.languages.getLanguages().some((l) => l.id === id)) {
    monaco.languages.register({ id });
    monaco.languages.setMonarchTokensProvider(id, definicion);
    monaco.languages.setLanguageConfiguration(id, { wordPattern: PALABRA[lenguaje] });
  }
}

// Tema que acompaña al de la aplicación (IBM i oscuro).
monaco.editor.defineTheme('ibmi-oscuro', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '8da2c4', fontStyle: 'italic' },
    { token: 'comment.doc', foreground: '5a6f94', fontStyle: '' },
    { token: 'keyword', foreground: '78a9ff' },
    { token: 'keyword.sql', foreground: '3ddbd9' },
    { token: 'string', foreground: '42be65' },
    { token: 'number', foreground: 'f1c21b' },
    { token: 'type', foreground: 'ff7eb6' },
    { token: 'variable', foreground: 'f1c21b' },
    { token: 'constant', foreground: '3ddbd9' },
    { token: 'attribute', foreground: 'be95ff' },
    { token: 'identifier', foreground: 'f2f4f8' },
  ],
  colors: {
    'editor.background': '#08101f',
    'editorGutter.background': '#08101f',
    'editor.foreground': '#f2f4f8',
    'editorLineNumber.foreground': '#5a6f94',
    'editorLineNumber.activeForeground': '#3ddbd9',
    'editorRuler.foreground': '#2a4170',
    'editor.lineHighlightBackground': '#111e36',
    'editor.selectionBackground': '#1b3f80',
    'editorCursor.foreground': '#3ddbd9',
  },
});

export { monaco };
