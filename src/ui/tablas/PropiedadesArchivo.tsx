import { literalesDe, parametroDe, tipoDeTabla, type RegistroTabla, type Tabla } from '@core/tablas/modelo';
import { establecerFisico, establecerTextoRegistro, renombrarRegistro } from '@core/tablas/operacionesTabla';
import { useTablas } from '../estado/storeTablas';
import { EntradaTextoConfirmar, Etiquetado } from '../componentes/propiedades/controles';
import { EditorKeywordsTabla } from './EditorKeywordsTabla';

interface Props {
  tabla: Tabla;
  registro: RegistroTabla;
  nombreArchivo: string;
}

/** Datos del archivo y de su formato de registro. */
export function PropiedadesArchivo({ tabla, registro, nombreArchivo }: Props) {
  const modificar = useTablas((s) => s.modificar);
  const tipo = tipoDeTabla(tabla);
  const texto = parametroDe(registro.keywords, 'TEXT');
  const pfile = parametroDe(registro.keywords, 'PFILE');

  return (
    <div className="form">
      <p className="tenue">
        {nombreArchivo} · {tipo === 'PF' ? 'archivo físico (PF)' : 'archivo lógico (LF)'}
      </p>
      <Etiquetado etiqueta="Formato" ayuda="Nombre del formato de registro (hasta 10 caracteres). Se confirma al salir del campo.">
        <EntradaTextoConfirmar
          valor={registro.nombre}
          etiquetaAria="Nombre del formato de registro"
          onConfirmar={(v) => modificar((t) => renombrarRegistro(t, registro.id, v))}
        />
      </Etiquetado>
      <Etiquetado etiqueta="Descripción" ayuda="TEXT del registro: se usa como etiqueta de la tabla en SQL">
        <input
          type="text"
          className="form-entrada"
          maxLength={50}
          value={texto === null ? '' : (literalesDe(texto)[0] ?? '')}
          onChange={(e) =>
            modificar((t) => establecerTextoRegistro(t, registro.id, e.target.value), { clave: `reg:${registro.id}:texto` })
          }
        />
      </Etiquetado>
      {pfile !== null && (
        <Etiquetado etiqueta="Físico" ayuda="PFILE: archivo físico sobre el que se construye el lógico">
          <EntradaTextoConfirmar
            valor={pfile}
            etiquetaAria="Archivo físico (PFILE)"
            onConfirmar={(v) => modificar((t) => establecerFisico(t, registro.id, v))}
          />
        </Etiquetado>
      )}

      <h4>Keywords del archivo</h4>
      <EditorKeywordsTabla
        destino={{ tipo: 'archivo' }}
        keywords={tabla.keywords}
        clave="archivo"
        ocultar={(k) => k.nombre === 'UNIQUE'}
      />
      <h4>Keywords del formato</h4>
      <EditorKeywordsTabla
        destino={{ tipo: 'registro', regId: registro.id }}
        keywords={registro.keywords}
        clave={`reg:${registro.id}`}
        ocultar={(k) => k.nombre === 'TEXT' || k.nombre === 'PFILE'}
      />
    </div>
  );
}
