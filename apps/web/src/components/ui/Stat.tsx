import type { ReactNode } from 'react';
import styles from './stat.module.css';

export function StatRow({ children }: { children: ReactNode }) {
  return <div className={styles.row}>{children}</div>;
}

/** Indicador clave: el número es el gráfico. */
export function Stat({
  label,
  value,
  caption,
  accent,
  small,
  testId,
}: {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  accent?: string;
  small?: boolean;
  testId?: string;
}) {
  return (
    <div className={styles.stat} data-testid={testId}>
      <div className={styles.label}>
        {accent ? (
          <span className={styles.accent} style={{ background: accent }} aria-hidden />
        ) : null}
        {label}
      </div>
      <div className={`${styles.value} ${small ? styles.valueSmall : ''}`}>{value}</div>
      {caption ? <div className={styles.caption}>{caption}</div> : null}
    </div>
  );
}
