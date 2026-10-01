import type { ScoreComponent } from '@/lib/api/types';
import { formatNumber } from '@/lib/format';
import styles from './charts.module.css';

/** Componentes del score: puntaje, peso, aporte y fundamento de cada uno. */
export function ScoreBreakdown({
  components,
  showFactors,
}: {
  components: ScoreComponent[];
  showFactors?: boolean;
}) {
  return (
    <div className={styles.components} data-testid="score-breakdown">
      {components.map((c) => (
        <div key={c.key}>
          <div className={styles.componentHead}>
            <span className={styles.componentName}>{c.label}</span>
            <span className={styles.componentScore}>
              {c.score}
              <span className={styles.componentMeta}>
                peso {formatNumber(c.weight * 100)} % · aporta {formatNumber(c.contribution, 2)}
              </span>
            </span>
          </div>
          <div className={styles.componentTrack} aria-hidden>
            <span className={styles.componentFill} style={{ width: `${c.score}%` }} />
          </div>
          <p className={styles.componentExplanation}>{c.explanation}</p>
          {showFactors && c.factors.length > 0 ? (
            <ul className={styles.factors}>
              {c.factors.map((f, index) => (
                <li key={`${f.label}-${index}`}>
                  <span>{f.label}</span>
                  <span>
                    {f.value}
                    {f.impact ? (
                      <span
                        className={f.impact < 0 ? styles.impactNegative : styles.impactPositive}
                      >
                        {' '}
                        ({f.impact > 0 ? '+' : ''}
                        {formatNumber(f.impact, 1)})
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}
