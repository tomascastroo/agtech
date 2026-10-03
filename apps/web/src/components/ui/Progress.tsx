import styles from './progress.module.css';

export interface ProgressSegment {
  value: number;
  tone: 'success' | 'warning' | 'critical' | 'info' | 'neutral';
  label: string;
}

/**
 * Barra segmentada (p. ej. estado del checklist). La leyenda con texto acompaña siempre a los
 * colores: el color no es la única señal.
 */
export function Progress({ segments, total }: { segments: ProgressSegment[]; total: number }) {
  const visible = segments.filter((s) => s.value > 0);
  return (
    <div className={styles.wrap}>
      <div
        className={styles.bar}
        role="img"
        aria-label={visible.map((s) => `${s.label}: ${s.value}`).join(', ')}
      >
        {visible.map((s) => (
          <span
            key={s.label}
            className={`${styles.segment} ${styles[s.tone]}`}
            style={{ width: `${(s.value / Math.max(total, 1)) * 100}%` }}
          />
        ))}
      </div>
      <ul className={styles.legend}>
        {visible.map((s) => (
          <li key={s.label}>
            <span className={`${styles.swatch} ${styles[s.tone]}`} aria-hidden />
            {s.label} <strong className="tabular">{s.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
