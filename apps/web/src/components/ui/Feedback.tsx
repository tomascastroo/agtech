import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api/client';
import { Icon, type IconName } from './Icon';
import styles from './feedback.module.css';

type CalloutTone = 'info' | 'success' | 'warning' | 'critical' | 'neutral';
const CALLOUT_ICON: Record<CalloutTone, IconName> = {
  info: 'info',
  success: 'check',
  warning: 'warning',
  critical: 'critical',
  neutral: 'info',
};

export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      className={`${styles.callout} ${styles[tone]}`}
      role={tone === 'critical' ? 'alert' : 'status'}
    >
      <span className={styles.calloutIcon} aria-hidden>
        <Icon name={CALLOUT_ICON[tone]} size="sm" />
      </span>
      <div className={styles.calloutBody}>
        {title ? <div className={styles.calloutTitle}>{title}</div> : null}
        {children}
      </div>
    </div>
  );
}

export function EmptyState({
  icon = 'info',
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}>
        <Icon name={icon} size="lg" />
      </div>
      <div className={styles.emptyTitle}>{title}</div>
      {children ? <div>{children}</div> : null}
      {action}
    </div>
  );
}

/** Estado de carga: esqueletos (no spinners genéricos). El texto queda para lectores de pantalla. */
export function Loading({ label = 'Cargando…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className={styles.loading} role="status" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      <Skeleton height={14} width="38%" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={12} width={i === rows - 1 ? '62%' : '100%'} />
      ))}
    </div>
  );
}

export function Skeleton({
  height = 16,
  width = '100%',
}: {
  height?: number;
  width?: number | string;
}) {
  return <div className={styles.skeleton} style={{ height, width }} aria-hidden />;
}

export function ErrorState({ error }: { error: unknown }) {
  const message =
    error instanceof ApiError ? error.message : 'No fue posible cargar la información.';
  const requestId = error instanceof ApiError ? error.requestId : null;
  return (
    <Callout tone="critical" title="Ocurrió un error">
      {message}
      {requestId ? <div style={{ marginTop: 4, opacity: 0.8 }}>Referencia: {requestId}</div> : null}
    </Callout>
  );
}
