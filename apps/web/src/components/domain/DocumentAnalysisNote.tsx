import type { DocumentAnalysis } from '@/lib/api/types';

const CHECK_LABEL: Record<string, string> = {
  DOCUMENT_TYPE: 'tipo',
  RENSPA: 'RENSPA',
  CUIT: 'CUIT',
  HOLDER: 'titular',
  EXPIRY: 'vigencia',
};

/**
 * Resultado de la lectura automática de un documento en una línea: qué coincide con lo
 * declarado y qué requiere revisión. Aclara siempre que no certifica autenticidad.
 */
export function DocumentAnalysisNote({ analysis }: { analysis?: DocumentAnalysis | null }) {
  if (!analysis) return null;
  const matched = analysis.validationResults
    .filter((r) => r.status === 'MATCH' && CHECK_LABEL[r.check])
    .map((r) => CHECK_LABEL[r.check]);
  const issues = analysis.validationResults.filter(
    (r) => r.status === 'MISMATCH' || (r.required && r.status === 'NOT_FOUND'),
  );
  const lowConfidence =
    analysis.extractionConfidence !== null && analysis.extractionConfidence < 0.75;
  const tooltip = [
    ...analysis.validationResults.map((r) => `• ${r.message}`),
    analysis.disclaimer,
  ].join('\n');

  let text: string;
  let color = 'var(--color-text-secondary)';
  switch (analysis.status) {
    case 'PENDING':
      text = 'Lectura automática en curso…';
      break;
    case 'FAILED':
      text = 'Lectura automática no disponible: requiere revisión manual';
      break;
    case 'CONSISTENT':
      text = `✓ Lectura automática: ${matched.length ? `${matched.join(', ')} coinciden` : 'sin diferencias'}`;
      color = 'var(--color-success-text)';
      break;
    default:
      text = `Revisión requerida: ${
        lowConfidence
          ? `lectura de baja confianza (${Math.round((analysis.extractionConfidence ?? 0) * 100)} %)`
          : issues.map((r) => r.message.toLowerCase()).join('; ') || 'verificar manualmente'
      }`;
      color = 'var(--color-warning-text)';
  }
  return (
    <span
      style={{ display: 'block', fontSize: 12, color }}
      title={tooltip}
      data-testid="document-analysis"
    >
      {text}
    </span>
  );
}
