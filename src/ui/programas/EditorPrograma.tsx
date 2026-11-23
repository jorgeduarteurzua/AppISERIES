import { useEffect, useRef, useState } from 'react';
import type { editor, IDisposable, languages } from 'monaco-editor';
import type { NivelMensaje } from '@core/as400/listado';
import { describirCopia, leerCopiaDds } from '@core/fuentes/copiaDds';
import { definicionDe, estructuraDe, palabraEn } from '@core/fuentes/estructura';
import { secuenciaDeLinea } from '@core/fuentes/lenguaje';
import type { LenguajePrograma } from '@core/fuentes/lenguaje';
import type { PantallaDSPF } from '@core/modelo/pantalla';
import { COMANDOS_CL, ID_LENGUAJE, PALABRAS_COBOL, PALABRAS_SQL, REGLAS } from './lenguajesMonaco';
import { nombresDelPrograma, ocurrencias, renombrar } from '@core/fuentes/simbolos';

type MonacoApi = typeof import('monaco-editor');

let carga: Promise<MonacoApi | null> | null = null;

/** En las pruebas (jsdom) Monaco no funciona: se usa un área de texto. */
const sinMonaco = (): boolean => typeof navigator === 'undefined' || /jsdom/i.test(navigator.userAgent);

/** Carga Monaco una sola vez. */
function cargarMonaco(): Promise<MonacoApi | null> {
  if (sinMonaco()) return Promise.resolve(null);
  carga ??= import('./monaco').then((m) => m.monaco as MonacoApi).catch(() => null);
  return carga;
}

export interface MarcaEditor {
  linea: number;
  columna: number;
  hasta: number;
  nivel: NivelMensaje;
  mensaje: string;
}

/** Busca la pantalla de un COPY DDS (en el editor de pantallas o en el CRUD). */
export type ResolverPantalla = (nombre: string | null) => PantallaDSPF | null;

let resolverActual: ResolverPantalla = () => null;
/** Aviso tras renombrar (lo muestra la sección). */
let avisarRenombrado: (mensaje: string) => void = () => undefined;
let proveedores: IDisposable[] | null = null;

