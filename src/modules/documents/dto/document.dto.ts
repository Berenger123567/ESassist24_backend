import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentEventType, DocumentStatus, DocumentType } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { DOCUMENT_ALLOWED_CONTENT_TYPES } from '../document-mime.util';

export class CreateDocumentUploadUrlDto {
  @ApiProperty({ enum: DocumentType })
  @IsEnum(DocumentType)
  type: DocumentType;

  @ApiProperty({ maxLength: 255, example: 'diplome.pdf' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName: string;

  @ApiProperty({ enum: [...DOCUMENT_ALLOWED_CONTENT_TYPES], example: 'application/pdf' })
  @IsIn([...DOCUMENT_ALLOWED_CONTENT_TYPES])
  contentType: string;

  @ApiProperty({ minimum: 1, example: 1048576 })
  @IsInt()
  @Min(1)
  sizeBytes: number;
}

export class DocumentUploadUrlResponseDto {
  @ApiProperty({ format: 'uuid' })
  documentId: string;

  @ApiProperty({ example: '/api/v1/pro/documents/upload/eyJwdXJwb3NlIjoi.dHVwYWQi.signature' })
  uploadUrl: string;

  @ApiProperty({ example: 'PUT' })
  method: 'PUT';

  @ApiProperty({ example: 600 })
  expiresInSeconds: number;

  @ApiProperty({ example: { 'Content-Type': 'application/pdf' } })
  headers: Record<string, string>;

  @ApiProperty({ example: '7f6b8e1c-1f2a-4c3d-8e4f-9a0b1c2d3e4f.pdf' })
  storageKey: string;
}

export class UploadDocumentResponseDto {
  @ApiProperty({ format: 'uuid' })
  documentId: string;

  @ApiProperty({ enum: DocumentStatus, example: DocumentStatus.SUBMITTED })
  status: DocumentStatus;
}

export class DocumentDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  ownerId: string;

  @ApiProperty({ enum: DocumentType })
  type: DocumentType;

  @ApiProperty({ enum: DocumentStatus })
  status: DocumentStatus;

  @ApiProperty()
  fileName: string;

  @ApiProperty()
  contentType: string;

  @ApiPropertyOptional({ nullable: true })
  detectedContentType: string | null;

  @ApiProperty()
  sizeBytes: number;

  @ApiPropertyOptional({ nullable: true })
  sha256: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  uploadedAt: Date | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  expiresAt: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}

export class DocumentEventDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  documentId: string;

  @ApiProperty({ enum: DocumentEventType })
  type: DocumentEventType;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  actorId: string | null;

  @ApiPropertyOptional({ nullable: true })
  metadata: unknown;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

export class DocumentDownloadUrlResponseDto {
  @ApiProperty({ format: 'uuid' })
  documentId: string;

  @ApiProperty({ example: '/api/v1/pro/documents/download/eyJwdXJwb3NlIjoi.dG93bmxvYWQ.signature' })
  downloadUrl: string;

  @ApiProperty({ example: 'GET' })
  method: 'GET';

  @ApiProperty({ example: 600 })
  expiresInSeconds: number;
}
