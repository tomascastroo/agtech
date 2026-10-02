import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  OmitType,
} from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
  IsUUID,
} from 'class-validator';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import {
  CurrentUser,
  Public,
  ReqContext,
  RequirePermissions,
  type RequestContext,
} from '../../../common/auth/decorators.js';
import { PERMISSIONS } from '../../../common/auth/permissions.js';
import { uploadOptions } from '../../../common/files/file-signature.js';
import { CreateAssetDto } from '../../assets/presentation/assets.dto.js';
import type { UploadedFile as UploadedFileData } from '../../documents/application/documents.service.js';
import {
  MAX_UPLOAD_BYTES,
  presentDocument,
  UploadDocumentDto,
  uploadSchema,
} from '../../documents/presentation/documents.controller.js';
import { DOCUMENT_TYPES } from '../../documents/domain/document.types.js';
import { CreateEstablishmentDto } from '../../establishments/presentation/establishments.dto.js';
import { UploadEvidenceDto } from '../../evidence/presentation/evidence.controller.js';
import { presentEvidence } from '../../evidence/presentation/evidence.presenter.js';
import { GuaranteeRequestsService } from '../application/guarantee-requests.service.js';

class CreateGuaranteeRequestDto {
  @ApiProperty({ example: 'Agropecuaria La Esperanza S.A.' })
  @IsString()
  @Length(2, 160)
  producerName: string;

  @ApiProperty({ example: '30-71548963-1' })
  @Matches(/^\d{2}-\d{8}-\d$/)
  producerTaxId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  producerEmail?: string;

  @ApiProperty({ example: 'BOVINOS', description: 'Tipo de garantía (catálogo de activos)' })
  @Matches(/^[A-Z_]{2,32}$/)
  assetTypeCode: string;

  @ApiPropertyOptional({ example: 1_200_000 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  requestedAmount?: number;

  @ApiPropertyOptional({ enum: ['USD', 'ARS'] })
  @IsOptional()
  @IsIn(['USD', 'ARS'])
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ description: 'Producto de crédito (define el checklist documental)' })
  @IsOptional()
  @Matches(/^[A-Z_]{2,48}$/)
  creditProductCode?: string;

  @ApiPropertyOptional({ type: [String], description: 'Requisitos del producto que no aplican' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @Matches(/^[A-Z_]{2,48}$/, { each: true })
  notApplicableRequirements?: string[];

  @ApiPropertyOptional({ description: 'Establecimiento ya registrado del productor' })
  @IsOptional()
  @IsUUID()
  establishmentId?: string;
}

class RequirementApplicabilityDto {
  @ApiProperty()
  @IsBoolean()
  notApplicable: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

class AcceptInvitationDto {
  @ApiProperty({ example: 'productor@laesperanza.com.ar' })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @Length(10, 128)
  password: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 160)
  fullName?: string;
}

class InformationRequestDto {
  @ApiProperty({ enum: ['DOCUMENT', 'EVIDENCE'] })
  @IsIn(['DOCUMENT', 'EVIDENCE'])
  kind: 'DOCUMENT' | 'EVIDENCE';

  @ApiPropertyOptional({ enum: DOCUMENT_TYPES })
  @IsOptional()
  @IsIn(DOCUMENT_TYPES)
  documentType?: string;

  @ApiPropertyOptional({ description: 'Requisito del checklist que se pide' })
  @IsOptional()
  @Matches(/^[A-Z_]{2,48}$/)
  requirementCode?: string;

  @ApiPropertyOptional({ example: 'Necesitamos la constancia actualizada de titularidad.' })
  @IsOptional()
  @IsString()
  @Length(3, 500)
  message?: string;
}

class ProducerAssetDto extends OmitType(CreateAssetDto, ['establishmentId', 'assetTypeCode']) {}

/** Entidad financiera: crea solicitudes, genera el link y consulta el resultado. */
@ApiTags('Solicitudes de garantía')
@Controller('guarantee-requests')
export class GuaranteeRequestsController {
  constructor(private readonly requests: GuaranteeRequestsService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.ASSETS_WRITE)
  @ApiOperation({ summary: 'Nueva solicitud de garantía: devuelve el link de invitación' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateGuaranteeRequestDto,
    @ReqContext() context: RequestContext,
  ) {
    return this.requests.create(user, dto, context);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.ASSETS_READ)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.requests.list(user.organizationId);
  }

  @Get('new/options')
  @RequirePermissions(PERMISSIONS.ASSETS_WRITE)
  @ApiOperation({ summary: 'Productos de crédito y productores existentes para crear rápido' })
  options(
    @CurrentUser() user: AuthenticatedUser,
    @Query('assetTypeCode') assetTypeCode: string = 'BOVINOS',
  ) {
    return this.requests.creationOptions(user.organizationId, assetTypeCode);
  }

  @Patch(':id/requirements/:code')
  @RequirePermissions(PERMISSIONS.ASSETS_WRITE)
  @ApiOperation({ summary: 'Marca un requisito como NO APLICA (o lo reactiva)' })
  setRequirement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('code') code: string,
    @Body() dto: RequirementApplicabilityDto,
    @ReqContext() context: RequestContext,
  ) {
    return this.requests.setRequirementApplicability(user, id, code, dto, context);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ASSETS_READ)
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.requests.detail(user.organizationId, id);
  }

