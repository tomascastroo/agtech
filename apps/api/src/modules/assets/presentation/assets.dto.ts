import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CoordinatesDto } from '../../../common/geo/coordinates.dto.js';
import { PaginationQueryDto } from '../../../common/pagination/pagination.js';
import {
  ASSET_STATUSES,
  CURRENCIES,
  type AssetStatus,
  type Currency,
} from '../domain/asset.types.js';

export class CreateAssetDto {
  @ApiProperty()
  @IsUUID()
  establishmentId: string;

  @ApiProperty({ example: 'BOVINOS' })
  @Matches(/^[A-Z_]{2,32}$/)
  assetTypeCode: string;

  @ApiProperty({ example: 'Rodeo de cría — La Esperanza' })
  @IsString()
  @Length(2, 160)
  name: string;

  @ApiProperty({ example: 1500 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000_000)
  declaredQuantity: number;

  @ApiPropertyOptional({ example: 1_350_000 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  declaredValue?: number;

  @ApiPropertyOptional({ enum: CURRENCIES })
  @IsOptional()
  @IsIn(CURRENCIES)
  currency?: Currency;

  @ApiPropertyOptional({ type: CoordinatesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CoordinatesDto)
  location?: CoordinatesDto;

  @ApiPropertyOptional({ description: 'GeoJSON Polygon/MultiPolygon de la superficie' })
  @IsOptional()
  @IsObject()
  area?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Metadata específica del tipo (validada contra su esquema)' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateAssetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  declaredQuantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  declaredValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class AssetListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ASSET_STATUSES })
  @IsOptional()
  @IsIn(ASSET_STATUSES)
  status?: AssetStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[A-Z_]{2,32}$/)
  assetTypeCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  establishmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;
}
