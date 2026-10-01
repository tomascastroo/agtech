import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { DocumentEntity } from './document.entity.js';

@Injectable()
export class DocumentsRepository {
  constructor(
    @InjectRepository(DocumentEntity) private readonly documents: Repository<DocumentEntity>,
  ) {}

  findById(organizationId: string, id: string): Promise<DocumentEntity | null> {
    return this.documents.findOneBy({ id, organizationId });
  }

  /** Documentos del activo y de su establecimiento (p. ej. RENSPA, escritura). */
  forAsset(
    organizationId: string,
    assetId: string,
    establishmentId: string,
  ): Promise<DocumentEntity[]> {
    return this.documents
      .createQueryBuilder('doc')
      .where('doc.organizationId = :organizationId', { organizationId })
      .andWhere(
        new Brackets((w) => {
          w.where('doc.assetId = :assetId', { assetId }).orWhere(
            'doc.establishmentId = :establishmentId AND doc.assetId IS NULL',
            { establishmentId },
          );
        }),
      )
      .orderBy('doc.createdAt', 'DESC')
      .getMany();
  }

  save(document: Partial<DocumentEntity>): Promise<DocumentEntity> {
    return this.documents.save(this.documents.create(document));
  }

  async updateReview(
    id: string,
    patch: Pick<DocumentEntity, 'status' | 'reviewedBy' | 'reviewedAt'>,
  ): Promise<void> {
    await this.documents.update({ id }, patch);
  }

  /** Documentos con vencimiento dentro de la ventana indicada (para alertas de monitoreo). */
  expiringForAsset(
    assetId: string,
    establishmentId: string,
    until: string,
  ): Promise<DocumentEntity[]> {
    return this.documents
      .createQueryBuilder('doc')
      .where('doc.expiresAt IS NOT NULL AND doc.expiresAt <= :until', { until })
      .andWhere("doc.status <> 'REJECTED'")
      .andWhere(
        new Brackets((w) => {
          w.where('doc.assetId = :assetId', { assetId }).orWhere(
            'doc.establishmentId = :establishmentId AND doc.assetId IS NULL',
            { establishmentId },
          );
        }),
      )
      .getMany();
  }
}
