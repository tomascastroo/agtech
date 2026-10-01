'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { ProducerOverview, ProducerRequestDetail } from '@/lib/api/types';

export const producerKeys = {
  overview: ['producer', 'overview'] as const,
  request: (id: string) => ['producer', 'request', id] as const,
};

export const useProducerOverview = () =>
  useQuery({
    queryKey: producerKeys.overview,
    queryFn: () => api<ProducerOverview>('/producer/me'),
  });

export const useProducerRequest = (id: string) =>
  useQuery({
    queryKey: producerKeys.request(id),
    queryFn: () => api<ProducerRequestDetail>(`/producer/me/requests/${id}`),
    // Mientras se verifica, el estado se actualiza solo.
    refetchInterval: (q) => (q.state.data?.producerStatus === 'VERIFYING' ? 5000 : false),
  });

/** Refresca la solicitud y el inicio después de cada acción del productor. */
export function useProducerRefresh() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['producer'] });
}
