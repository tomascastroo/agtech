import { RISK_LABELS } from '@/lib/labels';
import styles from './charts.module.css';

const LEVELS = [
  { key: 'LOW', color: 'var(--color-success)' },
  { key: 'MEDIUM', color: 'var(--color-warning)' },
  { key: 'HIGH', color: 'var(--color-danger)' },
] as const;

/** Parte-todo de niveles de riesgo (colores de estado, siempre con leyenda textual). */
export function RiskDistribution({ distribution }: { distribution: Record<string, number> }) {
  const total = LEVELS.reduce((acc, l) => acc + (distribution[l.key] ?? 0), 0);
  if (total === 0) return null;
  return (
    <div>
      <div
        className={styles.stack}
        role="img"
        aria-label="Distribución de activos por nivel de riesgo"
      >
        {LEVELS.filter((l) => (distribution[l.key] ?? 0) > 0).map((l) => (
          <span
            key={l.key}
            className={styles.stackSegment}
            style={{ flex: distribution[l.key], background: l.color }}
            title={`${RISK_LABELS[l.key]}: ${distribution[l.key]}`}
          />
        ))}
      </div>
      <div className={styles.legend}>
        {LEVELS.map((l) => (
          <span key={l.key} className={styles.legendItem}>
            <span className={styles.legendSwatch} style={{ background: l.color }} aria-hidden />
            Riesgo {RISK_LABELS[l.key]?.toLowerCase()}: <strong>{distribution[l.key] ?? 0}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
