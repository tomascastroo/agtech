import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'maria.lopez@bancodelcampo.com.ar' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

export class SessionUserDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() fullName: string;
  @ApiProperty() role: string;
  @ApiProperty() roleName: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() organizationName: string;
  @ApiProperty({ type: [String] }) permissions: string[];
}

export class SessionResponseDto {
  @ApiProperty({ type: SessionUserDto }) user: SessionUserDto;
  @ApiProperty({ description: 'Access token para clientes API (los navegadores usan cookies)' })
  accessToken: string;
  @ApiProperty() expiresIn: number;
}
