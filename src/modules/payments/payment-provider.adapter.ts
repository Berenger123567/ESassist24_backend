import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProvider } from '@prisma/client';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';

export interface CreatePaymentInput {
  reference: string;
  amountCents: number;
  currency: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface CreatePaymentResult {
  providerPaymentId: string;
  checkoutUrl: string;
  token: string;
}

export interface ReferenceVerificationResult {
  confirmed: boolean;
  providerPaymentId?: string;
  amountCents?: number;
  status?: string;
}

export interface PaymentProviderGateway {
  readonly provider: PaymentProvider;
  readonly sandbox: boolean;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyReference(reference: string): Promise<ReferenceVerificationResult>;
}

@Injectable()
export class PaymentProviderAdapter implements PaymentProviderGateway {
  private static readonly LIVE_PAYMENT_URL = 'https://api-checkout.cinetpay.com/v2/payment';
  private static readonly LIVE_VERIFY_URL = 'https://api-checkout.cinetpay.com/v2/payment/check';
  private static readonly SANDBOX_CHECKOUT_URL = 'https://sandbox.cinetpay.com/checkout';

  constructor(private readonly config: ConfigService) {}

  get provider(): PaymentProvider {
    return PaymentProvider.CINETPAY;
  }

  get sandbox(): boolean {
    return this.config.get<string>('PAYMENT_SANDBOX', 'true') === 'true';
  }

  get webhookSecret(): string {
    return this.config.getOrThrow<string>('CINETPAY_WEBHOOK_SECRET');
  }

  createToken(reference: string, amountCents: number, currency: string): string {
    const siteId = this.config.get<string>('CINETPAY_SITE_ID', '');
    return this.hmac(`${siteId}:${reference}:${amountCents}:${currency}`);
  }

  computeDigest(rawBody: Buffer | string): string {
    return this.hmac(rawBody);
  }

  computeSignature(rawBody: Buffer | string, eventId?: string): string {
    const digest = this.computeDigest(rawBody);
    return eventId ? this.hmac(`${digest}:${eventId}`) : digest;
  }

  generateToken(reference: string, amountCents: number, currency: string): string {
    return this.createToken(reference, amountCents, currency);
  }

  generateDigest(rawBody: Buffer | string): string {
    return this.computeDigest(rawBody);
  }

  generateSignature(rawBody: Buffer | string, eventId?: string): string {
    return this.computeSignature(rawBody, eventId);
  }

  verifySignature(
    rawBody: Buffer | string,
    signature: string | null | undefined,
    eventId?: string,
  ): boolean {
    return this.verifyWebhookSignature(rawBody, signature, eventId);
  }

  verifyWebhookSignature(
    rawBody: Buffer | string,
    signature: string | null | undefined,
    eventId?: string,
  ): boolean {
    if (!signature) {
      return false;
    }
    const normalized = this.normalizeSignature(signature);
    if (!normalized) {
      return false;
    }
    const candidates = [this.computeSignature(rawBody)];
    if (eventId) {
      candidates.push(this.computeSignature(rawBody, eventId));
    }
    return candidates.some((candidate) => this.matchesSignature(candidate, normalized));
  }

  assertWebhookSignature(
    rawBody: Buffer | string,
    signature: string | null | undefined,
    eventId?: string,
  ): void {
    if (!this.verifyWebhookSignature(rawBody, signature, eventId)) {
      throw new ApiError(
        ERROR_CODES.PAYMENT_WEBHOOK_SIGNATURE_INVALID,
        401,
        'Signature du webhook invalide.',
      );
    }
  }

  isTimestampFresh(timestamp: unknown): boolean {
    const seconds = this.toEpochSeconds(timestamp);
    if (seconds === null) {
      return false;
    }
    const tolerance = this.config.get<number>('PAYMENT_WEBHOOK_TOLERANCE_SECONDS', 300);
    return Math.abs(Date.now() / 1000 - seconds) <= tolerance;
  }

