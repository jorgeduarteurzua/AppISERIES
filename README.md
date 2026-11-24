# AppISERIES

Generador visual para IBM i (AS/400). Permite diseñar y generar programas
COBOL, CLP y DSPF, crear tablas (PF/LF y SQL) de forma gráfica, y dibujar o
importar pantallas tipo SDA.

Aplicación de escritorio construida con **Electron + React + TypeScript + Vite**,
estado con **Zustand** y pruebas con **Vitest**.

## Estado actual

Implementado (Fase 1 y Fase 3):

- Base del proyecto Electron + React + TS + Vite.
- Modelo de datos de pantallas DSPF (`src/core/modelo/pantalla.ts`).
- **Parser de DDS DSPF** (`src/core/parser/`): interpreta fuentes reales
  exportadas de SEU/SDA, con subfiles, ventanas, botones, teclas de función,
  indicadores y validaciones. Probado contra las 32 fuentes de `QDSPSRC`.
- **Visor de pantallas tipo SDA** (`src/ui/componentes/VisorPantalla.tsx`):
  lienzo de caracteres 24x80 / 27x132 que emula un terminal 5250 con colores
  y atributos (HI, UL, RI, BL, ND, PR).
- Importación de fuentes y navegación por carpeta (p.ej. `QDSPSRC`).

También implementado:

- **Generador de DDS** (`src/core/generador/`): convierte la pantalla en fuente DDS con
  columnas exactas y continuaciones. Probado con ida y vuelta sobre los 31 fuentes DDS de
  `QDSPSRC` (se regeneran idénticos).
- **Editor visual de pantallas** (botón «Editar pantalla»): seleccionar, arrastrar, flechas,
  agregar texto y campos, borrar, deshacer/rehacer (Ctrl+Z / Ctrl+Y), panel de propiedades
  (atributos, color, indicadores, keywords), registros (normal, ventana, subfile con su
  control), títulos de ventana arriba y abajo, teclas de función, tamaño 24x80 / 27x132,
  validación con lista de problemas y pantalla nueva desde cero.
- Pestaña **Fuente DDS**: ver, copiar y guardar el fuente generado (Windows-1252, CRLF).

- **Diseñador de tablas** (sección «Tablas»): abre una carpeta de fuentes de archivos (p.ej.
  `QDDSSRC`) o crea una tabla nueva, física (PF) o lógica (LF).
  - Cuadrícula de campos editable en la propia fila: nombre, tipo, longitud, decimales,
    llave, nulos y descripción; subir, bajar, duplicar y eliminar campos.
  - Condiciones de validez por campo: `VALUES`, `RANGE` y `COMP`, además de cabecera
    (`COLHDG`), alias, valor por defecto (`DFT`), `ALWNULL` y cualquier otra keyword.
  - Llave de acceso (ascendente/descendente, orden), `UNIQUE` y, en lógicos, sentencias de
    selección y omisión (S/O).
  - Validación con lista de problemas (límites por tipo, tamaño del registro y de la llave,
    llaves que no existen, campos contra el físico).
  - Pestañas **Fuente DDS** y **SQL** (`CREATE TABLE`, `INDEX`, `VIEW`, `LABEL ON`), con copiar y
    guardar. Los 48 fuentes de `QDDSSRC` se regeneran idénticos.
  - Deshacer y rehacer (Ctrl+Z / Ctrl+Y).

Pendiente (fases siguientes):

- Generadores COBOL (CBL / SQLCBL / CBLLE / SQLCBLLE) y CLP.
- Conexión al IBM i por FTP y compilación remota (conexión guardada; se pedirá solo la
  biblioteca y el archivo de fuentes).
- Guardar sobre el archivo original (hoy se usa «Guardar como» desde la pestaña Fuente DDS).
- Lógicos con unión (`JFILE`/`JOIN`): se leen y se vuelven a escribir como DDS, pero todavía
  no se traducen a SQL.

## Cómo ejecutar la aplicación

Haz doble clic en **`AppISERIES.lnk`**. Compila la aplicación (unos 2 segundos) y abre la
ventana. Es lo único que necesitas para el uso normal.

- En este equipo `ComSpec` está dañado (ver más abajo), por eso los `.bat` no se abren por doble
  clic ni con `& .\x.bat` en PowerShell ("El sistema no puede encontrar el archivo especificado").
  El `.lnk` llama a `cmd.exe` directamente y lo evita. También sirve:
  `cmd /c "Iniciar AppISERIES.bat"`.
