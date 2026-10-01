import type { ReactNode } from 'react';
import styles from './panel.module.css';

export function Panel({
  title,
  subtitle,
  actions,
  children,
  footer,
  flush,
  className,
  id,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  flush?: boolean;
  className?: string;
  id?: string;
}) {
  return (
    <section
      className={`${styles.panel} ${className ?? ''}`}
      aria-labelledby={id ? `${id}-title` : undefined}
      id={id}
    >
      {title || actions ? (
        <header className={styles.header}>
          <div className={styles.titles}>
            {title ? (
              <h2 className={styles.title} id={id ? `${id}-title` : undefined}>
                {title}
              </h2>
            ) : null}
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      <div className={flush ? styles.flush : styles.body}>{children}</div>
      {footer ? <footer className={styles.footer}>{footer}</footer> : null}
    </section>
  );
}

export function Grid({
  columns = '2',
  children,
}: {
  columns?: '2' | '3' | 'main-side';
  children: ReactNode;
}) {
  return (
    <div className={`${styles.grid} ${styles[`cols-${columns}`] ?? styles[columns]}`}>
      {children}
    </div>
  );
}

export function DescriptionList({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className={styles.dl}>
      {items.map(([term, value], index) => (
        <div key={index} style={{ display: 'contents' }}>
          <dt>{term}</dt>
          <dd>{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
