import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
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
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
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

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ASSETS_READ)
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.requests.detail(user.organizationId, id);
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
