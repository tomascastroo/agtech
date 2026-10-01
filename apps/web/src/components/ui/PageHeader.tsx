import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import styles from './page-header.module.css';

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  badge,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: { href: string; label: string }[];
  badge?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div>
        {breadcrumb ? (
          <nav className={styles.breadcrumb} aria-label="Ruta">
            {breadcrumb.map((crumb) => (
              <span
                key={crumb.href}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Link href={crumb.href}>{crumb.label}</Link>
                <Icon name="chevronRight" size={14} />
              </span>
            ))}
          </nav>
        ) : null}
        <div className={styles.title}>
          <h1>{title}</h1>
          {badge}
        </div>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
