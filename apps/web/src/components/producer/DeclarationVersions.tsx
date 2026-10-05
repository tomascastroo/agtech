'use client';

import { useState, type FormEvent } from 'react';
import { Callout } from '@/components/ui/Feedback';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { ApiError } from '@/lib/api/client';
import { useProducerCorrection, useProducerDeclaration } from '@/lib/api/collateral';
import { formatDateTime, formatNumber } from '@/lib/format';
import styles from './producer.module.css';

/**
 * Declaración enviada (congelada). El productor no la puede editar: si algo cambió (muertes,
 * error de carga) pide una corrección, que crea una versión nueva y conserva la anterior.
 */
export function DeclarationVersions({ requestId }: { requestId: string }) {
  const query = useProducerDeclaration(requestId);
  const correction = useProducerCorrection(requestId);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = query.data;
  if (!data?.frozen) return null;
  const current = data.declarations[0]!;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      await correction.mutateAsync({
        heads: Number(f.get('heads')),
        reason: String(f.get('reason') ?? ''),
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar la corrección');
    }
  };

  return (
    <div className={styles.list} data-testid="producer-declaration">
      <p>
        <strong>Declaración congelada</strong> (versión {current.version}):{' '}
        {formatNumber(current.heads)} cabezas, {formatDateTime(current.declaredAt)}.
      </p>
      {data.declarations.length > 1 ? (
        <ul className={styles.muted}>
          {data.declarations.slice(1).map((d) => (
            <li key={d.version}>
              Versión {d.version}: {formatNumber(d.heads)} cabezas · {formatDateTime(d.declaredAt)}
            </li>
          ))}
        </ul>
      ) : null}
      {current.reason ? (
        <p className={styles.muted}>Motivo de la última corrección: {current.reason}</p>
      ) : null}
      {open ? (
        <form onSubmit={submit} className={styles.list}>
          <Field label="Cantidad de cabezas correcta" required>
            {(p) => (
              <Input
                {...p}
                name="heads"
                type="number"
                min={1}
                defaultValue={current.heads}
                required
              />
            )}
          </Field>
          <Field label="Motivo" required>
            {(p) => (
              <Textarea
                {...p}
                name="reason"
                rows={2}
                required
                placeholder="Ej.: murieron 2 terneros"
              />
            )}
          </Field>
          {error ? <Callout tone="critical">{error}</Callout> : null}
          <button type="submit" className={styles.bigButton} disabled={correction.isPending}>
            Enviar corrección
          </button>
        </form>
      ) : (
        <button
          type="button"
          className={`${styles.bigButton} ${styles.bigButtonSecondary}`}
          onClick={() => setOpen(true)}
        >
          Corregir declaración
        </button>
      )}
      <p className={styles.muted}>
        La corrección no borra lo declarado antes: la entidad ve todas las versiones.
      </p>
    </div>
  );
}