- La primera vez, si faltan las dependencias, las instala solo (necesita Node.js y conexión).
- **`Crear acceso directo.vbs`** (doble clic) vuelve a crear `AppISERIES.lnk` y ofrece ponerlo en el escritorio.
- **`Iniciar AppISERIES (desarrollo).bat`** abre el modo desarrollo, que se recarga al guardar
  cambios en el código. La ventana de consola debe quedar abierta mientras lo uses.

## Guardar

Arriba, junto a «Nueva…», están **Guardar** y **Guardar como…** (en Pantallas y en Tablas). También
`Ctrl+S` y `Ctrl+Mayús+S`.

- **Guardar** escribe en el archivo del que abriste lo que editas. Si es nuevo, pide dónde dejarlo.
  Está desactivado mientras no haya cambios, y el botón se resalta cuando los hay.
- **Guardar como…** siempre pide la ruta, y desde ese momento el archivo actual es el nuevo.
- La primera vez que se sobrescribe un archivo existente se deja una copia **`NOMBRE.TXT.bak`** con
  el original (no se vuelve a tocar en los guardados siguientes). Importante para los fuentes
  exportados de SDA: el DDS se regenera y no conserva sus comentarios `A*%%TS`.
- Se escribe en Windows-1252 con saltos de línea CRLF, igual que los fuentes de origen.
- Si hay errores de validación, la app pregunta antes de guardar.
- La app solo sobrescribe archivos que abrió ella (de una carpeta, de «Importar» o de un diálogo
  de guardado).

## Conexión al AS400 y envío de fuentes

**Conexión** (botón junto a «Guardar», en Pantallas y en Tablas): servidor, puerto, usuario y
contraseña. Se guarda una sola vez en `conexion-as400.json` dentro de la carpeta de datos de la app.

- La contraseña se cifra con el sistema (`safeStorage`, DPAPI en Windows) y nunca vuelve a la
  interfaz. Se puede **cambiar** escribiendo otra y **borrar** con «Borrar contraseña». Si el equipo no
  puede cifrar, solo se conserva mientras la app esté abierta.
- «Guardar y probar» comprueba servidor, usuario, contraseña y si el servidor deja ejecutar comandos
  (`RCMD`), que hace falta para compilar.
- FTP simple envía la contraseña y los fuentes sin cifrar; con «FTP seguro (FTPS)» van cifrados.

**Enviar al AS400…** pide solo lo que cambia: la **biblioteca y el archivo fuente** donde dejar el
fuente y la **biblioteca de compilación** donde queda el objeto. Se recuerdan para la vez siguiente.

- El archivo fuente propuesto depende del tipo (`QDSPSRC`, `QDDSSRC`, `QSQLSRC`, `QCBLSRC`, `QCLSRC`). Si no
  existe, se crea.
- Pantallas se compilan con `CRTDSPF`, archivos con `CRTPF`/`CRTLF`, scripts con `RUNSQLSTM` y los
  programas COBOL con `CRTSQLCBL` (OPM) o `CRTSQLCBLI` (ILE), a elección, y los CL con `CRTCLPGM` (CLP)
  o `CRTBNDCL` (CLLE). Todo lo que usa SQL se compila siempre con `COMMIT(*NONE)`.
- El listado se trae del spool donde lo deja cada compilador: el precompilador SQL escribe en `QSYSPRT`
  y los compiladores COBOL y CL en un spool con el nombre del programa. Si el SQL tiene errores graves, el
  COBOL no llega a compilarse y solo se trae `QSYSPRT`.
- Compilar un PF con «Reemplazar» borra sus datos si ya existe: la app pregunta antes.
- Si la compilación falla se muestra el mensaje y, cuando el servidor lo permite, el listado.
- Los nombres de biblioteca, archivo y miembro se validan (máximo 10 caracteres: A-Z, 0-9, `$ # @ _`)
  antes de armar ningún comando.

## Generar CRUD

En **Tablas**, con un archivo físico abierto, **Generar CRUD…** crea una **pantalla (DSPF)** y un
**programa COBOL con SQL** que la atiende, con el estilo de los programas existentes.

**Pantalla.** Se elige *Normal* o *Window* y 80 o 132 columnas (automático usa 80 si todo cabe).
Los registros siguen esta nomenclatura, con un correlativo:

