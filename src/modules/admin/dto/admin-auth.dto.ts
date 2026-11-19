import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { AuthTokensDto } from '../../auth/dto/auth.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class AdminLoginDto {
  @ApiProperty({ example: '+22997000000' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone: string;

  @ApiProperty({ example: 'AdminTest123!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password: string;

  @ApiPropertyOptional({ description: 'Identifiant appareil (mobile/web)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceId?: string;
}

export class AdminMfaVerifyDto {
  @ApiProperty({ description: 'Jeton de défi MFA retourné par /admin/auth/login' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  mfaToken: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code: string;

  @ApiPropertyOptional({ description: 'Identifiant appareil (mobile/web)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceId?: string;
}

export class AdminTotpActivateDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code: string;
}

export class AdminMfaChallengeResponseDto {
  @ApiProperty({ example: true })
  mfaRequired: boolean;

  @ApiProperty()
  mfaToken: string;
}

export class AdminSessionResponseDto extends AuthTokensDto {
  @ApiProperty({ example: false })
  mfaRequired: boolean;
}

export class AdminTotpEnrollResponseDto {
  @ApiProperty()
  secret: string;

  @ApiProperty()
  uri: string;

  @ApiProperty({ example: true })
  enrolled: boolean;
}

export class AdminTotpActivateResponseDto {
  @ApiProperty({ example: true })
  enabled: boolean;
}

export type AdminSessionResult = AuthTokensDto & {
  isNewUser: boolean;
  mfaRequired: boolean;
};

export type AdminLoginResult = AdminSessionResult | AdminMfaChallengeResponseDto;
