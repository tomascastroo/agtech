import type { MigrationInterface, QueryRunner } from 'typeorm';
import { INITIAL_POLICIES } from '../../modules/collateral/domain/policy.js';

const DOC_TYPES_BEFORE = `'RENSPA','PROPERTY_DEED','LEASE_CONTRACT','ID_CUIT','SANITARY_CERTIFICATE','INSURANCE_POLICY',
  'MIPYME_CERTIFICATE','STOCK_CERTIFICATE','BRAND_TITLE','FEEDLOT_REGISTRATION','FINANCIAL_STATEMENTS','OTHER'`;
const DOC_TYPES_AFTER = `${DOC_TYPES_BEFORE},
  'DTE','TRAZA_REPORT','PLEDGE_CONTRACT','LIEN_REPORT','IMMOBILIZATION_CERTIFICATE'`;

/**
 * Garantía bovina con verificación continua (Asset Passport):
 *  - bovine_guarantees: la garantía (datos legales informados por la entidad, nunca inventados),
 *    estado, score, riesgo, cobertura y parámetros de valuación con su fuente.
 *  - collateral_declarations: declaración del productor INMUTABLE; una corrección es una versión
 *    nueva con motivo, fecha y usuario.
 *  - collateral_movements: egresos/ingresos OFICIAL / DOCUMENTADO / DECLARADO.
 *  - collateral_verifications: cada verificación (método, declarado/esperado/observado/verificado).
 *  - collateral_score_snapshots: cada evaluación del motor (componentes, compuertas, riesgo,
 *    cobertura). Inmutable.
 *  - collateral_events: historial / línea de tiempo. Inmutable.
 *  - collateral_inspections: inspección presencial (escalamiento). Una vez realizada no se edita.
 *  - collateral_monitoring_policies: frecuencias configurables por tipo de producción y riesgo.
 *  - monitoring_schedules: próxima verificación de cada garantía.
 *  - alerts: vínculo con la garantía, responsable, acción recomendada, estados IN_REVIEW/DISMISSED.
 *  - documents: DT-e, constancia TRAZA, contrato de prenda, informe de gravámenes, inmovilización.
 */
export class BovineCollateral1799000000000 implements MigrationInterface {
  name = 'BovineCollateral1799000000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE documents DROP CONSTRAINT documents_type_check`);
    await q.query(
      `ALTER TABLE documents ADD CONSTRAINT documents_type_check CHECK (type IN (${DOC_TYPES_AFTER}))`,
    );

