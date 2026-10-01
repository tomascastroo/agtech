import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const sha256Hex = (data: Buffer | string): string =>
  createHash('sha256').update(data).digest('hex');

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}
