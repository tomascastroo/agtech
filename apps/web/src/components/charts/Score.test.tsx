import { render, screen } from '@testing-library/react';
import type { ScoreComponent } from '@/lib/api/types';
import { ScoreBreakdown } from './ScoreBreakdown';
import { ScoreMeter } from './ScoreMeter';

const components: ScoreComponent[] = [
  {
    key: 'documentation',
    label: 'Documentación',
    score: 90,
    weight: 0.2,
    contribution: 18,
    explanation: 'Documentación completa con observaciones de revisión o vigencia.',
    factors: [
      { label: 'RENSPA', value: 'Válido', impact: 0 },
      { label: 'DNI / CUIT del titular', value: 'Pendiente de revisión', impact: -30 },
    ],
  },
  {
    key: 'existence',
    label: 'Existencia verificada',
    score: 85,
    weight: 0.25,
    contribution: 21.25,
    explanation: 'Coincidencia de 98,8 % entre lo declarado y lo detectado.',
    factors: [],
  },
];

describe('ScoreMeter', () => {
  it('muestra el score como número protagonista y medidor accesible', () => {
    render(<ScoreMeter score={82} tone="success" />);
    expect(screen.getByTestId('score-value')).toHaveTextContent('82');
    const meter = screen.getByRole('meter', { name: 'Score de verificación' });
    expect(meter).toHaveAttribute('aria-valuenow', '82');
    expect(meter).toHaveAttribute('aria-valuemax', '100');
  });
});

describe('ScoreBreakdown', () => {
  it('explica cada componente con su peso y aporte', () => {
    render(<ScoreBreakdown components={components} />);
    const breakdown = screen.getByTestId('score-breakdown');
    expect(breakdown).toHaveTextContent('Documentación');
    expect(breakdown).toHaveTextContent('peso 20 % · aporta 18');
    expect(breakdown).toHaveTextContent('peso 25 % · aporta 21,25');
    expect(breakdown).toHaveTextContent('Coincidencia de 98,8 %');
    expect(screen.queryByText('RENSPA')).not.toBeInTheDocument();
  });

  it('muestra los factores con su impacto cuando se solicita', () => {
    render(<ScoreBreakdown components={components} showFactors />);
    expect(screen.getByText('DNI / CUIT del titular')).toBeInTheDocument();
    expect(screen.getByText('(-30)')).toBeInTheDocument();
  });
});
