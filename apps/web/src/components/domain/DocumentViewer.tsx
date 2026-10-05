'use client';

import { useQuery } from '@tanstack/react-query';
import { ErrorState, Loading } from '@/components/ui/Feedback';
import styles from './documentation.module.css';

export interface ViewableDocument {
  url: string;
  mimeType: string;
  fileName: string;
}

/**
 * Visor de un documento cargado (imagen o PDF) dentro de la página. La URL es firmada y de
 * corta vida: se pide al abrir el visor y no se cachea entre aperturas.
 */
export function DocumentViewer({
  queryKey,
  resolve,
  title,
}: {
  queryKey: readonly unknown[];
  resolve: () => Promise<ViewableDocument>;
  title: string;
}) {
  const query = useQuery({
    queryKey: ['document-view', ...queryKey],
    queryFn: resolve,
    staleTime: 60_000,
    gcTime: 0,
  });
  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} />;
  const { url, mimeType, fileName } = query.data;
  const isPdf = mimeType === 'application/pdf';
  return (
    <figure className={styles.viewer} data-testid="document-viewer">
      {isPdf ? (
        <iframe className={styles.viewerFrame} src={url} title={title} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada externa, sin optimizar.
        <img className={styles.viewerImage} src={url} alt={title} />
      )}
      <figcaption className={styles.viewerCaption}>
        <span>{fileName}</span>
        <a href={url} target="_blank" rel="noreferrer">
          Abrir en otra pestaña
        </a>
      </figcaption>
    </figure>
  );
}
