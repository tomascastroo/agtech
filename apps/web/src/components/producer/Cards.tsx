import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { GuaranteeRequest, ProducerTask } from '@/lib/api/types';
import { formatNumber, unitLabel } from '@/lib/format';
import type { Unit } from '@/lib/api/types';
import styles from './producer.module.css';
import { PRODUCER_STATUS } from './status';

const TASK_TARGET: Record<ProducerTask['kind'], { section: string; icon: IconName }> = {
  ESTABLISHMENT: { section: 'establecimiento', icon: 'building' },
  ASSET: { section: 'activo', icon: 'layers' },
  EVIDENCE: { section: 'evidencia', icon: 'camera' },
  INFO_EVIDENCE: { section: 'evidencia', icon: 'camera' },
  DOCUMENTS: { section: 'documentacion', icon: 'document' },
  INFO_DOCUMENT: { section: 'documentacion', icon: 'document' },
  SUBMIT: { section: 'enviar', icon: 'check' },
};

export const ProducerStatusBadge = ({ status }: { status: GuaranteeRequest['producerStatus'] }) => {
  const s = PRODUCER_STATUS[status] ?? { label: status, tone: 'neutral' as const };
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
};

export function TaskCard({
  task,
  requestId,
  context,
}: {
  task: ProducerTask;
  requestId: string;
  context?: string;
}) {
  const target = TASK_TARGET[task.kind];
  const info = task.kind === 'INFO_EVIDENCE' || task.kind === 'INFO_DOCUMENT';
  return (
    <Link
      href={`/productor/solicitudes/${requestId}#${target.section}`}
      className={`${styles.task} ${info ? styles.taskInfo : ''}`}
    >
      <span className={styles.taskIcon}>
        <Icon name={target.icon} size={20} />
      </span>
      <span className={styles.taskBody}>
        <strong>{task.title}</strong>
        <span className={styles.muted}>{task.description}</span>
        {context ? <span className={styles.taskContext}>{context}</span> : null}
      </span>
      <span className={styles.chevron} aria-hidden>
        ›
      </span>
    </Link>
  );
}

export function ProgressBar({ progress }: { progress: GuaranteeRequest['progress'] }) {
  return (
    <div className={styles.progress} aria-label="Progreso de la solicitud">
      {progress.map((p) => (
        <div key={p.key} className={`${styles.progressStep} ${styles[`state${p.state}`] ?? ''}`}>
          <span className={styles.progressBar} />
          <span>
            {p.label}
            {p.state === 'DONE' ? ' ✓' : p.state === 'PENDING' ? ' ⚠' : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

export function RequestCard({ request }: { request: GuaranteeRequest }) {
  return (
    <Link
      href={`/productor/solicitudes/${request.id}`}
      className={`${styles.card} ${styles.cardLink}`}
    >
      <div className={styles.cardHead}>
        <div>
          <p className={styles.cardTitle}>
            {request.guaranteeType.name ?? request.guaranteeType.code}
          </p>
          <p className={styles.muted}>
            Solicitada por {request.requester.name}
            {request.requestedAmount != null
              ? ` · ${request.currency} ${formatNumber(request.requestedAmount)}`
              : ''}
          </p>
        </div>
        <ProducerStatusBadge status={request.producerStatus} />
      </div>
      {request.asset ? (
        <p className={styles.muted}>
          {request.asset.name} · {formatNumber(request.asset.declaredQuantity)}{' '}
          {unitLabel(request.asset.unit as Unit, request.asset.declaredQuantity)}
        </p>
      ) : null}
      <ProgressBar progress={request.progress} />
    </Link>
  );
}
