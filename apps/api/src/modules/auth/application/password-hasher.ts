import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

/** Argon2id con los parámetros recomendados por OWASP (m=19 MiB, t=2, p=1). */
@Injectable()
export class PasswordHasher {
  private readonly options = {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  } as const;

  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return argon2.hash(password, this.options);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /** Verificación contra un hash descartable: iguala tiempos cuando el usuario no existe. */
  async verifyDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash(randomBytes(16).toString('hex'));
    await this.verify(await this.dummyHash, password);
  }
}
