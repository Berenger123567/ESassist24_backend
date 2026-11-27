import { createHash, randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  FeeKind,
  LedgerAccountType,
  LedgerEntryReason,
  LedgerEntryType,
  NotificationType,
  PaymentIntent,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  ProviderEventStatus,
  QuoteStatus,
  ReconciliationStatus,
  RoleCode,
  UserStatus,
} from '@prisma/client';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { AuthUser } from '../../common/types/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CinetPayWebhookDto,
  PaymentConfirmationResponseDto,
  PaymentIntentResponseDto,
  ReconciliationReportResponseDto,
  WebhookResponseDto,
} from './dto/payment.dto';
import { LedgerService, PLATFORM_LEDGER_OWNER_ID } from './ledger.service';
import { PaymentProviderAdapter } from './payment-provider.adapter';
import { activateSubscriptionForIntent } from './subscriptions.service';

const INTENT_TTL_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface FinalizeResult {
  already: boolean;
  outboxIds: string[];
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly provider: PaymentProviderAdapter,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async createMissionIntent(user: AuthUser, missionId: string): Promise<PaymentIntentResponseDto> {
    if (!user.roles.includes(RoleCode.CLIENT)) {
      throw new ApiError(ERROR_CODES.FORBIDDEN, 403, 'Reserve aux clients.');
    }
    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
      select: { clientId: true },
    });
    if (!mission) {
      throw new ApiError(ERROR_CODES.NOT_FOUND, 404, 'Mission introuvable.');
    }
    if (mission.clientId !== user.id) {
      throw new ApiError(ERROR_CODES.PAYMENT_INTENT_NOT_OWNED, 403, 'Mission non appartenu.');
    }
    const quote = await this.prisma.quote.findFirst({
      where: { missionId, status: QuoteStatus.ACCEPTED },
      orderBy: { version: 'desc' },
    });
    if (!quote) {
      throw new ApiError(ERROR_CODES.NOT_FOUND, 404, 'Devis accepte introuvable.');
    }
    const fees = await this.ledger.computeMissionFees(quote.totalCents);
    const existing = await this.prisma.paymentIntent.findUnique({ where: { missionId } });
    if (existing) {
      if (existing.status === PaymentStatus.CONFIRMED) {
        throw new ApiError(ERROR_CODES.PAYMENT_ALREADY_CONFIRMED, 409, 'Paiement deja confirme.');
      }
      return this.toIntentDto(existing);
    }

    const reference = `MISSION-${missionId.slice(0, 8)}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    const now = new Date();
    const payment = await this.provider.createPayment({
      reference,
      amountCents: fees.totalCents,
      currency: quote.currency,
      description: `Paiement mission ${missionId}`,
      metadata: { missionId, quoteId: quote.id },
    });

    try {
      const intent = await this.prisma.$transaction(async (tx) => {
        const created = await tx.paymentIntent.create({
          data: {
            reference,
            clientId: user.id,
            missionId,
            provider: PaymentProvider.CINETPAY,
            amountCents: fees.totalCents,
            currency: quote.currency,
            status: PaymentStatus.PENDING,
            providerPaymentId: payment.providerPaymentId,
            checkoutUrl: payment.checkoutUrl,
            expiresAt: new Date(now.getTime() + INTENT_TTL_MS),
          },
        });
        await this.audit.write(
          {
            actorId: user.id,
            action: 'PAYMENT.INTENT_CREATED',
            targetType: 'PaymentIntent',
            targetId: created.id,
            after: {
              missionId,
              quoteId: quote.id,
              amountCents: fees.totalCents,
              reference,
            },
          },
          tx,
        );
        return created;
      });
      return this.toIntentDto(intent);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const race = await this.prisma.paymentIntent.findUnique({ where: { missionId } });
        if (race) {
          return this.toIntentDto(race);
        }
      }
      throw error;
    }
  }

  async getIntent(user: AuthUser, id: string): Promise<PaymentIntentResponseDto> {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id } });
    if (!intent) {
      throw new ApiError(
        ERROR_CODES.PAYMENT_INTENT_NOT_FOUND,
        404,
        'Intention de paiement introuvable.',
      );
    }
    this.assertOwner(intent, user);
    return this.toIntentDto(intent);
  }

  async confirmIntent(user: AuthUser, id: string): Promise<PaymentConfirmationResponseDto> {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id } });
    if (!intent) {
      throw new ApiError(
        ERROR_CODES.PAYMENT_INTENT_NOT_FOUND,
        404,
        'Intention de paiement introuvable.',
      );
    }
    this.assertOwner(intent, user);
    if (intent.status === PaymentStatus.CONFIRMED) {
      throw new ApiError(ERROR_CODES.PAYMENT_ALREADY_CONFIRMED, 409, 'Paiement deja confirme.');
    }
    if (!this.provider.sandbox) {
      throw new ApiError(
        ERROR_CODES.PAYMENT_PROVIDER_ERROR,
        409,
        'Confirmation manuelle reserve au mode sandbox.',
      );
    }
    if (intent.status !== PaymentStatus.PENDING) {
      throw new ApiError(ERROR_CODES.PAYMENT_PROVIDER_ERROR, 409, 'Paiement non confirmable.');
    }

    const verification = await this.provider.verifyReference(intent.reference);
    if (!verification.confirmed) {
      throw new ApiError(
        ERROR_CODES.PAYMENT_PROVIDER_ERROR,
        502,
        'Paiement non confirme par le fournisseur.',
      );
    }
    if (verification.amountCents !== undefined && verification.amountCents !== intent.amountCents) {
      throw new ApiError(
        ERROR_CODES.PAYMENT_AMOUNT_MISMATCH,
        409,
        'Montant du fournisseur incoherent.',
      );
    }

    const result = await this.prisma.$transaction(async (tx) =>
      this.finalizeIntent(
        intent,
        verification.providerPaymentId ?? `sandbox-${intent.reference}`,
        user,
        tx,
      ),
    );
    await this.notifications.enqueue(result.outboxIds);
    return {
      intentId: intent.id,
      status: PaymentStatus.CONFIRMED,
      alreadyConfirmed: result.already,
    };
  }

  async processWebhook(
    rawBody: Buffer | string,
    signature: string | null | undefined,
  ): Promise<WebhookResponseDto> {
    const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
    const parsed = this.parsePayload(raw);
    const payload = await this.normalizePayload(parsed);
    const payloadHash = createHash('sha256').update(raw).digest('hex');

    if (!this.provider.verifyWebhookSignature(raw, signature, payload.eventId)) {
      await this.recordWebhookEvent(
        payload,
        payloadHash,
        false,
        ProviderEventStatus.FAILED,
        'signature_invalid',
      );
      throw new ApiError(
        ERROR_CODES.PAYMENT_WEBHOOK_SIGNATURE_INVALID,
        401,
        'Signature du webhook invalide.',
      );
    }
    this.provider.assertFreshTimestamp(payload.timestamp ?? parsed.timestamp);

    const replay = await this.prisma.providerWebhookEvent.findUnique({
      where: { eventId: payload.eventId },
    });
    if (replay) {
      throw new ApiError(
        ERROR_CODES.PAYMENT_WEBHOOK_REPLAYED,
        409,
        'Evenement de paiement deja traite.',
      );
    }

    const intent = await this.prisma.paymentIntent.findUnique({
      where: { reference: payload.reference },
    });
    if (!intent) {
      await this.recordWebhookEvent(
        payload,
        payloadHash,
        true,
        ProviderEventStatus.FAILED,
        'intent_not_found',
      );
      throw new ApiError(
        ERROR_CODES.PAYMENT_INTENT_NOT_FOUND,
        404,
        'Intention de paiement introuvable.',
      );
    }
    if (intent.amountCents !== payload.amountCents) {
      await this.recordWebhookEvent(
        payload,
        payloadHash,
        true,
        ProviderEventStatus.FAILED,
        'amount_mismatch',
      );
      throw new ApiError(
        ERROR_CODES.PAYMENT_AMOUNT_MISMATCH,
        409,
        'Montant du webhook incoherent.',
      );
    }

    if (
      !this.isSuccessfulPayment(
        payload.status ?? this.stringValue(parsed.status, parsed.cpm_result, parsed.result),
      )
    ) {
      await this.recordWebhookEvent(payload, payloadHash, true, ProviderEventStatus.IGNORED, null);
      return { eventId: payload.eventId, status: ProviderEventStatus.IGNORED, received: true };
    }

    const syntheticUser = this.webhookActor(intent);
    const { status, outboxIds } = await this.prisma.$transaction(async (tx) => {
      let event;
      try {
        event = await tx.providerWebhookEvent.create({
          data: {
            provider: PaymentProvider.CINETPAY,
            eventId: payload.eventId,
            eventType: payload.eventType,
            signatureValid: true,
            payloadHash,
            status: ProviderEventStatus.RECEIVED,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ApiError(
            ERROR_CODES.PAYMENT_WEBHOOK_REPLAYED,
            409,
            'Evenement de paiement deja traite.',
          );
        }
        throw error;
      }
      const result = await this.finalizeIntent(
        intent,
        payload.providerPaymentId ?? `provider-${payload.eventId}`,
        syntheticUser,
        tx,
      );
      await tx.providerWebhookEvent.update({
        where: { id: event.id },
        data: { status: ProviderEventStatus.PROCESSED, processedAt: new Date() },
      });
      await this.audit.write(
        {
          actorId: intent.clientId,
          action: 'PAYMENT.WEBHOOK_PROCESSED',
          targetType: 'ProviderWebhookEvent',
          targetId: event.id,
          after: { eventId: payload.eventId, eventType: payload.eventType, intentId: intent.id },
        },
        tx,
      );
      return { status: ProviderEventStatus.PROCESSED, outboxIds: result.outboxIds };
    });
    await this.notifications.enqueue(outboxIds);
    return { eventId: payload.eventId, status, received: true };
  }

  async reconciliation(date?: string): Promise<ReconciliationReportResponseDto> {
    const day = this.normalizeDate(date);
    const nextDay = new Date(day.getTime() + DAY_MS);
    const [expectedAggregate, actualAggregate, intentCount, entryCount] = await Promise.all([
      this.prisma.paymentIntent.aggregate({
        where: {
          status: PaymentStatus.CONFIRMED,
          confirmedAt: { gte: day, lt: nextDay },
        },
        _sum: { amountCents: true },
      }),
      this.prisma.ledgerEntry.aggregate({
        where: {
          reason: LedgerEntryReason.PAYMENT,
          entryType: LedgerEntryType.DEBIT,
          createdAt: { gte: day, lt: nextDay },
        },
        _sum: { amountCents: true },
      }),
      this.prisma.paymentIntent.count({
        where: { status: PaymentStatus.CONFIRMED, confirmedAt: { gte: day, lt: nextDay } },
      }),
      this.prisma.ledgerEntry.count({
        where: {
          reason: LedgerEntryReason.PAYMENT,
          createdAt: { gte: day, lt: nextDay },
        },
      }),
    ]);
    const expectedCents = expectedAggregate._sum.amountCents ?? 0;
    const actualCents = actualAggregate._sum.amountCents ?? 0;
    const discrepancyCents = Math.abs(expectedCents - actualCents);
    const tolerance = this.config.get<number>('RECONCILIATION_TOLERANCE_CENTS', 0);
    const status =
      discrepancyCents <= tolerance ? ReconciliationStatus.OK : ReconciliationStatus.DISCREPANCY;
    const report = await this.prisma.reconciliationReport.upsert({
      where: { date: day },
      create: {
        date: day,
        status,
        expectedCents,
        actualCents,
        discrepancyCents,
        details: { intentCount, entryCount, toleranceCents: tolerance } as Prisma.InputJsonValue,
      },
      update: {
        status,
        expectedCents,
        actualCents,
        discrepancyCents,
        details: { intentCount, entryCount, toleranceCents: tolerance } as Prisma.InputJsonValue,
      },
    });
    if (status === ReconciliationStatus.DISCREPANCY) {
      throw new ApiError(
        ERROR_CODES.RECONCILIATION_DISCREPANCY,
        409,
        'Ecart de reconciliation detecte.',
        { reportId: report.id, discrepancyCents },
      );
    }
    return this.toReportDto(report);
  }

  async reconcile(date?: string): Promise<ReconciliationReportResponseDto> {
    return this.reconciliation(date);
  }

  async listReconciliationReports(limit = 50): Promise<ReconciliationReportResponseDto[]> {
    const reports = await this.prisma.reconciliationReport.findMany({
      orderBy: { date: 'desc' },
      take: Math.max(1, Math.min(limit, 100)),
    });
    return reports.map((report) => this.toReportDto(report));
  }

  async getReconciliationReport(id: string): Promise<ReconciliationReportResponseDto> {
    const report = await this.prisma.reconciliationReport.findUnique({ where: { id } });
    if (!report) {
      throw new ApiError(ERROR_CODES.RECONCILIATION_NOT_FOUND, 404, 'Rapport introuvable.');
    }
    return this.toReportDto(report);
  }

  private async finalizeIntent(
    intent: PaymentIntent,
    providerPaymentId: string,
    actor: AuthUser,
    tx: Prisma.TransactionClient,
  ): Promise<FinalizeResult> {
    const claimed = await tx.paymentIntent.updateMany({
      where: { id: intent.id, status: PaymentStatus.PENDING },
      data: {
        status: PaymentStatus.CONFIRMED,
        confirmedAt: new Date(),
        providerPaymentId,
      },
    });
    if (claimed.count === 0) {
      const current = await tx.paymentIntent.findUnique({ where: { id: intent.id } });
      if (current?.status === PaymentStatus.CONFIRMED) {
        return { already: true, outboxIds: [] };
      }
      throw new ApiError(ERROR_CODES.PAYMENT_ALREADY_CONFIRMED, 409, 'Paiement non confirmable.');
    }

    await this.ledger.postDoubleEntry(
      {
        debit: {
          ownerType: LedgerAccountType.PLATFORM,
          ownerId: PLATFORM_LEDGER_OWNER_ID,
        },
        credit: {
          ownerType: LedgerAccountType.USER,
          ownerId: intent.clientId,
        },
        amountCents: intent.amountCents,
        reason: LedgerEntryReason.PAYMENT,
        reference: `payment:${intent.reference}`,
        currency: intent.currency,
        metadata: { intentId: intent.id, providerPaymentId },
      },
      tx,
    );

    if (intent.missionId) {
      await this.ledger.recordMissionCommission(actor, intent.missionId, tx);
    }

    const outboxIds: string[] = [];
    if (intent.subscriptionId) {
      await this.recordSubscriptionFee(intent, tx);
      const activation = await activateSubscriptionForIntent(
        intent,
        tx,
        this.notifications,
        this.audit,
      );
      if (activation) {
        outboxIds.push(...activation.outboxIds);
      }
    }

    const notification = await this.notifications.createForUser(
      intent.clientId,
      {
        type: NotificationType.PAYMENT_CONFIRMED,
        title: 'Paiement confirme',
        body: 'Votre paiement a ete confirme.',
        entityId: intent.id,
        route: intent.missionId ? `/payments/${intent.id}` : '/subscriptions/mine',
        data: { reference: intent.reference, amountCents: intent.amountCents },
      },
      tx,
    );
    outboxIds.push(...notification.outboxIds);

    await this.audit.write(
      {
        actorId: actor.id,
        action: 'PAYMENT.CONFIRMED',
        targetType: 'PaymentIntent',
        targetId: intent.id,
        after: {
          reference: intent.reference,
          amountCents: intent.amountCents,
          providerPaymentId,
        },
      },
      tx,
    );
    return { already: false, outboxIds };
  }

  private async recordSubscriptionFee(
    intent: PaymentIntent,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const subscription = await tx.subscription.findUnique({
      where: { id: intent.subscriptionId! },
      select: { professionalProfileId: true, plan: true },
    });
    if (!subscription?.professionalProfileId) {
      throw new ApiError(
        ERROR_CODES.SUBSCRIPTION_REQUIRED,
        404,
        'Profil professionnel de l’abonnement introuvable.',
      );
    }
    const reference = `subscription-fee:${intent.reference}`;
    const existing = await tx.feeCharge.findUnique({ where: { reference } });
    if (!existing) {
      await tx.feeCharge.create({
        data: {
          userId: intent.clientId,
          kind: FeeKind.SUBSCRIPTION,
          amountCents: intent.amountCents,
          currency: intent.currency,
          reference,
          metadata: { plan: subscription.plan, intentId: intent.id } as Prisma.InputJsonValue,
        },
      });
    }
    if (intent.amountCents > 0) {
      await this.ledger.postDoubleEntry(
        {
          debit: {
            ownerType: LedgerAccountType.PLATFORM,
            ownerId: PLATFORM_LEDGER_OWNER_ID,
          },
          credit: {
            ownerType: LedgerAccountType.PROFESSIONAL,
            ownerId: subscription.professionalProfileId,
          },
          amountCents: intent.amountCents,
          reason: LedgerEntryReason.SUBSCRIPTION,
          reference,
          currency: intent.currency,
          metadata: { intentId: intent.id, plan: subscription.plan },
        },
        tx,
      );
    }
  }

  private async recordWebhookEvent(
    payload: CinetPayWebhookDto,
    payloadHash: string,
    signatureValid: boolean,
    status: ProviderEventStatus,
    error: string | null,
  ): Promise<void> {
    try {
      await this.prisma.providerWebhookEvent.create({
        data: {
          provider: PaymentProvider.CINETPAY,
          eventId: payload.eventId,
          eventType: payload.eventType,
          signatureValid,
          payloadHash,
          status,
          error,
          processedAt: status === ProviderEventStatus.FAILED ? new Date() : null,
        },
      });
    } catch (caught) {
      if (caught instanceof Prisma.PrismaClientKnownRequestError && caught.code === 'P2002') {
        throw new ApiError(
          ERROR_CODES.PAYMENT_WEBHOOK_REPLAYED,
          409,
          'Evenement de paiement deja traite.',
        );
      }
      throw caught;
    }
  }

  private parsePayload(raw: Buffer): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(raw.toString('utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('invalid payload');
      }
      return parsed as Record<string, unknown>;
    } catch {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Payload de webhook invalide.');
    }
  }

  private async normalizePayload(parsed: Record<string, unknown>): Promise<CinetPayWebhookDto> {
    const amount = this.numberValue(parsed.amountCents, parsed.amount, parsed.cpm_amount);
    const instance = plainToInstance(
      CinetPayWebhookDto,
      {
        eventId: this.stringValue(parsed.eventId, parsed.event_id, parsed.id),
        eventType: this.stringValue(parsed.eventType, parsed.event_type, parsed.type) ?? 'PAYMENT',
        reference: this.stringValue(
          parsed.reference,
          parsed.transaction_id,
          parsed.cpm_transaction_id,
        ),
        amountCents: amount,
        status: this.stringValue(parsed.status, parsed.cpm_result, parsed.result),
        providerPaymentId: this.stringValue(
          parsed.providerPaymentId,
          parsed.payment_id,
          parsed.cpm_payment_id,
        ),
        currency: this.stringValue(parsed.currency, parsed.cpm_currency),
        timestamp: this.timestampValue(parsed.timestamp, parsed.eventTimestamp),
      },
      { excludeExtraneousValues: false },
    );
    const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: false });
    if (errors.length > 0) {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Payload de webhook invalide.', {
        fields: errors.map((error) => error.property),
      });
    }
    return instance;
  }

  private numberValue(...values: unknown[]): number | undefined {
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return undefined;
  }

  private stringValue(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value.toString();
      }
    }
    return undefined;
  }

  private timestampValue(...values: unknown[]): string | number | undefined {
    for (const value of values) {
      if (typeof value === 'number' || typeof value === 'string') {
        return value;
      }
    }
    return undefined;
  }

  private isSuccessfulPayment(status?: string): boolean {
    if (!status) {
      return false;
    }
    return ['SUCCESS', 'CONFIRMED', 'PAID', 'COMPLETED', '00', '0', 'true'].includes(
      status.toUpperCase(),
    );
  }

  private assertOwner(intent: PaymentIntent, user: AuthUser): void {
    if (user.roles.includes(RoleCode.ADMIN)) {
      return;
    }
    if (intent.clientId !== user.id) {
      throw new ApiError(
        ERROR_CODES.PAYMENT_INTENT_NOT_OWNED,
        403,
        'Intention de paiement non appartenu.',
      );
    }
  }

  private webhookActor(intent: PaymentIntent): AuthUser {
    return {
      id: intent.clientId,
      phone: '',
      status: UserStatus.ACTIVE,
      roles: [RoleCode.CLIENT],
      sessionId: randomUUID(),
    };
  }

  private normalizeDate(value?: string): Date {
    if (value === undefined || value === '') {
      const now = new Date();
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Date de reconciliation invalide.');
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Date de reconciliation invalide.');
    }
    return date;
  }

  private toIntentDto(intent: PaymentIntent): PaymentIntentResponseDto {
    return {
      id: intent.id,
      reference: intent.reference,
      provider: intent.provider,
      amountCents: intent.amountCents,
      currency: intent.currency,
      status: intent.status,
      checkoutUrl: intent.checkoutUrl,
      providerPaymentId: intent.providerPaymentId,
      expiresAt: intent.expiresAt,
      confirmedAt: intent.confirmedAt,
      createdAt: intent.createdAt,
    };
  }

  private toReportDto(
    report: Prisma.ReconciliationReportGetPayload<object>,
  ): ReconciliationReportResponseDto {
    return {
      id: report.id,
      date: report.date,
      status: report.status,
      expectedCents: report.expectedCents,
      actualCents: report.actualCents,
      discrepancyCents: report.discrepancyCents,
      details: report.details as Record<string, unknown>,
      createdAt: report.createdAt,
    };
  }
}
