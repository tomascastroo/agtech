import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Verificación con señales reales: reglas de alerta por caída de NDVI y por observación
 * satelital de baja confianza, evidencia desactualizada también para activos con vegetación y
 * fuente Sentinel-2 L2A real. En una base vacía no hace nada: el catálogo lo carga el seed.
 */
export class RealVerificationSignals1791000000000 implements MigrationInterface {
  name = 'RealVerificationSignals1791000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const vegetationTypes = `ARRAY['CULTIVOS','VINEDOS','FRUTALES','FORESTAL']::text[]`;
    await queryRunner.query(`
      INSERT INTO alert_rules (organization_id, code, name, description, severity, condition_type, parameters, asset_type_codes)
      SELECT NULL, r.code, r.name, r.description, r.severity, r.condition_type, r.parameters::jsonb, ${vegetationTypes}
      FROM (VALUES
        ('VEGETATION_DECLINE', 'Disminución significativa de actividad vegetal',
         'Caída del NDVI respecto de la observación anterior o de la línea base', 'WARNING',
         'VEGETATION_DECLINE', '{"thresholdPct": 15}'),
        ('OBSERVATION_LOW_CONFIDENCE', 'Observación satelital de baja confianza',
         'Sin escena utilizable en la ventana (nubosidad sobre el lote o sin cobertura)', 'INFO',
         'OBSERVATION_LOW_CONFIDENCE', '{}')
      ) AS r(code, name, description, severity, condition_type, parameters)
      WHERE EXISTS (SELECT 1 FROM alert_rules WHERE organization_id IS NULL)
        AND NOT EXISTS (
          SELECT 1 FROM alert_rules a WHERE a.organization_id IS NULL AND a.code = r.code
        )`);
    await queryRunner.query(`
      UPDATE alert_rules
      SET asset_type_codes = (
        SELECT array_agg(DISTINCT c) FROM unnest(asset_type_codes || ${vegetationTypes}) AS c
      ), updated_at = now()
      WHERE organization_id IS NULL AND code = 'EVIDENCE_STALE'`);
    await queryRunner.query(`
      UPDATE evidence_sources
      SET name = 'Sentinel-2 L2A (AWS Open Data)',
          provider = 'sentinel2-l2a',
          description = 'Escenas Sentinel-2 L2A reales (ítems STAC y COG del bucket público sentinel-cogs); NDVI con máscara de nubes SCL'
      WHERE code = 'SATELLITE_SENTINEL2_STAC'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM alert_rules WHERE organization_id IS NULL AND code IN ('VEGETATION_DECLINE','OBSERVATION_LOW_CONFIDENCE')`,
    );
  }
}