| Tipo | Normal | Window |
|---|---|---|
| Detalle | `R01` | `W01` |
| Subfile | `S01` | `WS01` |
| Control del subfile | `C01` | `WC01` |
| Mensaje y teclas del control | `FC01` | `FWC01` (`WINDOW(WC01)` y `OVERLAY`: usa la ventana de `WC01`) |
| Ayuda | `W01` | `W02` |

- El subfile tiene siempre **12 líneas por página**. El mensaje y las teclas están en `FC01`/`FWC01`,
  no en el control, así no se pisan con las filas del subfile (error CPD7812).
- Si las columnas no caben, la lista es una sola línea que se **desplaza con F19/F20** por columnas
  completas, sin volver a leer la base de datos.
- Las llaves se protegen con una sola condición «40 o 41» (`A 40` y `AO 41 DSPATR(PR)`), no con dos
  líneas `DSPATR(PR)`, que no compila.
- En ventanas se agrega el registro ficticio `R99` (`KEEP ASSUME OVERLAY`).

**Teclas** (se pueden cambiar de número y de texto, quitar o agregar): F1 Ayuda, F3 Salir,
F4 Ayuda de campo (solo en el detalle), F5 Renovar, F6 Insertar, F8 Modificar, F9 Grabar, F12 Volver, F19/F20 desplazamiento, F23 Eliminar.
En la lista, F8 y F23 actúan sobre el registro donde está el cursor. En el detalle, F9 graba, F8 pasa
de consulta a modificar y F23 elimina (se pide confirmar con otra F23). Enter no graba.
Una tecla **personalizada** deja en el programa un párrafo `ACCION-Fnn` vacío para que usted escriba
lo que debe hacer, y el `EVALUATE` queda marcado para agregar más teclas.

**Ayuda de campo (F4).** F1 es la ayuda general (la ventana con las teclas). F4 es la ayuda del
campo donde está el cursor, como en los programas existentes que llaman a otro programa para elegir
un valor. En la tabla de campos, la columna **Ayuda (párrafo)** pide el nombre del párrafo que se
genera (siempre empieza con `AYUDA-`, por ejemplo `AYUDA-GENERO`) y **Ayuda (programa)** el programa
que ese párrafo llama (máximo 10 caracteres, sin guiones; puede quedar vacío).
- F4 aparece en la leyenda del detalle solo al **agregar y modificar**, y solo si algún campo tiene
  ayuda. Nunca aparece en la lista. La pantalla pide al sistema el campo del cursor (`RTNCSRLOC`) y
  el programa elige el párrafo según ese campo. Una llave solo tiene ayuda al agregar.
- Todos los programas de ayuda tienen **la misma interfaz**: `CALL "PROGRAMA" USING CODIGO DESCRIPCION`.
  `CODIGO` es `X(30)`: entra el valor actual y vuelve el elegido (en blanco = no se eligió nada).
  `DESCRIPCION` es `X(50)`: vuelve la descripción de lo elegido. Un campo numérico (entero) llega con
  los dígitos a la derecha y debe volver con los dígitos del código. No se admiten fechas, horas,
  decimales ni campos de más de 30 caracteres. El valor elegido se deja en el campo y la descripción
  en la línea de mensajes; si se necesita mostrarla, se agrega un campo en la pantalla.
- Por cada programa de ayuda distinto se genera un **esqueleto COBOL** (pestaña *Ayuda …*) con esa
  interfaz y sin lógica, para completarlo. Se guarda junto con el CRUD y, al enviar, **viene sin
  marcar** para no reemplazar una ayuda que ya exista en el AS400.
- Sin programa, el párrafo deja el `CALL` comentado para completarlo a mano.
- Las teclas guardadas de una versión anterior (F4 = ayuda) pasan a F1, y se agrega F4 de ayuda de campo.

**El CRUD queda guardado.** Al generarlo, el archivo, la pantalla, el programa y los esqueletos de
ayuda quedan disponibles en **Tablas** como **Enviar el CRUD…** y **Guardar el CRUD…**, aunque se
cierre el diálogo. Si la pantalla se abrió en el editor (*Abrir pantalla en el editor*), se envía y se
guarda **la pantalla editada**, no la generada, mientras siga abierta en el editor con el mismo nombre.
Generar el CRUD de nuevo suelta ese vínculo. El conjunto vive mientras la aplicación está abierta;
con **Guardar el CRUD…** queda en archivos (`.pf`, `.dspf`, `.sqlcbl` y la ayuda). Si el programa ya no
coincide con la pantalla editada (por ejemplo, si se cambiaron campos), hay que ajustarlo a mano.
**Fechas y horas.** En la tabla de campos se marca si un campo es *Fecha* u *Hora* y se elige el
formato con que se ve: `DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD`, `DD-MM-YYYY`, `DD/MM/YY`, `HH:MM:SS`,
`HH:MM` (Y año, M mes o minutos, D día). **En el archivo se guarda siempre según el tipo del campo:**

