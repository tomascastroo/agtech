'use client';

import Link from 'next/link';
import { DemoBanner } from '@/components/domain/DataLayersPanel';
import { RequestCard, TaskCard } from '@/components/producer/Cards';
import { useProducerOverview } from '@/components/producer/data';
import styles from '@/components/producer/producer.module.css';
import { ErrorState, Loading } from '@/components/ui/Feedback';
import type { Unit } from '@/lib/api/types';
import { formatNumber, unitLabel } from '@/lib/format';

/** Inicio del productor: qué tiene que hacer ahora y el estado de sus garantías. */
export default function ProducerHome() {
  const query = useProducerOverview();
  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} />;
  const { producer, tasks, requests, establishments, assets } = query.data;
  const active = requests.filter((r) => r.producerStatus !== 'FINALIZED');
  // Con varias solicitudes, cada tarea indica a cuál pertenece.
  const contextOf = (requestId: string) => {
    if (requests.length < 2) return undefined;
    const r = requests.find((x) => x.id === requestId);
    if (!r) return undefined;
    return `${r.asset?.name ?? r.guaranteeType.name ?? r.guaranteeType.code} · ${r.requester.name} · ${new Date(r.createdAt).toLocaleDateString('es-AR')}`;
  };
  return (
    <>
      <div>
        <h1 className={styles.hello}>Hola, {producer.name}</h1>
        <p className={styles.lead}>
          {tasks.length === 0
            ? 'No tenés tareas pendientes.'
            : `Tenés ${tasks.length} tarea${tasks.length === 1 ? '' : 's'} pendiente${tasks.length === 1 ? '' : 's'}.`}
        </p>
      </div>
      {requests.some((r) => r.dataSource === 'DEMO') ? (
        <DemoBanner
          message={
            'Esta cuenta y sus solicitudes son ficticias. Los documentos cargados acá no tienen validez y nada se envía a una entidad real.'
          }
        />
      ) : null}

      {tasks.length > 0 ? (
        <section className={styles.list} aria-label="Tareas pendientes">
          {tasks.map((t, i) => (
            <TaskCard
              key={`${t.requestId}-${t.kind}-${t.informationRequestId ?? i}`}
              task={t}
              requestId={t.requestId}
              context={contextOf(t.requestId)}
            />
          ))}
        </section>
      ) : null}

      <p className={styles.sectionTitle}>Solicitudes activas</p>
      {active.length === 0 ? (
        <p className={styles.muted}>No tenés solicitudes activas.</p>
      ) : (
        <section className={styles.list}>
          {active.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </section>
      )}

      {establishments.length > 0 ? (
        <>
          <p className={styles.sectionTitle}>Establecimientos</p>
          <div className={styles.list}>
            {establishments.map((e) => (
              <Link
                key={e.id}
                href="/productor/establecimientos"
                className={`${styles.card} ${styles.cardLink}`}
              >
                <strong>{e.name}</strong>
                <span className={styles.muted}>
                  {e.locality ? `${e.locality}, ` : ''}
                  {e.province}
                  {e.renspa ? ` · RENSPA ${e.renspa}` : ''}
                </span>
              </Link>
            ))}
          </div>
        </>
      ) : null}

      {assets.length > 0 ? (
        <>
          <p className={styles.sectionTitle}>Activos declarados</p>
          <div className={styles.list}>
            {assets.map((a) => (
              <Link
                key={a.id}
                href={`/productor/solicitudes/${a.requestId}`}
                className={`${styles.card} ${styles.cardLink}`}
              >
                <strong>{a.name}</strong>
                <span className={styles.muted}>
                  {formatNumber(a.declaredQuantity)} {unitLabel(a.unit as Unit, a.declaredQuantity)}{' '}
                  · {a.guaranteeType.name ?? a.guaranteeType.code}
                </span>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
