import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import {
  CurrentUser,
  Public,
  ReqContext,
  type RequestContext,
} from '../../../common/auth/decorators.js';
import { COOKIE_NAMES, REFRESH_COOKIE_PATH } from '../../../common/http/cookies.js';
import { AuthenticationError } from '../../../common/domain/errors.js';
import { AppConfig, loadAppConfig } from '../../../config/app-config.js';
import { AuthService, type SessionTokens } from '../application/auth.service.js';
import { CsrfGuard } from './auth.guard.js';
import { LoginDto, SessionResponseDto, SessionUserDto } from './auth.dto.js';

type SessionLike = Omit<AuthenticatedUser, 'authenticatedVia'>;

function toUserDto(session: SessionLike): SessionUserDto {
  return {
    id: session.userId,
    email: session.email,
    fullName: session.fullName,
    role: session.role,
    roleName: session.roleName,
    organizationId: session.organizationId,
    organizationName: session.organizationName,
    permissions: [...session.permissions].sort(),
  };
}

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({
    default: { limit: () => loadAppConfig().env.RATE_LIMIT_LOGIN_PER_MINUTE, ttl: 60_000 },
  })
  @ApiOperation({ summary: 'Inicio de sesión. Emite cookies httpOnly y un access token.' })
  @ApiOkResponse({ type: SessionResponseDto })
  async login(
    @Body() dto: LoginDto,
    @ReqContext() context: RequestContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponseDto> {
    const { session, tokens } = await this.auth.login(dto.email, dto.password, context);
    this.setSessionCookies(response, tokens);
    return {
      user: toUserDto(session),
      accessToken: tokens.accessToken,
      expiresIn: tokens.accessExpiresIn,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Renueva la sesión rotando el refresh token' })
  @ApiOkResponse({ type: SessionResponseDto })
  async refresh(
    @Req() request: Request,
    @ReqContext() context: RequestContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponseDto> {
    const refreshToken = request.cookies?.[COOKIE_NAMES.refresh] as string | undefined;
    if (!refreshToken) throw new AuthenticationError('Sesión inválida o vencida');
    try {
      const { session, tokens } = await this.auth.refresh(refreshToken, context);
      this.setSessionCookies(response, tokens);
      return {
        user: toUserDto(session),
        accessToken: tokens.accessToken,
        expiresIn: tokens.accessExpiresIn,
      };
    } catch (error) {
      this.clearSessionCookies(response);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Cierra la sesión y revoca el refresh token' })
  async logout(
    @Req() request: Request & { user?: AuthenticatedUser },
    @ReqContext() context: RequestContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const refreshToken = request.cookies?.[COOKIE_NAMES.refresh] as string | undefined;
    await this.auth.logout(request.user ?? null, refreshToken, context);
    this.clearSessionCookies(response);
  }

  @Get('me')
  @ApiOperation({ summary: 'Usuario autenticado y permisos vigentes' })
  @ApiOkResponse({ type: SessionUserDto })
  me(@CurrentUser() user: AuthenticatedUser): SessionUserDto {
    return toUserDto(user);
  }

  private baseCookie(): CookieOptions {
    return { secure: this.config.env.COOKIE_SECURE, sameSite: 'lax' };
  }

  private setSessionCookies(response: Response, tokens: SessionTokens): void {
    response.cookie(COOKIE_NAMES.access, tokens.accessToken, {
      ...this.baseCookie(),
      httpOnly: true,
      path: '/',
      maxAge: tokens.accessExpiresIn * 1000,
    });
    response.cookie(COOKIE_NAMES.refresh, tokens.refresh.token, {
      ...this.baseCookie(),
      httpOnly: true,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      expires: tokens.refresh.expiresAt,
    });
    response.cookie(COOKIE_NAMES.csrf, tokens.csrfToken, {
      ...this.baseCookie(),
      httpOnly: false,
      sameSite: 'strict',
      path: '/',
      expires: tokens.refresh.expiresAt,
    });
  }

  private clearSessionCookies(response: Response): void {
    response.clearCookie(COOKIE_NAMES.access, { ...this.baseCookie(), path: '/' });
    response.clearCookie(COOKIE_NAMES.refresh, { ...this.baseCookie(), path: REFRESH_COOKIE_PATH });
    response.clearCookie(COOKIE_NAMES.csrf, { ...this.baseCookie(), path: '/' });
  }
}
