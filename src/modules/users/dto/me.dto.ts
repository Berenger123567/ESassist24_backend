import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ZoneSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'BJ-LIT-COTONOU' })
  code: string;

  @ApiProperty({ example: 'Cotonou' })
  name: string;

  @ApiProperty({ example: 'Littoral' })
  department: string;
}

export class MeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: '+22997000000' })
  phone: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  firstName: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty({ example: 'ACTIVE' })
  status: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  photoDocumentId: string | null;

  @ApiPropertyOptional({ type: () => ZoneSummaryDto, nullable: true })
  zone: ZoneSummaryDto | null;

  @ApiProperty({ example: ['CLIENT'] })
  roles: string[];

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}
