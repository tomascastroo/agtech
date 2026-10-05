import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
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
import type { AlertEntity } from '../infrastructure/alert.entity.js';
import { AlertsRepository, type AlertFilters } from '../infrastructure/alerts.repository.js';

export type AlertTransition = 'ACKNOWLEDGED' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED';

export interface UpdateAlertCommand {
  status?: AlertTransition;
  resolutionNote?: string;
  /** Responsable asignado (usuario de la organización); null lo desasigna. */
  ownerUserId?: string | null;
}

/** Transiciones permitidas. RESOLVED y DISMISSED son finales (la alerta nunca se borra). */
const TRANSITIONS: Record<string, AlertTransition[]> = {
  OPEN: ['ACKNOWLEDGED', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'],
  ACKNOWLEDGED: ['IN_REVIEW', 'RESOLVED', 'DISMISSED'],
  IN_REVIEW: ['RESOLVED', 'DISMISSED'],
  RESOLVED: [],
  DISMISSED: [],
};

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
    private readonly dataSource: DataSource,
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
    if (alert.status === 'RESOLVED' || alert.status === 'DISMISSED')
      throw new InvalidStateError('La alerta ya está cerrada');
    const now = new Date();
    const patch: Partial<AlertEntity> = {};
    if (command.ownerUserId !== undefined) {
      if (command.ownerUserId !== null) {
        const [owner] = (await this.dataSource.query(
          `SELECT id FROM users WHERE id = $1 AND organization_id = $2`,
          [command.ownerUserId, user.organizationId],
        )) as { id: string }[];
        if (!owner)
          throw new ValidationFailedError('El responsable no pertenece a la organización');
      }
      patch.ownerUserId = command.ownerUserId;
    }
    const to = command.status;
    if (to) {
      if (!TRANSITIONS[alert.status]!.includes(to)) {
        throw new InvalidStateError(
          to === 'ACKNOWLEDGED'
            ? 'Solo se puede tomar conocimiento de alertas abiertas'
            : `No se puede pasar de ${alert.status} a ${to}`,
        );
      }
      if ((to === 'RESOLVED' || to === 'DISMISSED') && !command.resolutionNote?.trim()) {
        throw new ValidationFailedError(
          to === 'RESOLVED'
            ? 'La resolución requiere una nota explicativa'
            : 'Descartar una alerta requiere una nota explicativa',
        );
      }
      patch.status = to;
      if (!alert.acknowledgedAt)
        Object.assign(patch, { acknowledgedAt: now, acknowledgedBy: user.userId });
      if (to === 'RESOLVED')
        Object.assign(patch, {
          resolvedAt: now,
          resolvedBy: user.userId,
          resolutionNote: command.resolutionNote!.trim(),
        });
      if (to === 'DISMISSED')
        Object.assign(patch, {
          dismissedAt: now,
          dismissedBy: user.userId,
          resolutionNote: command.resolutionNote!.trim(),
        });
    }
    if (!Object.keys(patch).length) throw new ValidationFailedError('Nada para actualizar');
    await this.alerts.update(id, patch);
    await this.audit.record({
      actor: { kind: 'user', user },
      action:
        to === 'RESOLVED'
          ? AUDIT_ACTIONS.ALERT_RESOLVED
          : to === 'DISMISSED'
            ? AUDIT_ACTIONS.ALERT_DISMISSED
            : to
              ? AUDIT_ACTIONS.ALERT_ACKNOWLEDGED
              : AUDIT_ACTIONS.ALERT_ASSIGNED,
      resourceType: 'alert',
      resourceId: id,
      metadata: {
        from: alert.status,
        to: to ?? alert.status,
        note: command.resolutionNote ?? null,
        ownerUserId: patch.ownerUserId ?? alert.ownerUserId,
        bovineGuaranteeId: alert.bovineGuaranteeId,
      },
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