| Campo | Se guarda como |
|---|---|
| Numérico de 8 | fecha `YYYYMMDD` · hora `HHMMSSCC` |
| Numérico de 6 | fecha `YYMMDD` · hora `HHMMSS` |
| Numérico de 4 | hora `HHMM` |
| Tipo `L` / `T` | `DATE` / `TIME` (el SQL usa `CHAR(col, ISO)` y `DATE()` / `TIME()`) |
| Texto de 8 / 6 | fecha `YYYYMMDD` / hora `HHMMSS` |

El programa convierte, valida (meses, días, años bisiestos, horas y minutos) y no graba si algo no es
válido. Un año de 2 dígitos de 51 a 99 es 19xx y de 00 a 50 es 20xx. Una fecha en blanco se guarda
como 0 (o `0001-01-01` en un campo `DATE`). Los campos `L` y `T` se editan siempre como fecha y hora.

**Campos que no se muestran.** Los que no están en el detalle (por ejemplo, los de auditoría) toman el
valor por defecto de la tabla, o el que se indique **al agregar** y **al modificar**: fecha actual, hora
actual (con el almacenamiento del campo), usuario o un valor fijo. Va dentro del `INSERT` y del `UPDATE`.

**Guardar en el equipo.** «Guardar los dos…» escribe la pantalla y el programa en una carpeta que se
elige (la recuerda), con copia `.bak` si el archivo existía. También se puede marcar «Guardar también
una copia de los fuentes en mi equipo» al enviar al AS400.

Otras reglas:

- La tabla necesita llave. Si todos sus campos son llave se puede agregar, consultar y eliminar,
  pero no modificar.
- Los campos que no caben en una pantalla (por ejemplo, de 500 caracteres) quedan fuera, con aviso.
- Los timestamps se editan como texto. Los campos de coma flotante no se soportan.
- Los textos generados no llevan acentos (el fuente pasa por una conversión a EBCDIC).
- **No se pudo compilar nada contra un IBM i real.** Revisa el COBOL y la pantalla generados la
  primera vez, sobre todo los nombres de las copias `DDS-<formato>-I/-O/-INDIC`.

**Condiciones OR en el editor de pantallas.** En «Indicadores» un espacio es *Y* y `|` es *O*:
`40 41` activa con los dos; `40 | 41` activa con cualquiera de los dos. El parser y el generador leen y
escriben las líneas `AO` del DDS. El editor ahora marca como error un atributo `DSPATR` repetido en un
campo y un elemento del control del subfile dentro de las filas de la página del subfile.
### Validación de campos

En el diálogo del CRUD, cada campo del detalle tiene dos columnas. Por omisión no se valida nada.

- **Obligatorio**: para texto, «Sí» (distinto de espacios). Para números, «Mayor a 0» o «Distinto de 0». Para fecha u hora, «Sí» (no vacía). Las llaves siempre son obligatorias: las numéricas deben ser mayores a 0 y las de texto o fecha no pueden quedar vacías.
- **Validación** (se revisa solo si el campo tiene valor):
  - Email: una sola `@` que no va al inicio, un punto después de la `@`, sin puntos seguidos ni junto a la `@`, y solo letras, números y `- _ + .`. El campo lleva `CHECK(LC)` para que acepte minúsculas.
  - Rango: mínimo y máximo, para números.
  - Valores permitidos: separados por comas, por ejemplo `S,N`. Los de texto se pasan a mayúsculas, porque la pantalla también lo hace.
  - Existe en tabla: `SELECT COUNT(*)` sobre `TABLA` o `BIBLIOTECA/TABLA`, por la columna indicada. Si no se indica biblioteca, se usa la de la tabla del CRUD.

El programa valida en el párrafo `VALIDAR-DETALLE`, al grabar (F9), antes del INSERT o del UPDATE. Cada campo validado tiene un indicador del 50 al 99 que activa `DSPATR(RI PC)`, así que los campos con error se ven en video inverso, el cursor queda en el primero y el mensaje es el del primer error. Las fechas con formato no válido también se marcan así.

