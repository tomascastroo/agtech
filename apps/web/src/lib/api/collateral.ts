'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

/** Garantía bovina con verificación continua (Asset Passport). */
export type CollateralState =
  | 'PENDIENTE_DECLARACION'
  | 'PENDIENTE_VERIFICACION'
  | 'VERIFICADA'
  | 'EN_MONITOREO'
  | 'REQUIERE_EVIDENCIA'
  | 'REQUIERE_REVISION'
  | 'REQUIERE_INSPECCION'
  | 'NO_DETERMINABLE'
  | 'VENCIDA'
  | 'FINALIZADA';

export type RiskLevel = 'BAJO' | 'MEDIO' | 'ALTO' | 'CRITICO';

export interface GuaranteeRow {
  id: string;
  code: string;
  producerName: string;
  producerTaxId: string;
  establishmentName: string | null;
  renspa: string | null;
  productionType: string;
  state: CollateralState;
  stateLabel: string;
  stateReason: string | null;
  score: number | null;
  riskLevel: RiskLevel | null;
  amount: number | null;
  debtAmount: number | null;
  currency: string;
  coverageStatus: string | null;
  coverageRatio: number | null;
  verifiableValue: number | null;
  expectedHeads: number | null;
  declaredHeads: number | null;
  verifiableHeads: number | null;
  lastVerificationAt: string | null;
  nextVerificationAt: string | null;
  lastEvidenceAt: string | null;
  dataSource: 'REAL' | 'DEMO';
  requestId: string | null;
  openAlerts: number;
}

export interface GuaranteeDashboard {
  kpis: {
    activeGuarantees: number;
    verified: number;
    atRisk: number;
    expiredEvidence: number;
    averageScore: number | null;
    pendingInspections: number;
    openAlerts: number;
    byCurrency: {
      currency: string;
      guaranteed: number | null;
      verifiable: number | null;
      coverageRatio: number | null;
      determinable: number;
      total: number;
    }[];
  };
  demoGuarantees: number;
  items: GuaranteeRow[];
}

type Row = Record<string, unknown>;

export interface ScoreComponent {
  code: string;
  label: string;
  value: number | null;
  weight: number;
  explanation: string;
}

export interface Gate {
  code: string;
  state: string;
  explanation: string;
}

export interface Passport {
  header: {
    id: string;
    code: string;
    state: CollateralState;
    stateLabel: string;
    stateReason: string | null;
    trust: { verdict: string; text: string };
    score: number | null;
    riskLevel: RiskLevel | null;
    coverage: {
      status: string;
      ratio: number | null;
      verifiableValue: number | null;
      currency: string;
    };
    lastVerificationAt: string | null;
    nextVerificationAt: string | null;
    lastEvidenceAt: string | null;
    evaluatedAt: string | null;
    dataSource: 'REAL' | 'DEMO';
    requestId: string | null;
    assetId: string | null;
  };
  identity: {
    producerName: string;
    producerTaxId: string;
    establishment: {
      id: string;
      name: string;
      renspa: string | null;
      province: string;
      locality: string | null;
      holderName: string;
    } | null;
    asset: { id: string; name: string } | null;
    productionType: string;
    productionLabel: string;
    strategy: string;
  };
  legal: {
    instrument: string;
    identifier: string | null;
    status: string;
    lienPriority: number | null;
    immobilizationStatus: string;
    immobilizationReference: string | null;
    amount: number | null;
    debtAmount: number | null;
    currency: string;
    grantedAt: string | null;
    expiresAt: string | null;
    notInformed: string[];
    note: string;
  };
  valuation: {
    averageWeightKg: number | null;
    weightSource: string | null;
    pricePerKg: number | null;
    priceCurrency: string | null;
    priceSource: string | null;
    priceDate: string | null;
    qualityFactor: number | null;
  };
  declaration: {
    immutable: boolean;
    current: DeclarationVersion | null;
    versions: DeclarationVersion[];
  };
  bovines: {
    declared: number | null;
    exits: number;
    entries: number;
    expected: number | null;
    observed: number | null;
    observedBasis: 'CENSO' | 'COTA_INFERIOR' | null;
    observedMethod: string | null;
    verifiable: number | null;
    unexplainedDifference: number | null;
    consistency: string | null;
    narrative: string[];
    observationChoice: string | null;
  };
  evidence: Row[];
  rfid: {
    identified: number;
    ambiguous: number;
    insufficient: number;
    simulatedExcluded: number;
    captures: Row[];
  };
  officialSources: {
    code: string;
    name: string;
    scope: string;
    status: string;
    statusLabel: string;
    detail: string;
    documentTypes: string[];
    documents: { id: string; title: string; uploadedAt: string; analysis: string | null }[];
    action: string | null;
  }[];
  movements: Row[];
  documents: Row[];
  verifications: Row[];
  score: {
    value: number | null;
    weighted: number | null;
    components: ScoreComponent[];
    gates: Gate[];
    engineVersion: string;
    evaluatedAt: string;
    history: {
      evaluatedAt: string;
      score: number | null;
      state: string;
      riskLevel: string;
      trigger: string;
    }[];
  } | null;
  coverage: {
    status: string;
    missing: string[];
    warnings: string[];
    verifiableHeads: number | null;
    verifiableValue: number | null;
    currency: string;
    ratio: number | null;
    ratioBasis: string | null;
    guaranteeRatio: number | null;
    formula: string | null;
  } | null;
  risk: {
    level: RiskLevel;
    points: number;
    factors: { code: string; points: number; explanation: string }[];
  } | null;
  schedule: {
    riskLevel: string;
    frequencyDays: number;
    maxEvidenceAgeDays: number;
    recommendedMethod: string;
    recommendedMethodLabel: string;
    requiresInspection: boolean;
    lastVerificationAt: string | null;
    nextVerificationAt: string;
    explanation: string;
  } | null;
  alerts: Row[];
  inspections: Row[];
  history: Row[];
  limitations: string[];
}