  @Post(':id/information-requests')
  @RequirePermissions(PERMISSIONS.ASSETS_WRITE)
  @ApiOperation({ summary: 'Pide documentación o evidencia adicional al productor' })
  requestInformation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InformationRequestDto,
    @ReqContext() context: RequestContext,
  ) {
    return this.requests.requestInformation(user, id, dto, context);
  }

  @Post(':id/invitation')
  @RequirePermissions(PERMISSIONS.ASSETS_WRITE)
  @ApiOperation({ summary: 'Genera un nuevo link (invalida el anterior)' })
  renew(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ReqContext() context: RequestContext,
  ) {
    return this.requests.renewInvitation(user, id, context);
  }
}

/**
 * Productor: acceso por link. El token (aleatorio de 256 bits, se guarda su hash, vence a los
 * 30 días) es la credencial y limita cada operación a su solicitud.
 */
@ApiTags('Productor (link de invitación)')
@Public()
@Controller('producer/requests/:token')
export class ProducerRequestsController {
  constructor(private readonly requests: GuaranteeRequestsService) {}

  @Get()
  view(@Param('token') token: string) {
    return this.requests.producerView(token);
  }

  @Post('accept')
  @ApiOperation({
    summary: 'Acepta la invitación y crea el acceso del productor (email y contraseña)',
  })
  accept(
    @Param('token') token: string,
    @Body() dto: AcceptInvitationDto,
    @ReqContext() context: RequestContext,
  ) {
    return this.requests.acceptInvitation(token, dto, context);
  }

  @Post('establishment')
  createEstablishment(
    @Param('token') token: string,
    @Body() dto: CreateEstablishmentDto,
    @ReqContext() context: RequestContext,
  ) {
    return this.requests.producerCreateEstablishment(token, dto, context);
  }

  @Post('asset')
  createAsset(
    @Param('token') token: string,
    @Body() dto: ProducerAssetDto,
    @ReqContext() context: RequestContext,
  ) {
    return this.requests.producerCreateAsset(token, dto, context);
  }

  @Post('documents')
  @ApiConsumes('multipart/form-data')
  @ApiBody(uploadSchema)
  @UseInterceptors(FileInterceptor('file', uploadOptions(MAX_UPLOAD_BYTES)))
  async uploadDocument(
    @Param('token') token: string,
    @UploadedFile() file: UploadedFileData | undefined,
    @Body() dto: UploadDocumentDto,
    @ReqContext() context: RequestContext,
  ) {
    return presentDocument(await this.requests.producerUploadDocument(token, file, dto, context));
  }

  @Post('evidence')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', uploadOptions(20 * 1_048_576)))
  async uploadEvidence(
    @Param('token') token: string,
    @UploadedFile() file: UploadedFileData | undefined,
    @Body() dto: UploadEvidenceDto,
    @ReqContext() context: RequestContext,
  ) {
    return presentEvidence(
      await this.requests.producerUploadEvidence(token, file, dto, context),
      null,
    );
  }

  @Post('submit')
  @ApiOperation({ summary: 'Confirma la declaración: queda lista y se ejecuta la verificación' })
  submit(@Param('token') token: string, @ReqContext() context: RequestContext) {
    return this.requests.producerSubmit(token, context);
  }
}

/**
 * Portal del productor (sesión con rol PRODUCER): solicitudes propias, tareas, carga de
 * evidencia y documentación y respuesta a pedidos de información.
 */
@ApiTags('Portal del productor')
@Controller('producer/me')
export class ProducerPortalController {
  constructor(private readonly requests: GuaranteeRequestsService) {}

  @Get()
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.requests.overview(user);
  }

  @Get('requests/:id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.requests.producerDetail(user, id);
  }

  @Post('requests/:id/establishment')
  async createEstablishment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateEstablishmentDto,
    @ReqContext() context: RequestContext,
  ) {
    await this.requests.establishmentFor(await this.requests.mine(user, id), dto, context);
    return this.requests.producerDetail(user, id);
  }

  @Post('requests/:id/asset')
  async createAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProducerAssetDto,
    @ReqContext() context: RequestContext,
  ) {
    await this.requests.assetFor(await this.requests.mine(user, id), dto, context);
    return this.requests.producerDetail(user, id);
  }

  @Post('requests/:id/documents')
  @ApiConsumes('multipart/form-data')
  @ApiBody(uploadSchema)
  @UseInterceptors(FileInterceptor('file', uploadOptions(MAX_UPLOAD_BYTES)))
  async uploadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedFileData | undefined,
    @Body() dto: UploadDocumentDto,
    @ReqContext() context: RequestContext,
  ) {
    const request = await this.requests.mine(user, id);
    return presentDocument(await this.requests.documentFor(request, file, dto, context));
  }

  @Post('requests/:id/evidence')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', uploadOptions(20 * 1_048_576)))
  async uploadEvidence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedFileData | undefined,
    @Body() dto: UploadEvidenceDto,
    @ReqContext() context: RequestContext,
  ) {
    const request = await this.requests.mine(user, id);
    return presentEvidence(await this.requests.evidenceFor(request, file, dto, context), null);
  }

  @Post('requests/:id/submit')
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ReqContext() context: RequestContext,
  ) {
    await this.requests.submitFor(await this.requests.mine(user, id), context);
    return this.requests.producerDetail(user, id);
  }

  @Post('requests/:id/information-requests/:infoId/respond')
  respond(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('infoId', ParseUUIDPipe) infoId: string,
    @ReqContext() context: RequestContext,
  ) {
    return this.requests.respondInformation(user, id, infoId, context);
  }
}
