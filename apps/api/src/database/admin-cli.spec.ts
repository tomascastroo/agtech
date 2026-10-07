import { describe, expect, it } from 'vitest';
import { parseArgs, validateOrganization, validateUser } from './admin-cli.js';

describe('admin-cli', () => {
  it('lee comando y opciones', () => {
    expect(parseArgs(['create-user', '--email', 'a@b.com', '--name', 'Ana'])).toEqual({
      command: 'create-user',
      options: { email: 'a@b.com', name: 'Ana' },
    });
    expect(() => parseArgs(['create-user', '--email'])).toThrow('Falta el valor');
  });

  it('valida la organización con CUIT y administrador', () => {
    const org = validateOrganization({
      name: 'Banco Piloto',
      kind: 'bank',
      'tax-id': '30-71548963-1',
      'admin-email': 'Ana@BancoPiloto.com.ar',
      'admin-name': 'Ana Pérez',
    });
    expect(org).toMatchObject({ kind: 'BANK', adminEmail: 'ana@bancopiloto.com.ar' });
    expect(() =>
      validateOrganization({
        name: 'X',
        'tax-id': '30-71548963-2',
        'admin-email': 'a@b.com',
        'admin-name': 'A',
      }),
    ).toThrow('CUIT');
    expect(() =>
      validateOrganization({
        name: 'X',
        kind: 'PRODUCER',
        'tax-id': '30-71548963-1',
        'admin-email': 'a@b.com',
        'admin-name': 'A',
      }),
    ).toThrow('--kind');
  });

  it('no permite crear productores ni roles inexistentes', () => {
    expect(validateUser({ email: 'a@b.com', name: 'A', role: 'risk_analyst' }).role).toBe(
      'RISK_ANALYST',
    );
    expect(() => validateUser({ email: 'a@b.com', name: 'A', role: 'PRODUCER' })).toThrow('--role');
    expect(() => validateUser({ email: 'no-es-email', name: 'A' })).toThrow('Email');
  });
});