export interface DeclarationVersion {
  id?: string;
  version: number;
  heads: number;
  categories: { category: string; heads: number }[];
  source: string;
  declaredBy: string;
  declaredAt: string;
  reason: string | null;
}

export const STATE_TONE: Record<
  CollateralState,
  'success' | 'warning' | 'critical' | 'info' | 'neutral'
> = {
  VERIFICADA: 'success',
  EN_MONITOREO: 'success',
  REQUIERE_EVIDENCIA: 'warning',
  REQUIERE_REVISION: 'warning',
  REQUIERE_INSPECCION: 'critical',
  NO_DETERMINABLE: 'critical',
  PENDIENTE_DECLARACION: 'neutral',
  PENDIENTE_VERIFICACION: 'info',
  VENCIDA: 'neutral',
  FINALIZADA: 'neutral',
};

export const STATE_LABELS: Record<CollateralState, string> = {
  PENDIENTE_DECLARACION: 'Pendiente de declaración',
  PENDIENTE_VERIFICACION: 'Pendiente de verificación',
  VERIFICADA: 'Verificada',
  EN_MONITOREO: 'En monitoreo',
  REQUIERE_EVIDENCIA: 'Requiere evidencia',
  REQUIERE_REVISION: 'Requiere revisión',
  REQUIERE_INSPECCION: 'Requiere inspección',
  NO_DETERMINABLE: 'No determinable',
  VENCIDA: 'Vencida',
  FINALIZADA: 'Finalizada',
};

export const RISK_TONE: Record<RiskLevel, 'success' | 'warning' | 'critical' | 'neutral'> = {
  BAJO: 'success',
  MEDIO: 'neutral',
  ALTO: 'warning',
  CRITICO: 'critical',
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  BAJO: 'Bajo',
  MEDIO: 'Medio',
  ALTO: 'Alto',
  CRITICO: 'Crítico',
};

export const PRODUCTION_LABELS: Record<string, string> = {
  FEEDLOT: 'Feedlot',
  CRIA: 'Cría',
  INVERNADA: 'Invernada',
  TAMBO: 'Tambo',
};

export const METHOD_LABELS: Record<string, string> = {
  FOTO: 'Foto',
  VIDEO: 'Video / barrido',
  ESCANER_FIJO: 'Escáner fijo',
  MANGA_RFID: 'Manga + RFID',
  INSPECCION: 'Inspección',
  DOCUMENTO: 'Documento',
};

export const ORIGIN_LABELS: Record<string, string> = {
  CAPTURA_EN_CAMPO: 'Captura en campo',
  ARCHIVO_CARGADO: 'Archivo cargado',
  DISPOSITIVO_FIJO: 'Cámara instalada',
  DESCONOCIDO: 'Origen no registrado',
};

const qs = (params: Record<string, string | boolean | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== '' && v !== false) s.set(k, String(v));
  const t = s.toString();
  return t ? `?${t}` : '';
};

export const collateralKeys = {
  list: (filters: object) => ['bovine-guarantees', filters] as const,
  passport: (id: string) => ['bovine-guarantee', id] as const,
  producer: (requestId: string) => ['producer-declaration', requestId] as const,
};

export const useGuarantees = (filters: {
  state?: string;
  risk?: string;
  production?: string;
  q?: string;
  includeDemo?: boolean;
}) =>
  useQuery({
    queryKey: collateralKeys.list(filters),
    queryFn: () => api<GuaranteeDashboard>(`/bovine-guarantees${qs(filters)}`),
  });

export const usePassport = (id: string) =>
  useQuery({
    queryKey: collateralKeys.passport(id),
    queryFn: () => api<Passport>(`/bovine-guarantees/${id}/passport`),
    // Las verificaciones del pipeline llegan en segundo plano.
    refetchInterval: (q) =>
      q.state.data?.header.state === 'PENDIENTE_VERIFICACION' ? 5_000 : false,
  });

/** Acción sobre una garantía (JSON o multipart); al terminar refresca el passport y la cartera. */
export function useGuaranteeAction<T = unknown>(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { path: string; method?: string; body?: unknown; form?: FormData }) =>
      api<T>(`/bovine-guarantees/${id}${input.path}`, {
        method: input.method ?? 'POST',
        body: input.body,
        form: input.form,
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: collateralKeys.passport(id) });
      await client.invalidateQueries({ queryKey: ['bovine-guarantees'] });
      await client.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export const useProducerDeclaration = (requestId: string) =>
  useQuery({
    queryKey: collateralKeys.producer(requestId),
    queryFn: () =>
      api<{ code: string; frozen: boolean; declarations: DeclarationVersion[] } | null>(
        `/producer/me/requests/${requestId}/declaration`,
      ),
  });

export function useProducerCorrection(requestId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { heads: number; reason: string }) =>
      api(`/producer/me/requests/${requestId}/declaration/corrections`, { method: 'POST', body }),
    onSuccess: () => client.invalidateQueries({ queryKey: collateralKeys.producer(requestId) }),
  });
}
