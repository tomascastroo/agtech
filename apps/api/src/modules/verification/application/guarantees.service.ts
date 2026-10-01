import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import type { RequestContext } from '../../../common/auth/decorators.js';
import { ConflictError, InvalidStateError, NotFoundError } from '../../../common/domain/errors.js';
import { GUARANTEE_VERIFICATION_MAX_AGE_DAYS } from '../../assets/domain/asset-status.js';
import { GuaranteeEntity } from '../../assets/infrastructure/guarantee.entity.js';
import { AuditService } from '../../audit/application/audit.service.js';
import { AUDIT_ACTIONS } from '../../audit/application/audit.types.js';
import { MonitoringEventsService } from '../../monitoring/application/monitoring-events.service.js';
import { VerificationRepository } from '../infrastructure/verification.repository.js';

const DAY_MS = 86_400_000;

export interface ConfirmGuaranteeCommand {
  coveredQuantity?: number;
  valuation?: number;
  notes?: string;
}

/**
 * Confirmación de un activo como garantía. Solo se admite sobre la última verificación del
 * activo, con resultado VERIFIED y vigente; la garantía queda vinculada a esa verificación.
 */
@Injectable()
export class GuaranteesService {
  constructor(
    private readonly verification: VerificationRepository,
    private readonly audit: AuditService,
    private readonly events: MonitoringEventsService,
    private readonly dataSource: DataSource,
  ) {}

  async confirm(
    user: AuthenticatedUser,
    runId: string,
    command: ConfirmGuaranteeCommand,
    context: RequestContext,
  ): Promise<GuaranteeEntity> {
    const run = await this.verification.findForOrganization(user.organizationId, runId);
    if (!run?.asset) throw new NotFoundError('Verificación', runId);
    const result = run.result;
    if (run.status !== 'COMPLETED' || !result)
      throw new InvalidStateError('La verificación no está completada');
    if (result.outcome !== 'VERIFIED') {
      throw new InvalidStateError(
        'Solo puede confirmarse como garantía un activo verificado sin observaciones',
      );
    }
    if (run.asset.lastVerificationRunId !== run.id) {
      throw new InvalidStateError('Existe una verificación más reciente del activo');
    }
    if (
      Date.now() - (run.completedAt?.getTime() ?? 0) >
      GUARANTEE_VERIFICATION_MAX_AGE_DAYS * DAY_MS
    ) {
      throw new InvalidStateError('La verificación está vencida; ejecute una nueva verificación');
    }

    const covered =
      command.coveredQuantity ??
      Math.min(result.detectedQuantity ?? result.declaredQuantity, result.declaredQuantity);
    if (covered > result.declaredQuantity) {
      throw new InvalidStateError('La cantidad en garantía no puede superar la declarada');
    }
    const valuation =
      command.valuation ??
      (run.asset.declaredValue !== null
        ? Math.round((run.asset.declaredValue * covered) / result.declaredQuantity)
        : null);

    const repo = this.dataSource.getRepository(GuaranteeEntity);
    if (await repo.findOneBy({ assetId: run.assetId, status: 'ACTIVE' })) {
      throw new ConflictError('El activo ya está confirmado como garantía');
    }
    const guarantee = await repo.save(
      repo.create({
        organizationId: user.organizationId,
        assetId: run.assetId,
        verificationRunId: run.id,
        status: 'ACTIVE',
        coveredQuantity: covered,
        valuation,
        currency: run.asset.currency,
        confirmedBy: user.userId,
        notes: command.notes ?? null,
      }),
    );
    await this.audit.record({
      actor: { kind: 'user', user },
      action: AUDIT_ACTIONS.GUARANTEE_CONFIRMED,
      resourceType: 'guarantee',
      resourceId: guarantee.id,
      metadata: {
        assetId: run.assetId,
        verificationRunId: run.id,
        coveredQuantity: covered,
        valuation,
      },
      context,
    });
    await this.events.record({
      organizationId: user.organizationId,
      assetId: run.assetId,
      verificationRunId: run.id,
      type: 'GUARANTEE_CONFIRMED',
      message: `Activo confirmado como garantía por ${user.fullName}`,
      payload: { guaranteeId: guarantee.id },
    });
    return guarantee;
  }
}
