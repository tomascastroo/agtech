import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Solicitudes de garantía: la entidad financiera invita al productor mediante un link con
 * token (se guarda solo su hash); el productor declara establecimiento, activo y evidencia.
 * Agrega el rol PRODUCER (sin permisos sobre la cartera) si el catálogo ya existe.
 */
export class GuaranteeRequests1792000000000 implements MigrationInterface {
  name = 'GuaranteeRequests1792000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE guarantee_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        producer_name varchar(160) NOT NULL,
        producer_tax_id varchar(13) NOT NULL,
        producer_email varchar(254),
        producer_user_id uuid NOT NULL REFERENCES users(id),
        asset_type_code varchar(32) NOT NULL,
        requested_amount numeric(16,2),
        currency varchar(3) NOT NULL DEFAULT 'USD',
        notes varchar(500),
        status varchar(24) NOT NULL DEFAULT 'INVITED'
          CHECK (status IN ('INVITED','IN_PROGRESS','READY_FOR_VERIFICATION')),
        invite_token_hash char(64) NOT NULL UNIQUE,
        invite_expires_at timestamptz NOT NULL,
        establishment_id uuid REFERENCES establishments(id),
        asset_id uuid REFERENCES assets(id),
        verification_run_id uuid REFERENCES verification_runs(id),
        submitted_at timestamptz,
        created_by uuid NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE INDEX guarantee_requests_org_idx ON guarantee_requests (organization_id, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX guarantee_requests_asset_uq ON guarantee_requests (asset_id) WHERE asset_id IS NOT NULL`,
    );
    await queryRunner.query(`
      INSERT INTO roles (code, name, description)
      SELECT 'PRODUCER', 'Productor', 'Declara establecimiento, activos y evidencia de su solicitud'
      WHERE EXISTS (SELECT 1 FROM roles) AND NOT EXISTS (SELECT 1 FROM roles WHERE code = 'PRODUCER')`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE guarantee_requests`);
  }
}
