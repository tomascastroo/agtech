import { Badge, type Tone } from '@/components/ui/Badge';
import type { IconName } from '@/components/ui/Icon';
import {
  ALERT_STATUS_LABELS,
  ASSET_STATUS_LABELS,
  DOCUMENT_STATUS_LABELS,
  OUTCOME_LABELS,
  PORTFOLIO_STATE_LABELS,
  RISK_LABELS,
  RUN_STATUS_LABELS,
  SEVERITY_LABELS,
} from '@/lib/labels';

const ASSET_TONES: Record<string, Tone> = {
  DRAFT: 'neutral',
  PENDING_VERIFICATION: 'info',
  VERIFIED: 'success',
  OBSERVED: 'warning',
  REJECTED: 'critical',
};

export const AssetStatusBadge = ({ status }: { status: string }) => (
  <Badge tone={ASSET_TONES[status] ?? 'neutral'} dot>
    {ASSET_STATUS_LABELS[status] ?? status}
  </Badge>
);

const STATE: Record<string, [Tone, IconName]> = {
  OK: ['success', 'check'],
  ALERTA: ['critical', 'warning'],
  EN_REVISION: ['info', 'clock'],
  OBSERVADO: ['warning', 'info'],
};

export const PortfolioStateBadge = ({ state }: { state: string }) => {
  const [tone, icon] = STATE[state] ?? ['neutral', 'info'];
  return (
    <Badge tone={tone} icon={icon}>
      {PORTFOLIO_STATE_LABELS[state] ?? state}
    </Badge>
  );
};

const OUTCOME: Record<string, [Tone, IconName]> = {
  VERIFIED: ['success', 'check'],
  OBSERVED: ['warning', 'warning'],
  REJECTED: ['critical', 'critical'],
  INCONCLUSIVE: ['neutral', 'info'],
};

export const OutcomeBadge = ({ outcome }: { outcome: string }) => {
  const [tone, icon] = OUTCOME[outcome] ?? ['neutral', 'info'];
  return (
    <Badge tone={tone} icon={icon}>
      {OUTCOME_LABELS[outcome] ?? outcome}
    </Badge>
  );
};

const SEVERITY: Record<string, [Tone, IconName]> = {
  INFO: ['info', 'info'],
  WARNING: ['warning', 'warning'],
  CRITICAL: ['critical', 'critical'],
};

export const SeverityBadge = ({ severity }: { severity: string }) => {
  const [tone, icon] = SEVERITY[severity] ?? ['neutral', 'info'];
  return (
    <Badge tone={tone} icon={icon}>
      {SEVERITY_LABELS[severity] ?? severity}
    </Badge>
  );
};

const RUN: Record<string, Tone> = {
  PENDING: 'neutral',
  PROCESSING: 'info',
  COMPLETED: 'success',
  FAILED: 'critical',
};
export const RunStatusBadge = ({ status }: { status: string }) => (
  <Badge tone={RUN[status] ?? 'neutral'} dot>
    {RUN_STATUS_LABELS[status] ?? status}
  </Badge>
);

const RISK: Record<string, Tone> = { LOW: 'success', MEDIUM: 'warning', HIGH: 'critical' };
export const RiskBadge = ({ level }: { level: string }) => (
  <Badge tone={RISK[level] ?? 'neutral'} dot>
    Riesgo {RISK_LABELS[level]?.toLowerCase() ?? level}
  </Badge>
);

const DOC: Record<string, Tone> = {
  VALID: 'success',
  PENDING_REVIEW: 'info',
  EXPIRED: 'critical',
  REJECTED: 'critical',
};
export const DocumentStatusBadge = ({ status }: { status: string }) => (
  <Badge tone={DOC[status] ?? 'neutral'} dot>
    {DOCUMENT_STATUS_LABELS[status] ?? status}
  </Badge>
);

const ALERT_STATUS: Record<string, Tone> = {
  OPEN: 'outline',
  ACKNOWLEDGED: 'info',
  RESOLVED: 'neutral',
};
export const AlertStatusBadge = ({ status }: { status: string }) => (
  <Badge tone={ALERT_STATUS[status] ?? 'neutral'}>{ALERT_STATUS_LABELS[status] ?? status}</Badge>
);

export const SimulatedBadge = () => (
  <Badge tone="outline" title="Fuente simulada de desarrollo: no constituye una observación real">
    Simulado
  </Badge>
);

const REQUIREMENT: Record<string, [Tone, IconName, string]> = {
  PENDING: ['neutral', 'clock', 'Pendiente'],
  UPLOADED: ['info', 'document', 'Cargado'],
  PROCESSING: ['info', 'refresh', 'Procesando'],
  CONSISTENT: ['success', 'check', 'Consistente'],
  INCONSISTENT: ['critical', 'critical', 'Inconsistente'],
  REVIEW_REQUIRED: ['warning', 'warning', 'Requiere revisión'],
  NOT_APPLICABLE: ['outline', 'x', 'No aplica'],
};

/** Estado de un requisito documental (siempre con ícono y texto). */
export const RequirementStatusBadge = ({ status }: { status: string }) => {
  const [tone, icon, label] = REQUIREMENT[status] ?? ['neutral', 'info', status];
  return (
    <Badge tone={tone} icon={icon}>
      {label}
    </Badge>
  );
};

/** Marca de datos de demostración (nunca se confunde con datos reales). */
export const DemoBadge = ({ label = 'DEMO' }: { label?: string }) => (
  <Badge tone="warning" icon="info" title="Datos ficticios de demostración">
    {label}
  </Badge>
);

/** Nombre de un activo/establecimiento con la marca DEMO cuando viene de "Simular solicitud". */
export const DemoName = ({ name, dataSource }: { name: string; dataSource?: string }) =>
  dataSource === 'DEMO' ? (
    <span className="demo-name">
      {name} <DemoBadge />
    </span>
  ) : (
    <>{name}</>
  );
