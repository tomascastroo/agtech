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
      <Icon name={CALLOUT_ICON[tone]} size={18} />
      <div>
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
        <Icon name={icon} size={20} />
      </div>
      <div className={styles.emptyTitle}>{title}</div>
      {children ? <div>{children}</div> : null}
      {action}
    </div>
  );
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className={styles.loading} role="status">
      <span className={styles.spinner} aria-hidden />
      {label}
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
