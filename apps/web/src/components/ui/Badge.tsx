import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './badge.module.css';

export type Tone = 'success' | 'warning' | 'critical' | 'info' | 'neutral' | 'outline';

/** Etiqueta de estado. El color nunca es la única señal: siempre lleva texto (y ícono o punto). */
export function Badge({
  tone = 'neutral',
  icon,
  dot,
  children,
  title,
}: {
  tone?: Tone;
  icon?: IconName;
  dot?: boolean;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`} title={title}>
      {icon ? (
        <Icon name={icon} size={13} />
      ) : dot ? (
        <span className={styles.dot} aria-hidden />
      ) : null}
      {children}
    </span>
  );
}
