'use client';

import { Callout } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import type { PipelineStep, VerificationDetail } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { STRATEGY_DESCRIPTIONS } from '@/lib/labels';
import styles from './domain.module.css';

const STEPS: { key: PipelineStep; label: string }[] = [
  { key: 'EVIDENCE', label: 'Obtención de evidencia y análisis de imágenes' },
  { key: 'METRICS', label: 'Cálculo de métricas' },
  { key: 'CROSS_CHECKS', label: 'Controles cruzados (ubicación y registros)' },
  { key: 'SCORING', label: 'Cálculo y registro del score' },
  { key: 'ALERTS', label: 'Evaluación de alertas' },
  { key: 'REPORT', label: 'Solicitud del informe' },
];

/**
 * Estado de una verificación en curso. La etapa activa es la que publica el worker como
 * progreso del job; mientras está en cola no se marca ninguna.
 */
export function VerificationProgress({
  run,
  strategy,
}: {
  run: VerificationDetail;
  strategy: string;
}) {
  if (run.status === 'FAILED') {
    return (
      <Callout tone="critical" title="La verificación no pudo completarse">
        {run.failureReason ?? 'Error desconocido.'} El activo conserva su estado anterior. Podés
        volver a intentarlo.
      </Callout>
    );
  }
  const current = run.status === 'PROCESSING' ? (run.progress?.index ?? 0) : -1;
  return (
    <div className={styles.stackTight} data-testid="verification-progress" aria-live="polite">
      <p className={styles.muted}>
        {run.status === 'PENDING'
          ? `En cola desde ${formatDateTime(run.queuedAt)}.`
          : 'Procesando.'}{' '}
        {STRATEGY_DESCRIPTIONS[strategy] ?? ''}
      </p>
      <ol className={styles.progress}>
        {STEPS.map((step, index) => {
          const state = index < current ? 'done' : index === current ? 'active' : 'todo';
          return (
            <li
              key={step.key}
              className={`${styles.progressItem} ${state === 'done' ? styles.progressDone : state === 'active' ? styles.progressActive : ''}`}
            >
              <span className={styles.progressMark} aria-hidden>
                {state === 'done' ? <Icon name="check" size="xs" /> : null}
              </span>
              {step.label}
              <span className="visually-hidden">
                {state === 'done'
                  ? '(completado)'
                  : state === 'active'
                    ? '(en curso)'
                    : '(pendiente)'}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
