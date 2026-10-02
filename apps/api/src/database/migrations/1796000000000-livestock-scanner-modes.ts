import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Producto ganadero: dos modos nuevos del Escáner de Bovinos.
 *  - PEN (escáner de corral): animales quietos; únicos con unión conservadora de vistas.
 *  - PHOTO (analizar foto): fotos del mismo grupo, procesadas oficialmente en el servidor.
 * La calidad sigue en scan_sessions.quality (COMPLETE/LIMITED/INSUFFICIENT); el estado de la
 * evidencia (VALIDADO / NO CONCLUYENTE / INSUFICIENTE) se deriva de ella.
 */
export class LivestockScannerModes1796000000000 implements MigrationInterface {
  name = 'LivestockScannerModes1796000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE scan_sessions DROP CONSTRAINT IF EXISTS scan_sessions_mode_check`,
    );
    await queryRunner.query(`
      ALTER TABLE scan_sessions ADD CONSTRAINT scan_sessions_mode_check
      CHECK (mode IN ('FIXED','SWEEP','PEN','PHOTO'))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE scan_sessions DROP CONSTRAINT scan_sessions_mode_check`);
    await queryRunner.query(`
      ALTER TABLE scan_sessions ADD CONSTRAINT scan_sessions_mode_check
      CHECK (mode IN ('FIXED','SWEEP'))`);
  }
}