### El CRUD se recuerda por tabla

Lo que se marca en el diálogo, el último CRUD generado y la pantalla tal como quedó en el editor se guardan en el equipo, por tabla, y se recuperan aunque se cierre la aplicación:

- Al abrir de nuevo «Generar CRUD…» quedan las opciones de la última vez y se ve lo último generado.
- Al abrir la tabla, «Enviar el CRUD…» y «Guardar el CRUD…» vuelven a estar disponibles.
- Si la pantalla se editó en el editor, el CRUD la envía y la guarda con esos cambios, y «Abrir pantalla en el editor» la abre como quedó. «Generar de nuevo» pide confirmar antes de reemplazarla.

### Detalle con campos largos (CNTFLD)

En el detalle del CRUD, un campo de texto que no cabe en el ancho de la pantalla se parte con `CNTFLD`. El ajuste es el mayor divisor exacto de la longitud (mínimo 20 y como máximo el ancho disponible). Si no hay divisor exacto se usa el ancho disponible y la última fila queda más corta, con un aviso. La columna **Ajuste** del diálogo permite fijar otro valor por campo. El programa COBOL sigue tratando el campo completo.

En la lista, los campos largos se muestran hasta 250 caracteres y F19/F20 desplazan por columnas (o por tramos si una columna es más ancha que la pantalla).

### Traer fuentes del AS400

El botón **Traer del AS400…** pide biblioteca y archivo de fuentes, lista los miembros (con fecha si el servidor la da) y descarga los que se marquen a una carpeta. La lista muestra el **Tipo** (CBLLE, DSPF, PF, LF…) y el **Texto** de cada miembro, como PDM. El servidor los entrega con `RCMD DSPFD ... TYPE(*MBRLIST)` hacia QTEMP y una tabla de solo texto (`RUNSQL`), que se baja en ASCII; solo escribe en QTEMP, que se vacía al cerrar la sesión. La extensión local sale de ese tipo en minúsculas (`DSPF` → `.dspf`, `SQLCBLLE` → `.sqlcblle`). Si el servidor no permite `RCMD`, el tipo se deduce del contenido: `.dspf` por `DSPSIZ`, campos con uso y posición o teclas como `CF03`; `.lf` por `PFILE(` o `JFILE(`; y sin marcas, por el nombre del archivo fuente. Esa deducción puede equivocarse en un miembro atípico. Si el archivo ya existe se omite, salvo que se marque reemplazar, y en ese caso queda una copia `.bak`. Un miembro que falla no detiene a los demás.

### Botones de envío por tipo

Pantallas: **Enviar pantalla…**. Tablas: **Enviar archivo…** (DDS y SQL opcional). CRUD: **Enviar pantalla…**, **Enviar programa…** y **Enviar los dos…**. En cada envío se indican biblioteca y archivo fuente por tipo.

### Sondeo del servidor FTP

`node herramientas/sondeo-ftp.mjs` hace consultas de solo lectura al servidor y escribe `sondeo-ftp-resultado.txt` (contiene servidor y usuario; está en `.gitignore`).
## Uso general

- **Carpetas al día:** la lista de archivos de Pantallas, Tablas y Programas se actualiza sola cuando cambia un archivo de la carpeta abierta, incluso si se copia o se borra desde el Explorador de Windows. También se actualiza al guardar, al guardar el CRUD y al traer fuentes del AS400.
- **Índices del físico:** con un PF abierto, el panel «Índices de este archivo» muestra los lógicos de la carpeta que lo usan (PFILE), con su llave. Un clic abre cada uno. «Nuevo índice…» arma el LF (nombre, texto, UNIQUE, llave en orden con ascendente o descendente, y todos los campos o solo algunos) y muestra a la vez el DDS y el SQL (`CREATE INDEX`). El índice se abre como archivo nuevo y «Guardar» propone dejarlo en la misma carpeta.
- **CRUD en pestañas:** General · Campos · Validaciones · Ayudas y valores · Teclas · Resultado. El diálogo ocupa casi toda la ventana, y en las tablas la fila de títulos y la columna del campo quedan fijas al desplazarse.
- **Menú en español:** Archivo, Editar, Ver y Ayuda. Ayuda tiene «Acerca de AppISERIES», «Desarrollado por», «Referencias de COBOL» y «Repositorio en GitHub». Los enlaces se abren en el navegador, y solo los de esa lista.
- **Tema «IBM i oscuro»:** azules de IBM, títulos en turquesa 5250 y contraste suficiente para leer cómodo. El editor de programas usa el mismo tema.

