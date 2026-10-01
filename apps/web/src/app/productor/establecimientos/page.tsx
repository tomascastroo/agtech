'use client';

import { useProducerOverview } from '@/components/producer/data';
import styles from '@/components/producer/producer.module.css';
import { ErrorState, Loading } from '@/components/ui/Feedback';

export default function ProducerEstablishments() {
  const query = useProducerOverview();
  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} />;
  const { establishments } = query.data;
  return (
    <>
      <h1 className={styles.hello}>Mis establecimientos</h1>
      {establishments.length === 0 ? (
        <p className={styles.muted}>
          Todavía no registraste establecimientos. Se agregan desde una solicitud.
        </p>
      ) : (
        <section className={styles.list}>
          {establishments.map((e) => (
            <div key={e.id} className={styles.card}>
              <p className={styles.cardTitle}>{e.name}</p>
              <p className={styles.muted}>
                {e.locality ? `${e.locality}, ` : ''}
                {e.province}
              </p>
              {e.renspa ? <span className={styles.chip}>RENSPA {e.renspa}</span> : null}
            </div>
          ))}
        </section>
      )}
    </>
  );
}
