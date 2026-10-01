import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import type { RequestContext } from '../../../common/auth/decorators.js';
import { NotFoundError, ValidationFailedError } from '../../../common/domain/errors.js';
import { AuditService } from '../../audit/application/audit.service.js';
import { AUDIT_ACTIONS } from '../../audit/application/audit.types.js';
import {
  DEFAULT_SCORING_WEIGHTS,
  InvalidScoringWeightsError,
  SCORING_MODEL_VERSION,
  resolveWeights,
  validateWeights,
} from '../../scoring/domain/scoring.config.js';
import type { ScoringWeights } from '../../scoring/domain/scoring.types.js';
import { OrganizationEntity } from '../infrastructure/organization.entity.js';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(OrganizationEntity)
    private readonly organizations: Repository<OrganizationEntity>,
    private readonly audit: AuditService,
  ) {}

  async get(organizationId: string): Promise<OrganizationEntity> {
    const organization = await this.organizations.findOneBy({ id: organizationId });
    if (!organization) throw new NotFoundError('Organización', organizationId);
    return organization;
  }

  async scoringWeights(organizationId: string): Promise<ScoringWeights> {
    const organization = await this.get(organizationId);
    try {
      return resolveWeights(organization.settings.scoring?.weights);
    } catch {
      return { ...DEFAULT_SCORING_WEIGHTS };
    }
  }

  async scoringConfiguration(organizationId: string) {
    return {
      modelVersion: SCORING_MODEL_VERSION,
      weights: await this.scoringWeights(organizationId),
      defaults: DEFAULT_SCORING_WEIGHTS,
    };
  }

  async updateScoringWeights(
    user: AuthenticatedUser,
    weights: Record<string, number>,
    context: RequestContext,
  ): Promise<ScoringWeights> {
    let validated: ScoringWeights;
    try {
      validated = validateWeights(weights);
    } catch (error) {
      if (error instanceof InvalidScoringWeightsError)
        throw new ValidationFailedError(error.message);
      throw error;
    }
    const organization = await this.get(user.organizationId);
    const previous = organization.settings.scoring?.weights ?? DEFAULT_SCORING_WEIGHTS;
    organization.settings = { ...organization.settings, scoring: { weights: validated } };
    await this.organizations.save(organization);
    await this.audit.record({
      actor: { kind: 'user', user },
      action: AUDIT_ACTIONS.SCORING_WEIGHTS_UPDATED,
      resourceType: 'organization',
      resourceId: organization.id,
      metadata: { previous, next: validated },
      context,
    });
    return validated;
  }
}
