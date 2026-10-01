import type { MigrationInterface, QueryRunner } from 'typeorm';
import { EVIDENCE_GUIDANCE } from '../../modules/assets/domain/evidence-guidance.js';

/**
 * Portal del productor: aceptación de la invitación (cuenta persistente), pedidos de
 * información adicional de la entidad/AgroGarantías e instrucciones de evidencia por tipo.
 */
export class ProducerPortal1793000000000 implements MigrationInterface {
  name = 'ProducerPortal1793000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE guarantee_requests ADD COLUMN accepted_at timestamptz`);
    await queryRunner.query(`ALTER TABLE asset_types ADD COLUMN evidence_guidance varchar(255)`);
    for (const [code, guidance] of Object.entries(EVIDENCE_GUIDANCE)) {
      await queryRunner.query(`UPDATE asset_types SET evidence_guidance = $2 WHERE code = $1`, [
        code,
        guidance,
      ]);
    }
    await queryRunner.query(`
      CREATE TABLE information_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        guarantee_request_id uuid NOT NULL REFERENCES guarantee_requests(id),
        kind varchar(16) NOT NULL CHECK (kind IN ('DOCUMENT','EVIDENCE')),
        document_type varchar(32),
        message varchar(500) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESPONDED')),
        requested_by uuid NOT NULL REFERENCES users(id),
        responded_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE INDEX information_requests_request_idx ON information_requests (guarantee_request_id, created_at)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE information_requests`);
    await queryRunner.query(`ALTER TABLE asset_types DROP COLUMN evidence_guidance`);
    await queryRunner.query(`ALTER TABLE guarantee_requests DROP COLUMN accepted_at`);
  }
}
