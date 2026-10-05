import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Inspección por link: la entidad solicita la inspección y obtiene un link para el inspector
 * (como la invitación del productor). Solo se guarda el SHA-256 del token; vence y deja de servir
 * cuando el acta se firma. Los movimientos registran quién los informó (productor o entidad).
 */
export class InspectorLink1800000000000 implements MigrationInterface {
  name = 'InspectorLink1800000000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE collateral_inspections
        ADD COLUMN invite_token_hash char(64) UNIQUE,
        ADD COLUMN invite_expires_at timestamptz,
        ADD COLUMN inspector_contact varchar(160)`);
    await q.query(`
      ALTER TABLE collateral_movements
        ADD COLUMN reported_by_role varchar(12) NOT NULL DEFAULT 'ENTIDAD'
          CHECK (reported_by_role IN ('PRODUCTOR','ENTIDAD'))`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE collateral_movements DROP COLUMN reported_by_role`);
    await q.query(`
      ALTER TABLE collateral_inspections
        DROP COLUMN invite_token_hash, DROP COLUMN invite_expires_at, DROP COLUMN inspector_contact`);
  }
}
