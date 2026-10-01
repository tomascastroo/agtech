import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import type { RequestContext } from '../../../common/auth/decorators.js';
import { randomToken } from '../../../common/crypto/hashing.js';
import { AuthenticationError } from '../../../common/domain/errors.js';
import { AuditService } from '../../audit/application/audit.service.js';
import { AUDIT_ACTIONS } from '../../audit/application/audit.types.js';
import { UsersRepository } from '../../users/infrastructure/users.repository.js';
import { PasswordHasher } from './password-hasher.js';
import { SessionResolver } from './session-resolver.js';
import { TokenService, type IssuedRefreshToken } from './token.service.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60_000;

export interface SessionTokens {
  accessToken: string;
  accessExpiresIn: number;
  refresh: IssuedRefreshToken;
  csrfToken: string;
}

type Session = Omit<AuthenticatedUser, 'authenticatedVia'>;

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly sessions: SessionResolver,
    private readonly audit: AuditService,
  ) {}

  async login(
    email: string,
    password: string,
    context: RequestContext,
  ): Promise<{ session: Session; tokens: SessionTokens }> {
    const user = await this.users.findForAuthentication(email);
    if (!user) {
      await this.hasher.verifyDummy(password);
      throw new AuthenticationError('Credenciales inválidas');
    }
    if (user.status !== 'ACTIVE') throw new AuthenticationError('Credenciales inválidas');
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new AuthenticationError('Cuenta bloqueada temporalmente por intentos fallidos');
    }

    const valid = await this.hasher.verify(user.passwordHash, password);
    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      const lockUntil =
        attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_DURATION_MS) : null;
      await this.users.registerFailedLogin(user.id, lockUntil);
      await this.audit.record({
        actor: { kind: 'anonymous', organizationId: user.organizationId },
        action: AUDIT_ACTIONS.USER_LOGIN_FAILED,
        resourceType: 'user',
        resourceId: user.id,
        metadata: { attempts, locked: lockUntil !== null },
        context,
      });
      throw new AuthenticationError('Credenciales inválidas');
    }

    await this.users.registerSuccessfulLogin(user.id);
    this.sessions.invalidate(user.id);
    const session = await this.sessions.resolve(user.id);
    if (!session) throw new AuthenticationError('Credenciales inválidas');

    const tokens = await this.issueTokens(session, context);
    await this.audit.record({
      actor: { kind: 'user', user: { ...session, authenticatedVia: 'cookie' } },
      action: AUDIT_ACTIONS.USER_LOGGED_IN,
      resourceType: 'user',
      resourceId: user.id,
      context,
    });
    return { session, tokens };
  }

  async refresh(
    refreshToken: string,
    context: RequestContext,
  ): Promise<{ session: Session; tokens: SessionTokens }> {
    const { userId, refresh } = await this.tokens.rotateRefreshToken(refreshToken, context);
    const session = await this.sessions.resolve(userId);
    if (!session) throw new AuthenticationError('Sesión inválida o vencida');
    const accessToken = await this.tokens.signAccessToken({
      sub: session.userId,
      org: session.organizationId,
      role: session.role,
    });
    return {
      session,
      tokens: {
        accessToken,
        accessExpiresIn: this.tokens.accessTtlSeconds,
        refresh,
        csrfToken: randomToken(24),
      },
    };
  }

  async logout(
    user: AuthenticatedUser | null,
    refreshToken: string | undefined,
    context: RequestContext,
  ) {
    if (refreshToken) await this.tokens.revokeRefreshToken(refreshToken);
    if (user) {
      await this.audit.record({
        actor: { kind: 'user', user },
        action: AUDIT_ACTIONS.USER_LOGGED_OUT,
        resourceType: 'user',
        resourceId: user.userId,
        context,
      });
    }
  }

  private async issueTokens(session: Session, context: RequestContext): Promise<SessionTokens> {
    const accessToken = await this.tokens.signAccessToken({
      sub: session.userId,
      org: session.organizationId,
      role: session.role,
    });
    const refresh = await this.tokens.issueRefreshToken(
      session.userId,
      session.organizationId,
      context,
    );
    return {
      accessToken,
      accessExpiresIn: this.tokens.accessTtlSeconds,
      refresh,
      csrfToken: randomToken(24),
    };
  }
}