## Programas desde una pantalla

- **Campos de un archivo…** (en Pantallas): elige un archivo PF o LF de los que están abiertos en Tablas, el formato de la pantalla, los campos, el uso (entrada, salida o ambos), la etiqueta (TEXT, COLHDG, el nombre o ninguna) y desde qué fila y columna se ubican. Cada campo queda con `R` en la columna 29 y `REFFLD(CAMPO ARCHIVO)`, así hereda el largo y el tipo y el generador sabe de dónde leerlo. Las etiquetas se alinean y los campos de entrada van subrayados. En fechas y horas no se escribe el largo ni el tipo: los da el archivo.
- **Generar programa…** (en Pantallas): se elige el nombre, el formato por el que parte el programa y cómo se genera: COBOL con E/S nativa (CBL o CBLLE) o COBOL con SQL (SQLCBL o SQLCBLLE). El programa se abre en Programas para completarlo y compilarlo.
  - **Esqueleto:** la pantalla con sus copias DDS, un párrafo `MOSTRAR-<formato>` por formato con su ciclo y el `EVALUATE` de las teclas del DSPF (F3 sale, F12 vuelve, las demás dejan un párrafo `TECLA-Fnn-<formato>` para completar). Los formatos que solo se escriben, con OVERLAY y sin entrada, se escriben antes del formato inicial, o después si usan su ventana.
  - **Subfiles:** `CARGAR-<sfl>` usa los indicadores de SFLCLR, SFLDSP, SFLDSPCTL y SFLEND del control, y respeta el SFLSIZ. `PROCESAR-<sfl>` lee las filas modificadas.
  - **Datos:** para los campos con REFFLD, en un formato normal se genera `LEER-<archivo>-<formato>` por la llave del archivo (si la pantalla tiene como entrada todos sus campos), más `AGREGAR-` y `MODIFICAR-`. En un subfile, la carga lee los registros del archivo. Con E/S nativa se usa `SELECT … ASSIGN TO DATABASE-…`, `COPY DDS-ALL-FORMATS`, `READ`, `START`, `WRITE` y `REWRITE`. Con SQL se usan variables de trabajo con la definición del archivo, `SELECT INTO`, un cursor, `INSERT` y `UPDATE`.
  - **Avisos:** si un archivo no está abierto en Tablas, si la pantalla no tiene INDARA, o si un formato no tiene la llave como entrada.
- **Subfiles como los del CRUD:** al crear un subfile con «+ Registro» (opción «Como el CRUD», marcada por defecto), el control lleva `OVERLAY`, `SFLCSRRRN(&REGREL)` con el oculto `REGREL 5S 0H` (registro relativo del cursor) y `POSCUR 4S 0H` con `SFLRCDNBR(CURSOR)` (la página donde quedó). El subfile lleva `OPCION 1A B` en la columna 2, el encabezado «Opc» y la línea «Opciones: 2=Modificar 4=Eliminar 5=Consultar», que se puede cambiar. En una pantalla que ya existe, **Completar subfile** (en la barra de edición) agrega lo que falte. No mueve nada: si no hay lugar, lo avisa.
- **Llave oculta:** al incorporar campos de un archivo en un subfile, los campos de la llave se agregan como ocultos (`HK01`, `HK02`…, con `REFFLD`). Así el programa sabe a qué registro corresponde la fila elegida.
- **Barra de desplazamiento:** con `SFLEND(*SCRBAR)`, el editor marca como error el campo del subfile que llegue al borde derecho. A pantalla completa debe terminar en la columna 77 o antes; en una ventana, 2 columnas antes del borde. Si no, el compilador da CPD8186 y, por arrastre, CPD5238. Solo se avisa (también al incorporar campos): no se acomoda nada.
- **Campos ocultos:** «+ Campo oculto» agrega un campo sin posición. Debajo del lienzo, «Campos sin posición» lista los ocultos (H) y de programa (P) del formato; un clic los selecciona para editarlos o borrarlos.
- **Programa con opciones:** si el subfile tiene `OPCION` y la llave oculta, `PROCESAR-<sfl>` evalúa la opción de cada fila elegida. La 2 y la 5 llevan la llave al formato de detalle, lo leen con `LEER-` y lo muestran. La 4 elimina (`DELETE` nativo o de SQL). Al terminar se vuelve a cargar el subfile y se queda en la página donde estaba el cursor (`REGREL` y `POSCUR`). Con SQL, la llave visible y oculta no repite columnas.

