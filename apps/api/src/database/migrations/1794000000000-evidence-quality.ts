import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Calidad de la evidencia:
 *  - document_analyses: OCR / capa de texto, clasificación, campos extraídos y validación contra
 *    los datos declarados. Es un análisis derivado (se puede recalcular), no una certificación.
 *  - rfid_observations: lecturas RFID crudas tal como llegan del lector/puente (append-only).
 *    Se asocian a un animal vía animal_identifications (method RFID) cuando el EID es conocido.
 */
export class EvidenceQuality1794000000000 implements MigrationInterface {
  name = 'EvidenceQuality1794000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE document_analyses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        document_id uuid NOT NULL UNIQUE REFERENCES documents(id),
        status varchar(16) NOT NULL CHECK (status IN ('PENDING','CONSISTENT','REVIEW_REQUIRED','FAILED')),
        method varchar(16),
        detected_type varchar(32),
        extracted_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
        extraction_confidence numeric(4,3) CHECK (extraction_confidence IS NULL OR extraction_confidence BETWEEN 0 AND 1),
        validation_results jsonb NOT NULL DEFAULT '[]'::jsonb,
        text_excerpt text,
        engine varchar(48),
        version varchar(32),
        error varchar(500),
        analyzed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);

    await queryRunner.query(`
      CREATE TABLE rfid_observations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        electronic_id varchar(32) NOT NULL,
        reader_device_id uuid REFERENCES devices(id),
        establishment_id uuid NOT NULL REFERENCES establishments(id),
        asset_id uuid REFERENCES assets(id),
        animal_id uuid REFERENCES animals(id),
        observed_at timestamptz NOT NULL,
        location geometry(Point, 4326),
        source varchar(16) NOT NULL CHECK (source IN ('READER_BRIDGE','SIMULATED')),
        raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        confidence numeric(4,3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
        status varchar(24) NOT NULL CHECK (status IN ('IDENTIFIED','UNKNOWN_TAG','OTHER_ESTABLISHMENT')),
        received_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE INDEX rfid_observations_establishment_idx ON rfid_observations (establishment_id, observed_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX rfid_observations_asset_idx ON rfid_observations (asset_id, observed_at DESC)`,
    );
    await queryRunner.query(`
      CREATE TRIGGER rfid_observations_immutable BEFORE UPDATE OR DELETE ON rfid_observations
      FOR EACH ROW EXECUTE FUNCTION forbid_mutation()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE rfid_observations`);
    await queryRunner.query(`DROP TABLE document_analyses`);
  }
}
