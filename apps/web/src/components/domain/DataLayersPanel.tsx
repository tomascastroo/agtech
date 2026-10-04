import { Badge } from '@/components/ui/Badge';
import { Panel } from '@/components/ui/Panel';
import type { DataLayers } from '@/lib/api/types';
import styles from './documentation.module.css';

const INTERNAL = {
  MATCH: { tone: 'success', icon: 'check', label: 'Coincide' },
  MISMATCH: { tone: 'critical', icon: 'critical', label: 'No coincide' },
  NOT_COMPARED: { tone: 'neutral', icon: 'info', label: 'Sin comparar' },
} as const;

/**
 * Cuatro capas de cada dato: lo DECLARADO por el productor, lo EXTRAÍDO de los documentos (OCR),
 * la VERIFICACIÓN INTERNA (comparación) y la FUENTE OFICIAL. Hoy no hay fuente oficial conectada:
 * esa columna queda explícitamente vacía.
 */
export function DataLayersPanel({ layers }: { layers: DataLayers }) {
  const official = layers.officialSources[0];
  return (
    <Panel
      title="Datos del productor y del establecimiento"
      subtitle="Declarado → leído en los documentos → comparación interna → fuente oficial."
      flush
    >
      <div className={styles.tableScroll}>
        <table className={styles.layers} data-testid="data-layers">
          <caption className="visually-hidden">Capas de datos</caption>
          <thead>
            <tr>
              <th scope="col">Dato</th>
              <th scope="col">Declarado</th>
              <th scope="col">Extraído (OCR)</th>
              <th scope="col">Verificación interna</th>
              <th scope="col">Fuente oficial</th>
            </tr>
          </thead>
          <tbody>
            {layers.fields.map((f) => {
              const internal = INTERNAL[f.internal];
              // El OCR puede leer la misma palabra con o sin espacios ("LA ESPERANZA" /
              // "LAESPERANZA"): se muestra una vez por valor.
              const values = [
                ...new Map(
                  f.extracted.map((e) => [
                    e.normalized.replace(/[^\p{L}\p{N}]/gu, '').toUpperCase(),
                    e.normalized,
                  ]),
                ).values(),
              ];
              return (
                <tr key={f.key} data-field={f.key}>
                  <th scope="row">{f.label}</th>
                  <td>{f.declared ?? '—'}</td>
                  <td>
                    {values.length ? (
                      <div className={styles.extracted}>
                        {values.map((v) => (
                          <span key={v}>{v}</span>
                        ))}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <Badge tone={internal.tone} icon={internal.icon}>
                      {internal.label}
                    </Badge>
                  </td>
                  <td>
                    <span className={styles.unavailable}>
                      {f.official.status === 'NOT_CONNECTED'
                        ? 'NO CONECTADA'
                        : (f.official.value ?? '—')}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {official ? (
        <p className={styles.note} style={{ padding: '12px 16px' }}>
          {official.name}: {official.status === 'NOT_CONNECTED' ? 'no conectada. ' : ''}
          {official.reason} Ningún dato figura como verificado por fuente oficial.
        </p>
      ) : null}
    </Panel>
  );
}

/** Aviso fijo en toda pantalla con datos de demostración. */
export function DemoBanner({
  scenario,
  message = 'Productor, CUIT, RENSPA y documentos son ficticios y no tienen validez. Generado con “Simular solicitud” para probar el flujo.',
}: {
  scenario?: string | null;
  message?: string;
}) {
  return (
    <div className={styles.demoBanner} role="note" data-testid="demo-banner">
      <div>
        <strong>DATOS DE DEMOSTRACIÓN</strong>
        {scenario ? ` · ${scenario}` : ''}. {message}
      </div>
    </div>
  );
}
