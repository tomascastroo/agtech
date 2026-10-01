import { requirementAlternatives } from '../../../documents/domain/document.types.js';
import { round } from '../scoring.math.js';
import type {
  ComponentEvaluation,
  RequiredDocumentInput,
  ScoreComponent,
  ScoreFactor,
  ScoringInput,
} from '../scoring.types.js';

const EXPIRING_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

const STATUS_LABEL: Record<string, string> = {
  VALID: 'Válido',
  PENDING_REVIEW: 'Pendiente de revisión',
  EXPIRED: 'Vencido',
  REJECTED: 'Rechazado',
};

/** Completitud y vigencia de la documentación exigida para el tipo de activo. */
export class DocumentationComponent implements ScoreComponent {
  readonly key = 'documentation' as const;
  readonly label = 'Documentación';

  evaluate({ documents, now }: ScoringInput): ComponentEvaluation {
    if (documents.requirements.length === 0) {
      return { score: 100, explanation: 'El tipo de activo no exige documentación.', factors: [] };
    }
    const factors: ScoreFactor[] = [];
    let total = 0;
    for (const requirement of documents.requirements) {
      const alternatives = requirementAlternatives(requirement);
      const candidates = documents.documents.filter((doc) => alternatives.includes(doc.type));
      const best = candidates
        .map((doc) => ({ doc, points: this.points(doc, now) }))
        .sort((a, b) => b.points - a.points)[0];
      const points = best?.points ?? 0;
      total += points;
      factors.push({
        label: requirement.replace('|', ' o '),
        value: best ? this.describe(best.doc, now) : 'Faltante',
        impact: points - 100,
      });
    }
    const score = round(total / documents.requirements.length);
    const missing = factors.filter((f) => f.value === 'Faltante').length;
    const explanation =
      missing > 0
        ? `Faltan ${missing} de ${documents.requirements.length} documentos requeridos.`
        : score === 100
          ? 'Documentación completa y vigente.'
          : 'Documentación completa con observaciones de revisión o vigencia.';
    return { score, explanation, factors };
  }

  private points(doc: RequiredDocumentInput, now: Date): number {
    if (doc.status === 'REJECTED' || doc.status === 'EXPIRED') return 0;
    const expiresAt = doc.expiresAt ? new Date(`${doc.expiresAt}T23:59:59Z`) : null;
    if (expiresAt && expiresAt < now) return 0;
    if (doc.status === 'PENDING_REVIEW') return 70;
    if (expiresAt && expiresAt.getTime() - now.getTime() < EXPIRING_WINDOW_DAYS * DAY_MS) return 85;
    return 100;
  }

  private describe(doc: RequiredDocumentInput, now: Date): string {
    const expiresAt = doc.expiresAt ? new Date(`${doc.expiresAt}T23:59:59Z`) : null;
    if (expiresAt && expiresAt < now) return 'Vencido';
    return STATUS_LABEL[doc.status] ?? doc.status;
  }
}
