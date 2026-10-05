'use client';

import Link from 'next/link';
import { useProducerOverview } from '@/components/producer/data';
import styles from '@/components/producer/producer.module.css';
import { ErrorState, Loading } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { DOCUMENT_TYPE_LABELS } from '@/lib/labels';

export default function ProducerDocumentation() {
  const query = useProducerOverview();
  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} />;
  const requests = query.data.requests.filter((r) => r.asset);
  return (
    <>
      <h1 className={styles.hello}>Documentación</h1>
      {requests.length === 0 ? (
        <p className={styles.muted}>
          La documentación se pide cuando declarás un activo en una solicitud.
        </p>
      ) : (
        requests.map((r) => (
          <section key={r.id} className={styles.card}>
            <div className={styles.cardHead}>
              <p className={styles.cardTitle}>{r.asset!.name}</p>
              <span className={styles.chip}>{r.requester.name}</span>
            </div>
            {r.requiredDocuments.map((d) => (
              <div key={d.requirement} className={styles.docRow}>
                <span
                  className={`${styles.docMark} ${d.satisfied ? styles.docOk : styles.docMissing}`}
                >
                  <Icon name={d.satisfied ? 'check' : 'warning'} size="xs" />
                </span>
                <span style={{ flex: 1 }}>
                  {d.alternatives.map((a) => DOCUMENT_TYPE_LABELS[a] ?? a).join(' o ')}
                </span>
              </div>
            ))}
            <Link
              href={`/productor/solicitudes/${r.id}#documentacion`}
              className={`${styles.bigButton} ${styles.bigButtonSecondary}`}
            >
              <Icon name="plus" size="lg" /> Agregar documento
            </Link>
          </section>
        ))
      )}
    </>
  );
}