## Programas (COBOL y CL)

La sección **Programas** edita fuentes COBOL (`.cbl`, `.cblle`, `.sqlcbl`, `.sqlcblle`) y CL (`.clp`, `.clle`) con Monaco, el editor de VS Code, sin conexión a internet. RPG (`.rpg`, `.rpgle`, `.sqlrpgle`) ya se abre y se edita, pero todavía no se compila desde la aplicación.

- **Abrir carpeta…** lista los programas de la carpeta con su tipo. **Nuevo programa…** crea uno con su esqueleto. **Programa del CRUD** abre el programa del último CRUD: lo que se edite se guarda con el CRUD (también al cerrar la aplicación), y «Enviar el CRUD…» lo envía con esos cambios. Si se vuelve a generar el CRUD, la aplicación pide confirmar antes de reemplazarlo.
- **Traer del AS400…** propone `QCBLSRC` o `QCLSRC` según el programa. Al terminar, «Abrir la carpeta en Programas» los muestra.
- **Formato fijo de COBOL:** el margen muestra la secuencia estilo SEU (`0001.00`) sin guardarla en el texto (el FTP numera el miembro de 1,00 en 1,00). Hay guías en las columnas 7, 8, 12, 72 y 80. Comentarios, palabras reservadas, literales, `PIC` y el SQL entre `EXEC SQL` y `END-EXEC` van en colores. En CL se colorean comandos, parámetros, valores `*XXX`, variables `&X`, etiquetas y comentarios.
- **Estructura:** divisiones, secciones, `COPY` y párrafos en COBOL; `PGM`, variables, etiquetas y subrutinas en CL. Un clic lleva a la línea. Con F12 o Ctrl+clic sobre el nombre de un `PERFORM`, `GO TO`, `GOTO` o `CALLSUBR` se va a su definición.
- **COPY DDS:** al pasar el ratón sobre `COPY DDS-C01-I OF TABLA1D` se ven los campos (o los indicadores con `-INDIC`) del formato, si esa pantalla está abierta en Pantallas o es la del CRUD.
- **Formato:** avisa de tabuladores, líneas de más de 80 caracteres, columna 7 no válida, texto después de la columna 72 (el compilador no lo lee) y acentos fuera de los comentarios.
- **Compilación:** «Enviar programa…» envía y compila con el tipo del programa (se puede cambiar entre OPM e ILE). Los mensajes del listado se marcan en su línea: en el precompilador SQL por el registro, en COBOL por `NUMSEC` y en CL por la línea de arriba del mensaje. Los de las referencias cruzadas de CL no tienen línea. Gravedad menor a 10 es información, de 10 a 29 es aviso (el compilador lo acepta) y 30 o más es error.
- **Autocompletar:** al escribir, o con Ctrl+Espacio, el editor propone los datos de la DATA DIVISION (con su nivel y PIC), los párrafos, los campos de las pantallas de los `COPY DDS` y las palabras de COBOL y SQL. En CL propone las variables (al escribir `&`), las etiquetas y los comandos más usados.
- **Renombrar (F2):** cambia un dato, párrafo, variable, etiqueta o subrutina en todo el programa, sin tocar comentarios ni literales. Rechaza nombres no válidos o que ya existen, y avisa si alguna línea COBOL pasa de la columna 72.
- **Listado nuevo:** antes de compilar se guarda una copia del spool del listado. Si después de compilar sigue igual, el compilador no dejó un listado nuevo: no se muestra el de una compilación anterior y se avisa.
- Monaco se carga al abrir el primer programa. Si no se puede cargar, el programa se edita en un área de texto simple.

## Seguridad y repositorio

- La versión compilada lleva una política de contenido (CSP) en `index.html`: solo carga lo que viene con la aplicación, sin red y sin `eval`. Monaco necesita estilos en línea y sus trabajadores, y por eso los permite. En desarrollo no se aplica, porque Vite necesita scripts en línea.
- El menú Ayuda abre en el navegador solo los enlaces conocidos (`src/core/acerca.ts`).
- `.gitignore` deja fuera los compilados, las copias `.bak`, los resultados de los sondeos (llevan el servidor y el usuario), los accesos directos y las carpetas con fuentes reales del IBM i (`QCBLSRC`, `QDDSSRC`, `QDSPSRC`, `Fuentes Generador`). Las pruebas que usan `QDDSSRC` y `QDSPSRC` necesitan esas carpetas en el equipo.

