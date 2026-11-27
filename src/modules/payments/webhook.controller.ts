import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WebhookResponseDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Webhooks paiement')
@Controller('webhooks/payments')
export class WebhookController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('cinetpay')
  @HttpCode(200)
  @ApiOperation({ summary: 'Recevoir la notification de paiement CinetPay (corps brut)' })
  @ApiHeader({ name: 'x-cinetpay-signature', required: false })
  @ApiOkResponse({ type: WebhookResponseDto })
  process(
    @Req() request: Request & { body: Buffer | string },
    @Headers('x-cinetpay-signature') signature?: string,
  ) {
    return this.paymentsService.processWebhook(request.body, signature);
  }
}
