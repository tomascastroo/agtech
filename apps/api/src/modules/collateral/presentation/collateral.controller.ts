import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import {
  CurrentUser,
  ReqContext,
  RequirePermissions,
  type RequestContext,
} from '../../../common/auth/decorators.js';
import { PERMISSIONS } from '../../../common/auth/permissions.js';
import { uploadOptions } from '../../../common/files/file-signature.js';
import { UploadDocumentDto } from '../../documents/presentation/documents.controller.js';
import { UploadEvidenceDto } from '../../evidence/presentation/evidence.controller.js';
import { CollateralCommandsService } from '../application/collateral-commands.service.js';
import { CollateralQueryService } from '../application/collateral-query.service.js';
import { renderPassportPdf } from '../application/passport-pdf.renderer.js';
import {
  COLLATERAL_STATES,
  EVIDENCE_METHODS,
  IMMOBILIZATION_STATUSES,
  INSPECTION_RESULTS,
  LEGAL_INSTRUMENTS,
  LEGAL_STATUSES,
  MOVEMENT_DIRECTIONS,
  MOVEMENT_KINDS,
  PRODUCTION_TYPES,
  RISK_LEVELS,
  type CollateralRiskLevel,
  type EvidenceMethod,
  type ImmobilizationStatus,
  type InspectionResult,
  type LegalInstrument,
  type LegalStatus,
  type MovementDirection,
  type MovementKind,
  type ProductionType,
} from '../domain/collateral.types.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
type UploadedFileType = { buffer: Buffer; originalname: string; mimetype: string; size: number };

