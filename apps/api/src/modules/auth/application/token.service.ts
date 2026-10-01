import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AppConfig } from '../../../config/app-config.js';
import { AuthenticationError } from '../../../common/domain/errors.js';
import { randomToken, sha256Hex } from '../../../common/crypto/hashing.js';
import type { RequestContext } from '../../../common/auth/decorators.js';
import { AuditService } from '../../audit/application/audit.service.js';
import { AUDIT_ACTIONS } from '../../audit/application/audit.types.js';
import { RefreshTokensRepository } from '../infrastructure/refresh-tokens.repository.js';

export interface AccessTokenPayload {
  sub: string;
  org: string;
  role: string;
}

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

const ISSUER = 'agrogarantias-api';
const AUDIENCE = 'agrogarantias';
const DAY_MS = 86_400_000;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  get accessTtlSeconds(): number {
    return this.config.env.JWT_ACCESS_TTL_SECONDS;
  }

  signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.env.JWT_ACCESS_SECRET,
      expiresIn: this.accessTtlSeconds,
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithm: 'HS256',
    });
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      return await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.env.JWT_ACCESS_SECRET,
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
    } catch {
      throw new AuthenticationError('Sesión inválida o vencida');
    }
  }

  async issueRefreshToken(
    userId: string,
    organizationId: string,
    context: RequestContext,
    familyId: string = randomUUID(),
  ): Promise<IssuedRefreshToken> {
    const token = randomToken(48);
    const expiresAt = new Date(Date.now() + this.config.env.REFRESH_TOKEN_TTL_DAYS * DAY_MS);
    await this.refreshTokens.create({
      userId,
      organizationId,
      familyId,
      tokenHash: sha256Hex(token),
      expiresAt,
      ip: context.ip,
      userAgent: context.userAgent,
    });
    return { token, expiresAt };
  }

  /**
   * Rotación de refresh token. Si se presenta un token ya revocado se asume robo y se revoca
   * toda la familia de tokens (todas las sesiones derivadas de ese login).
   */
  async rotateRefreshToken(
    rawToken: string,
    context: RequestContext,
  ): Promise<{ userId: string; refresh: IssuedRefreshToken }> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const current = await this.refreshTokens.findByHash(sha256Hex(rawToken), manager);
      if (!current) return { kind: 'invalid' as const };
      if (current.revokedAt) {
        await this.refreshTokens.revokeFamily(current.familyId, manager);
        return { kind: 'reuse' as const, current };
      }
      if (current.expiresAt.getTime() <= Date.now()) return { kind: 'invalid' as const };

      const token = randomToken(48);
      const expiresAt = new Date(Date.now() + this.config.env.REFRESH_TOKEN_TTL_DAYS * DAY_MS);
      const next = await this.refreshTokens.create(
        {
          userId: current.userId,
          organizationId: current.organizationId,
          familyId: current.familyId,
          tokenHash: sha256Hex(token),
          expiresAt,
          ip: context.ip,
          userAgent: context.userAgent,
        },
        manager,
      );
      await this.refreshTokens.revoke(current.id, next.id, manager);
      return { kind: 'rotated' as const, userId: current.userId, refresh: { token, expiresAt } };
    });

    if (outcome.kind === 'reuse') {
      await this.audit.record({
        actor: { kind: 'anonymous', organizationId: outcome.current.organizationId },
        action: AUDIT_ACTIONS.REFRESH_TOKEN_REUSE_DETECTED,
        resourceType: 'user',
        resourceId: outcome.current.userId,
        metadata: { familyId: outcome.current.familyId },
        context,
      });
    }
    if (outcome.kind !== 'rotated') throw new AuthenticationError('Sesión inválida o vencida');
    return { userId: outcome.userId, refresh: outcome.refresh };
  }

  async revokeRefreshToken(rawToken: string): Promise<void> {
    const current = await this.refreshTokens.findByHash(sha256Hex(rawToken));
    if (current) await this.refreshTokens.revokeFamily(current.familyId);
  }
}
