import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CoordinatesDto } from '../../../common/geo/coordinates.dto.js';
import {
  CUIT_PATTERN,
  ESTABLISHMENT_TYPES,
  RENSPA_PATTERN,
  TENURE_TYPES,
  type EstablishmentType,
  type Tenure,
} from '../domain/establishment.types.js';

export class CreateEstablishmentDto {
  @ApiProperty({ example: 'La Esperanza' })
  @IsString()
  @Length(2, 160)
  name: string;

  @ApiProperty({ example: 'Agropecuaria La Esperanza S.A.' })
  @IsString()
  @Length(2, 160)
  holderName: string;

  @ApiProperty({ example: '30-71234567-8' })
  @Matches(CUIT_PATTERN, { message: 'CUIT con formato NN-NNNNNNNN-N' })
  holderTaxId: string;

  @ApiPropertyOptional({ example: '06.410.0.00123/00' })
  @IsOptional()
  @Matches(RENSPA_PATTERN, { message: 'RENSPA con formato NN.NNN.N.NNNNN/NN' })
  renspa?: string;

  @ApiProperty({ enum: ESTABLISHMENT_TYPES })
  @IsIn(ESTABLISHMENT_TYPES)
  establishmentType: EstablishmentType;

  @ApiProperty({ enum: TENURE_TYPES })
  @IsIn(TENURE_TYPES)
  tenure: Tenure;

  @ApiProperty({ example: 'Buenos Aires' })
  @IsString()
  @Length(2, 80)
  province: string;

  @ApiPropertyOptional({ example: 'Rauch' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  locality?: string;

  @ApiPropertyOptional({ example: 2450 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  totalAreaHa?: number;

  @ApiProperty({ type: CoordinatesDto })
  @ValidateNested()
  @Type(() => CoordinatesDto)
  location: CoordinatesDto;

  @ApiPropertyOptional({ description: 'GeoJSON Polygon o MultiPolygon (WGS84)' })
  @IsOptional()
  @IsObject()
  boundary?: Record<string, unknown>;
}
