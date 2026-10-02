import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { GeoPoint } from '../../../common/geo/geojson.js';
import { numericTransformer } from '../../../database/transformers.js';
import type {
  OfficialScanResult,
  ScanLine,
  ScanMode,
  ScanQuality,
  ScanStatus,
} from '../domain/scan.types.js';
import type { CaptureZone } from '../domain/chute-matching.js';

/** Sesión de escaneo de bovinos (id generado en el celular para reanudar sin duplicar). */
@Entity('scan_sessions')
export class ScanSessionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid', nullable: true })
  guaranteeRequestId: string | null;

  @Column({ type: 'uuid' })
  assetId: string;

  @Column({ type: 'uuid' })
  establishmentId: string;

  @Column({ type: 'uuid' })
  createdBy: string;

  @Column({ type: 'varchar', length: 8 })
  mode: ScanMode;

  @Column({ type: 'varchar', length: 16, default: 'UPLOADING' })
  status: ScanStatus;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @Column({
    type: 'numeric',
    precision: 8,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  durationS: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, transformer: numericTransformer })
  sampledFps: number;

  @Column({ type: 'integer' })
  frameWidth: number;

  @Column({ type: 'integer' })
  frameHeight: number;

  @Column({ type: 'jsonb' })
  line: ScanLine;

  /** Manga + RFID: zona de captura (fracciones del cuadro). */
  @Column({ type: 'jsonb', nullable: true })
  captureZone: CaptureZone | null;

  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326, nullable: true })
  location: GeoPoint | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  locationAccuracyM: number | null;

  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326, nullable: true })
  locationEnd: GeoPoint | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  maxDisplacementM: number | null;

  @Column({ type: 'jsonb', nullable: true })
  heading: { startDeg: number | null; sweptDeg: number | null; source: string } | null;

  @Column({ type: 'jsonb', default: {} })
  device: Record<string, unknown>;

  @Column({ type: 'integer', nullable: true })
  expectedFrames: number | null;

  @Column({ type: 'integer', nullable: true })
  expectedKeyFrames: number | null;

  @Column({ type: 'jsonb', nullable: true })
  clientResult: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  serverResult: (OfficialScanResult & Record<string, unknown>) | null;

  @Column({ type: 'integer', nullable: true })
  officialCount: number | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  quality: ScanQuality | null;

  @Column({ type: 'jsonb', default: [] })
  warnings: string[];

  @Column({ type: 'uuid', nullable: true })
  evidenceId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  error: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  finalizedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