/** Ir a la definición (PERFORM, GO TO, GOTO, CALLSUBR) y ayuda sobre los COPY DDS. */
function registrarProveedores(monaco: MonacoApi): void {
  if (proveedores) return;
  proveedores = [];
  const lenguajes: LenguajePrograma[] = ['cobol', 'cl'];
  for (const lenguaje of lenguajes) {
    const id = ID_LENGUAJE[lenguaje];
    proveedores.push(
      monaco.languages.registerDefinitionProvider(id, {
        provideDefinition(model, position) {
          const nombre = palabraEn(model.getLineContent(position.lineNumber), position.column);
          if (!nombre) return null;
          const destino = definicionDe(estructuraDe(model.getValue(), lenguaje), nombre, lenguaje);
          if (!destino) return null;
          const fin = model.getLineMaxColumn(destino.linea);
          return { uri: model.uri, range: new monaco.Range(destino.linea, 1, destino.linea, fin) };
        },
      }),
    );
  }
  const Tipo = monaco.languages.CompletionItemKind;
  for (const lenguaje of lenguajes) {
    const id = ID_LENGUAJE[lenguaje];
    // Autocompletar: los nombres del programa, los campos de las pantallas copiadas y las palabras del lenguaje.
    proveedores.push(
      monaco.languages.registerCompletionItemProvider(id, {
        triggerCharacters: lenguaje === 'cl' ? ['&'] : [],
        provideCompletionItems(model, position) {
          const palabra = model.getWordUntilPosition(position);
          const range = new monaco.Range(position.lineNumber, palabra.startColumn, position.lineNumber, palabra.endColumn);
          const texto = model.getValue();
          const vistos = new Set<string>();
          const items: languages.CompletionItem[] = [];
          const agregar = (label: string, kind: languages.CompletionItemKind, detail: string, orden: string) => {
            if (vistos.has(label)) return;
            vistos.add(label);
            items.push({ label, kind, detail, insertText: label, range, sortText: `${orden}${label}` });
          };
          for (const n of nombresDelPrograma(texto, lenguaje)) {
            agregar(n.nombre, n.tipo === 'parrafo' || n.tipo === 'subrutina' ? Tipo.Function : n.tipo === 'etiqueta' ? Tipo.Reference : Tipo.Variable, n.detalle, '1');
          }
          if (lenguaje === 'cobol') {
            for (const linea of texto.split('\n')) {
              const copia = leerCopiaDds(linea);
              const pantalla = copia ? resolverActual(copia.archivo) : null;
              if (!copia || !pantalla) continue;
              for (const r of pantalla.registros) {
                if (copia.formato && r.nombre.toUpperCase() !== copia.formato) continue;
                for (const e of r.elementos) {
                  if (e.tipo === 'campo' && !e.sistema && e.nombre) agregar(e.nombre.toUpperCase(), Tipo.Field, `campo de ${r.nombre} (${pantalla.nombre})`, '2');
                }
              }
            }
            for (const k of PALABRAS_COBOL) agregar(k, Tipo.Keyword, 'COBOL', '3');
            for (const k of PALABRAS_SQL) agregar(k, Tipo.Keyword, 'SQL', '4');
          } else {
            for (const k of COMANDOS_CL) agregar(k, Tipo.Keyword, 'comando CL', '3');
          }
          return { suggestions: items };
        },
      }),
    );
    // Renombrar (F2): datos y párrafos en COBOL; variables, etiquetas y subrutinas en CL.
    proveedores.push(
      monaco.languages.registerRenameProvider(id, {
        resolveRenameLocation(model, position) {
          const palabra = model.getWordAtPosition(position);
          const nombre = palabra?.word.toUpperCase() ?? '';
          const conocido = nombresDelPrograma(model.getValue(), lenguaje).some((n) => n.nombre === nombre);
          if (!palabra || !conocido) {
            return { range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column), text: '', rejectReason: 'Solo se pueden renombrar los datos, párrafos, variables o etiquetas definidos en este programa.' };
          }
          return { range: new monaco.Range(position.lineNumber, palabra.startColumn, position.lineNumber, palabra.endColumn), text: palabra.word };
        },
        provideRenameEdits(model, position, nuevo) {
          const viejo = model.getWordAtPosition(position)?.word ?? '';
          const texto = model.getValue();
          try {
            // Valida (nombre nuevo, que no exista) y avisa si alguna línea pasa de la columna 72.
            const r = renombrar(texto, viejo, nuevo, lenguaje);
            const n = nuevo.trim().toUpperCase();
            const edits = ocurrencias(texto, viejo, lenguaje).map((o) => ({
              resource: model.uri,
              versionId: model.getVersionId(),
              textEdit: { range: new monaco.Range(o.linea, o.columna, o.linea, o.hasta), text: n },
            }));
            if (r.largas.length > 0) avisarRenombrado(`Atención: las líneas ${r.largas.join(', ')} pasan de la columna 72 con el nombre nuevo.`);
            return { edits };
          } catch (e) {
            return { edits: [], rejectReason: e instanceof Error ? e.message : String(e) };
          }
        },
      }),
    );
  }
  proveedores.push(
    monaco.languages.registerHoverProvider(ID_LENGUAJE.cobol, {
      provideHover(model, position) {
        const copia = leerCopiaDds(model.getLineContent(position.lineNumber));
        if (!copia) return null;
        const titulo = `**COPY DDS ${copia.formato ?? 'ALL-FORMATS'} (${copia.parte})${copia.archivo ? ` de ${copia.archivo}` : ''}**`;
        const pantalla = resolverActual(copia.archivo);
        if (!pantalla) {
          return { contents: [{ value: titulo }, { value: 'Abra esa pantalla en la sección Pantallas (o genere su CRUD) para ver sus campos.' }] };
        }
        const lineas = describirCopia(pantalla, copia);
        return {
          contents: [
            { value: titulo },
            { value: lineas ? `\`\`\`\n${lineas.join('\n')}\n\`\`\`` : `La pantalla no tiene el formato ${copia.formato}.` },
          ],
        };
      },
    }),
  );
}

const SEVERIDAD: Record<NivelMensaje, number> = { error: 8, aviso: 4, info: 2 };

