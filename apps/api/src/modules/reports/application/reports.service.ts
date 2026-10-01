import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Actor, AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import type { RequestContext } from '../../../common/auth/decorators.js';
import { sha256Hex } from '../../../common/crypto/hashing.js';
import { InvalidStateError, NotFoundError } from '../../../common/domain/errors.js';
import { QUEUES, type ReportJobData } from '../../../common/queues/queues.js';
import { AuditService } from '../../audit/application/audit.service.js';
import { AUDIT_ACTIONS } from '../../audit/application/audit.types.js';
import { ObjectStorage } from '../../storage/object-storage.js';
import { storageKeys } from '../../storage/storage-keys.js';
import { VerificationRepository } from '../../verification/infrastructure/verification.repository.js';
import type { ReportFormat } from '../domain/report.types.js';
import type { ReportEntity } from '../infrastructure/report.entity.js';
import { ReportsRepository } from '../infrastructure/reports.repository.js';
import { ReportDataBuilder } from './report-data.builder.js';
import { CsvReportRenderer } from './renderers/csv-report.renderer.js';
import { JsonReportRenderer } from './renderers/json-report.renderer.js';
import { PdfReportRenderer } from './renderers/pdf-report.renderer.js';

const CONTENT_TYPES: Record<ReportFormat, { mime: string; extension: string }> = {
  PDF: { mime: 'application/pdf', extension: 'pdf' },
  CSV: { mime: 'text/csv; charset=utf-8', extension: 'csv' },
  JSON: { mime: 'application/json', extension: 'json' },
};

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly pdf = new PdfReportRenderer();
  private readonly csv = new CsvReportRenderer();
  private readonly json = new JsonReportRenderer();

  constructor(
    private readonly reports: ReportsRepository,
    private readonly verification: VerificationRepository,
    private readonly builder: ReportDataBuilder,
    private readonly storage: ObjectStorage,
    private readonly audit: AuditService,
    @InjectQueue(QUEUES.REPORTS) private readonly queue: Queue<ReportJobData>,
  ) {}

  /** Crea (una vez por verificación) el informe y encola su generación. */
  async requestForRun(
    actor: Actor,
    runId: string,
    context?: RequestContext,
  ): Promise<ReportEntity> {
    const organizationId = actor.kind === 'user' ? actor.user.organizationId : actor.organizationId;
    const run = await this.verification.findForOrganization(organizationId, runId);
    if (!run?.asset) throw new NotFoundError('Verificación', runId);
    if (run.status !== 'COMPLETED')
      throw new InvalidStateError('La verificación todavía no finalizó');

    const existing = await this.reports.findByRun(runId);
    if (existing) {
      if (existing.status === 'FAILED') await this.enqueue(existing);
      return existing;
    }
    const report = await this.reports.create({
      organizationId,
      assetId: run.assetId,
      verificationRunId: run.id,
      status: 'PENDING',
      title:
        `Informe de verificación — ${run.asset.establishment?.name ?? ''} — ${run.asset.assetType?.name ?? ''}`.slice(
          0,
          200,
        ),
      requestedBy: actor.kind === 'user' ? actor.user.userId : run.requestedBy,
    });
    await this.audit.record({
      actor,
      action: AUDIT_ACTIONS.REPORT_REQUESTED,
      resourceType: 'report',
      resourceId: report.id,
      metadata: { verificationRunId: runId },
      context,
    });
    await this.enqueue(report);
    return report;
  }

  async regenerate(
    user: AuthenticatedUser,
    reportId: string,
    context: RequestContext,
  ): Promise<ReportEntity> {
    const report = await this.get(user.organizationId, reportId);
    if (report.status === 'GENERATING' || report.status === 'PENDING') {
      throw new InvalidStateError('El informe ya se está generando');
    }
    await this.reports.setStatus(report.id, 'PENDING');
    await this.audit.record({
      actor: { kind: 'user', user },
      action: AUDIT_ACTIONS.REPORT_REQUESTED,
      resourceType: 'report',
      resourceId: report.id,
      metadata: { regenerate: true },
      context,
    });
    await this.enqueue(report);
    return Object.assign(report, { status: 'PENDING' as const });
  }

  async get(organizationId: string, id: string): Promise<ReportEntity> {
    const report = await this.reports.findById(organizationId, id);
    if (!report) throw new NotFoundError('Informe', id);
    return report;
  }

  list(organizationId: string, filters: Parameters<ReportsRepository['list']>[1]) {
    return this.reports.list(organizationId, filters);
  }

  async downloadUrl(
    user: AuthenticatedUser,
    id: string,
    format: ReportFormat,
    context: RequestContext,
  ) {
    const report = await this.get(user.organizationId, id);
    const document = await this.reports.latestDocument(report.id, format);
    if (report.status !== 'READY' || !document)
      throw new InvalidStateError('El informe todavía no está disponible');
    const fileName = `informe-${report.id.slice(0, 8)}-v${document.version}.${CONTENT_TYPES[format].extension}`;
    const url = await this.storage.signedDownloadUrl(document.storageKey, {
      downloadFileName: fileName,
      inline: format === 'PDF',
    });
    await this.audit.record({
      actor: { kind: 'user', user },
      action: AUDIT_ACTIONS.REPORT_DOWNLOADED,
      resourceType: 'report',
      resourceId: report.id,
      metadata: { format, version: document.version, sha256: document.sha256 },
      context,
    });
    return { url, fileName, sha256: document.sha256, version: document.version };
  }

  /** Generación (worker): PDF, CSV y JSON versionados en almacenamiento de objetos. */
  async generate(organizationId: string, reportId: string): Promise<void> {
    const report = await this.reports.findById(organizationId, reportId);
    if (!report) return;
    await this.reports.setStatus(report.id, 'GENERATING');
    try {
      const version = await this.reports.nextVersion(report.id);
      const data = await this.builder.build(report, version, true);
      const outputs: Record<ReportFormat, Buffer> = {
        PDF: await this.pdf.render(data),
        CSV: this.csv.render(data),
        JSON: this.json.render(data),
      };
      for (const [format, body] of Object.entries(outputs) as [ReportFormat, Buffer][]) {
        const key = storageKeys.report(
          organizationId,
          report.id,
          version,
          CONTENT_TYPES[format].extension,
        );
        const sha256 = sha256Hex(body);
        await this.storage.putObject({
          key,
          body,
          contentType: CONTENT_TYPES[format].mime,
          metadata: { sha256 },
        });
        await this.reports.saveDocument({
          organizationId,
          reportId: report.id,
          format,
          version,
          storageKey: key,
          sizeBytes: body.length,
          sha256,
        });
      }
      await this.reports.setStatus(report.id, 'READY', {
        generatedAt: new Date(),
        failureReason: null,
      });
      await this.audit.record({
        actor: { kind: 'system', organizationId, process: 'report-worker' },
        action: AUDIT_ACTIONS.REPORT_GENERATED,
        resourceType: 'report',
        resourceId: report.id,
        metadata: { version, formats: Object.keys(outputs) },
      });
    } catch (error) {
      this.logger.error({ err: error, reportId }, 'Error generando informe');
      await this.reports.setStatus(report.id, 'FAILED', {
        failureReason: (error as Error).message.slice(0, 500),
      });
      throw error;
    }
  }

  private async enqueue(report: ReportEntity) {
    await this.queue.add('generate', {
      kind: 'generate',
      reportId: report.id,
      organizationId: report.organizationId,
    });
  }
}
