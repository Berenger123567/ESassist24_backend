import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export const ADMIN_INVITATION_ROLES = ['ADMIN', 'EVALUATOR'] as const;
export type AdminInvitationRole = (typeof ADMIN_INVITATION_ROLES)[number];

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateAdminInvitationDto {
  @ApiProperty({ example: '+22997000000' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone: string;

  @ApiProperty({ enum: [...ADMIN_INVITATION_ROLES] })
  @IsIn([...ADMIN_INVITATION_ROLES])
  role: AdminInvitationRole;

  @ApiPropertyOptional({ format: 'email' })
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;
}

export class CreateEvaluatorDto {
  @ApiProperty({ example: '+22997000000' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone: string;

  @ApiPropertyOptional({ format: 'email' })
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;
}

export class AcceptAdminInvitationDto {
  @ApiProperty({ description: 'Jeton brut transmis dans le lien d’invitation' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  token: string;

  @ApiProperty({ example: 'AdminTest123!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password: string;

  @ApiPropertyOptional({ example: 'Jean' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Dossou' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 100)
  lastName?: string;
}

export class AdminInvitationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: '+22997000000' })
  phone: string;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'email' })
  email: string | null;

  @ApiProperty({ enum: [...ADMIN_INVITATION_ROLES] })
  role: string;

  @ApiProperty({ example: 'PENDING' })
  status: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt: Date;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  acceptedAt: Date | null;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  revokedAt: Date | null;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  invitedByUserId: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

export class CreatedAdminInvitationResponseDto extends AdminInvitationResponseDto {
  @ApiProperty({ description: 'Jeton d’invitation à transmettre une seule fois' })
  token: string;

  @ApiProperty({ example: '/admin/accept-invitation?token=...' })
  inviteUrl: string;
}

export class AcceptAdminInvitationResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ example: '+22997000000' })
  phone: string;

  @ApiProperty({ example: ['CLIENT', 'ADMIN'], type: [String] })
  roles: string[];

  @ApiProperty({ example: true })
  mfaEnrollmentRequired: boolean;
}
