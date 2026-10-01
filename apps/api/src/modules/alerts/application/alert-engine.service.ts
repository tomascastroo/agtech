import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service.js';
import { AUDIT_ACTIONS } from '../../audit/application/audit.types.js';
import { MonitoringEventsService } from '../../monitoring/application/monitoring-events.service.js';
import {
  EVALUATORS,
  type AlertConditionEvaluator,
  type AlertEvaluationContext,
} from '../domain/alert-evaluation.js';
import type { AlertEntity } from '../infrastructure/alert.entity.js';
import { AlertsRepository } from '../infrastructure/alerts.repository.js';

/**
 * Motor de alertas: evalúa las reglas configurables (sistema + organización) contra el
 * contexto de una verificación o del monitoreo periódico. Las alertas se deduplican: no se
 * crea una nueva si ya existe una sin resolver del mismo tipo para el activo.
 */
@Injectable()
export class AlertEngineService {
  private readonly logger = new Logger(AlertEngineService.name);
  private readonly evaluators = new Map<string, AlertConditionEvaluator>(
    EVALUATORS.map((e) => [e.type, e]),
  );

  constructor(
    private readonly alerts: AlertsRepository,
    private readonly audit: AuditService,
    private readonly events: MonitoringEventsService,
  ) {}

  async evaluate(organizationId: string, ctx: AlertEvaluationContext): Promise<AlertEntity[]> {
    const rules = await this.alerts.effectiveRules(organizationId);
    const created: AlertEntity[] = [];
    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (rule.assetTypeCodes.length > 0 && !rule.assetTypeCodes.includes(ctx.asset.assetTypeCode))
        continue;
      const evaluator = this.evaluators.get(rule.conditionType);
      if (!evaluator) {
        this.logger.warn(`Regla ${rule.code} con condición desconocida: ${rule.conditionType}`);
        continue;
      }
      if (!evaluator.phases.includes(ctx.phase)) continue;
      const candidate = evaluator.evaluate(ctx, rule.parameters);
      if (!candidate) continue;

      const alert = await this.alerts.insertIfAbsent({
        organizationId,
        assetId: ctx.asset.id,
        verificationRunId: ctx.verification?.runId ?? null,
        ruleId: rule.id,
        type: rule.code,
        severity: rule.severity,
        status: 'OPEN',
        title: candidate.title,
        description: candidate.description,
        context: {
          ...candidate.context,
          rule: { code: rule.code, parameters: rule.parameters },
          phase: ctx.phase,
        },
      });
      if (!alert) continue;
      created.push(alert);
      await this.audit.record({
        actor: {
          kind: 'system',
          organizationId,
          process: `alert-engine:${ctx.phase.toLowerCase()}`,
        },
        action: AUDIT_ACTIONS.ALERT_CREATED,
        resourceType: 'alert',
        resourceId: alert.id,
        metadata: { type: alert.type, severity: alert.severity, assetId: ctx.asset.id },
      });
      await this.events.record({
        organizationId,
        assetId: ctx.asset.id,
        verificationRunId: ctx.verification?.runId ?? null,
        type: 'ALERT_RAISED',
        severity: alert.severity,
        message: alert.title,
        payload: { alertId: alert.id, type: alert.type },
      });
    }
    return created;
  }
}
