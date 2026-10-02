import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import type { ChuteDecision, SelectedFrame } from '../domain/chute-matching.js';

export type ChuteCaptureStatus = 'PENDING' | 'CONFIRMED' | 'AMBIGUOUS' | 'INSUFFICIENT_EVIDENCE';
export const CHUTE_RFID_SOURCES = ['READER_BRIDGE', 'SIMULATED'] as const;
export type ChuteRfidSource = (typeof CHUTE_RFID_SOURCES)[number];

/** Lectura de caravana tal como la registró el celular (reloj del celular, ms de sesión). */
export interface ChuteClientRead {
  electronicId: string;
  atMs: number;
}

/** Mejor cuadro elegido por el servidor, con su hash (dataset para investigación futura). */
export interface ChuteBestFrame extends SelectedFrame {
  sha256: string;
}

/**
 * Una captura de Manga + RFID: un animal, su lectura de caravana y los cuadros de la ventana.
 * Inmutable una vez resuelta (trigger en la base); una corrección es otra captura.
 */
@Entity('chute_captures')
export class ChuteCaptureEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  scanSessionId: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  assetId: string;

  @Column({ type: 'uuid' })
  establishmentId: string;

  @Column({ type: 'integer' })
  sequence: number;

  @Column({ type: 'varchar', length: 16 })
  rfidSource: ChuteRfidSource;

  @Column({ type: 'uuid', nullable: true })
  readerDeviceId: string | null;

  @Column({ type: 'jsonb' })
  reads: ChuteClientRead[];

  @Column({ type: 'integer', array: true })
  frameIndices: number[];

  @Column({ type: 'integer', nullable: true })
  clientTrackId: number | null;

  @Column({ type: 'jsonb', nullable: true })
  clientResult: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 24, default: 'PENDING' })
  status: ChuteCaptureStatus;

  @Column({ type: 'varchar', length: 40, nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  electronicId: string | null;

  @Column({ type: 'integer', nullable: true })
  trackId: number | null;

  @Column({ type: 'jsonb', default: [] })
  bestFrames: ChuteBestFrame[];

  @Column({ type: 'jsonb', nullable: true })
  decision: ChuteDecision | null;

  @Column({ type: 'uuid', array: true, default: [] })
  rfidObservationIds: string[];

  @Column({ type: 'uuid', nullable: true })
  individualId: string | null;

  @Column({ type: 'uuid', nullable: true })
  evidenceId: string | null;

  @Column({ type: 'uuid' })
  createdBy: string;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
