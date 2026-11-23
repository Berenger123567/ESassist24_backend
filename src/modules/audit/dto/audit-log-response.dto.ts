import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuditResult } from '@prisma/client';

export class AuditLogResponseDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional({ nullable: true })
  actorId: string | null;

  @ApiPropertyOptional({ nullable: true })
  actorRole: string | null;

  @ApiProperty()
  action: string;

  @ApiPropertyOptional({ nullable: true })
  targetType: string | null;

  @ApiPropertyOptional({ nullable: true })
  targetId: string | null;

  @ApiPropertyOptional({ nullable: true })
  before: unknown;

  @ApiPropertyOptional({ nullable: true })
  after: unknown;

  @ApiPropertyOptional({ nullable: true })
  ip: string | null;

  @ApiPropertyOptional({ nullable: true })
  requestId: string | null;

  @ApiProperty({ enum: AuditResult })
  result: AuditResult;

  @ApiPropertyOptional({ nullable: true })
  reason: string | null;

  @ApiProperty()
  createdAt: Date;
}

export class AuditLogPageDto {
  @ApiProperty({ type: [AuditLogResponseDto] })
  data: AuditLogResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  nextCursor: string | null;
}