## Requisitos

- Node.js 20+ y npm.

## Instalación

> **Nota para este equipo (Windows):** la variable de entorno `ComSpec` del
> sistema está corrupta (contiene dos rutas unidas por `;`). Eso hace fallar
> `npm install`, `npx` y el postinstall de Electron con `ENOENT ... cmd.exe;...`.
> Mientras no se corrija en el sistema, usa estos comandos, que fijan `ComSpec`
> solo para la sesión actual de PowerShell:

```powershell
# 1) Instalar dependencias sin ejecutar postinstalls problemáticos
npm install --ignore-scripts

# 2) Completar la instalación de Electron con ComSpec correcto
$env:ComSpec = "C:\Windows\System32\cmd.exe"
node .\node_modules\electron\install.js
```

La corrección definitiva es arreglar `ComSpec` en las variables de entorno de
Windows para que valga exactamente `C:\Windows\System32\cmd.exe`.

## Desarrollo

```powershell
$env:ComSpec = "C:\Windows\System32\cmd.exe"
node .\node_modules\vite\bin\vite.js
```

Vite sirve el renderer y `vite-plugin-electron` abre la ventana de escritorio.
Una vez corregido `ComSpec` a nivel de sistema, bastará con `npm run dev`.

## Pruebas

```powershell
$env:ComSpec = "C:\Windows\System32\cmd.exe"
node .\node_modules\vitest\vitest.mjs run
```

Con `ComSpec` corregido en el sistema: `npm test`.

## Estructura

```
electron/            Proceso principal y preload de Electron
  main/main.ts       Ventana, IPC y lectura de fuentes (CP850 vía iconv-lite)
  preload/preload.ts Puente seguro window.api
src/
  core/
    modelo/          Modelo de datos (PantallaDSPF, Registro, Campo, ...)
    parser/          Parser de DDS DSPF + pruebas
    render/          Conversión de modelo a matriz de celdas del lienzo
    fuentes/         Programas: lenguaje por extensión, estructura, revisión de columnas, COPY DDS
    as400/           Comandos, validación y lector de listados de compilación
  ui/
    programas/       Editor de programas (Monaco) y colores de COBOL, CL y RPG
    componentes/     VisorPantalla, PanelDetalle
    estado/          Store de Zustand
    estilos/         CSS
QDSPSRC/             Fuentes DDS de ejemplo (32 pantallas reales)
```

## Uso

1. Arranca la app en modo desarrollo.
2. Pulsa **Abrir carpeta…** y elige `QDSPSRC`, o **Importar fuentes…** para
   elegir archivos sueltos.
3. Selecciona una fuente de la lista y luego un formato de registro para verlo
   dibujado en el visor 5250.

### CRUD: límite de la lista y ventanas

- La lista (subfile) carga como máximo 500 registros (`SFLSIZ(0500)`). Si hay más, el programa avisa y se usa Posicionar para ver los demás.
- En pantallas Window la última línea de la ventana queda libre para mensajes (`*MSGLIN`) y el borde (fila + alto + 1, columna + ancho + 3) debe caber en la pantalla; la validación avisa si no.

## Teclas F1, F3, F12, AYUDA y PIE

- Toda pantalla nueva sale con F1, F3 y F12 declaradas como CF, un formato `AYUDA` (ventana con las teclas, se muestra con F1) y un formato `PIE` (OVERLAY con el pie de teclas).
- El botón «Teclas y ayuda» agrega lo que falte y vuelve a armar AYUDA y PIE con las teclas actuales.
- La validación avisa si falta F1, F3 o F12, si F1 no tiene formato AYUDA o si AYUDA no lista todas las teclas.
- Con `SFLEND(*SCRBAR)` un campo del subfile no puede empezar en la columna 1 (su byte de atributo cae sobre la barra, CPD8186) ni terminar sobre ella. Solo se avisa; los campos no se mueven solos.
- El generador de programas mapea F1 a `MUESTRA-AYUDA`, F3 a la salida del programa y F12 a volver al formato anterior. Los formatos solo de escritura (PIE) se escriben junto con cada formato.
- Nada de lo generado se ha compilado en el IBM i.
