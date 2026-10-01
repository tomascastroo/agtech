import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import type { RequestContext } from '../../../common/auth/decorators.js';
import {
  InvalidStateError,
  NotFoundError,
  ValidationFailedError,
} from '../../../common/domain/errors.js';
import { AuditService } from '../../audit/application/audit.service.js';
import { AUDIT_ACTIONS } from '../../audit/application/audit.types.js';
import type { AlertSeverity } from '../domain/alert.types.js';
import { AlertsRepository, type AlertFilters } from '../infrastructure/alerts.repository.js';

export interface UpdateAlertCommand {
  status: 'ACKNOWLEDGED' | 'RESOLVED';
  resolutionNote?: string;
}

export interface UpdateRuleCommand {
  enabled?: boolean;
  severity?: AlertSeverity;
  parameters?: Record<string, number>;
}

@Injectable()
export class AlertsService {
  constructor(
    private readonly alerts: AlertsRepository,
    private readonly audit: AuditService,
  ) {}

  list(organizationId: string, filters: AlertFilters) {
    return this.alerts.list(organizationId, filters);
  }

  async get(organizationId: string, id: string) {
    const alert = await this.alerts.findById(organizationId, id);
    if (!alert) throw new NotFoundError('Alerta', id);
    return alert;
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    command: UpdateAlertCommand,
    context: RequestContext,
  ) {
    const alert = await this.get(user.organizationId, id);
    if (alert.status === 'RESOLVED') throw new InvalidStateError('La alerta ya está resuelta');
    if (command.status === 'ACKNOWLEDGED' && alert.status !== 'OPEN') {
      throw new InvalidStateError('Solo se puede tomar conocimiento de alertas abiertas');
    }
    if (command.status === 'RESOLVED' && !command.resolutionNote?.trim()) {
      throw new ValidationFailedError('La resolución requiere una nota explicativa');
    }
    const now = new Date();
    await this.alerts.update(
      id,
      command.status === 'ACKNOWLEDGED'
        ? { status: 'ACKNOWLEDGED', acknowledgedAt: now, acknowledgedBy: user.userId }
        : {
            status: 'RESOLVED',
            resolvedAt: now,
            resolvedBy: user.userId,
            resolutionNote: command.resolutionNote!.trim(),
            ...(alert.acknowledgedAt ? {} : { acknowledgedAt: now, acknowledgedBy: user.userId }),
          },
    );
    await this.audit.record({
      actor: { kind: 'user', user },
      action:
        command.status === 'RESOLVED'
          ? AUDIT_ACTIONS.ALERT_RESOLVED
          : AUDIT_ACTIONS.ALERT_ACKNOWLEDGED,
      resourceType: 'alert',
      resourceId: id,
      metadata: { from: alert.status, to: command.status, note: command.resolutionNote ?? null },
      context,
    });
    return this.get(user.organizationId, id);
  }

  rules(organizationId: string) {
    return this.alerts.effectiveRules(organizationId);
  }

  /**
   * Actualiza una regla. Si es una regla del sistema, se crea una versión propia de la
   * organización (override) para no afectar a otras organizaciones.
   */
  async updateRule(
    user: AuthenticatedUser,
    id: string,
    command: UpdateRuleCommand,
    context: RequestContext,
  ) {
    const rule = await this.alerts.findRule(id, user.organizationId);
    if (!rule) throw new NotFoundError('Regla de alerta', id);
    if (command.parameters) {
      const invalid = Object.values(command.parameters).some(
        (value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0,
      );
      if (invalid) throw new ValidationFailedError('Los parámetros deben ser números no negativos');
      const unknown = Object.keys(command.parameters).filter((k) => !(k in rule.parameters));
      if (unknown.length > 0)
        throw new ValidationFailedError(`Parámetros no admitidos: ${unknown.join(', ')}`);
    }
    const next = {
      enabled: command.enabled ?? rule.enabled,
      severity: command.severity ?? rule.severity,
      parameters: { ...rule.parameters, ...command.parameters },
    };
    const saved =
      rule.organizationId === null
        ? await this.alerts.saveRule({
            organizationId: user.organizationId,
            code: rule.code,
            name: rule.name,
            description: rule.description,
            conditionType: rule.conditionType,
            assetTypeCodes: rule.assetTypeCodes,
            ...next,
          })
        : await this.alerts.saveRule(Object.assign(rule, next));
    await this.audit.record({
      actor: { kind: 'user', user },
      action: AUDIT_ACTIONS.ALERT_RULE_UPDATED,
      resourceType: 'alert_rule',
      resourceId: saved.id,
      metadata: {
        code: rule.code,
        before: { enabled: rule.enabled, severity: rule.severity, parameters: rule.parameters },
        after: next,
      },
      context,
    });
    return saved;
  }
}
