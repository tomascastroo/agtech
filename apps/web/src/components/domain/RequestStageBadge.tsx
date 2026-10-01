import { Badge, type Tone } from '@/components/ui/Badge';

export const REQUEST_STAGE: Record<string, { label: string; tone: Tone }> = {
  INVITED: { label: 'Invitación enviada', tone: 'outline' },
  IN_PROGRESS: { label: 'Productor completando', tone: 'info' },
  READY_FOR_VERIFICATION: { label: 'Lista para verificar', tone: 'warning' },
  VERIFICATION_FAILED: { label: 'Verificación fallida', tone: 'critical' },
  VERIFIED: { label: 'Verificación completada', tone: 'success' },
};

export const RequestStageBadge = ({ stage }: { stage: string }) => {
  const s = REQUEST_STAGE[stage] ?? { label: stage, tone: 'neutral' as Tone };
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
};