    await q.query(`CREATE SEQUENCE bovine_guarantee_code_seq`);
    await q.query(`
      CREATE TABLE bovine_guarantees (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        code varchar(16) NOT NULL UNIQUE
          DEFAULT ('AG-' || lpad(nextval('bovine_guarantee_code_seq')::text, 4, '0')),
        guarantee_request_id uuid UNIQUE REFERENCES guarantee_requests(id),
        asset_id uuid REFERENCES assets(id),
        establishment_id uuid REFERENCES establishments(id),
        producer_name varchar(160) NOT NULL,
        producer_tax_id varchar(13) NOT NULL,
        production_type varchar(16) NOT NULL DEFAULT 'CRIA'
          CHECK (production_type IN ('FEEDLOT','CRIA','INVERNADA','TAMBO')),
        state varchar(24) NOT NULL DEFAULT 'PENDIENTE_DECLARACION' CHECK (state IN
          ('PENDIENTE_DECLARACION','PENDIENTE_VERIFICACION','VERIFICADA','EN_MONITOREO','REQUIERE_EVIDENCIA',
           'REQUIERE_REVISION','REQUIERE_INSPECCION','NO_DETERMINABLE','VENCIDA','FINALIZADA')),
        state_reason varchar(400),
        legal_instrument varchar(16) NOT NULL DEFAULT 'NO_INFORMADO'
          CHECK (legal_instrument IN ('PRENDA_FIJA','PRENDA_FLOTANTE','WARRANT','OTRO','NO_INFORMADO')),
        legal_identifier varchar(80),
        legal_status varchar(16) NOT NULL DEFAULT 'NO_INFORMADO'
          CHECK (legal_status IN ('NO_INFORMADO','EN_TRAMITE','INSCRIPTA','VIGENTE','CANCELADA')),
        lien_priority smallint CHECK (lien_priority IS NULL OR lien_priority > 0),
        immobilization_status varchar(16) NOT NULL DEFAULT 'NO_INFORMADA'
          CHECK (immobilization_status IN ('NO_INFORMADA','NO_APLICA','SOLICITADA','VIGENTE','LEVANTADA')),
        immobilization_reference varchar(80),
        amount numeric(18,2) CHECK (amount IS NULL OR amount >= 0),
        debt_amount numeric(18,2) CHECK (debt_amount IS NULL OR debt_amount >= 0),
        currency char(3) NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','ARS')),
        granted_at date,
        expires_at date,
        CHECK (expires_at IS NULL OR granted_at IS NULL OR expires_at >= granted_at),
        average_weight_kg numeric(8,2) CHECK (average_weight_kg IS NULL OR average_weight_kg > 0),
        weight_source varchar(160),
        price_per_kg numeric(14,4) CHECK (price_per_kg IS NULL OR price_per_kg > 0),
        price_currency char(3) CHECK (price_currency IS NULL OR price_currency IN ('USD','ARS')),
        price_source varchar(160),
        price_date date,
        quality_factor numeric(4,3) CHECK (quality_factor IS NULL OR quality_factor BETWEEN 0 AND 1),
        current_declaration_version integer,
        score smallint CHECK (score IS NULL OR score BETWEEN 0 AND 100),
        risk_level varchar(8) CHECK (risk_level IS NULL OR risk_level IN ('BAJO','MEDIO','ALTO','CRITICO')),
        coverage_status varchar(16),
        coverage_ratio numeric(10,2),
        verifiable_value numeric(18,2),
        verifiable_heads integer,
        expected_heads integer,
        last_evidence_at timestamptz,
        last_verification_at timestamptz,
        next_verification_at timestamptz,
        last_snapshot_id uuid,
        data_source varchar(8) NOT NULL DEFAULT 'REAL' CHECK (data_source IN ('REAL','DEMO')),
        created_by uuid REFERENCES users(id),
        finalized_at timestamptz,
        finalized_by uuid REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE INDEX bovine_guarantees_org_state_idx ON bovine_guarantees (organization_id, state)`,
    );
    await q.query(`CREATE INDEX bovine_guarantees_asset_idx ON bovine_guarantees (asset_id)`);
    await q.query(
      `CREATE INDEX bovine_guarantees_establishment_idx ON bovine_guarantees (establishment_id)`,
    );
    await q.query(
      `CREATE INDEX bovine_guarantees_next_idx ON bovine_guarantees (next_verification_at) WHERE finalized_at IS NULL`,
    );

    await q.query(`
      CREATE TABLE collateral_declarations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        guarantee_id uuid NOT NULL REFERENCES bovine_guarantees(id),
        version integer NOT NULL CHECK (version > 0),
        heads integer NOT NULL CHECK (heads > 0),
        categories jsonb NOT NULL DEFAULT '[]'::jsonb,
        production_type varchar(16) NOT NULL,
        establishment jsonb NOT NULL DEFAULT '{}'::jsonb,
        source varchar(16) NOT NULL CHECK (source IN ('PRODUCTOR','ENTIDAD','MIGRACION')),
        declared_by uuid REFERENCES users(id),
        declared_by_label varchar(160) NOT NULL,
        declared_at timestamptz NOT NULL DEFAULT now(),
        reason varchar(500),
        supersedes_id uuid REFERENCES collateral_declarations(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (guarantee_id, version),
        CHECK (version = 1 OR (reason IS NOT NULL AND supersedes_id IS NOT NULL))
      )`);
    await q.query(`
      CREATE TRIGGER collateral_declarations_immutable BEFORE UPDATE OR DELETE ON collateral_declarations
      FOR EACH ROW EXECUTE FUNCTION forbid_mutation()`);

