import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema inicial de AgroGarantías.
 *
 * Decisiones relevantes:
 * - UUID como clave primaria en todas las tablas (gen_random_uuid, nativo desde PG13).
 * - organization_id en todo recurso de negocio para aislamiento multi-tenant.
 * - PostGIS (SRID 4326) para ubicaciones, límites de establecimientos y huellas satelitales.
 * - Registros de verificación, evidencia y auditoría son append-only: triggers impiden
 *   modificarlos o borrarlos una vez cerrados.
 */
export class InitialSchema1790000000000 implements MigrationInterface {
  name = 'InitialSchema1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql`);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'La tabla % es inmutable (operación % no permitida)', TG_TABLE_NAME, TG_OP
          USING ERRCODE = 'integrity_constraint_violation';
      END;
      $$ LANGUAGE plpgsql`);

    // ---------------------------------------------------------------- identidad y tenancy
    await queryRunner.query(`
      CREATE TABLE organizations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(160) NOT NULL,
        legal_name varchar(200),
        tax_id varchar(13),
        kind varchar(24) NOT NULL CHECK (kind IN ('BANK','INSURER','WARRANT_COMPANY','PRODUCER','OTHER')),
        settings jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX organizations_tax_id_uq ON organizations (tax_id) WHERE deleted_at IS NULL AND tax_id IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE permissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code varchar(64) NOT NULL UNIQUE,
        description varchar(255) NOT NULL
      )`);
    await queryRunner.query(`
      CREATE TABLE roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code varchar(32) NOT NULL UNIQUE,
        name varchar(80) NOT NULL,
        description varchar(255),
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`
      CREATE TABLE role_permissions (
        role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
      )`);

    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        role_id uuid NOT NULL REFERENCES roles(id),
        email varchar(254) NOT NULL,
        full_name varchar(160) NOT NULL,
        password_hash varchar(255) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
        failed_login_attempts integer NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
        locked_until timestamptz,
        last_login_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX users_email_uq ON users (lower(email)) WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(`CREATE INDEX users_organization_idx ON users (organization_id)`);

    await queryRunner.query(`
      CREATE TABLE refresh_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id uuid NOT NULL REFERENCES organizations(id),
        family_id uuid NOT NULL,
        token_hash char(64) NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        replaced_by_id uuid REFERENCES refresh_tokens(id),
        ip varchar(64),
        user_agent varchar(255),
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id)`);
    await queryRunner.query(`CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id)`);

    // ---------------------------------------------------------------- establecimientos
    await queryRunner.query(`
      CREATE TABLE establishments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        name varchar(160) NOT NULL,
        holder_name varchar(160) NOT NULL,
        holder_tax_id varchar(13) NOT NULL CHECK (holder_tax_id ~ '^[0-9]{2}-[0-9]{8}-[0-9]$'),
        renspa varchar(20) CHECK (renspa IS NULL OR renspa ~ '^[0-9]{2}\\.[0-9]{3}\\.[0-9]\\.[0-9]{5}/[0-9]{2}$'),
        establishment_type varchar(24) NOT NULL CHECK (establishment_type IN
          ('CRIA','INVERNADA','CICLO_COMPLETO','TAMBO','FEEDLOT','AGRICOLA','MIXTO','VITIVINICOLA','FRUTICOLA','FORESTAL')),
        tenure varchar(16) NOT NULL DEFAULT 'OWNED' CHECK (tenure IN ('OWNED','LEASED','OTHER')),
        province varchar(80) NOT NULL,
        locality varchar(120),
        total_area_ha numeric(12,2) CHECK (total_area_ha IS NULL OR total_area_ha > 0),
        created_by uuid REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX establishments_org_name_uq ON establishments (organization_id, lower(name)) WHERE deleted_at IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE establishment_locations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        establishment_id uuid NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
        kind varchar(16) NOT NULL CHECK (kind IN ('MAIN','PADDOCK','ZONE','INFRASTRUCTURE')),
        name varchar(120) NOT NULL,
        point geometry(Point, 4326) NOT NULL,
        boundary geometry(MultiPolygon, 4326),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX establishment_locations_main_uq ON establishment_locations (establishment_id) WHERE kind = 'MAIN'`,
    );
    await queryRunner.query(
      `CREATE INDEX establishment_locations_point_gix ON establishment_locations USING gist (point)`,
    );
    await queryRunner.query(
      `CREATE INDEX establishment_locations_boundary_gix ON establishment_locations USING gist (boundary)`,
    );

    // ---------------------------------------------------------------- activos
    await queryRunner.query(`
      CREATE TABLE asset_types (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code varchar(32) NOT NULL UNIQUE,
        name varchar(80) NOT NULL,
        category varchar(24) NOT NULL CHECK (category IN
          ('LIVESTOCK','CROP','PERENNIAL','FORESTRY','STORAGE','MACHINERY','INFRASTRUCTURE','WATER','OTHER')),
        default_unit varchar(16) NOT NULL CHECK (default_unit IN ('HEAD','HECTARE','TONNE','UNIT','CUBIC_METER')),
        verification_strategy varchar(32) NOT NULL CHECK (verification_strategy IN
          ('LIVESTOCK_COUNTING','VEGETATION_AREA','EVIDENCE_REVIEW')),
        evidence_sources text[] NOT NULL DEFAULT '{}',
        required_documents text[] NOT NULL DEFAULT '{}',
        metadata_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
        mobility varchar(8) NOT NULL DEFAULT 'LOW' CHECK (mobility IN ('LOW','HIGH')),
        is_active boolean NOT NULL DEFAULT true,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);

    await queryRunner.query(`
      CREATE TABLE assets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        establishment_id uuid NOT NULL REFERENCES establishments(id),
        asset_type_id uuid NOT NULL REFERENCES asset_types(id),
        name varchar(160) NOT NULL,
        status varchar(24) NOT NULL DEFAULT 'DRAFT' CHECK (status IN
          ('DRAFT','PENDING_VERIFICATION','VERIFIED','OBSERVED','REJECTED')),
        declared_quantity numeric(14,2) NOT NULL CHECK (declared_quantity > 0),
        unit varchar(16) NOT NULL CHECK (unit IN ('HEAD','HECTARE','TONNE','UNIT','CUBIC_METER')),
        declared_value numeric(18,2) CHECK (declared_value IS NULL OR declared_value >= 0),
        currency char(3) NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','ARS')),
        location geometry(Point, 4326) NOT NULL,
        area geometry(MultiPolygon, 4326),
        last_verification_run_id uuid,
        last_verified_at timestamptz,
        last_score smallint CHECK (last_score IS NULL OR last_score BETWEEN 0 AND 100),
        last_detected_quantity numeric(14,2),
        created_by uuid REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      )`);
    await queryRunner.query(
      `CREATE INDEX assets_org_status_idx ON assets (organization_id, status) WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(`CREATE INDEX assets_establishment_idx ON assets (establishment_id)`);
    await queryRunner.query(`CREATE INDEX assets_type_idx ON assets (asset_type_id)`);
    await queryRunner.query(`CREATE INDEX assets_location_gix ON assets USING gist (location)`);
    await queryRunner.query(`CREATE INDEX assets_area_gix ON assets USING gist (area)`);

    await queryRunner.query(`
      CREATE TABLE asset_metadata (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        version integer NOT NULL CHECK (version > 0),
        data jsonb NOT NULL,
        created_by uuid REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (asset_id, version)
      )`);

    // ---------------------------------------------------------------- documentos
    await queryRunner.query(`
      CREATE TABLE documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        establishment_id uuid REFERENCES establishments(id),
        asset_id uuid REFERENCES assets(id),
        type varchar(32) NOT NULL CHECK (type IN
          ('RENSPA','PROPERTY_DEED','LEASE_CONTRACT','ID_CUIT','SANITARY_CERTIFICATE','INSURANCE_POLICY','OTHER')),
        status varchar(16) NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW','VALID','EXPIRED','REJECTED')),
        title varchar(160) NOT NULL,
        original_file_name varchar(255) NOT NULL,
        storage_key varchar(512) NOT NULL UNIQUE,
        mime_type varchar(100) NOT NULL,
        size_bytes bigint NOT NULL CHECK (size_bytes > 0),
        sha256 char(64) NOT NULL,
        issued_at date,
        expires_at date,
        uploaded_by uuid REFERENCES users(id),
        reviewed_by uuid REFERENCES users(id),
        reviewed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CHECK (establishment_id IS NOT NULL OR asset_id IS NOT NULL),
        CHECK (expires_at IS NULL OR issued_at IS NULL OR expires_at >= issued_at)
      )`);
    await queryRunner.query(
      `CREATE INDEX documents_asset_idx ON documents (asset_id) WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX documents_establishment_idx ON documents (establishment_id) WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(`CREATE INDEX documents_org_idx ON documents (organization_id)`);

    // ---------------------------------------------------------------- dispositivos
    await queryRunner.query(`
      CREATE TABLE devices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        type varchar(16) NOT NULL CHECK (type IN ('FIXED_CAMERA','SOLAR_CAMERA','RFID_READER','SENSOR','GATEWAY')),
        serial_number varchar(64) NOT NULL,
        model varchar(80),
        manufacturer varchar(80),
        connectivity varchar(16) NOT NULL CHECK (connectivity IN ('LTE_4G','WIFI','SATELLITE','LORA')),
        power_source varchar(16) NOT NULL CHECK (power_source IN ('SOLAR','GRID','BATTERY')),
        status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ONLINE','OFFLINE','MAINTENANCE','DECOMMISSIONED')),
        gateway varchar(32) NOT NULL DEFAULT 'simulated',
        capabilities text[] NOT NULL DEFAULT '{}',
        last_seen_at timestamptz,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (organization_id, serial_number)
      )`);

    await queryRunner.query(`
      CREATE TABLE device_installations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        device_id uuid REFERENCES devices(id),
        establishment_id uuid NOT NULL REFERENCES establishments(id),
        asset_id uuid REFERENCES assets(id),
        request_type varchar(16) NOT NULL CHECK (request_type IN ('KIT_REQUEST','SELF_INSTALLED')),
        status varchar(16) NOT NULL CHECK (status IN ('REQUESTED','SHIPPED','INSTALLED','ACTIVE','REMOVED')),
        label varchar(120) NOT NULL,
        location geometry(Point, 4326),
        kit_spec jsonb,
        shipping_address varchar(255),
        contact_name varchar(120),
        contact_phone varchar(40),
        notes text,
        requested_by uuid REFERENCES users(id),
        installed_at timestamptz,
        removed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (status IN ('REQUESTED','SHIPPED') OR device_id IS NOT NULL)
      )`);
    await queryRunner.query(
      `CREATE INDEX device_installations_asset_idx ON device_installations (asset_id)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX device_installations_active_device_uq ON device_installations (device_id) WHERE status IN ('INSTALLED','ACTIVE')`,
    );

    // ---------------------------------------------------------------- modelos de IA
    await queryRunner.query(`
      CREATE TABLE ai_models (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code varchar(64) NOT NULL UNIQUE,
        name varchar(120) NOT NULL,
        task varchar(32) NOT NULL CHECK (task IN
          ('ANIMAL_COUNTING','OBJECT_DETECTION','CHANGE_DETECTION','VEGETATION_INDEX','IMAGE_QUALITY','INDIVIDUAL_ID','SCORING')),
        provider varchar(64) NOT NULL,
        description text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`
      CREATE TABLE ai_model_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        model_id uuid NOT NULL REFERENCES ai_models(id),
        version varchar(32) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DEPRECATED','EXPERIMENTAL')),
        is_simulated boolean NOT NULL DEFAULT false,
        metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
        parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
        released_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (model_id, version)
      )`);

    // ---------------------------------------------------------------- satelital
    await queryRunner.query(`
      CREATE TABLE satellite_images (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        provider varchar(48) NOT NULL,
        collection varchar(64) NOT NULL,
        scene_id varchar(160) NOT NULL,
        acquired_at timestamptz NOT NULL,
        cloud_cover_pct numeric(5,2) CHECK (cloud_cover_pct BETWEEN 0 AND 100),
        resolution_m numeric(6,2) NOT NULL CHECK (resolution_m > 0),
        footprint geometry(Polygon, 4326),
        bands text[] NOT NULL DEFAULT '{}',
        preview_storage_key varchar(512),
        is_simulated boolean NOT NULL DEFAULT false,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (organization_id, provider, scene_id)
      )`);
    await queryRunner.query(
      `CREATE INDEX satellite_images_footprint_gix ON satellite_images USING gist (footprint)`,
    );

    // ---------------------------------------------------------------- evidencia
    await queryRunner.query(`
      CREATE TABLE evidence_sources (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code varchar(48) NOT NULL UNIQUE,
        name varchar(120) NOT NULL,
        kind varchar(16) NOT NULL CHECK (kind IN ('CAMERA','SATELLITE','MANUAL_UPLOAD','RFID','SENSOR','REGISTRY','DRONE')),
        provider varchar(80) NOT NULL,
        is_simulated boolean NOT NULL DEFAULT false,
        description varchar(255),
        created_at timestamptz NOT NULL DEFAULT now()
      )`);

    await queryRunner.query(`
      CREATE TABLE evidence (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        asset_id uuid NOT NULL REFERENCES assets(id),
        establishment_id uuid NOT NULL REFERENCES establishments(id),
        source_id uuid NOT NULL REFERENCES evidence_sources(id),
        device_id uuid REFERENCES devices(id),
        satellite_image_id uuid REFERENCES satellite_images(id),
        type varchar(24) NOT NULL CHECK (type IN ('IMAGE','SATELLITE_SCENE','RFID_READ','SENSOR_READING')),
        storage_key varchar(512),
        mime_type varchar(100),
        size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes > 0),
        sha256 char(64),
        captured_at timestamptz NOT NULL,
        received_at timestamptz NOT NULL DEFAULT now(),
        location geometry(Point, 4326),
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        uploaded_by uuid REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK (type <> 'IMAGE' OR (storage_key IS NOT NULL AND sha256 IS NOT NULL))
      )`);
    await queryRunner.query(
      `CREATE INDEX evidence_asset_captured_idx ON evidence (asset_id, captured_at DESC)`,
    );
    await queryRunner.query(`CREATE INDEX evidence_org_idx ON evidence (organization_id)`);
    await queryRunner.query(`CREATE INDEX evidence_location_gix ON evidence USING gist (location)`);
    await queryRunner.query(`
      CREATE TRIGGER evidence_immutable BEFORE UPDATE OR DELETE ON evidence
      FOR EACH ROW EXECUTE FUNCTION forbid_mutation()`);

    await queryRunner.query(`
      CREATE TABLE satellite_observations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        asset_id uuid NOT NULL REFERENCES assets(id),
        satellite_image_id uuid NOT NULL REFERENCES satellite_images(id),
        evidence_id uuid REFERENCES evidence(id),
        observed_at timestamptz NOT NULL,
        ndvi_mean numeric(5,4) CHECK (ndvi_mean BETWEEN -1 AND 1),
        ndvi_std numeric(5,4),
        vegetated_area_ha numeric(12,2) CHECK (vegetated_area_ha IS NULL OR vegetated_area_ha >= 0),
        declared_area_ha numeric(12,2),
        coverage_ratio numeric(6,4),
        change_vs_previous_pct numeric(7,2),
        metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE INDEX satellite_observations_asset_idx ON satellite_observations (asset_id, observed_at DESC)`,
    );

    // ---------------------------------------------------------------- verificación
    await queryRunner.query(`
      CREATE TABLE verification_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        asset_id uuid NOT NULL REFERENCES assets(id),
        status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED')),
        trigger varchar(16) NOT NULL CHECK (trigger IN ('MANUAL','SCHEDULED','API')),
        requested_by uuid REFERENCES users(id),
        requested_by_process varchar(64),
        attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        pipeline_version varchar(32) NOT NULL,
        input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
        failure_reason text,
        queued_at timestamptz NOT NULL DEFAULT now(),
        started_at timestamptz,
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (requested_by IS NOT NULL OR requested_by_process IS NOT NULL)
      )`);
    await queryRunner.query(
      `CREATE INDEX verification_runs_org_created_idx ON verification_runs (organization_id, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX verification_runs_asset_created_idx ON verification_runs (asset_id, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX verification_runs_one_active_uq ON verification_runs (asset_id) WHERE status IN ('PENDING','PROCESSING')`,
    );
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION protect_closed_verification_run() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'Las verificaciones no pueden eliminarse' USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        IF OLD.status IN ('COMPLETED','FAILED') THEN
          RAISE EXCEPTION 'La verificación % está cerrada y es inmutable', OLD.id USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql`);
    await queryRunner.query(`
      CREATE TRIGGER verification_runs_immutable BEFORE UPDATE OR DELETE ON verification_runs
      FOR EACH ROW EXECUTE FUNCTION protect_closed_verification_run()`);

    await queryRunner.query(
      `ALTER TABLE assets ADD CONSTRAINT assets_last_verification_fk FOREIGN KEY (last_verification_run_id) REFERENCES verification_runs(id)`,
    );

    await queryRunner.query(`
      CREATE TABLE verification_results (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        verification_run_id uuid NOT NULL UNIQUE REFERENCES verification_runs(id),
        asset_id uuid NOT NULL REFERENCES assets(id),
        outcome varchar(16) NOT NULL CHECK (outcome IN ('VERIFIED','OBSERVED','REJECTED','INCONCLUSIVE')),
        declared_quantity numeric(14,2) NOT NULL,
        detected_quantity numeric(14,2),
        unit varchar(16) NOT NULL,
        match_percentage numeric(5,2) CHECK (match_percentage IS NULL OR match_percentage BETWEEN 0 AND 100),
        difference numeric(14,2),
        final_score smallint NOT NULL CHECK (final_score BETWEEN 0 AND 100),
        confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
        risk_level varchar(8) NOT NULL CHECK (risk_level IN ('LOW','MEDIUM','HIGH')),
        location_verified boolean,
        location_distance_m numeric(10,1),
        scoring_model_version varchar(32) NOT NULL,
        score_components jsonb NOT NULL,
        score_weights jsonb NOT NULL,
        risk_penalty numeric(5,2) NOT NULL DEFAULT 0,
        anomalies jsonb NOT NULL DEFAULT '[]'::jsonb,
        summary text NOT NULL,
        ai_model_version_id uuid REFERENCES ai_model_versions(id),
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE INDEX verification_results_asset_idx ON verification_results (asset_id, created_at DESC)`,
    );
    await queryRunner.query(`
      CREATE TRIGGER verification_results_immutable BEFORE UPDATE OR DELETE ON verification_results
      FOR EACH ROW EXECUTE FUNCTION forbid_mutation()`);

    await queryRunner.query(`
      CREATE TABLE verification_metrics (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        verification_run_id uuid NOT NULL REFERENCES verification_runs(id),
        key varchar(64) NOT NULL,
        value numeric(14,4) NOT NULL,
        unit varchar(16),
        source varchar(48) NOT NULL,
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (verification_run_id, key)
      )`);
    await queryRunner.query(`
      CREATE TRIGGER verification_metrics_immutable BEFORE UPDATE OR DELETE ON verification_metrics
      FOR EACH ROW EXECUTE FUNCTION forbid_mutation()`);

    await queryRunner.query(`
      CREATE TABLE verification_evidence (
        verification_run_id uuid NOT NULL REFERENCES verification_runs(id),
        evidence_id uuid NOT NULL REFERENCES evidence(id),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        role varchar(16) NOT NULL CHECK (role IN ('PRIMARY','SUPPORTING','EXCLUDED')),
        detected_count integer CHECK (detected_count IS NULL OR detected_count >= 0),
        confidence numeric(4,3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
        analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
        exclusion_reason varchar(255),
        ai_model_version_id uuid REFERENCES ai_model_versions(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (verification_run_id, evidence_id)
      )`);
    await queryRunner.query(
      `CREATE INDEX verification_evidence_evidence_idx ON verification_evidence (evidence_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE guarantees (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        asset_id uuid NOT NULL REFERENCES assets(id),
        verification_run_id uuid NOT NULL REFERENCES verification_runs(id),
        status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RELEASED')),
        covered_quantity numeric(14,2) NOT NULL CHECK (covered_quantity > 0),
        valuation numeric(18,2),
        currency char(3) NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','ARS')),
        confirmed_by uuid NOT NULL REFERENCES users(id),
        confirmed_at timestamptz NOT NULL DEFAULT now(),
        released_by uuid REFERENCES users(id),
        released_at timestamptz,
        notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX guarantees_active_asset_uq ON guarantees (asset_id) WHERE status = 'ACTIVE'`,
    );
    await queryRunner.query(
      `CREATE INDEX guarantees_org_idx ON guarantees (organization_id, status)`,
    );

    // ---------------------------------------------------------------- monitoreo
    await queryRunner.query(`
      CREATE TABLE monitoring_configurations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        asset_id uuid NOT NULL UNIQUE REFERENCES assets(id),
        enabled boolean NOT NULL DEFAULT true,
        interval_hours integer NOT NULL DEFAULT 24 CHECK (interval_hours BETWEEN 1 AND 2160),
        max_evidence_age_hours integer NOT NULL DEFAULT 72 CHECK (max_evidence_age_hours BETWEEN 1 AND 8760),
        next_run_at timestamptz,
        last_run_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE INDEX monitoring_configurations_due_idx ON monitoring_configurations (next_run_at) WHERE enabled`,
    );

    await queryRunner.query(`
      CREATE TABLE monitoring_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        asset_id uuid NOT NULL REFERENCES assets(id),
        verification_run_id uuid REFERENCES verification_runs(id),
        type varchar(48) NOT NULL,
        severity varchar(8) NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO','WARNING','CRITICAL')),
        message varchar(255) NOT NULL,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        occurred_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE INDEX monitoring_events_asset_idx ON monitoring_events (asset_id, occurred_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX monitoring_events_org_idx ON monitoring_events (organization_id, occurred_at DESC)`,
    );

    // ---------------------------------------------------------------- alertas
    await queryRunner.query(`
      CREATE TABLE alert_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid REFERENCES organizations(id),
        code varchar(64) NOT NULL,
        name varchar(120) NOT NULL,
        description varchar(255) NOT NULL,
        severity varchar(8) NOT NULL CHECK (severity IN ('INFO','WARNING','CRITICAL')),
        condition_type varchar(48) NOT NULL,
        parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
        asset_type_codes text[] NOT NULL DEFAULT '{}',
        enabled boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX alert_rules_scope_code_uq ON alert_rules (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), code)`,
    );

    await queryRunner.query(`
      CREATE TABLE alerts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        asset_id uuid NOT NULL REFERENCES assets(id),
        verification_run_id uuid REFERENCES verification_runs(id),
        rule_id uuid REFERENCES alert_rules(id),
        type varchar(64) NOT NULL,
        severity varchar(8) NOT NULL CHECK (severity IN ('INFO','WARNING','CRITICAL')),
        status varchar(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
        title varchar(200) NOT NULL,
        description text NOT NULL,
        context jsonb NOT NULL DEFAULT '{}'::jsonb,
        acknowledged_by uuid REFERENCES users(id),
        acknowledged_at timestamptz,
        resolved_by uuid REFERENCES users(id),
        resolved_at timestamptz,
        resolution_note text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (status <> 'RESOLVED' OR resolved_at IS NOT NULL)
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX alerts_open_dedup_uq ON alerts (asset_id, type) WHERE status <> 'RESOLVED'`,
    );
    await queryRunner.query(
      `CREATE INDEX alerts_org_status_idx ON alerts (organization_id, status, created_at DESC)`,
    );

    // ---------------------------------------------------------------- informes
    await queryRunner.query(`
      CREATE TABLE reports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        asset_id uuid NOT NULL REFERENCES assets(id),
        verification_run_id uuid NOT NULL REFERENCES verification_runs(id),
        type varchar(32) NOT NULL DEFAULT 'GUARANTEE_VERIFICATION' CHECK (type IN ('GUARANTEE_VERIFICATION')),
        status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','GENERATING','READY','FAILED')),
        title varchar(200) NOT NULL,
        requested_by uuid REFERENCES users(id),
        generated_at timestamptz,
        failure_reason text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE INDEX reports_org_created_idx ON reports (organization_id, created_at DESC)`,
    );
    await queryRunner.query(`CREATE INDEX reports_run_idx ON reports (verification_run_id)`);

    await queryRunner.query(`
      CREATE TABLE report_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
        format varchar(8) NOT NULL CHECK (format IN ('PDF','CSV','JSON')),
        version integer NOT NULL DEFAULT 1 CHECK (version > 0),
        storage_key varchar(512) NOT NULL UNIQUE,
        size_bytes bigint NOT NULL CHECK (size_bytes > 0),
        sha256 char(64) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (report_id, format, version)
      )`);

    // ---------------------------------------------------------------- identificación individual (fase 4)
    await queryRunner.query(`
      CREATE TABLE animals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        establishment_id uuid NOT NULL REFERENCES establishments(id),
        asset_id uuid REFERENCES assets(id),
        official_tag varchar(32) NOT NULL,
        species varchar(16) NOT NULL DEFAULT 'BOVINE' CHECK (species IN ('BOVINE','OVINE','PORCINE','EQUINE')),
        category varchar(24) NOT NULL CHECK (category IN ('VACA','VAQUILLONA','TERNERO','TERNERA','NOVILLO','NOVILLITO','TORO')),
        breed varchar(48),
        sex char(1) NOT NULL CHECK (sex IN ('M','H')),
        birth_date date,
        status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SOLD','DEAD','MISSING')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (organization_id, official_tag)
      )`);
    await queryRunner.query(`CREATE INDEX animals_asset_idx ON animals (asset_id)`);
    await queryRunner.query(`
      CREATE TABLE animal_identifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        animal_id uuid NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
        method varchar(16) NOT NULL CHECK (method IN ('RFID','VISUAL','TAG_OCR','MANUAL')),
        identifier varchar(128) NOT NULL,
        confidence numeric(4,3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
        evidence_id uuid REFERENCES evidence(id),
        is_primary boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (organization_id, method, identifier)
      )`);
    await queryRunner.query(`
      CREATE TABLE animal_observations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        animal_id uuid NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
        evidence_id uuid REFERENCES evidence(id),
        device_id uuid REFERENCES devices(id),
        method varchar(16) NOT NULL CHECK (method IN ('RFID','VISUAL','TAG_OCR','MANUAL')),
        observed_at timestamptz NOT NULL,
        location geometry(Point, 4326),
        confidence numeric(4,3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
        attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE INDEX animal_observations_animal_idx ON animal_observations (animal_id, observed_at DESC)`,
    );

    // ---------------------------------------------------------------- datos externos y auditoría
    await queryRunner.query(`
      CREATE TABLE external_data_snapshots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        source varchar(48) NOT NULL,
        provider varchar(64) NOT NULL,
        subject_type varchar(32) NOT NULL,
        subject_ref varchar(128) NOT NULL,
        asset_id uuid REFERENCES assets(id),
        establishment_id uuid REFERENCES establishments(id),
        verification_run_id uuid REFERENCES verification_runs(id),
        status varchar(16) NOT NULL CHECK (status IN ('OK','NOT_FOUND','ERROR')),
        is_simulated boolean NOT NULL DEFAULT false,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        fetched_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE INDEX external_data_snapshots_subject_idx ON external_data_snapshots (organization_id, source, subject_ref, fetched_at DESC)`,
    );
    await queryRunner.query(`
      CREATE TRIGGER external_data_snapshots_immutable BEFORE UPDATE OR DELETE ON external_data_snapshots
      FOR EACH ROW EXECUTE FUNCTION forbid_mutation()`);

    await queryRunner.query(`
      CREATE TABLE audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid REFERENCES organizations(id),
        user_id uuid REFERENCES users(id),
        actor_type varchar(8) NOT NULL CHECK (actor_type IN ('USER','SYSTEM')),
        action varchar(64) NOT NULL,
        resource_type varchar(48) NOT NULL,
        resource_id uuid,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        ip varchar(64),
        user_agent varchar(255),
        request_id varchar(64),
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE INDEX audit_logs_org_created_idx ON audit_logs (organization_id, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX audit_logs_resource_idx ON audit_logs (resource_type, resource_id)`,
    );
    await queryRunner.query(`
      CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION forbid_mutation()`);

    // ---------------------------------------------------------------- triggers updated_at
    for (const table of [
      'organizations',
      'users',
      'establishments',
      'establishment_locations',
      'asset_types',
      'assets',
      'documents',
      'devices',
      'device_installations',
      'verification_runs',
      'guarantees',
      'monitoring_configurations',
      'alert_rules',
      'alerts',
      'reports',
      'animals',
    ]) {
      await queryRunner.query(
        `CREATE TRIGGER ${table}_set_updated_at BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'audit_logs',
      'external_data_snapshots',
      'animal_observations',
      'animal_identifications',
      'animals',
      'report_documents',
      'reports',
      'alerts',
      'alert_rules',
      'monitoring_events',
      'monitoring_configurations',
      'guarantees',
      'verification_evidence',
      'verification_metrics',
      'verification_results',
      'satellite_observations',
      'evidence',
      'evidence_sources',
      'satellite_images',
      'ai_model_versions',
      'ai_models',
      'device_installations',
      'devices',
      'documents',
      'asset_metadata',
    ];
    for (const table of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    }
    await queryRunner.query(
      `ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_last_verification_fk`,
    );
    for (const table of [
      'verification_runs',
      'assets',
      'asset_types',
      'establishment_locations',
      'establishments',
      'refresh_tokens',
      'users',
      'role_permissions',
      'roles',
      'permissions',
      'organizations',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    }
    await queryRunner.query(`DROP FUNCTION IF EXISTS protect_closed_verification_run()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS forbid_mutation()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS set_updated_at()`);
  }
}
