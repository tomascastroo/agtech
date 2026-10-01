'use client';

import { RequestCard } from '@/components/producer/Cards';
import { useProducerOverview } from '@/components/producer/data';
import styles from '@/components/producer/producer.module.css';
import { ErrorState, Loading } from '@/components/ui/Feedback';

export default function ProducerRequests() {
  const query = useProducerOverview();
  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} />;
  return (
    <>
      <h1 className={styles.hello}>Mis solicitudes</h1>
      <section className={styles.list}>
        {query.data.requests.map((r) => (
          <RequestCard key={r.id} request={r} />
        ))}
      </section>
    </>
  );
}
