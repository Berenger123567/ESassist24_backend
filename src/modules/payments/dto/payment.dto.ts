import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PaymentProvider,
  PaymentStatus,
  ProviderEventStatus,
  ReconciliationStatus,
} from '@prisma/client';
import { IsDateString, IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';

export class CinetPayWebhookDto {
  @ApiProperty()
  @IsString()
  @Length(1, 200)
  eventId: string;

  @ApiProperty()
  @IsString()
  @Length(1, 100)
  eventType: string;

  @ApiProperty()
  @IsString()
  @Length(1, 200)
  reference: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  amountCents: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 100)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 200)
  providerPaymentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  currency?: string | number;

  @ApiPropertyOptional()
  @IsOptional()
  timestamp?: string | number;
}

export class PaymentIntentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  reference: string;

  @ApiProperty({ enum: PaymentProvider })
  provider: PaymentProvider;

  @ApiProperty()
  amountCents: number;

  @ApiProperty()
  currency: string;

  @ApiProperty({ enum: PaymentStatus })
  status: PaymentStatus;

  @ApiPropertyOptional({ type: String, nullable: true })
  checkoutUrl: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  providerPaymentId: string | null;

  @ApiProperty({ format: 'date-time' })
  expiresAt: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  confirmedAt: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

export class PaymentConfirmationResponseDto {
  @ApiProperty({ format: 'uuid' })
  intentId: string;

  @ApiProperty({ enum: PaymentStatus })
  status: PaymentStatus;

  @ApiProperty({ example: true })
  alreadyConfirmed: boolean;
}

export class WebhookResponseDto {
  @ApiProperty()
  eventId: string;

  @ApiProperty({ enum: ProviderEventStatus })
  status: ProviderEventStatus;

  @ApiProperty({ example: true })
  received: true;
}

export class ReconciliationQueryDto {
  @ApiPropertyOptional({ example: '2026-11-26' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString()
  date?: string;
}

export class ReconciliationReportResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'date' })
  date: Date;

  @ApiProperty({ enum: ReconciliationStatus })
  status: ReconciliationStatus;

  @ApiProperty()
  expectedCents: number;

  @ApiProperty()
  actualCents: number;

  @ApiProperty()
  discrepancyCents: number;

  @ApiProperty()
  details: Record<string, unknown>;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}
