import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ERROR_CODES, ErrorCode } from '../errors/error-codes';

export class ErrorBodyDto {
  @ApiProperty({
    enum: Object.values(ERROR_CODES),
    enumName: 'ErrorCode',
    example: ERROR_CODES.VALIDATION_ERROR,
  })
  code: ErrorCode;

  @ApiProperty({ example: 'Les données envoyées sont invalides.' })
  message: string;

  @ApiPropertyOptional({ type: Object, additionalProperties: true })
  details?: Record<string, unknown>;
}

export class ErrorResponseDto {
  @ApiProperty({ type: ErrorBodyDto })
  error: ErrorBodyDto;
}
