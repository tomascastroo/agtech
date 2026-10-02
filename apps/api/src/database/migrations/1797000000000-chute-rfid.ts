import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Manga + RFID: registro individual de bovinos.
 *  - scan_sessions.mode 'CHUTE' (sesión de captura de varios animales en la manga) y su zona de
 *    captura. Reutiliza la subida reanudable de cuadros y el procesamiento oficial del escáner.
 *  - chute_captures: una fila por animal (lectura de caravana + cuadros de la ventana). El
 *    celular la envía como preliminar; el servidor la resuelve (CONFIRMED / AMBIGUOUS /
 *    INSUFFICIENT_EVIDENCE) y desde ese momento es inmutable: una corrección es otra fila.
 *  - bovine_individuals: identidad individual por caravana (RFID) dentro de la organización,
 *    con código interno BOV-NNNNN. Se vincula a animals cuando la caravana ya está registrada
 *    (animals exige categoría y sexo, que la manga no informa).
 * No hay reconocimiento visual: la identidad la da el RFID; la imagen es respaldo.
 */
export class ChuteRfid1797000000000 implements MigrationInterface {
  name = 'ChuteRfid1797000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE scan_sessions DROP CONSTRAINT scan_sessions_mode_check`);
    await queryRunner.query(`
      ALTER TABLE scan_sessions ADD CONSTRAINT scan_sessions_mode_check
      CHECK (mode IN ('FIXED','SWEEP','PEN','PHOTO','CHUTE'))`);
    await queryRunner.query(`ALTER TABLE scan_sessions ADD COLUMN capture_zone jsonb`);

    await queryRunner.query(`
      CREATE TABLE bovine_individuals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        establishment_id uuid NOT NULL REFERENCES establishments(id),
        asset_id uuid REFERENCES assets(id),
        internal_code varchar(16) NOT NULL,
        electronic_id varchar(32) NOT NULL CHECK (electronic_id ~ '^[0-9]{15}$'),
        animal_id uuid REFERENCES animals(id),
        simulated boolean NOT NULL,
        first_identified_at timestamptz NOT NULL,
        last_identified_at timestamptz NOT NULL,
        confirmations integer NOT NULL DEFAULT 1 CHECK (confirmations >= 1),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (organization_id, internal_code),
        UNIQUE (organization_id, electronic_id, simulated)
      )`);
    await queryRunner.query(
      `CREATE INDEX bovine_individuals_asset_idx ON bovine_individuals (asset_id, last_identified_at DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE chute_captures (
        id uuid PRIMARY KEY,
        scan_session_id uuid NOT NULL REFERENCES scan_sessions(id),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        asset_id uuid NOT NULL REFERENCES assets(id),
        establishment_id uuid NOT NULL REFERENCES establishments(id),
        sequence integer NOT NULL CHECK (sequence >= 1),
        rfid_source varchar(16) NOT NULL CHECK (rfid_source IN ('READER_BRIDGE','SIMULATED')),
        reader_device_id uuid REFERENCES devices(id),
        reads jsonb NOT NULL,
        frame_indices integer[] NOT NULL,
        client_track_id integer,
        client_result jsonb,
        status varchar(24) NOT NULL DEFAULT 'PENDING'
          CHECK (status IN ('PENDING','CONFIRMED','AMBIGUOUS','INSUFFICIENT_EVIDENCE')),
        reason varchar(40),
        electronic_id varchar(32),
        track_id integer,
        best_frames jsonb NOT NULL DEFAULT '[]'::jsonb,
        decision jsonb,
        rfid_observation_ids uuid[] NOT NULL DEFAULT '{}',
        individual_id uuid REFERENCES bovine_individuals(id),
        evidence_id uuid REFERENCES evidence(id),
        created_by uuid NOT NULL REFERENCES users(id),
        processed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (scan_session_id, sequence),
        CHECK (status <> 'CONFIRMED' OR (electronic_id IS NOT NULL AND individual_id IS NOT NULL
          AND evidence_id IS NOT NULL AND jsonb_array_length(best_frames) > 0))
      )`);
    await queryRunner.query(
      `CREATE INDEX chute_captures_session_idx ON chute_captures (scan_session_id, sequence)`,
    );
    await queryRunner.query(
      `CREATE INDEX chute_captures_individual_idx ON chute_captures (individual_id, created_at DESC)`,
    );
    // Una captura resuelta (o su borrado) no se puede modificar en silencio: las correcciones son
    // capturas nuevas, auditadas.
    await queryRunner.query(`
      CREATE FUNCTION chute_captures_immutable() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'chute_captures es append-only';
        END IF;
        IF OLD.status <> 'PENDING' THEN
          RAISE EXCEPTION 'La captura % ya fue resuelta (%): es inmutable', OLD.id, OLD.status;
        END IF;
        IF NEW.id <> OLD.id OR NEW.scan_session_id <> OLD.scan_session_id
           OR NEW.reads <> OLD.reads OR NEW.frame_indices <> OLD.frame_indices
           OR NEW.rfid_source <> OLD.rfid_source OR NEW.organization_id <> OLD.organization_id THEN
          RAISE EXCEPTION 'Los datos capturados de la captura % no se pueden cambiar', OLD.id;
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await queryRunner.query(`
      CREATE TRIGGER chute_captures_immutable BEFORE UPDATE OR DELETE ON chute_captures
      FOR EACH ROW EXECUTE FUNCTION chute_captures_immutable()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE chute_captures`);
    await queryRunner.query(`DROP FUNCTION chute_captures_immutable`);
    await queryRunner.query(`DROP TABLE bovine_individuals`);
    await queryRunner.query(`ALTER TABLE scan_sessions DROP COLUMN capture_zone`);
    await queryRunner.query(`ALTER TABLE scan_sessions DROP CONSTRAINT scan_sessions_mode_check`);
    await queryRunner.query(`
      ALTER TABLE scan_sessions ADD CONSTRAINT scan_sessions_mode_check
      CHECK (mode IN ('FIXED','SWEEP','PEN','PHOTO'))`);
  }
}