  assertFreshTimestamp(timestamp: unknown): void {
    if (timestamp === undefined || timestamp === null || timestamp === '') {
      return;
    }
    if (!this.isTimestampFresh(timestamp)) {
      throw new ApiError(
        ERROR_CODES.PAYMENT_WEBHOOK_REPLAYED,
        409,
        'Événement de paiement trop ancien.',
      );
    }
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    this.assertAmount(input.amountCents);
    const token = this.createToken(input.reference, input.amountCents, input.currency);

    if (this.sandbox) {
      return {
        providerPaymentId: `sandbox-${input.reference}`,
        checkoutUrl: `${PaymentProviderAdapter.SANDBOX_CHECKOUT_URL}/${encodeURIComponent(
          input.reference,
        )}?amount=${input.amountCents}&currency=${encodeURIComponent(input.currency)}`,
        token,
      };
    }

    const response = await fetch(PaymentProviderAdapter.LIVE_PAYMENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.get<string>('CINETPAY_API_KEY', ''),
      },
      body: JSON.stringify({
        site_id: this.config.get<string>('CINETPAY_SITE_ID', ''),
        apikey: this.config.get<string>('CINETPAY_API_KEY', ''),
        transaction_id: input.reference,
        amount: input.amountCents,
        currency: input.currency,
        description: input.description,
        metadata: input.metadata ?? {},
      }),
    });

    if (!response.ok) {
      throw new ApiError(
        ERROR_CODES.PAYMENT_PROVIDER_ERROR,
        502,
        'Paiement refuse par le fournisseur.',
      );
    }

    const data = (await response.json()) as {
      code?: string;
      message?: string;
      data?: { payment_id?: string; payment_url?: string };
      payment_id?: string;
      payment_url?: string;
    };
    const success = data.code === '00' || data.code === '0' || data.code === undefined;
    const providerPaymentId = data.data?.payment_id ?? data.payment_id;
    const checkoutUrl = data.data?.payment_url ?? data.payment_url;
    if (!success || !providerPaymentId || !checkoutUrl) {
      throw new ApiError(
        ERROR_CODES.PAYMENT_PROVIDER_ERROR,
        502,
        'Reponse du fournisseur de paiement invalide.',
      );
    }
    return { providerPaymentId, checkoutUrl, token };
  }

  async verifyReference(reference: string): Promise<ReferenceVerificationResult> {
    if (this.sandbox) {
      return {
        confirmed: true,
        providerPaymentId: `sandbox-${reference}`,
        status: 'SUCCESS',
      };
    }

    const response = await fetch(
      `${PaymentProviderAdapter.LIVE_VERIFY_URL}?transaction_id=${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          'x-api-key': this.config.get<string>('CINETPAY_API_KEY', ''),
        },
      },
    );
    if (!response.ok) {
      throw new ApiError(
        ERROR_CODES.PAYMENT_PROVIDER_ERROR,
        502,
        'Verification du paiement impossible.',
      );
    }
    const data = (await response.json()) as {
      code?: string;
      data?: {
        transaction_id?: string;
        payment_id?: string;
        amount?: number;
        status?: string;
      };
    };
    const payment = data.data;
    return {
      confirmed: data.code === '00' && payment?.status === 'SUCCESS',
      providerPaymentId: payment?.payment_id ?? payment?.transaction_id,
      amountCents: payment?.amount,
      status: payment?.status,
    };
  }

  private assertAmount(amountCents: number): void {
    if (!Number.isInteger(amountCents) || amountCents < 0) {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Montant de paiement invalide.');
    }
  }

  private hmac(value: Buffer | string): string {
    return createHmac('sha256', this.webhookSecret).update(value).digest('hex');
  }

  private matchesSignature(expected: string, provided: string): boolean {
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (provided.length === expected.length && /^[0-9a-fA-F]+$/.test(provided)) {
      const providedBuffer = Buffer.from(provided, 'hex');
      return (
        providedBuffer.length === expectedBuffer.length &&
        timingSafeEqual(providedBuffer, expectedBuffer)
      );
    }
    const providedBase64 = Buffer.from(provided, 'base64');
    return (
      providedBase64.length === expectedBuffer.length &&
      timingSafeEqual(providedBase64, expectedBuffer)
    );
  }

  private normalizeSignature(signature: string): string {
    let value = signature.trim();
    const separator = value.indexOf('=');
    if (separator >= 0 && /^(sha256|v1|hmac)$/i.test(value.slice(0, separator))) {
      value = value.slice(separator + 1);
    }
    return value.replace(/^0x/i, '');
  }

  private toEpochSeconds(timestamp: unknown): number | null {
    if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
      return timestamp > 1e12 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
    }
    if (typeof timestamp === 'string' && timestamp.trim() !== '') {
      const numeric = Number(timestamp);
      if (Number.isFinite(numeric)) {
        return numeric > 1e12 ? Math.floor(numeric / 1000) : Math.floor(numeric);
      }
      const parsed = Date.parse(timestamp);
      return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
    }
    if (timestamp instanceof Date) {
      return Math.floor(timestamp.getTime() / 1000);
    }
    return null;
  }
}
