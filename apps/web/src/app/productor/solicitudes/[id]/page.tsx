'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProgressBar, ProducerStatusBadge } from '@/components/producer/Cards';
import { AssetStep, EstablishmentStep } from '@/components/producer/DeclarationForms';
import { PhotoCapture } from '@/components/producer/PhotoCapture';
import { ProducerDocuments } from '@/components/producer/ProducerDocuments';
import { ScannerScans } from '@/components/scanner/ScannerScans';
import { useProducerRefresh, useProducerRequest } from '@/components/producer/data';
import styles from '@/components/producer/producer.module.css';
import { Callout, ErrorState, Loading } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { api, ApiError } from '@/lib/api/client';
import type { ProducerRequestDetail, Unit } from '@/lib/api/types';
import { formatNumber, unitLabel } from '@/lib/format';
import { DOCUMENT_TYPE_LABELS, locationLabel } from '@/lib/labels';

/**
 * Solicitud de garantía vista por el productor: progreso, pedidos de información y cada paso
 * como una tarjeta. Se puede entrar y salir: el progreso queda guardado en el servidor.
 */
export default function ProducerRequestPage() {
  const { id } = useParams<{ id: string }>();
  const query = useProducerRequest(id);
  const refresh = useProducerRefresh();
  const loaded = Boolean(query.data);

  useEffect(() => {
    if (!loaded || !window.location.hash) return;
    document
      .getElementById(window.location.hash.slice(1))
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loaded]);

  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} />;
  const r = query.data;
  const base = `/producer/me/requests/${r.id}`;
  const submitted = r.status === 'READY_FOR_VERIFICATION';
  const openInfo = r.informationRequests.filter((i) => i.status === 'OPEN');
  const docRequest = openInfo.find((i) => i.kind === 'DOCUMENT');

  return (
    <>
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <p className={styles.cardTitle}>
              Solicitud de garantía · {r.guaranteeType.name ?? r.guaranteeType.code}
            </p>
            <p className={styles.muted}>
              {r.requester.name}
              {r.requestedAmount != null
                ? ` · ${r.currency} ${formatNumber(r.requestedAmount)}`
                : ''}
            </p>
          </div>
          <ProducerStatusBadge status={r.producerStatus} />
        </div>
        <ProgressBar progress={r.progress} />
      </section>

      {openInfo.map((info) => (
        <InfoRequestCard key={info.id} request={r} infoId={info.id} onDone={refresh} />
      ))}

      <Section id="establecimiento" title="Establecimiento" done={Boolean(r.establishment)}>
        <EstablishmentStep request={r} base={base} onDone={refresh} disabled={submitted} />
      </Section>

      {r.establishment ? (
        <Section id="activo" title="Activo" done={Boolean(r.asset)}>
          <AssetStep request={r} base={base} onDone={refresh} disabled={submitted} />
        </Section>
      ) : null}

      {r.asset ? (
        <>
          <Section
            id="evidencia"
            title="Evidencia fotográfica"
            done={!r.missing.some((m) => m.startsWith('evidencia'))}
            subtitle={`${r.evidenceCount} foto${r.evidenceCount === 1 ? '' : 's'} aportada${r.evidenceCount === 1 ? '' : 's'}`}
          >
            <PhotoCapture
              endpoint={`${base}/evidence`}
              guidance={r.guaranteeType.evidenceGuidance}
              onUploaded={refresh}
            />
            <EvidenceGrid items={r.evidence} />
          </Section>

          <Section
            id="escaner"
            title="Escáner de bovinos"
            done={(r.scans ?? []).some((s) => s.status === 'COMPLETED')}
            subtitle="Conteo con la cámara del celular"
          >
            <ScannerScans
              requestId={r.id}
              assetName={r.asset.name}
              profile={r.livestockProfile ?? null}
            />
          </Section>

          <Section
            id="documentacion"
            title="Documentación"
            done={
              r.documentation
                ? r.documentation.summary.mandatoryMissing === 0 &&
                  r.documentation.summary.attention === 0
                : r.requiredDocuments.every((d) => d.satisfied)
            }
            subtitle={`${r.documentCount} documento${r.documentCount === 1 ? '' : 's'}`}
          >
            <ProducerDocuments
              request={r}
              documents={r.documents?.documents ?? []}
              endpoint={`${base}/documents`}
              onUploaded={refresh}
              suggestedType={docRequest?.documentType}
            />
          </Section>

          <Section
            id="enviar"
            title={submitted ? 'Declaración enviada' : 'Enviar declaración'}
            done={submitted}
          >
            {submitted ? (
              <SubmittedCard request={r} />
            ) : (
              <SubmitCard request={r} base={base} onDone={refresh} />
            )}
          </Section>
        </>
      ) : null}
    </>
  );
}

