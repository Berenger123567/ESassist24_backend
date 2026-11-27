import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, Length } from 'class-validator';

export class CreateSubscriptionDto {
  @ApiProperty({ enum: SubscriptionPlan, example: SubscriptionPlan.PRO })
  @IsEnum(SubscriptionPlan)
  plan: SubscriptionPlan;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;
}

export class CancelSubscriptionDto {
  @ApiPropertyOptional({ example: 'Changement de formule' })
  @IsOptional()
  @Length(0, 500)
  reason?: string;
}

export class SubscriptionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: SubscriptionPlan })
  plan: SubscriptionPlan;

  @ApiProperty({ enum: SubscriptionStatus })
  status: SubscriptionStatus;

  @ApiProperty({ format: 'date-time' })
  startedAt: Date;

  @ApiProperty({ format: 'date-time' })
  currentPeriodEnd: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  cancelledAt: Date | null;

  @ApiProperty()
  autoRenew: boolean;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  professionalProfileId: string | null;
}

export class SubscriptionCheckoutResponseDto {
  @ApiProperty({ format: 'uuid' })
  subscriptionId: string;

  @ApiProperty({ format: 'uuid' })
  intentId: string;

  @ApiProperty()
  reference: string;

  @ApiProperty()
  checkoutUrl: string;

  @ApiProperty()
  amountCents: number;
}

export class SubscriptionPageDto {
  @ApiProperty({ type: [SubscriptionResponseDto] })
  data: SubscriptionResponseDto[];

  @ApiPropertyOptional({ type: String, nullable: true, example: null })
  nextCursor: string | null;
}
