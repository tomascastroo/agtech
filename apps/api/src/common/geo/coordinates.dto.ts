import { ApiProperty } from '@nestjs/swagger';
import { IsLatitude, IsLongitude } from 'class-validator';

export class CoordinatesDto {
  @ApiProperty({ example: -36.0921 })
  @IsLatitude()
  latitude: number;

  @ApiProperty({ example: -60.0254 })
  @IsLongitude()
  longitude: number;
}
