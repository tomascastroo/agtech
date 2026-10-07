import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ROLE_DEFINITIONS } from '../common/auth/permissions.js';
import { loadAppConfig } from '../config/app-config.js';
import { PasswordHasher } from '../modules/auth/application/password-hasher.js';
import { isValidCuit } from '../modules/establishments/domain/establishment.types.js';
import {
  OrganizationEntity,
  type OrganizationKind,
} from '../modules/organizations/infrastructure/organization.entity.js';
import { RoleEntity } from '../modules/users/infrastructure/role.entity.js';
import { UserEntity } from '../modules/users/infrastructure/user.entity.js';
import { ensureCatalog } from './seed/catalog-seeder.js';
import { typeOrmOptions } from './typeorm-options.js';

/**
 * Administración de una instalación real (sin datos demo): alta de la organización cliente con
 * su primer administrador y alta de usuarios. Se ejecuta en el servidor, nunca desde la web.
 *
 *   node dist/database/admin-cli.js create-organization --name "Banco X" --kind BANK \
 *     --tax-id 30-12345678-9 --admin-email ana@bancox.com.ar --admin-name "Ana Pérez"
 *   node dist/database/admin-cli.js create-user --organization 30-12345678-9 \
 *     --email luis@bancox.com.ar --name "Luis Gómez" --role RISK_ANALYST
 *   node dist/database/admin-cli.js list-organizations
 *
 * La contraseña inicial se genera al azar y se muestra una sola vez (o se toma de
 * ADMIN_INITIAL_PASSWORD). Cada alta queda en audit_logs como acción del sistema.
 */

