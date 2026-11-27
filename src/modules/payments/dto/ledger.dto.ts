import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LedgerAccountType, LedgerEntryReason, LedgerEntryType } from '@prisma/client';

export class LedgerAccountResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: LedgerAccountType })
  ownerType: LedgerAccountType;

  @ApiProperty()
  currency: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

export class LedgerEntryResponseDto {
  @ApiProperty({ example: '12' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  accountId: string;

  @ApiProperty({ enum: LedgerEntryType })
  entryType: LedgerEntryType;

  @ApiProperty()
  amountCents: number;

  @ApiProperty({ enum: LedgerEntryReason })
  reason: LedgerEntryReason;

  @ApiProperty()
  reference: string;

  @ApiProperty()
  priorBalanceCents: number;

  @ApiProperty()
  balanceCents: number;

  @ApiPropertyOptional({ type: String, example: '11', nullable: true })
  reversalOfId: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

export class LedgerEntryPageDto {
  @ApiProperty({ type: [LedgerEntryResponseDto] })
  data: LedgerEntryResponseDto[];

  @ApiPropertyOptional({ type: String, nullable: true, example: null })
  nextCursor: string | null;
}
