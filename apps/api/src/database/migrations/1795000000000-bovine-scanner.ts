import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Escáner de Bovinos.
 *  - scan_sessions: sesión de escaneo desde el celular (subida reanudable, procesamiento
 *    oficial en el servidor). El resultado del dispositivo se guarda solo como referencia.
 *  - scan_frames: cuadros muestreados y representativos con su hash (append-only). No se guarda
 *    el video completo.
 *  - evidence.type 'SCAN': al terminar el procesamiento oficial se registra una evidencia
 *    inmutable (manifiesto con hash) que la verificación usa como cualquier otra evidencia.
 */
export class BovineScanner1795000000000 implements MigrationInterface {
  name = 'BovineScanner1795000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE evidence DROP CONSTRAINT evidence_type_check`);
    await queryRunner.query(`
      ALTER TABLE evidence ADD CONSTRAINT evidence_type_check
      CHECK (type IN ('IMAGE','SATELLITE_SCENE','RFID_READ','SENSOR_READING','SCAN'))`);
    await queryRunner.query(`
      ALTER TABLE evidence ADD CONSTRAINT evidence_scan_manifest_check
      CHECK (type <> 'SCAN' OR (storage_key IS NOT NULL AND sha256 IS NOT NULL))`);
    await queryRunner.query(
      `ALTER TABLE evidence_sources DROP CONSTRAINT evidence_sources_kind_check`,
    );
    await queryRunner.query(`
      ALTER TABLE evidence_sources ADD CONSTRAINT evidence_sources_kind_check
      CHECK (kind IN ('CAMERA','SATELLITE','MANUAL_UPLOAD','RFID','SENSOR','REGISTRY','DRONE','SCANNER'))`);
    await queryRunner.query(`
      INSERT INTO evidence_sources (code, name, kind, provider, is_simulated, description)
      VALUES ('BOVINE_SCANNER', 'Escáner de bovinos (celular)', 'SCANNER', 'agrogarantias', false,
              'Escaneo en vivo desde el celular; conteo oficial recalculado en el servidor sobre cuadros muestreados')
      ON CONFLICT (code) DO NOTHING`);

    await queryRunner.query(`
      CREATE TABLE scan_sessions (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL REFERENCES organizations(id),
        guarantee_request_id uuid REFERENCES guarantee_requests(id),
        asset_id uuid NOT NULL REFERENCES assets(id),
        establishment_id uuid NOT NULL REFERENCES establishments(id),
        created_by uuid NOT NULL REFERENCES users(id),
        mode varchar(8) NOT NULL CHECK (mode IN ('FIXED','SWEEP')),
        status varchar(16) NOT NULL DEFAULT 'UPLOADING'
          CHECK (status IN ('UPLOADING','PROCESSING','COMPLETED','FAILED')),
        started_at timestamptz NOT NULL,
        ended_at timestamptz,
        duration_s numeric(8,2),
        sampled_fps numeric(5,2) NOT NULL,
        frame_width integer NOT NULL CHECK (frame_width > 0),
        frame_height integer NOT NULL CHECK (frame_height > 0),
        line jsonb NOT NULL,
        location geometry(Point, 4326),
        location_accuracy_m numeric(10,2),
        location_end geometry(Point, 4326),
        max_displacement_m numeric(10,2),
        heading jsonb,
        device jsonb NOT NULL DEFAULT '{}'::jsonb,
        expected_frames integer,
        expected_key_frames integer,
        client_result jsonb,
        server_result jsonb,
        official_count integer CHECK (official_count IS NULL OR official_count >= 0),
        quality varchar(16) CHECK (quality IS NULL OR quality IN ('COMPLETE','LIMITED','INSUFFICIENT')),
        warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
        evidence_id uuid REFERENCES evidence(id),
        error varchar(500),
        finalized_at timestamptz,
        processed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE INDEX scan_sessions_asset_idx ON scan_sessions (asset_id, started_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX scan_sessions_request_idx ON scan_sessions (guarantee_request_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE scan_frames (
        scan_session_id uuid NOT NULL REFERENCES scan_sessions(id),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        kind varchar(8) NOT NULL CHECK (kind IN ('SAMPLE','KEY')),
        frame_index integer NOT NULL CHECK (frame_index >= 0),
        captured_ms integer NOT NULL CHECK (captured_ms >= 0),
        storage_key varchar(512) NOT NULL,
        sha256 char(64) NOT NULL,
        size_bytes integer NOT NULL CHECK (size_bytes > 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (scan_session_id, kind, frame_index)
      )`);
    await queryRunner.query(`
      CREATE TRIGGER scan_frames_immutable BEFORE UPDATE OR DELETE ON scan_frames
      FOR EACH ROW EXECUTE FUNCTION forbid_mutation()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE scan_frames`);
    await queryRunner.query(`DROP TABLE scan_sessions`);
    await queryRunner.query(`DELETE FROM evidence_sources WHERE code = 'BOVINE_SCANNER'`);
    await queryRunner.query(`ALTER TABLE evidence DROP CONSTRAINT evidence_scan_manifest_check`);
    await queryRunner.query(`ALTER TABLE evidence DROP CONSTRAINT evidence_type_check`);
    await queryRunner.query(`
      ALTER TABLE evidence ADD CONSTRAINT evidence_type_check
      CHECK (type IN ('IMAGE','SATELLITE_SCENE','RFID_READ','SENSOR_READING'))`);
    await queryRunner.query(
      `ALTER TABLE evidence_sources DROP CONSTRAINT evidence_sources_kind_check`,
    );
    await queryRunner.query(`
      ALTER TABLE evidence_sources ADD CONSTRAINT evidence_sources_kind_check
      CHECK (kind IN ('CAMERA','SATELLITE','MANUAL_UPLOAD','RFID','SENSOR','REGISTRY','DRONE'))`);
  }
}
