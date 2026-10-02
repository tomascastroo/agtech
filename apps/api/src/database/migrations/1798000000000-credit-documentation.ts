import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Documentación de crédito ganadero + demo:
 *  - documents: tipos nuevos (MiPyME, existencias SENASA, marca y señal, engorde a corral,
 *    información financiera) y origen REAL/DEMO.
 *  - document_analyses: texto OCR completo, campos con valor original/normalizado/confianza y
 *    los datos declarados contra los que se comparó.
 *  - guarantee_requests: producto de crédito elegido, origen REAL/DEMO y escenario de la demo.
 *  - guarantee_request_requirements: checklist de la solicitud (copiado del producto de crédito).
 *  - information_requests.requirement_code: pedido de un requisito concreto del checklist.
 *  - establishments / assets: origen REAL/DEMO. Los nombres únicos por organización solo aplican a
 *    datos reales (las demos repiten "La Esperanza" sin chocar con un establecimiento real).
 */
export class CreditDocumentation1798000000000 implements MigrationInterface {
  name = 'CreditDocumentation1798000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE documents DROP CONSTRAINT documents_type_check`);
    await queryRunner.query(`
      ALTER TABLE documents ADD CONSTRAINT documents_type_check CHECK (type IN
        ('RENSPA','PROPERTY_DEED','LEASE_CONTRACT','ID_CUIT','SANITARY_CERTIFICATE','INSURANCE_POLICY',
         'MIPYME_CERTIFICATE','STOCK_CERTIFICATE','BRAND_TITLE','FEEDLOT_REGISTRATION',
         'FINANCIAL_STATEMENTS','OTHER'))`);
    for (const table of ['documents', 'guarantee_requests', 'establishments', 'assets']) {
      await queryRunner.query(`
        ALTER TABLE ${table} ADD COLUMN data_source varchar(8) NOT NULL DEFAULT 'REAL'
          CHECK (data_source IN ('REAL','DEMO'))`);
    }
    await queryRunner.query(`DROP INDEX establishments_org_name_uq`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX establishments_org_name_uq ON establishments (organization_id, lower(name))
        WHERE deleted_at IS NULL AND data_source = 'REAL'`);

    await queryRunner.query(`
      ALTER TABLE document_analyses
        ADD COLUMN ocr_text text,
        ADD COLUMN field_entries jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN declared jsonb`);

    await queryRunner.query(`
      ALTER TABLE guarantee_requests
        ADD COLUMN credit_product_code varchar(48),
        ADD COLUMN demo_scenario varchar(32)`);

    await queryRunner.query(`
      CREATE TABLE guarantee_request_requirements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        guarantee_request_id uuid NOT NULL REFERENCES guarantee_requests(id),
        requirement_code varchar(48) NOT NULL,
        obligation varchar(16) NOT NULL CHECK (obligation IN ('MANDATORY','CONDITIONAL','EVALUATION')),
        condition varchar(200),
        not_applicable boolean NOT NULL DEFAULT false,
        note varchar(300),
        sort_order integer NOT NULL DEFAULT 0,
        updated_by uuid REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (guarantee_request_id, requirement_code)
      )`);

    await queryRunner.query(
      `ALTER TABLE information_requests ADD COLUMN requirement_code varchar(48)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE information_requests DROP COLUMN requirement_code`);
    await queryRunner.query(`DROP TABLE guarantee_request_requirements`);
    await queryRunner.query(
      `ALTER TABLE guarantee_requests DROP COLUMN credit_product_code, DROP COLUMN demo_scenario`,
    );
    await queryRunner.query(
      `ALTER TABLE document_analyses DROP COLUMN ocr_text, DROP COLUMN field_entries, DROP COLUMN declared`,
    );
    await queryRunner.query(`DROP INDEX establishments_org_name_uq`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX establishments_org_name_uq ON establishments (organization_id, lower(name)) WHERE deleted_at IS NULL`,
    );
    for (const table of ['documents', 'guarantee_requests', 'establishments', 'assets']) {
      await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN data_source`);
    }
    await queryRunner.query(`ALTER TABLE documents DROP CONSTRAINT documents_type_check`);
    await queryRunner.query(`
      ALTER TABLE documents ADD CONSTRAINT documents_type_check CHECK (type IN
        ('RENSPA','PROPERTY_DEED','LEASE_CONTRACT','ID_CUIT','SANITARY_CERTIFICATE','INSURANCE_POLICY','OTHER'))`);
  }
}
