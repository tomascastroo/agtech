'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BovineScanner } from '@/components/scanner/BovineScanner';
import { Loading } from '@/components/ui/Feedback';
import { api } from '@/lib/api/client';
import type { ProducerRequestDetail } from '@/lib/api/types';
import { cachedRequest, cacheRequest, type CachedRequest } from '@/lib/scanner/request-cache';
import { registerServiceWorker, warmScannerAssets } from '@/lib/scanner/offline';
import { startAutoSync } from '@/lib/scanner/sync';

/**
 * Escáner de bovinos a pantalla completa (fuera del marco del portal para poder abrirse sin
 * señal: usa la copia local de la solicitud si no hay conexión).
 */
export default function ScannerPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const [request, setRequest] = useState<CachedRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    registerServiceWorker();
    // Deja el motor y el modelo en caché: la próxima vez el escáner abre sin señal.
    if (navigator.onLine) void warmScannerAssets();
    return startAutoSync();
  }, []);

  useEffect(() => {
    const local = cachedRequest(requestId);
    // Copia local primero (sin señal), luego se actualiza con la API si hay conexión.
    if (local) queueMicrotask(() => setRequest(local));
    api<ProducerRequestDetail>(`/producer/me/requests/${requestId}`)
      .then((r) => {
        if (!r.asset) throw new Error('Primero declará el rodeo en la solicitud');
        const value = { id: r.id, assetName: r.asset.name };
        cacheRequest(value);
        setRequest(value);
      })
      .catch((e: Error) => {
        if (!local)
          setError(
            navigator.onLine
              ? e.message
              : 'Sin señal: abrí el escáner una vez con conexión para dejarlo listo.',
          );
      });
  }, [requestId]);

  if (error) return <p style={{ padding: 16 }}>{error}</p>;
  if (!request) return <Loading />;
  return <BovineScanner requestId={request.id} assetName={request.assetName} />;
}
