import { render, screen } from '@testing-library/react';
import type { VerificationDetail } from '@/lib/api/types';
import { VerificationProgress } from './VerificationProgress';

const run = (patch: Partial<VerificationDetail>): VerificationDetail => ({
  id: 'run-1',
  status: 'PROCESSING',
  trigger: 'MANUAL',
  assetId: 'asset-1',
  asset: null,
  requestedByProcess: null,
  attempts: 1,
  pipelineVersion: 'verification-pipeline/1.0.0',
  failureReason: null,
  queuedAt: '2026-10-01T12:00:00Z',
  startedAt: '2026-10-01T12:00:01Z',
  completedAt: null,
  result: null,
  inputSnapshot: {},
  metrics: [],
  externalData: [],
  history: [],
  progress: null,
  ...patch,
});

describe('VerificationProgress', () => {
  it('marca como completadas las etapas anteriores a la publicada por el worker', () => {
    render(
      <VerificationProgress
        run={run({ progress: { step: 'CROSS_CHECKS', index: 2, total: 6 } })}
        strategy="LIVESTOCK_COUNTING"
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('(completado)');
    expect(items[1]).toHaveTextContent('(completado)');
    expect(items[2]).toHaveTextContent('Controles cruzados');
    expect(items[2]).toHaveTextContent('(en curso)');
    expect(items[5]).toHaveTextContent('(pendiente)');
  });

  it('no marca etapas mientras la verificación está en cola', () => {
    render(<VerificationProgress run={run({ status: 'PENDING' })} strategy="LIVESTOCK_COUNTING" />);
    expect(screen.queryByText('(en curso)')).not.toBeInTheDocument();
    expect(screen.getByTestId('verification-progress')).toHaveTextContent('En cola desde');
  });

  it('informa el motivo cuando la verificación falla', () => {
    render(
      <VerificationProgress
        run={run({ status: 'FAILED', failureReason: 'Sin evidencia disponible' })}
        strategy="LIVESTOCK_COUNTING"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Sin evidencia disponible');
  });
});
