import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuditResult } from '@prisma/client';

export class AuditLogResponseDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  actorId: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  actorRole: string | null;

  @ApiProperty()
  action: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  targetType: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  targetId: string | null;

  @ApiPropertyOptional({ type: Object, additionalProperties: true, nullable: true })
  before: unknown;

  @ApiPropertyOptional({ type: Object, additionalProperties: true, nullable: true })
  after: unknown;

  @ApiPropertyOptional({ type: String, nullable: true })
  ip: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  requestId: string | null;

  @ApiProperty({ enum: AuditResult })
  result: AuditResult;

  @ApiPropertyOptional({ type: String, nullable: true })
  reason: string | null;

  @ApiProperty()
  createdAt: Date;
}

export class AuditLogPageDto {
  @ApiProperty({ type: [AuditLogResponseDto] })
  data: AuditLogResponseDto[];

  @ApiPropertyOptional({ type: String, nullable: true })
  nextCursor: string | null;
}
