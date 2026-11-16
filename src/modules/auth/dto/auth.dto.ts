import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({ example: '+22997000000', description: 'Numéro de téléphone béninois' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone: string;

  @ApiPropertyOptional({ enum: ['SMS', 'WHATSAPP'], default: 'SMS' })
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiPropertyOptional({ description: 'Identifiant appareil (mobile/web)' })
  @IsOptional()
  @IsString()
  deviceId?: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '+22997000000' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code: string;

  @ApiPropertyOptional({ description: 'Identifiant appareil (mobile/web)' })
  @IsOptional()
  @IsString()
  deviceId?: string;
}

export class RefreshTokenDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  refreshToken?: string;

  @ApiPropertyOptional({ description: 'Identifiant appareil (mobile/web)' })
  @IsOptional()
  @IsString()
  deviceId?: string;
}

export class AuthUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: ['CLIENT'] })
  roles: string[];
}

export class AuthTokensDto {
  @ApiProperty()
  accessToken: string;

  @ApiPropertyOptional({ description: 'Absent pour le web (cookie HttpOnly).' })
  @IsOptional()
  refreshToken?: string;

  @ApiProperty({ example: 900, description: "Durée du jeton d'accès en secondes" })
  expiresIn: number;

  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto;

  @ApiPropertyOptional({ description: 'Indique si le compte vient d’être créé.' })
  @IsOptional()
  isNewUser?: boolean;

  @ApiPropertyOptional({ description: 'Jeton CSRF retourné pour le mode web' })
  @IsOptional()
  csrfToken?: string;
}

export class RequestOtpResponseDto {
  @ApiProperty({ example: 60 })
  retryAfterSeconds: number;

  @ApiPropertyOptional({ example: 60 })
  resendAfterSeconds?: number;

  @ApiPropertyOptional({ example: 300 })
  expiresInSeconds?: number;
}