function Section({
  id,
  title,
  subtitle,
  done,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={styles.card} style={{ scrollMarginTop: 72 }}>
      <div className={styles.cardHead}>
        <div>
          <p className={styles.cardTitle}>
            {title} {done ? '✓' : ''}
          </p>
          {subtitle ? <p className={styles.muted}>{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function EvidenceGrid({ items }: { items: ProducerRequestDetail['evidence'] }) {
  const photos = items.filter((e) => e.type === 'IMAGE');
  if (photos.length === 0) return null;
  return (
    <>
      <p className={styles.sectionTitle}>Fotos aportadas</p>
      <div className={styles.thumbs}>
        {photos.map((e) => (
          <a
            key={e.id}
            href={e.url ?? '#'}
            target="_blank"
            rel="noreferrer"
            className={styles.thumb}
            title={locationLabel(e.locationSource, e.locationAccuracyM)}
          >
            {e.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL firmada del almacenamiento
              <img src={e.url} alt={String(e.metadata.description ?? 'Evidencia')} loading="lazy" />
            ) : null}
            <span className={styles.thumbState}>
              {new Date(e.capturedAt).toLocaleDateString('es-AR')} ·{' '}
              {['DEVICE_GPS', 'EXIF'].includes(e.locationSource ?? '')
                ? `GPS${e.locationAccuracyM !== null ? ` ±${Math.round(e.locationAccuracyM)} m` : ''}`
                : 'sin GPS'}
            </span>
          </a>
        ))}
      </div>
    </>
  );
}

function InfoRequestCard({
  request: r,
  infoId,
  onDone,
}: {
  request: ProducerRequestDetail;
  infoId: string;
  onDone: () => unknown;
}) {
  const info = r.informationRequests.find((i) => i.id === infoId)!;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const evidence = info.kind === 'EVIDENCE';
  const requirement = r.documentation?.items.find((x) => x.code === info.requirementCode);
  const respond = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/producer/me/requests/${r.id}/information-requests/${info.id}/respond`, {
        method: 'POST',
      });
      await onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No fue posible responder.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={styles.card} style={{ borderLeft: '4px solid var(--data-1)' }}>
      <p className={styles.cardTitle}>
        {requirement
          ? `${r.requester.name} solicita: ${requirement.name}`
          : `${r.requester.name} solicita ${evidence ? 'más evidencia' : 'documentación adicional'}`}
      </p>
      {requirement ? (
        <>
          <p>{requirement.purpose}</p>
          <p className={styles.muted}>{requirement.howTo}</p>
        </>
      ) : (
        <p>{info.message}</p>
      )}
      {!evidence && !requirement && info.documentType ? (
        <span className={styles.chip}>
          {DOCUMENT_TYPE_LABELS[info.documentType] ?? info.documentType}
        </span>
      ) : null}
      <a href={evidence ? '#evidencia' : '#documentacion'} className={styles.bigButton}>
        <Icon name={evidence ? 'camera' : 'upload'} size={20} />{' '}
        {evidence ? 'Agregar fotos' : 'Subir documento'}
      </a>
      <button
        type="button"
        className={`${styles.bigButton} ${styles.bigButtonSecondary}`}
        onClick={respond}
        disabled={busy}
      >
        <Icon name="check" size={20} /> {busy ? 'Enviando…' : 'Listo, ya lo aporté'}
      </button>
      <p className={styles.muted}>
        Lo que agregues queda como evidencia nueva: tu declaración original no cambia.
      </p>
      {error ? <Callout tone="critical">{error}</Callout> : null}
    </section>
  );
}

function SubmitCard({
  request: r,
  base,
  onDone,
}: {
  request: ProducerRequestDetail;
  base: string;
  onDone: () => unknown;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/submit`, { method: 'POST' });
      await onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No fue posible enviar la declaración.');
    } finally {
      setBusy(false);
    }
  };
  const ready = r.missing.length === 0;
  return (
    <div className={styles.list}>
      {r.asset ? (
        <p>
          Declarás <strong>{r.asset.name}</strong>:{' '}
          <strong>
            {formatNumber(r.asset.declaredQuantity)}{' '}
            {unitLabel(r.asset.unit as Unit, r.asset.declaredQuantity)}
          </strong>{' '}
          en {r.establishment?.name}. Al enviar, la declaración queda registrada y no puede
          modificarse; después podés seguir aportando fotos y documentos.
        </p>
      ) : null}
      {!r.requiredDocuments.every((d) => d.satisfied) ? (
        <Callout tone="warning">
          Te falta documentación requerida: podés enviarla ahora o más tarde.
        </Callout>
      ) : null}
      {error ? <Callout tone="critical">{error}</Callout> : null}
      <button type="button" className={styles.bigButton} onClick={submit} disabled={!ready || busy}>
        <Icon name="check" size={20} />
        {busy ? 'Enviando…' : ready ? 'Enviar declaración' : `Falta: ${r.missing.join(', ')}`}
      </button>
    </div>
  );
}

function SubmittedCard({ request: r }: { request: ProducerRequestDetail }) {
  return (
    <div className={styles.list}>
      <p className={styles.muted}>
        Enviada el {r.submittedAt ? new Date(r.submittedAt).toLocaleString('es-AR') : ''}. La
        declaración es inmutable.
      </p>
      {r.asset ? (
        <p>
          {r.asset.name}: {formatNumber(r.asset.declaredQuantity)}{' '}
          {unitLabel(r.asset.unit as Unit, r.asset.declaredQuantity)} declarados.
        </p>
      ) : null}
      <Callout
        tone={
          r.producerStatus === 'VERIFIED' || r.producerStatus === 'FINALIZED' ? 'success' : 'info'
        }
      >
        {r.producerStatus === 'VERIFYING'
          ? 'AgroGarantías está verificando tu activo.'
          : r.producerStatus === 'VERIFIED' || r.producerStatus === 'FINALIZED'
            ? `Verificación completada. ${r.requester.name} recibió el resultado.`
            : r.producerStatus === 'INFO_REQUIRED'
              ? 'Hay un pedido de información pendiente (arriba).'
              : 'Lista para verificar.'}
      </Callout>
    </div>
  );
}