    await q.query(`
      CREATE TABLE collateral_movements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        guarantee_id uuid NOT NULL REFERENCES bovine_guarantees(id),
        direction varchar(8) NOT NULL CHECK (direction IN ('EGRESO','INGRESO')),
        kind varchar(16) NOT NULL CHECK (kind IN ('VENTA','TRASLADO','FAENA','MUERTE','COMPRA','NACIMIENTO','OTRO')),
        heads integer NOT NULL CHECK (heads > 0),
        category varchar(40),
        animal_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
        origin varchar(160),
        destination varchar(160),
        occurred_at timestamptz NOT NULL,
        source_level varchar(12) NOT NULL CHECK (source_level IN ('OFICIAL','DOCUMENTADO','DECLARADO')),
        source_label varchar(160) NOT NULL,
        document_id uuid REFERENCES documents(id),
        dte_number varchar(40),
        verification_state varchar(12) NOT NULL DEFAULT 'PENDIENTE'
          CHECK (verification_state IN ('PENDIENTE','VERIFICADO','RECHAZADO')),
        notes varchar(500),
        recorded_by uuid REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (source_level <> 'DOCUMENTADO' OR document_id IS NOT NULL)
      )`);
    await q.query(
      `CREATE INDEX collateral_movements_guarantee_idx ON collateral_movements (guarantee_id, occurred_at DESC)`,
    );

    await q.query(`
      CREATE TABLE collateral_score_snapshots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        guarantee_id uuid NOT NULL REFERENCES bovine_guarantees(id),
        trigger varchar(16) NOT NULL,
        state varchar(24) NOT NULL,
        state_reason varchar(400) NOT NULL,
        score smallint,
        weighted_score smallint,
        risk_level varchar(8) NOT NULL,
        risk_points smallint NOT NULL,
        coverage_status varchar(16) NOT NULL,
        coverage_ratio numeric(10,2),
        expected_heads integer,
        observed_heads integer,
        verifiable_heads integer,
        components jsonb NOT NULL,
        gates jsonb NOT NULL,
        risk_factors jsonb NOT NULL,
        coverage jsonb NOT NULL,
        reconciliation jsonb NOT NULL,
        schedule jsonb NOT NULL,
        inputs jsonb NOT NULL,
        engine_version varchar(40) NOT NULL,
        evaluated_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE INDEX collateral_snapshots_guarantee_idx ON collateral_score_snapshots (guarantee_id, evaluated_at DESC)`,
    );
    await q.query(`
      CREATE TRIGGER collateral_score_snapshots_immutable BEFORE UPDATE OR DELETE ON collateral_score_snapshots
      FOR EACH ROW EXECUTE FUNCTION forbid_mutation()`);
    await q.query(`
      ALTER TABLE bovine_guarantees ADD CONSTRAINT bovine_guarantees_last_snapshot_fk
        FOREIGN KEY (last_snapshot_id) REFERENCES collateral_score_snapshots(id)`);

    await q.query(`
      CREATE TABLE collateral_inspections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        guarantee_id uuid NOT NULL REFERENCES bovine_guarantees(id),
        status varchar(12) NOT NULL DEFAULT 'SOLICITADA' CHECK (status IN ('SOLICITADA','REALIZADA','CANCELADA')),
        reason varchar(500),
        requested_by uuid REFERENCES users(id),
        requested_at timestamptz NOT NULL DEFAULT now(),
        due_at timestamptz,
        inspector_name varchar(160),
        inspector_user_id uuid REFERENCES users(id),
        performed_at timestamptz,
        location geometry(Point, 4326),
        observed_heads integer CHECK (observed_heads IS NULL OR observed_heads >= 0),
        full_count boolean,
        rfid_read integer CHECK (rfid_read IS NULL OR rfid_read >= 0),
        evidence_ids uuid[] NOT NULL DEFAULT '{}',
        observations text,
        discrepancies jsonb NOT NULL DEFAULT '[]'::jsonb,
        result varchar(20) CHECK (result IS NULL OR result IN ('CONFORME','CON_OBSERVACIONES','NO_CONFORME','NO_DETERMINABLE')),
        signature_name varchar(160),
        signature_hash char(64),
        signed_at timestamptz,
        recorded_by uuid REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (status <> 'REALIZADA' OR (performed_at IS NOT NULL AND result IS NOT NULL
          AND inspector_name IS NOT NULL AND signature_hash IS NOT NULL AND observed_heads IS NOT NULL))
      )`);
    await q.query(
      `CREATE INDEX collateral_inspections_guarantee_idx ON collateral_inspections (guarantee_id, requested_at DESC)`,
    );
    await q.query(`
      CREATE OR REPLACE FUNCTION forbid_mutation_when_performed() RETURNS trigger AS $$
      BEGIN
        IF OLD.status = 'REALIZADA' THEN
          RAISE EXCEPTION 'La inspección % ya fue realizada y firmada: no se modifica', OLD.id
            USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'Las inspecciones no se borran' USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql`);
    await q.query(`
      CREATE TRIGGER collateral_inspections_lock BEFORE UPDATE OR DELETE ON collateral_inspections
      FOR EACH ROW EXECUTE FUNCTION forbid_mutation_when_performed()`);

