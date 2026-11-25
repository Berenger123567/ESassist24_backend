import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ example: 'Je suis en route.' })
  @IsString()
  @Length(1, 2000)
  body: string;
}

export class MarkReadDto {
  @ApiProperty({ format: 'uuid', description: 'Identifiant numérique du dernier message lu' })
  @IsString()
  @Length(1, 30)
  messageId: string;
}

export class MessageResponseDto {
  @ApiProperty({ example: '42' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  conversationId: string;

  @ApiProperty({ format: 'uuid' })
  senderId: string;

  @ApiProperty()
  body: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  deletedAt: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

export class MessagePageDto {
  @ApiProperty({ type: [MessageResponseDto] })
  data: MessageResponseDto[];

  @ApiPropertyOptional({ type: String, nullable: true })
  nextCursor: string | null;
}

export class ConversationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  missionId: string;

  @ApiProperty({ format: 'date-time' })
  lastMessageAt: Date;
}

export class ConversationPageDto {
  @ApiProperty({ type: [ConversationResponseDto] })
  data: ConversationResponseDto[];

  @ApiPropertyOptional({ type: String, nullable: true, example: null })
  nextCursor: string | null;
}
