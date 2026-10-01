import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module.js';
import { AuthService } from './application/auth.service.js';
import { PasswordHasher } from './application/password-hasher.js';
import { SessionResolver } from './application/session-resolver.js';
import { TokenService } from './application/token.service.js';
import { RefreshTokenEntity } from './infrastructure/refresh-token.entity.js';
import { RefreshTokensRepository } from './infrastructure/refresh-tokens.repository.js';
import { AuthController } from './presentation/auth.controller.js';
import { AuthGuard, CsrfGuard } from './presentation/auth.guard.js';

@Module({
  imports: [JwtModule.register({}), TypeOrmModule.forFeature([RefreshTokenEntity]), UsersModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordHasher,
    SessionResolver,
    TokenService,
    RefreshTokensRepository,
    CsrfGuard,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [PasswordHasher],
})
export class AuthModule {}