    await q.query(`
      CREATE TABLE collateral_verifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        guarantee_id uuid NOT NULL REFERENCES bovine_guarantees(id),
        verified_at timestamptz NOT NULL,
        method varchar(16) NOT NULL CHECK (method IN ('FOTO','VIDEO','ESCANER_FIJO','MANGA_RFID','INSPECCION','DOCUMENTO')),
        verification_run_id uuid REFERENCES verification_runs(id),
        inspection_id uuid REFERENCES collateral_inspections(id),
        declared_heads integer,
        expected_heads integer,
        observed_heads integer,
        verified_heads integer,
        count_basis varchar(16),
        quality varchar(16),
        quality_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
        capture_origin varchar(20),
        result_state varchar(24) NOT NULL,
        score smallint,
        risk_level varchar(8),
        evidence_ids uuid[] NOT NULL DEFAULT '{}',
        actor_id uuid REFERENCES users(id),
        actor_label varchar(160) NOT NULL,
        explanation text NOT NULL,
        snapshot_id uuid REFERENCES collateral_score_snapshots(id),
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE INDEX collateral_verifications_guarantee_idx ON collateral_verifications (guarantee_id, verified_at DESC)`,
    );
    await q.query(
      `CREATE UNIQUE INDEX collateral_verifications_run_uq ON collateral_verifications (guarantee_id, verification_run_id) WHERE verification_run_id IS NOT NULL`,
    );
    await q.query(`
      CREATE TRIGGER collateral_verifications_immutable BEFORE UPDATE OR DELETE ON collateral_verifications
      FOR EACH ROW EXECUTE FUNCTION forbid_mutation()`);

    await q.query(`
      CREATE TABLE collateral_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        guarantee_id uuid NOT NULL REFERENCES bovine_guarantees(id),
        type varchar(40) NOT NULL,
        occurred_at timestamptz NOT NULL DEFAULT now(),
        source varchar(16) NOT NULL CHECK (source IN ('SISTEMA','ENTIDAD','PRODUCTOR','INSPECTOR','DOCUMENTO','FUENTE_OFICIAL')),
        actor_id uuid REFERENCES users(id),
        actor_label varchar(160) NOT NULL,
        method varchar(40),
        evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
        result varchar(80),
        previous_state varchar(24),
        new_state varchar(24),
        summary varchar(600) NOT NULL,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE INDEX collateral_events_guarantee_idx ON collateral_events (guarantee_id, occurred_at DESC)`,
    );
    await q.query(`
      CREATE TRIGGER collateral_events_immutable BEFORE UPDATE OR DELETE ON collateral_events
      FOR EACH ROW EXECUTE FUNCTION forbid_mutation()`);

