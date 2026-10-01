import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionEntity } from './infrastructure/permission.entity.js';
import { RoleEntity } from './infrastructure/role.entity.js';
import { UserEntity } from './infrastructure/user.entity.js';
import { UsersRepository } from './infrastructure/users.repository.js';
import { UsersController } from './presentation/users.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, RoleEntity, PermissionEntity])],
  controllers: [UsersController],
  providers: [UsersRepository],
  exports: [UsersRepository],
})
export class UsersModule {}
