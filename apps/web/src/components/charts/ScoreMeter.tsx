import styles from './charts.module.css';

/** Score como número protagonista + medidor fino. El color acompaña, el texto informa. */
export function ScoreMeter({
  score,
  tone,
}: {
  score: number;
  tone: 'success' | 'warning' | 'critical';
}) {
  const color =
    tone === 'success'
      ? 'var(--color-secondary)'
      : tone === 'warning'
        ? 'var(--color-warning)'
        : 'var(--color-danger)';
  return (
    <div className={styles.meter}>
      <div className={styles.meterHero}>
        <span className={styles.meterValue} data-testid="score-value">
          {score}
        </span>
        <span className={styles.meterMax}>/ 100</span>
      </div>
      <div
        className={styles.meterTrack}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        aria-label="Score de verificación"
      >
        <span className={styles.meterFill} style={{ width: `${score}%`, background: color }} />
      </div>
      <div className={styles.meterScale} aria-hidden>
        <span>0</span>
        <span>50</span>
        <span>70</span>
        <span>100</span>
      </div>
    </div>
  );
}