export const ORGANIZATION_KINDS: OrganizationKind[] = [
  'BANK',
  'INSURER',
  'WARRANT_COMPANY',
  'OTHER',
];
const USER_ROLES = Object.keys(ROLE_DEFINITIONS).filter((r) => r !== 'PRODUCER');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseArgs(argv: string[]): { command: string; options: Record<string, string> } {
  const [command = 'help', ...rest] = argv;
  const options: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i]!;
    if (!key.startsWith('--')) throw new Error(`Argumento inesperado: ${key}`);
    const value = rest[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Falta el valor de ${key}`);
    options[key.slice(2)] = value;
    i++;
  }
  return { command, options };
}

export interface OrganizationInput {
  name: string;
  kind: OrganizationKind;
  taxId: string;
  legalName: string | null;
  adminEmail: string;
  adminName: string;
}

export function validateOrganization(o: Record<string, string>): OrganizationInput {
  const name = o.name?.trim();
  if (!name || name.length > 160) throw new Error('--name es obligatorio (máx. 160 caracteres)');
  const kind = (o.kind ?? 'BANK').toUpperCase() as OrganizationKind;
  if (!ORGANIZATION_KINDS.includes(kind))
    throw new Error(`--kind debe ser uno de: ${ORGANIZATION_KINDS.join(', ')}`);
  const taxId = o['tax-id']?.trim() ?? '';
  if (!/^\d{2}-\d{8}-\d$/.test(taxId) || !isValidCuit(taxId))
    throw new Error('--tax-id debe ser un CUIT válido con formato NN-NNNNNNNN-N');
  const user = validateUser({ email: o['admin-email'] ?? '', name: o['admin-name'] ?? '' });
  return {
    name,
    kind,
    taxId,
    legalName: o['legal-name']?.trim() || null,
    adminEmail: user.email,
    adminName: user.name,
  };
}

export function validateUser(o: Record<string, string>): {
  email: string;
  name: string;
  role: string;
} {
  const email = (o.email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) throw new Error('Email inválido');
  const name = (o.name ?? '').trim();
  if (!name || name.length > 160) throw new Error('El nombre es obligatorio (máx. 160 caracteres)');
  const role = (o.role ?? 'ADMIN').toUpperCase();
  if (!USER_ROLES.includes(role))
    throw new Error(`--role debe ser uno de: ${USER_ROLES.join(', ')}`);
  return { email, name, role };
}

function initialPassword(): string {
  const fromEnv = process.env.ADMIN_INITIAL_PASSWORD;
  if (fromEnv) {
    if (fromEnv.length < 12)
      throw new Error('ADMIN_INITIAL_PASSWORD debe tener al menos 12 caracteres');
    return fromEnv;
  }
  return randomBytes(15).toString('base64url');
}

async function createUser(
  ds: DataSource,
  organizationId: string,
  input: { email: string; name: string; role: string },
): Promise<{ userId: string; password: string }> {
  const exists = (await ds.query('SELECT 1 FROM users WHERE lower(email) = $1 LIMIT 1', [
    input.email,
  ])) as unknown[];
  if (exists.length) throw new Error(`Ya existe un usuario con el email ${input.email}`);
  const role = await ds.getRepository(RoleEntity).findOneByOrFail({ code: input.role });
  const password = initialPassword();
  const user = await ds.getRepository(UserEntity).save(
    ds.getRepository(UserEntity).create({
      organizationId,
      roleId: role.id,
      email: input.email,
      fullName: input.name,
      passwordHash: await new PasswordHasher().hash(password),
      status: 'ACTIVE',
    }),
  );
  await audit(ds, organizationId, 'USER_CREATED', 'user', user.id, {
    email: input.email,
    role: input.role,
    via: 'admin-cli',
  });
  return { userId: user.id, password };
}

async function audit(
  ds: DataSource,
  organizationId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata: Record<string, unknown>,
) {
  await ds.query(
    `INSERT INTO audit_logs (organization_id, actor_type, action, resource_type, resource_id, metadata)
     VALUES ($1, 'SYSTEM', $2, $3, $4, $5)`,
    [organizationId, action, resourceType, resourceId, JSON.stringify(metadata)],
  );
}

async function findOrganization(ds: DataSource, ref: string): Promise<OrganizationEntity> {
  const repo = ds.getRepository(OrganizationEntity);
  const org = /^\d{2}-\d{8}-\d$/.test(ref)
    ? await repo.findOneBy({ taxId: ref })
    : /^[0-9a-f-]{36}$/i.test(ref)
      ? await repo.findOneBy({ id: ref })
      : null;
  if (!org) throw new Error(`No existe la organización ${ref} (usá el CUIT o el id)`);
  return org;
}

/** Salida de la herramienta de línea de comandos. */
const out = (line: string) => process.stdout.write(`${line}\n`);

const HELP = `Uso:
  create-organization --name <nombre> --kind <BANK|INSURER|WARRANT_COMPANY|OTHER> --tax-id <CUIT>
                      --admin-email <email> --admin-name <nombre> [--legal-name <razón social>]
  create-user --organization <CUIT o id> --email <email> --name <nombre>
              [--role <${USER_ROLES.join('|')}>]
  list-organizations`;

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === 'help' || command === '--help') {
    out(HELP);
    return;
  }
  const config = loadAppConfig();
  const ds = new DataSource({ ...typeOrmOptions(config.env), logging: ['error'] });
  await ds.initialize();
  try {
    if (command === 'create-organization') {
      const input = validateOrganization(options);
      await ds.transaction((m) => ensureCatalog(m));
      const repo = ds.getRepository(OrganizationEntity);
      if (await repo.findOneBy({ taxId: input.taxId }))
        throw new Error(`Ya existe una organización con el CUIT ${input.taxId}`);
      const org = await repo.save(
        repo.create({
          name: input.name,
          legalName: input.legalName,
          taxId: input.taxId,
          kind: input.kind,
          settings: {},
        }),
      );
      await audit(ds, org.id, 'ORGANIZATION_CREATED', 'organization', org.id, {
        name: input.name,
        kind: input.kind,
        via: 'admin-cli',
      });
      const admin = await createUser(ds, org.id, {
        email: input.adminEmail,
        name: input.adminName,
        role: 'ADMIN',
      });
      out(`Organización creada: ${org.name} (${org.id})`);
      out(`Administrador: ${input.adminEmail}`);
      out(`Contraseña inicial (se muestra una sola vez): ${admin.password}`);
    } else if (command === 'create-user') {
      const org = await findOrganization(ds, options.organization ?? '');
      const input = validateUser(options);
      const user = await createUser(ds, org.id, input);
      out(`Usuario creado en ${org.name}: ${input.email} (${input.role})`);
      out(`Contraseña inicial (se muestra una sola vez): ${user.password}`);
    } else if (command === 'list-organizations') {
      const rows = (await ds.query(
        `SELECT o.name, o.kind, o.tax_id AS "taxId", o.id, count(u.id)::int AS users
           FROM organizations o LEFT JOIN users u ON u.organization_id = o.id
          WHERE o.deleted_at IS NULL
          GROUP BY o.id ORDER BY o.created_at`,
      )) as Record<string, unknown>[];
      for (const r of rows)
        out(
          `${String(r.name)} · ${String(r.kind)} · ${String(r.taxId)} · ${String(r.users)} usuarios · ${String(r.id)}`,
        );
    } else {
      throw new Error(`Comando desconocido: ${command}\n\n${HELP}`);
    }
  } finally {
    await ds.destroy();
  }
}

if (process.argv[1]?.endsWith('admin-cli.js')) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
