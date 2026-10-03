import { render, screen } from '@testing-library/react';
import {
  AssetStatusBadge,
  OutcomeBadge,
  PortfolioStateBadge,
  RiskBadge,
  SeverityBadge,
  SimulatedBadge,
} from './StatusBadges';

describe('Badges de estado', () => {
  it('siempre comunican el estado con texto, no sólo con color', () => {
    render(
      <>
        <AssetStatusBadge status="VERIFIED" />
        <OutcomeBadge outcome="OBSERVED" />
        <PortfolioStateBadge state="ALERTA" />
        <SeverityBadge severity="CRITICAL" />
        <RiskBadge level="MEDIUM" />
      </>,
    );
    expect(screen.getByText('Verificado')).toBeInTheDocument();
    expect(screen.getByText('Requiere revisión')).toBeInTheDocument();
    expect(screen.getByText('Alerta')).toBeInTheDocument();
    expect(screen.getByText('Crítica')).toBeInTheDocument();
    expect(screen.getByText('Riesgo moderado')).toBeInTheDocument();
  });

  it('identifica las fuentes simuladas', () => {
    render(<SimulatedBadge />);
    expect(screen.getByText('Simulado')).toHaveAttribute(
      'title',
      expect.stringContaining('no constituye una observación real'),
    );
  });

  it('muestra el código si el estado es desconocido', () => {
    render(<AssetStatusBadge status="ARCHIVED" />);
    expect(screen.getByText('ARCHIVED')).toBeInTheDocument();
  });
});
