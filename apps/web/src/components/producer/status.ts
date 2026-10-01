import type { Tone } from '@/components/ui/Badge';
import type { ProducerStatus } from '@/lib/api/types';

/** Estados que ve el productor (sin estados técnicos). */
export const PRODUCER_STATUS: Record<ProducerStatus, { label: string; tone: Tone }> = {
  INVITATION_PENDING: { label: 'Invitación pendiente', tone: 'outline' },
  PREPARING: { label: 'En preparación', tone: 'info' },
  PENDING_DOCUMENTATION: { label: 'Pendiente de documentación', tone: 'warning' },
  PENDING_EVIDENCE: { label: 'Pendiente de evidencia', tone: 'warning' },
  READY_FOR_VERIFICATION: { label: 'Lista para verificar', tone: 'info' },
  VERIFYING: { label: 'En verificación', tone: 'info' },
  VERIFIED: { label: 'Verificada', tone: 'success' },
  INFO_REQUIRED: { label: 'Requiere información', tone: 'critical' },
  FINALIZED: { label: 'Finalizada', tone: 'success' },
};
