'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type {
  AlertItem,
  AlertRule,
  AnimalItem,
  AssetDetail,
  AssetSummary,
  AssetType,
  AuditLogItem,
  DashboardSummary,
  DeviceInstallation,
  DocumentItem,
  DocumentRequirement,
  EstablishmentSummary,
  EvidenceItem,
  IntegrationsStatus,
  MonitoringConfig,
  MonitoringEvent,
  Paginated,
  PortfolioRow,
  ReportItem,
  SatelliteObservation,
  SessionUser,
  VerificationDetail,
  VerificationEvidence,
  VerificationRun,
} from './types';

const qs = (params: Record<string, string | number | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const keys = {
  me: ['me'] as const,
  dashboard: ['dashboard'] as const,
  portfolio: ['portfolio'] as const,
  assets: (filters: object) => ['assets', filters] as const,
  asset: (id: string) => ['asset', id] as const,
  assetTypes: ['asset-types'] as const,
  establishments: ['establishments'] as const,
  documents: (assetId: string) => ['documents', assetId] as const,
  evidence: (assetId: string) => ['evidence', assetId] as const,
  devices: (assetId: string) => ['devices', assetId] as const,
  satellite: (assetId: string) => ['satellite', assetId] as const,
  animals: (assetId: string) => ['animals', assetId] as const,
  verifications: (filters: object) => ['verifications', filters] as const,
  verification: (id: string) => ['verification', id] as const,
  verificationEvidence: (id: string) => ['verification-evidence', id] as const,
  alerts: (filters: object) => ['alerts', filters] as const,
  reports: (filters: object) => ['reports', filters] as const,
  events: (assetId?: string) => ['events', assetId ?? 'all'] as const,
  rules: ['alert-rules'] as const,
  scoring: ['scoring'] as const,
  integrations: ['integrations'] as const,
  audit: (page: number) => ['audit', page] as const,
  users: ['users'] as const,
  monitoring: (assetId: string) => ['monitoring', assetId] as const,
  organization: ['organization'] as const,
};

export const useSession = () =>
  useQuery({ queryKey: keys.me, queryFn: () => api<SessionUser>('/auth/me'), staleTime: 60_000 });

/** ¿Está habilitado "Simular solicitud" (DEMO_MODE) en este entorno? */
export const useDemoMode = (allowed = true) => {
  const query = useQuery({
    queryKey: ['demo-scenarios'],
    queryFn: () => api<{ enabled: boolean }>('/demo/scenarios'),
    enabled: allowed,
    staleTime: 5 * 60_000,
  });
  return query.data?.enabled === true;
};

export const useDashboard = () =>
  useQuery({
    queryKey: keys.dashboard,
    queryFn: () => api<DashboardSummary>('/dashboard/summary'),
  });

export const usePortfolio = () =>
  useQuery({
    queryKey: keys.portfolio,
    queryFn: () => api<PortfolioRow[]>('/monitoring/portfolio'),
  });

export interface AssetFilters {
  search?: string;
  status?: string;
  assetTypeCode?: string;
  page?: number;
}
export const useAssets = (filters: AssetFilters) =>
  useQuery({
    queryKey: keys.assets(filters),
    queryFn: () => api<Paginated<AssetSummary>>(`/assets${qs({ ...filters, pageSize: 50 })}`),
  });

export const useAsset = (id: string) =>
  useQuery({ queryKey: keys.asset(id), queryFn: () => api<AssetDetail>(`/assets/${id}`) });

export const useAssetTypes = () =>
  useQuery({
    queryKey: keys.assetTypes,
    queryFn: () => api<AssetType[]>('/asset-types'),
    staleTime: 300_000,
  });

export const useEstablishments = () =>
  useQuery({
    queryKey: keys.establishments,
    queryFn: () => api<EstablishmentSummary[]>('/establishments'),
  });

export const useDocuments = (assetId: string) =>
  useQuery({
    queryKey: keys.documents(assetId),
    queryFn: () =>
      api<{ documents: DocumentItem[]; requirements: DocumentRequirement[] }>(
        `/assets/${assetId}/documents`,
      ),
    // Mientras haya lecturas automáticas en curso se refresca para mostrar el resultado.
    refetchInterval: (q) =>
      q.state.data?.documents.some((d) => d.analysis?.status === 'PENDING') ? 4000 : false,
  });

export const useEvidence = (assetId: string) =>
  useQuery({
    queryKey: keys.evidence(assetId),
    queryFn: () => api<EvidenceItem[]>(`/assets/${assetId}/evidence`),
  });

export const useDevices = (assetId: string) =>
  useQuery({
    queryKey: keys.devices(assetId),
    queryFn: () => api<DeviceInstallation[]>(`/assets/${assetId}/devices`),
  });

export const useSatellite = (assetId: string, enabled: boolean) =>
  useQuery({
    queryKey: keys.satellite(assetId),
    queryFn: () => api<SatelliteObservation[]>(`/assets/${assetId}/satellite`),
    enabled,
  });

export const useAnimals = (assetId: string, enabled: boolean) =>
  useQuery({
    queryKey: keys.animals(assetId),
    queryFn: () => api<AnimalItem[]>(`/assets/${assetId}/animals`),
    enabled,
  });

export const useVerifications = (filters: { assetId?: string; status?: string; page?: number }) =>
  useQuery({
    queryKey: keys.verifications(filters),
    queryFn: () =>
      api<Paginated<VerificationRun>>(`/verifications${qs({ ...filters, pageSize: 50 })}`),
  });

/** Detalle de verificación; consulta periódicamente mientras está en curso. */
export const useVerification = (id: string | null) =>
  useQuery({
    queryKey: keys.verification(id ?? ''),
    queryFn: () => api<VerificationDetail>(`/verifications/${id}`),
    enabled: Boolean(id),
    refetchInterval: (query) =>
      query.state.data && ['PENDING', 'PROCESSING'].includes(query.state.data.status)
        ? 1000
        : false,
  });

export const useVerificationEvidence = (id: string | null, enabled: boolean) =>
  useQuery({
    queryKey: keys.verificationEvidence(id ?? ''),
    queryFn: () => api<VerificationEvidence[]>(`/verifications/${id}/evidence`),
    enabled: Boolean(id) && enabled,
  });

export const useAlerts = (filters: { status?: string; severity?: string; assetId?: string }) =>
  useQuery({
    queryKey: keys.alerts(filters),
    queryFn: () => api<Paginated<AlertItem>>(`/alerts${qs({ ...filters, pageSize: 100 })}`),
  });

export const useReports = (filters: { assetId?: string }) =>
  useQuery({
    queryKey: keys.reports(filters),
    queryFn: () => api<Paginated<ReportItem>>(`/reports${qs({ ...filters, pageSize: 100 })}`),
    refetchInterval: (query) =>
      query.state.data?.items.some((r) => r.status === 'PENDING' || r.status === 'GENERATING')
        ? 2000
        : false,
  });

export const useEvents = (assetId?: string) =>
  useQuery({
    queryKey: keys.events(assetId),
    queryFn: () => api<MonitoringEvent[]>(`/monitoring/events${qs({ assetId, limit: 40 })}`),
  });

export const useMonitoringConfig = (assetId: string) =>
  useQuery({
    queryKey: keys.monitoring(assetId),
    queryFn: () => api<MonitoringConfig | null>(`/assets/${assetId}/monitoring`),
  });

export const useOrganization = () =>
  useQuery({
    queryKey: keys.organization,
    queryFn: () =>
      api<{ id: string; name: string; legalName: string; taxId: string; kind: string }>(
        '/organization',
      ),
    staleTime: 300_000,
  });

export const useAlertRules = () =>
  useQuery({ queryKey: keys.rules, queryFn: () => api<AlertRule[]>('/alert-rules') });

export const useScoring = () =>
  useQuery({
    queryKey: keys.scoring,
    queryFn: () =>
      api<{
        modelVersion: string;
        weights: Record<string, number>;
        defaults: Record<string, number>;
      }>('/organization/scoring'),
  });

export const useIntegrations = () =>
  useQuery({
    queryKey: keys.integrations,
    queryFn: () => api<IntegrationsStatus>('/integrations'),
  });

export const useAuditLogs = (page: number) =>
  useQuery({
    queryKey: keys.audit(page),
    queryFn: () => api<Paginated<AuditLogItem>>(`/audit-logs${qs({ page, pageSize: 25 })}`),
  });

export const useUsers = () =>
  useQuery({
    queryKey: keys.users,
    queryFn: () =>
      api<
        {
          id: string;
          fullName: string;
          email: string;
          status: string;
          role: { code: string; name: string } | null;
          lastLoginAt: string | null;
        }[]
      >('/users'),
  });

/** Mutación con invalidación de las consultas afectadas. */
export function useApiMutation<TVariables, TResult>(
  fn: (variables: TVariables) => Promise<TResult>,
  invalidate: readonly (readonly unknown[])[] = [],
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all(
        invalidate.map((queryKey) => client.invalidateQueries({ queryKey: [...queryKey] })),
      );
    },
  });
}