class ListQueryDto {
  @ApiPropertyOptional({ enum: COLLATERAL_STATES })
  @IsOptional()
  @IsIn(COLLATERAL_STATES)
  state?: string;
  @ApiPropertyOptional({ enum: RISK_LEVELS }) @IsOptional() @IsIn(RISK_LEVELS) risk?: string;
  @ApiPropertyOptional({ enum: PRODUCTION_TYPES })
  @IsOptional()
  @IsIn(PRODUCTION_TYPES)
  production?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) q?: string;
  @ApiPropertyOptional({ description: 'Incluir garantías de demostración (marcadas DEMO)' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  includeDemo?: boolean;
}

class UpdateGuaranteeDto {
  @ApiPropertyOptional({ enum: LEGAL_INSTRUMENTS })
  @IsOptional()
  @IsIn(LEGAL_INSTRUMENTS)
  legalInstrument?: LegalInstrument;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  legalIdentifier?: string | null;
  @ApiPropertyOptional({ enum: LEGAL_STATUSES })
  @IsOptional()
  @IsIn(LEGAL_STATUSES)
  legalStatus?: LegalStatus;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Min(1) @Max(20) lienPriority?:
    | number
    | null;
  @ApiPropertyOptional({ enum: IMMOBILIZATION_STATUSES })
  @IsOptional()
  @IsIn(IMMOBILIZATION_STATUSES)
  immobilizationStatus?: ImmobilizationStatus;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  immobilizationReference?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber() @Min(0) amount?: number | null;
  @ApiPropertyOptional({ nullable: true, description: 'Deuda vigente' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  debtAmount?: number | null;
  @ApiPropertyOptional({ enum: ['USD', 'ARS'] }) @IsOptional() @IsIn(['USD', 'ARS']) currency?:
    | 'USD'
    | 'ARS';
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Matches(ISO_DATE) grantedAt?:
    | string
    | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Matches(ISO_DATE) expiresAt?:
    | string
    | null;
  @ApiPropertyOptional({ enum: PRODUCTION_TYPES })
  @IsOptional()
  @IsIn(PRODUCTION_TYPES)
  productionType?: ProductionType;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(2000)
  averageWeightKg?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(160) weightSource?:
    | string
    | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber() @Min(0.0001) pricePerKg?:
    | number
    | null;
  @ApiPropertyOptional({ enum: ['USD', 'ARS'], nullable: true })
  @IsOptional()
  @IsIn(['USD', 'ARS', null])
  priceCurrency?: 'USD' | 'ARS' | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(160) priceSource?:
    | string
    | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Matches(ISO_DATE) priceDate?:
    | string
    | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  qualityFactor?: number | null;
}

class CategoryDto {
  @ApiProperty() @IsString() @MaxLength(40) category: string;
  @ApiProperty() @IsInt() @Min(1) heads: number;
}

class DeclarationCorrectionDto {
  @ApiProperty() @IsInt() @Min(1) @Max(1_000_000) heads: number;
  @ApiPropertyOptional({ type: [CategoryDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CategoryDto)
  categories?: CategoryDto[];
  @ApiProperty() @IsString() @MaxLength(500) reason: string;
}

class MovementDto {
  @ApiProperty({ enum: MOVEMENT_DIRECTIONS })
  @IsIn(MOVEMENT_DIRECTIONS)
  direction: MovementDirection;
  @ApiProperty({ enum: MOVEMENT_KINDS }) @IsIn(MOVEMENT_KINDS) kind: MovementKind;
  @ApiProperty() @IsInt() @Min(1) @Max(100_000) heads: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) origin?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) destination?: string;
  @ApiProperty() @IsISO8601() occurredAt: string;
  @ApiPropertyOptional({ description: 'Documento cargado que respalda el movimiento (DT-e)' })
  @IsOptional()
  @IsUUID()
  documentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) dteNumber?: string;
  @ApiPropertyOptional({ type: [String], description: 'Caravanas RFID / identificaciones' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  animalRefs?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

class ReviewMovementDto {
  @ApiProperty({ enum: ['VERIFICADO', 'RECHAZADO'] }) @IsIn(['VERIFICADO', 'RECHAZADO']) state:
    | 'VERIFICADO'
    | 'RECHAZADO';
  @ApiProperty() @IsString() @MaxLength(500) note: string;
}

class InspectionRequestDto {
  @ApiProperty() @IsString() @MaxLength(500) reason: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() dueAt?: string;
}

class DiscrepancyDto {
  @ApiProperty() @IsString() @MaxLength(80) topic: string;
  @ApiProperty() @IsString() @MaxLength(500) description: string;
}

class InspectionRecordDto {
  @ApiProperty() @IsString() @MaxLength(160) inspectorName: string;
  @ApiProperty() @IsISO8601() performedAt: string;
  @ApiPropertyOptional() @IsOptional() @IsLatitude() latitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsLongitude() longitude?: number;
  @ApiProperty() @IsInt() @Min(0) observedHeads: number;
  @ApiProperty({ description: 'El inspector contó todo el rodeo (no una parte)' })
  @IsBoolean()
  fullCount: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) rfidRead?: number;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  evidenceIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) observations?: string;
  @ApiPropertyOptional({ type: [DiscrepancyDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => DiscrepancyDto)
  discrepancies?: DiscrepancyDto[];
  @ApiProperty({ enum: INSPECTION_RESULTS }) @IsIn(INSPECTION_RESULTS) result: InspectionResult;
  @ApiProperty() @IsString() @MaxLength(160) signatureName: string;
  @ApiProperty({ description: 'El inspector firma el acta' })
  @IsBoolean()
  signatureAccepted: boolean;
}

class FinalizeDto {
  @ApiProperty() @IsString() @MaxLength(500) reason: string;
}

class PolicyDto {
  @ApiProperty({ enum: PRODUCTION_TYPES }) @IsIn(PRODUCTION_TYPES) productionType: ProductionType;
  @ApiProperty({ enum: RISK_LEVELS }) @IsIn(RISK_LEVELS) riskLevel: CollateralRiskLevel;
  @ApiProperty() @IsInt() @Min(1) @Max(365) frequencyDays: number;
  @ApiProperty() @IsInt() @Min(1) @Max(730) maxEvidenceAgeDays: number;
  @ApiProperty({ enum: EVIDENCE_METHODS })
  @IsIn(EVIDENCE_METHODS)
  recommendedMethod: EvidenceMethod;
  @ApiProperty() @IsBoolean() requiresInspection: boolean;
}

/**
 * Garantía bovina con verificación continua (Asset Passport). Lectura: permisos de activos y
 * monitoreo. Escritura: gestión de monitoreo (datos de la garantía, movimientos, inspecciones,
 * recálculo) y verificaciones (evidencia, verificación nueva).
 */
@ApiTags('Garantías bovinas')
@Controller('bovine-guarantees')
export class CollateralController {
  constructor(
    private readonly query: CollateralQueryService,
    private readonly commands: CollateralCommandsService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MONITORING_READ)
  @ApiOperation({
    summary: 'Cartera de garantías bovinas: KPIs (solo datos reales) y tabla filtrable',
  })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListQueryDto) {
    return this.query.dashboard(user.organizationId, query);
  }

  @Get('policies')
  @RequirePermissions(PERMISSIONS.MONITORING_READ)
  @ApiOperation({ summary: 'Frecuencias de verificación vigentes por tipo de producción y riesgo' })
  policies(@CurrentUser() user: AuthenticatedUser) {
    return this.query.policies(user.organizationId);
  }

  @Put('policies')
  @RequirePermissions(PERMISSIONS.MONITORING_MANAGE)
  @ApiOperation({
    summary: 'Configura la frecuencia de un tipo de producción y nivel de riesgo (organización)',
  })
  upsertPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PolicyDto,
    @ReqContext() context: RequestContext,
  ) {
    return this.commands.upsertPolicy(user, dto, context);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.MONITORING_READ)
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const { raw: _raw, ...head } = await this.query.summary(user.organizationId, id);
    return head;
  }

  @Get(':id/passport')
  @RequirePermissions(PERMISSIONS.MONITORING_READ)
  @ApiOperation({ summary: 'Asset Passport completo' })
  passport(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.query.passport(user.organizationId, id);
  }

  @Get(':id/passport.pdf')
  @RequirePermissions(PERMISSIONS.REPORTS_READ)
  @ApiOperation({ summary: 'ASSET PASSPORT — GARANTÍA BOVINA en PDF' })
  async passportPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const passport = await this.query.passport(user.organizationId, id);
    const pdf = await renderPassportPdf(passport, `${user.fullName} (${user.organizationName})`);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="asset-passport-${passport.header.code}.pdf"`,
    });
  }

  @Get(':id/timeline')
  @RequirePermissions(PERMISSIONS.MONITORING_READ)
  timeline(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.query.timeline(user.organizationId, id);
  }

  @Get(':id/score')
  @RequirePermissions(PERMISSIONS.MONITORING_READ)
  async score(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const s = await this.query.snapshot(user.organizationId, id);
    return s
      ? {
          score: s.score,
          weightedScore: s.weighted_score,
          state: s.state,
          stateReason: s.state_reason,
          components: s.components,
          gates: s.gates,
          riskLevel: s.risk_level,
          riskFactors: s.risk_factors,
          engineVersion: s.engine_version,
          evaluatedAt: s.evaluated_at,
        }
      : null;
  }

  @Get(':id/coverage')
  @RequirePermissions(PERMISSIONS.MONITORING_READ)
  async coverage(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const s = await this.query.snapshot(user.organizationId, id);
    return s?.coverage ?? { status: 'NO_DETERMINABLE', missing: ['evaluación'] };
  }

  @Get(':id/alerts')
  @RequirePermissions(PERMISSIONS.ALERTS_READ)
  alerts(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.query.alerts(user.organizationId, id);
  }

  @Get(':id/verifications')
  @RequirePermissions(PERMISSIONS.MONITORING_READ)
  verifications(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.query.verifications(user.organizationId, id);
  }

  @Get(':id/movements')
  @RequirePermissions(PERMISSIONS.MONITORING_READ)
  movements(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.query.movements(user.organizationId, id);
  }

  @Get(':id/inspections')
  @RequirePermissions(PERMISSIONS.MONITORING_READ)
  inspections(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.query.inspections(user.organizationId, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.MONITORING_MANAGE)
  @ApiOperation({ summary: 'Datos legales, deuda y parámetros de valuación (con su fuente)' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGuaranteeDto,
    @ReqContext() context: RequestContext,
  ) {
    await this.commands.update(user, id, dto, context);
    return this.get(user, id);
  }

  @Post(':id/declaration')
  @RequirePermissions(PERMISSIONS.MONITORING_MANAGE)
  @ApiOperation({
    summary: 'Corrige la declaración creando una versión nueva (la anterior se conserva)',
  })
  correct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeclarationCorrectionDto,
    @ReqContext() context: RequestContext,
  ) {
    return this.commands.correctDeclaration(user, id, dto, context);
  }

  @Post(':id/movements')
  @RequirePermissions(PERMISSIONS.MONITORING_MANAGE)
  @ApiOperation({
    summary: 'Registra un egreso/ingreso (DOCUMENTADO con DT-e cargado, o DECLARADO)',
  })
  movement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MovementDto,
    @ReqContext() context: RequestContext,
  ) {
    return this.commands.recordMovement(user, id, dto, context);
  }

  @Patch(':id/movements/:movementId')
  @RequirePermissions(PERMISSIONS.MONITORING_MANAGE)
  async reviewMovement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('movementId', ParseUUIDPipe) movementId: string,
    @Body() dto: ReviewMovementDto,
    @ReqContext() context: RequestContext,
  ) {
    await this.commands.reviewMovement(user, id, movementId, dto, context);
    return { ok: true };
  }

  @Post(':id/verify')
  @RequirePermissions(PERMISSIONS.VERIFICATIONS_RUN)
  @ApiOperation({ summary: 'Verificación nueva con el pipeline (evidencia disponible del rodeo)' })
  verify(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ReqContext() context: RequestContext,
  ) {
    return this.commands.requestVerification(user, id, context);
  }

  @Post(':id/evidence')
  @RequirePermissions(PERMISSIONS.EVIDENCE_WRITE)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Foto nueva (cámara o archivo, con GPS) + verificación' })
  @UseInterceptors(FileInterceptor('file', uploadOptions(20 * 1_048_576)))
  evidence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedFileType | undefined,
    @Body() dto: UploadEvidenceDto,
    @ReqContext() context: RequestContext,
  ) {
    return this.commands.uploadEvidence(user, id, file, dto, context);
  }

  @Post(':id/documents')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_WRITE)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Documento oficial cargado (RENSPA, existencias, DT-e, TRAZA, prenda...)',
  })
  @UseInterceptors(FileInterceptor('file', uploadOptions(15 * 1_048_576)))
  async document(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedFileType | undefined,
    @Body() dto: UploadDocumentDto,
    @ReqContext() context: RequestContext,
  ) {
    const doc = await this.commands.uploadDocument(user, id, file, dto, context);
    return { id: doc.id, type: doc.type, title: doc.title, sha256: doc.sha256 };
  }

  @Post(':id/inspection')
  @RequirePermissions(PERMISSIONS.MONITORING_MANAGE)
  @ApiOperation({ summary: 'Solicita una inspección presencial' })
  requestInspection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InspectionRequestDto,
    @ReqContext() context: RequestContext,
  ) {
    return this.commands.requestInspection(user, id, dto, context);
  }

  @Post(':id/inspection/record')
  @RequirePermissions(PERMISSIONS.VERIFICATIONS_RUN)
  @ApiOperation({
    summary: 'Registra una inspección realizada sin solicitud previa (acta firmada)',
  })
  recordInspection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InspectionRecordDto,
    @ReqContext() context: RequestContext,
  ) {
    return this.commands.recordInspection(user, id, null, dto, context);
  }

  @Post(':id/inspection/:inspectionId')
  @RequirePermissions(PERMISSIONS.VERIFICATIONS_RUN)
  @ApiOperation({ summary: 'Registra el resultado de una inspección solicitada (acta firmada)' })
  completeInspection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('inspectionId', ParseUUIDPipe) inspectionId: string,
    @Body() dto: InspectionRecordDto,
    @ReqContext() context: RequestContext,
  ) {
    return this.commands.recordInspection(user, id, inspectionId, dto, context);
  }

  @Post(':id/recalculate')
  @RequirePermissions(PERMISSIONS.MONITORING_MANAGE)
  @ApiOperation({ summary: 'Recalcula score, riesgo, cobertura, estado y agenda' })
  recalculate(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.commands.recalculate(user, id);
  }

  @Post(':id/finalize')
  @RequirePermissions(PERMISSIONS.MONITORING_MANAGE)
  async finalize(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FinalizeDto,
    @ReqContext() context: RequestContext,
  ) {
    await this.commands.finalize(user, id, dto, context);
    return this.get(user, id);
  }
}

/** Productor: ve su declaración congelada y pide correcciones (crean una versión nueva). */
@ApiTags('Portal del productor')
@Controller('producer/me/requests/:id/declaration')
export class ProducerDeclarationController {
  constructor(
    private readonly query: CollateralQueryService,
    private readonly commands: CollateralCommandsService,
  ) {}

  @Get()
  view(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.query.producerView(user.userId, id);
  }

  @Post('corrections')
  async correct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeclarationCorrectionDto,
    @ReqContext() context: RequestContext,
  ) {
    await this.commands.correctDeclaration(user, id, dto, context, true);
    return this.query.producerView(user.userId, id);
  }
}
