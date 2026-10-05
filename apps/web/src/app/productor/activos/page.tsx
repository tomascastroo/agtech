'use client';

import Link from 'next/link';
import { useProducerOverview } from '@/components/producer/data';
import styles from '@/components/producer/producer.module.css';
import { ErrorState, Loading } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import type { Unit } from '@/lib/api/types';
import { formatNumber, unitLabel } from '@/lib/format';

export default function ProducerAssets() {
  const query = useProducerOverview();
  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} />;
  const { assets } = query.data;
  return (
    <>
      <h1 className={styles.hello}>Mis activos</h1>
      {assets.length === 0 ? (
        <p className={styles.muted}>
          Todavía no declaraste activos. Se declaran desde una solicitud.
        </p>
      ) : (
        <section className={styles.list}>
          {assets.map((a) => (
            <Link
              key={a.id}
              href={`/productor/solicitudes/${a.requestId}#evidencia`}
              className={`${styles.card} ${styles.cardLink}`}
            >
              <p className={styles.cardTitle}>{a.name}</p>
              <p className={styles.muted}>
                {a.guaranteeType.name ?? a.guaranteeType.code} · {formatNumber(a.declaredQuantity)}{' '}
                {unitLabel(a.unit as Unit, a.declaredQuantity)} declarados
              </p>
              <span className={styles.chip}>
                Agregar fotos o ver evidencia <Icon name="chevronRight" size="xs" />
              </span>
            </Link>
          ))}
        </section>
      )}
    </>
  );
}
