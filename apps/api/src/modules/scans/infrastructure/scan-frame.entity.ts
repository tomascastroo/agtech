import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import type { ScanFrameKind } from '../domain/scan.types.js';

/** Cuadro muestreado o representativo de un escaneo (append-only, con hash). */
@Entity('scan_frames')
export class ScanFrameEntity {
  @PrimaryColumn({ type: 'uuid' })
  scanSessionId: string;

  @PrimaryColumn({ type: 'varchar', length: 8 })
  kind: ScanFrameKind;

  @PrimaryColumn({ type: 'integer' })
  frameIndex: number;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'integer' })
  capturedMs: number;

  @Column({ type: 'varchar', length: 512 })
  storageKey: string;

  @Column({ type: 'char', length: 64 })
  sha256: string;

  @Column({ type: 'integer' })
  sizeBytes: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
