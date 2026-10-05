'use client';

import { useState, type FormEvent } from 'react';
import { Callout } from '@/components/ui/Feedback';
import { Field, FormRow, Input, Select } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { ApiError } from '@/lib/api/client';
import {
  MOVEMENT_KIND_LABELS,
  useProducerMonitoring,
  useProducerMovement,
} from '@/lib/api/collateral';
import { formatDate, formatNumber } from '@/lib/format';
import { DeclarationVersions } from './DeclarationVersions';
import styles from './producer.module.css';

const STATE_TEXT: Record<string, string> = {
  PENDIENTE: 'La entidad lo está revisando',
  VERIFICADO: 'Aceptado por la entidad',
  RECHAZADO: 'Rechazado por la entidad',
};

/**
 * Monitoreo de la garantía visto por el productor: qué tiene que hacer y cuándo. Desde acá avisa
 * ventas, muertes y traslados (con el DT-e). No ve el score ni las alertas internas de la entidad.
 */
export function ProducerMonitoring({ requestId }: { requestId: string }) {
  const query = useProducerMonitoring(requestId);
  const movement = useProducerMovement(requestId);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const m = query.data;
  if (!m) return null;
  const today = new Date().toISOString().slice(0, 10);
  const next = m.nextVerification;
  const pendingInspections = m.inspections.filter((i) => i.status === 'SOLICITADA');

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const form = new FormData();
    for (const key of ['direction', 'kind', 'heads', 'dteNumber', 'destination']) {
      const v = f.get(key);
      if (typeof v === 'string' && v.trim()) form.set(key, v.trim());
    }
    form.set('occurredAt', new Date(`${String(f.get('occurredAt'))}T12:00:00`).toISOString());
    const file = f.get('file');
    if (file instanceof File && file.size) form.set('file', file);
    try {
      await movement.mutateAsync(form);
      setOpen(false);
      setNotice(
        file instanceof File && file.size
          ? 'Movimiento avisado con su DT-e. La entidad lo va a revisar.'
          : 'Movimiento avisado. Si tenés el DT-e, subilo: sin él queda como declarado.',
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo avisar el movimiento');
    }
  };

  return (
    <div className={styles.list} data-testid="producer-monitoring">
      <div className={styles.card}>
        <p className={styles.cardTitle} data-testid="producer-monitoring-status">
          {m.status.title}
        </p>
        <p className={styles.muted}>{m.status.text}</p>
        {next ? (
          <p data-testid="producer-next-verification">
            <Icon name="clock" size={14} />{' '}
            {next.overdue ? (
              <strong>La verificación venció el {formatDate(next.at)}.</strong>
            ) : (
              <>
                Próxima verificación: <strong>{formatDate(next.at)}</strong>
                {next.daysLeft <= 7 ? ` (en ${next.daysLeft} días)` : ''}.
              </>
            )}{' '}
            {next.methodLabel ? `Método: ${next.methodLabel}. ` : ''}
            {next.instructions}
          </p>
        ) : null}
        {pendingInspections.length ? (
          <Callout tone="info" title="Inspección programada">
            Un inspector va a visitar el establecimiento para contar los animales
            {pendingInspections[0]!.dueAt
              ? ` antes del ${formatDate(pendingInspections[0]!.dueAt)}`
              : ''}
            .
          </Callout>
        ) : null}
      </div>

      <div className={styles.card}>
        <p className={styles.cardTitle}>Movimientos de hacienda</p>
        <p className={styles.muted}>
          Si vendiste, trasladaste o se murieron animales, avisalo acá con el DT-e. Así la
          diferencia queda explicada y no se interpreta como faltante.
        </p>
        {notice ? <Callout tone="success">{notice}</Callout> : null}
        {open ? (
          <form onSubmit={submit} className={styles.list} data-testid="producer-movement-form">
            <FormRow>
              <Field label="Tipo" required>
                {(p) => (
                  <Select {...p} name="direction" defaultValue="EGRESO">
                    <option value="EGRESO">Salida</option>
                    <option value="INGRESO">Entrada</option>
                  </Select>
                )}
              </Field>
              <Field label="Motivo" required>
                {(p) => (
                  <Select {...p} name="kind" defaultValue="VENTA">
                    {Object.entries(MOVEMENT_KIND_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </FormRow>
            <FormRow>
              <Field label="Cantidad de animales" required>
                {(p) => (
                  <Input {...p} name="heads" type="number" min={1} inputMode="numeric" required />
                )}
              </Field>
              <Field label="Fecha" required>
                {(p) => (
                  <Input
                    {...p}
                    name="occurredAt"
                    type="date"
                    max={today}
                    defaultValue={today}
                    required
                  />
                )}
              </Field>
            </FormRow>
            <Field label="Destino u origen">
              {(p) => <Input {...p} name="destination" placeholder="Frigorífico, campo, remate…" />}
            </Field>
            <Field label="N° de DT-e">
              {(p) => <Input {...p} name="dteNumber" inputMode="numeric" />}
            </Field>
            <Field label="DT-e (PDF o foto)" hint="Con el DT-e el movimiento queda documentado.">
              {(p) => <Input {...p} name="file" type="file" accept="application/pdf,image/*" />}
            </Field>
            {error ? <Callout tone="critical">{error}</Callout> : null}
            <button type="submit" className={styles.bigButton} disabled={movement.isPending}>
              {movement.isPending ? 'Enviando…' : 'Avisar movimiento'}
            </button>
            <button
              type="button"
              className={`${styles.bigButton} ${styles.bigButtonSecondary}`}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </button>
          </form>
        ) : (
          <button
            type="button"
            className={styles.bigButton}
            onClick={() => {
              setNotice(null);
              setOpen(true);
            }}
          >
            <Icon name="plus" size={20} /> Avisar un movimiento
          </button>
        )}
        {m.movements.length ? (
          <ul className={styles.list} data-testid="producer-movements">
            {m.movements.map((mv) => (
              <li key={mv.id} className={styles.docRow}>
                <span>
                  <strong>
                    {mv.direction === 'EGRESO' ? 'Salida' : 'Entrada'} de {formatNumber(mv.heads)} ·{' '}
                    {MOVEMENT_KIND_LABELS[mv.kind] ?? mv.kind}
                  </strong>
                  <br />
                  <span className={styles.muted}>
                    {formatDate(mv.occurredAt)} ·{' '}
                    {mv.sourceLevel === 'DOCUMENTADO' ? 'con DT-e' : 'sin DT-e'} ·{' '}
                    {STATE_TEXT[mv.verificationState]}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <DeclarationVersions requestId={requestId} />
    </div>
  );
}