interface Props {
  texto: string;
  lenguaje: LenguajePrograma;
  marcas: MarcaEditor[];
  /** Pedido de ir a una línea (cambia `n` en cada pedido). */
  irA: { linea: number; columna: number; n: number } | null;
  alCambiar: (texto: string) => void;
  resolverPantalla: ResolverPantalla;
  /** Mensajes del editor (por ejemplo, después de renombrar). */
  alAvisar?: (mensaje: string) => void;
}

/** Editor de fuentes con Monaco: colores, guías de columnas, secuencia SEU en el margen y marcas. */
export function EditorPrograma({ texto, lenguaje, marcas, irA, alCambiar, resolverPantalla, alAvisar }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const alCambiarRef = useRef(alCambiar);
  alCambiarRef.current = alCambiar;
  resolverActual = resolverPantalla;
  avisarRenombrado = alAvisar ?? (() => undefined);
  /** undefined = cargando; null = no se pudo (se usa el área de texto). */
  const [monaco, setMonaco] = useState<MonacoApi | null | undefined>(() => (sinMonaco() ? null : undefined));

  useEffect(() => {
    let vivo = true;
    void cargarMonaco().then((m) => {
      if (vivo) setMonaco(m);
    });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!monaco || !contenedor.current) return;
    registrarProveedores(monaco);
    const ed = monaco.editor.create(contenedor.current, {
      value: texto,
      language: ID_LENGUAJE[lenguaje],
      theme: 'ibmi-oscuro',
      automaticLayout: true,
      lineNumbers: (n: number) => secuenciaDeLinea(n),
      lineNumbersMinChars: 8,
      rulers: REGLAS[lenguaje],
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 13,
      minimap: { enabled: false },
      // Sugerencias al escribir código (no en comentarios ni literales); Ctrl+Espacio las pide siempre.
      quickSuggestions: { other: true, comments: false, strings: false },
      wordBasedSuggestions: 'off',
      insertSpaces: true,
      detectIndentation: false,
      renderWhitespace: 'boundary',
      // En COBOL el guion es parte del nombre; en CL lo son & @ # $.
      wordSeparators: '`~!%^*()=+[{]}\\|;:\'",.<>/?',
    });
    editorRef.current = ed;
    const cambio = ed.onDidChangeModelContent(() => alCambiarRef.current(ed.getValue()));
    return () => {
      cambio.dispose();
      ed.getModel()?.dispose();
      ed.dispose();
      editorRef.current = null;
    };
    // Se crea una vez; el texto y el lenguaje se actualizan en los efectos de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monaco]);

  // Otro programa abierto (o un cambio que no vino del editor).
  useEffect(() => {
    const ed = editorRef.current;
    if (ed && ed.getValue() !== texto) ed.setValue(texto);
  }, [texto]);

  useEffect(() => {
    const ed = editorRef.current;
    const model = ed?.getModel();
    if (!monaco || !ed || !model) return;
    monaco.editor.setModelLanguage(model, ID_LENGUAJE[lenguaje]);
    ed.updateOptions({ rulers: REGLAS[lenguaje] });
  }, [monaco, lenguaje]);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!monaco || !model) return;
    const total = model.getLineCount();
    monaco.editor.setModelMarkers(
      model,
      'appiseries',
      marcas
        .filter((m) => m.linea >= 1 && m.linea <= total)
        .map((m) => ({
          startLineNumber: m.linea,
          startColumn: m.columna,
          endLineNumber: m.linea,
          endColumn: Math.max(m.hasta, m.columna + 1),
          severity: SEVERIDAD[m.nivel],
          message: m.mensaje,
        })),
    );
  }, [monaco, marcas, texto]);

  useEffect(() => {
    const ed = editorRef.current;
    if (!irA || !ed) return;
    ed.revealLineInCenter(irA.linea);
    ed.setPosition({ lineNumber: irA.linea, column: irA.columna });
    ed.focus();
  }, [irA]);

  if (monaco === null) {
    // Sin Monaco: un área de texto simple, con el mismo contenido.
    return (
      <textarea
        className="programa-texto"
        aria-label="Fuente del programa"
        spellCheck={false}
        value={texto}
        onChange={(e) => alCambiar(e.target.value)}
      />
    );
  }
  return (
    <div className="programa-editor" ref={contenedor} aria-label="Fuente del programa" role="region">
      {monaco === undefined && <p className="tenue">Cargando el editor…</p>}
    </div>
  );
}
