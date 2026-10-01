import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { UserEntity } from './user.entity.js';

@Injectable()
export class UsersRepository {
  constructor(@InjectRepository(UserEntity) private readonly users: Repository<UserEntity>) {}

  /** Incluye el hash de contraseña: usar únicamente para autenticación. */
  findForAuthentication(email: string): Promise<UserEntity | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('lower(user.email) = lower(:email)', { email })
      .andWhere('user.deletedAt IS NULL')
      .getOne();
  }

  findWithRole(userId: string): Promise<UserEntity | null> {
    return this.users.findOne({
      where: { id: userId, deletedAt: IsNull() },
      relations: { role: { permissions: true }, organization: true },
    });
  }

  listByOrganization(organizationId: string): Promise<UserEntity[]> {
    return this.users.find({
      where: { organizationId },
      relations: { role: true },
      order: { fullName: 'ASC' },
    });
  }

  async registerFailedLogin(userId: string, lockUntil: Date | null): Promise<void> {
    await this.users
      .createQueryBuilder()
      .update()
      .set({
        failedLoginAttempts: () => 'failed_login_attempts + 1',
        ...(lockUntil ? { lockedUntil: lockUntil } : {}),
      })
      .where('id = :userId', { userId })
      .execute();
  }

  async registerSuccessfulLogin(userId: string): Promise<void> {
    await this.users.update(userId, {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    });
  }
}
