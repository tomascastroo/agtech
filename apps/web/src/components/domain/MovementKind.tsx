import { Icon, type IconName } from '@/components/ui/Icon';
import { MOVEMENT_KIND_LABELS } from '@/lib/api/collateral';
import styles from './domain.module.css';

type Tone = 'in' | 'out' | 'transfer' | 'loss';

const TONE_CLASS: Record<Tone, string> = {
  in: styles.movementIn,
  out: styles.movementOut,
  transfer: styles.movementTransfer,
  loss: styles.movementLoss,
};

function visual(direction: string, kind: string): { icon: IconName; tone: Tone } {
  if (kind === 'MUERTE') return { icon: 'critical', tone: 'loss' };
  if (kind === 'TRASLADO') return { icon: 'transfer', tone: 'transfer' };
  if (kind === 'VENTA' || kind === 'FAENA') return { icon: 'truck', tone: 'out' };
  return direction === 'EGRESO'
    ? { icon: 'movementOut', tone: 'out' }
    : { icon: 'movementIn', tone: 'in' };
}

/** Solo el ícono del movimiento (listas compactas, portal del productor). */
export function MovementIcon({ direction, kind }: { direction: string; kind: string }) {
  const { icon, tone } = visual(direction, kind);
  return (
    <span className={`${styles.movementIcon} ${TONE_CLASS[tone]}`} aria-hidden>
      <Icon name={icon} size="sm" />
    </span>
  );
}

/** Tipo de movimiento: ícono lineal en un círculo suave + dirección y motivo. Nunca solo color. */
export function MovementKind({ direction, kind }: { direction: string; kind: string }) {
  return (
    <span className={styles.movement}>
      <MovementIcon direction={direction} kind={kind} />
      <span className={styles.movementText}>
        <strong>{direction === 'EGRESO' ? 'Egreso' : 'Ingreso'}</strong>
        <span>{MOVEMENT_KIND_LABELS[kind] ?? kind}</span>
      </span>
    </span>
  );
}
