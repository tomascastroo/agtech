import type { ReactNode } from 'react';
import styles from './charts.module.css';

/** Barras horizontales de una sola serie (un color para todas las barras). */
export function BarList({
  items,
  formatValue,
  label,
}: {
  items: { key: string; label: string; value: number; detail?: ReactNode }[];
  formatValue: (value: number) => ReactNode;
  label: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className={styles.barList} aria-label={label}>
      {items.map((item) => (
        <li
          key={item.key}
          className={styles.barRow}
          title={`${item.label}: ${String(formatValue(item.value))}`}
        >
          <span className={styles.barLabel}>{item.label}</span>
          <span className={styles.barTrack} aria-hidden>
            <span className={styles.barFill} style={{ width: `${(item.value / max) * 100}%` }} />
          </span>
          <span className={styles.barValue}>
            <strong>{formatValue(item.value)}</strong>
            {item.detail ? <> · {item.detail}</> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
