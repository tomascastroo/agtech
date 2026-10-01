import { CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export abstract class UuidEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;
}

export abstract class TimestampedEntity extends UuidEntity {
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

export abstract class CreatedOnlyEntity extends UuidEntity {
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