    await q.query(`
      CREATE TABLE collateral_monitoring_policies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid REFERENCES organizations(id),
        production_type varchar(16) NOT NULL CHECK (production_type IN ('FEEDLOT','CRIA','INVERNADA','TAMBO')),
        risk_level varchar(8) NOT NULL CHECK (risk_level IN ('BAJO','MEDIO','ALTO','CRITICO')),
        frequency_days integer NOT NULL CHECK (frequency_days BETWEEN 1 AND 365),
        max_evidence_age_days integer NOT NULL CHECK (max_evidence_age_days BETWEEN 1 AND 730),
        recommended_method varchar(16) NOT NULL,
        requires_inspection boolean NOT NULL DEFAULT false,
        updated_by uuid REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`
      CREATE UNIQUE INDEX collateral_policies_scope_uq ON collateral_monitoring_policies
        (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), production_type, risk_level)`);
    for (const [production, policy] of Object.entries(INITIAL_POLICIES)) {
      for (const [risk, rule] of Object.entries(policy)) {
        await q.query(
          `INSERT INTO collateral_monitoring_policies
             (production_type, risk_level, frequency_days, max_evidence_age_days, recommended_method, requires_inspection)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            production,
            risk,
            rule.frequencyDays,
            rule.maxEvidenceAgeDays,
            rule.recommendedMethod,
            rule.requiresInspection,
          ],
        );
      }
    }

    await q.query(`
      CREATE TABLE monitoring_schedules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        guarantee_id uuid NOT NULL UNIQUE REFERENCES bovine_guarantees(id),
        risk_level varchar(8) NOT NULL,
        frequency_days integer NOT NULL,
        max_evidence_age_days integer NOT NULL,
        recommended_method varchar(16) NOT NULL,
        requires_inspection boolean NOT NULL DEFAULT false,
        last_verification_at timestamptz,
        next_verification_at timestamptz NOT NULL,
        explanation varchar(400) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE INDEX monitoring_schedules_due_idx ON monitoring_schedules (next_verification_at)`,
    );

    for (const table of [
      'bovine_guarantees',
      'collateral_movements',
      'collateral_inspections',
      'collateral_monitoring_policies',
      'monitoring_schedules',
    ]) {
      await q.query(
        `CREATE TRIGGER ${table}_set_updated_at BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
      );
    }

    // Alertas: vínculo con la garantía, responsable, acción recomendada y estados nuevos.
    await q.query(`
      ALTER TABLE alerts
        ADD COLUMN bovine_guarantee_id uuid REFERENCES bovine_guarantees(id),
        ADD COLUMN owner_user_id uuid REFERENCES users(id),
        ADD COLUMN recommended_action varchar(400),
        ADD COLUMN dismissed_by uuid REFERENCES users(id),
        ADD COLUMN dismissed_at timestamptz`);
    await q.query(`ALTER TABLE alerts DROP CONSTRAINT alerts_status_check`);
    await q.query(`
      ALTER TABLE alerts ADD CONSTRAINT alerts_status_check
        CHECK (status IN ('OPEN','ACKNOWLEDGED','IN_REVIEW','RESOLVED','DISMISSED'))`);
    await q.query(`DROP INDEX alerts_open_dedup_uq`);
    await q.query(`
      CREATE UNIQUE INDEX alerts_open_dedup_uq ON alerts (asset_id, type)
        WHERE status NOT IN ('RESOLVED','DISMISSED')`);
    await q.query(
      `CREATE INDEX alerts_bovine_guarantee_idx ON alerts (bovine_guarantee_id, created_at DESC) WHERE bovine_guarantee_id IS NOT NULL`,
    );

    // Garantías de las solicitudes bovinas existentes (estado inicial; el motor las evalúa en el
    // primer barrido programado). La declaración v1 sale del activo declarado y enviado.
    await q.query(`
      INSERT INTO bovine_guarantees (organization_id, guarantee_request_id, asset_id, establishment_id,
          producer_name, producer_tax_id, production_type, state, amount, currency, data_source, created_by,
          created_at)
      SELECT r.organization_id, r.id, r.asset_id, r.establishment_id, r.producer_name, r.producer_tax_id,
          CASE m.data->>'sistema_productivo'
            WHEN 'Feedlot' THEN 'FEEDLOT' WHEN 'Tambo' THEN 'TAMBO'
            WHEN 'Invernada' THEN 'INVERNADA' WHEN 'Recría' THEN 'INVERNADA' ELSE 'CRIA' END,
          CASE WHEN r.submitted_at IS NULL THEN 'PENDIENTE_DECLARACION' ELSE 'PENDIENTE_VERIFICACION' END,
          r.requested_amount, CASE WHEN r.currency IN ('USD','ARS') THEN r.currency ELSE 'USD' END,
          r.data_source, r.created_by, r.created_at
      FROM guarantee_requests r
      LEFT JOIN LATERAL (
        SELECT data FROM asset_metadata am WHERE am.asset_id = r.asset_id ORDER BY version DESC LIMIT 1
      ) m ON true
      WHERE r.asset_type_code = 'BOVINOS'
      ORDER BY r.created_at`);
    await q.query(`
      INSERT INTO collateral_declarations (organization_id, guarantee_id, version, heads, production_type,
          establishment, source, declared_by, declared_by_label, declared_at)
      SELECT g.organization_id, g.id, 1, a.declared_quantity::int, g.production_type,
          jsonb_build_object('id', e.id, 'name', e.name, 'renspa', e.renspa),
          'MIGRACION', r.producer_user_id, g.producer_name, r.submitted_at
      FROM bovine_guarantees g
      JOIN guarantee_requests r ON r.id = g.guarantee_request_id
      JOIN assets a ON a.id = r.asset_id
      JOIN establishments e ON e.id = a.establishment_id
      WHERE r.submitted_at IS NOT NULL AND a.declared_quantity >= 1`);
    await q.query(`
      UPDATE bovine_guarantees g SET current_declaration_version = 1
      WHERE EXISTS (SELECT 1 FROM collateral_declarations d WHERE d.guarantee_id = g.id)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX alerts_bovine_guarantee_idx`);
    await q.query(`DROP INDEX alerts_open_dedup_uq`);
    await q.query(`UPDATE alerts SET status = 'ACKNOWLEDGED' WHERE status = 'IN_REVIEW'`);
    await q.query(`UPDATE alerts SET status = 'RESOLVED', resolved_at = COALESCE(resolved_at, now())
                     WHERE status = 'DISMISSED'`);
    await q.query(`ALTER TABLE alerts DROP CONSTRAINT alerts_status_check`);
    await q.query(
      `ALTER TABLE alerts ADD CONSTRAINT alerts_status_check CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED'))`,
    );
    await q.query(
      `CREATE UNIQUE INDEX alerts_open_dedup_uq ON alerts (asset_id, type) WHERE status <> 'RESOLVED'`,
    );
    await q.query(`
      ALTER TABLE alerts DROP COLUMN bovine_guarantee_id, DROP COLUMN owner_user_id,
        DROP COLUMN recommended_action, DROP COLUMN dismissed_by, DROP COLUMN dismissed_at`);
    await q.query(
      `ALTER TABLE bovine_guarantees DROP CONSTRAINT bovine_guarantees_last_snapshot_fk`,
    );
    for (const table of [
      'monitoring_schedules',
      'collateral_monitoring_policies',
      'collateral_events',
      'collateral_verifications',
      'collateral_inspections',
      'collateral_score_snapshots',
      'collateral_movements',
      'collateral_declarations',
      'bovine_guarantees',
    ]) {
      await q.query(`DROP TABLE ${table} CASCADE`);
    }
    await q.query(`DROP FUNCTION IF EXISTS forbid_mutation_when_performed()`);
    await q.query(`DROP SEQUENCE bovine_guarantee_code_seq`);
    await q.query(`UPDATE documents SET type = 'OTHER'
                     WHERE type IN ('DTE','TRAZA_REPORT','PLEDGE_CONTRACT','LIEN_REPORT','IMMOBILIZATION_CERTIFICATE')`);
    await q.query(`ALTER TABLE documents DROP CONSTRAINT documents_type_check`);
    await q.query(
      `ALTER TABLE documents ADD CONSTRAINT documents_type_check CHECK (type IN (${DOC_TYPES_BEFORE}))`,
    );
  }
}
