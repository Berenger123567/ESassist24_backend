import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationType,
  PaymentIntent,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  RoleCode,
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { buildPage, decodeCursor, resolveLimit } from '../../common/pagination/pagination';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { AuthUser } from '../../common/types/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CancelSubscriptionDto,
  CreateSubscriptionDto,
  SubscriptionCheckoutResponseDto,
  SubscriptionPageDto,
  SubscriptionResponseDto,
} from './dto/subscription.dto';
import { PaymentProviderAdapter } from './payment-provider.adapter';

const INTENT_TTL_MS = 30 * 60 * 1000;
const SUBSCRIPTION_PERIOD_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionClient = PrismaService | Prisma.TransactionClient;

export async function assertActiveSubscription(
  client: SubscriptionClient,
  userId: string,
  graceDays = 7,
  professionalProfileId?: string,
): Promise<Subscription> {
  const subscription = await client.subscription.findFirst({
    where: {
      userId,
      status: SubscriptionStatus.ACTIVE,
      ...(professionalProfileId ? { professionalProfileId } : {}),
    },
    orderBy: { currentPeriodEnd: 'desc' },
  });
  if (!subscription) {
    const any = await client.subscription.findFirst({ where: { userId } });
    throw new ApiError(
      any ? ERROR_CODES.SUBSCRIPTION_EXPIRED : ERROR_CODES.SUBSCRIPTION_REQUIRED,
      403,
      any ? 'Abonnement expire ou annule.' : 'Abonnement requis.',
    );
  }
  if (subscription.currentPeriodEnd.getTime() + graceDays * DAY_MS <= Date.now()) {
    throw new ApiError(ERROR_CODES.SUBSCRIPTION_EXPIRED, 403, 'Abonnement expire.');
  }
  return subscription;
}

export interface SubscriptionActivationResult {
  subscription: Subscription;
  outboxIds: string[];
}

export async function activateSubscriptionForIntent(
  intent: Pick<PaymentIntent, 'id' | 'subscriptionId' | 'clientId' | 'reference'>,
  client: Prisma.TransactionClient,
  notifications: NotificationsService,
  audit: AuditService,
): Promise<SubscriptionActivationResult | null> {
  if (!intent.subscriptionId) {
    return null;
  }
  const subscription = await client.subscription.findUnique({
    where: { id: intent.subscriptionId },
  });
  if (!subscription) {
    throw new ApiError(ERROR_CODES.SUBSCRIPTION_REQUIRED, 404, 'Abonnement introuvable.');
  }
  const now = new Date();
  if (
    subscription.status === SubscriptionStatus.ACTIVE &&
    subscription.currentPeriodEnd.getTime() > now.getTime()
  ) {
    return { subscription, outboxIds: [] };
  }

  const updated = await client.subscription.update({
    where: { id: subscription.id },
    data: {
      status: SubscriptionStatus.ACTIVE,
      startedAt: now,
      currentPeriodEnd: new Date(now.getTime() + SUBSCRIPTION_PERIOD_DAYS * DAY_MS),
      cancelledAt: null,
    },
  });
  const notification = await notifications.createForUser(
    intent.clientId,
    {
      type: NotificationType.SUBSCRIPTION_ACTIVATED,
      title: 'Abonnement activé',
      body: `Votre abonnement ${updated.plan} est actif.`,
      entityId: updated.id,
      route: '/subscriptions/mine',
      data: { plan: updated.plan, intentId: intent.id, reference: intent.reference },
    },
    client,
  );
  await audit.write(
    {
      actorId: intent.clientId,
      action: 'SUBSCRIPTION.ACTIVATED',
      targetType: 'Subscription',
      targetId: updated.id,
      after: { plan: updated.plan, intentId: intent.id },
    },
    client,
  );
  return { subscription: updated, outboxIds: notification.outboxIds };
}

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly provider: PaymentProviderAdapter,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async subscribe(
    user: AuthUser,
    dto: CreateSubscriptionDto,
  ): Promise<SubscriptionCheckoutResponseDto> {
    if (!user.roles.includes(RoleCode.PROFESSIONAL)) {
      throw new ApiError(ERROR_CODES.FORBIDDEN, 403, 'Reserve aux professionnels.');
    }
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!profile) {
      throw new ApiError(
        ERROR_CODES.PROFESSIONAL_PROFILE_NOT_FOUND,
        404,
        'Profil professionnel introuvable.',
      );
    }
    const now = new Date();
    const active = await this.prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: { gt: new Date(now.getTime() - this.graceDays() * DAY_MS) },
      },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    if (active) {
      throw new ApiError(
        ERROR_CODES.SUBSCRIPTION_ALREADY_ACTIVE,
        409,
        'Un abonnement actif existe deja.',
      );
    }

    const pending = await this.prisma.subscription.findFirst({
      where: {
        userId: user.id,
        plan: dto.plan,
        status: SubscriptionStatus.EXPIRED,
        paymentIntents: { some: { status: PaymentStatus.PENDING } },
      },
      include: {
        paymentIntents: {
          where: { status: PaymentStatus.PENDING },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (pending && pending.paymentIntents[0]) {
      return this.toCheckout(pending.paymentIntents[0]);
    }

    const amountCents = this.priceFor(dto.plan);
    const reference = `SUBSCRIPTION-${user.id.slice(0, 8)}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    const payment = await this.provider.createPayment({
      reference,
      amountCents,
      currency: 'XOF',
      description: `Abonnement ${dto.plan}`,
      metadata: { userId: user.id, plan: dto.plan },
    });

    const { subscription, intent } = await this.prisma.$transaction(async (tx) => {
      const createdSubscription = await tx.subscription.create({
        data: {
          userId: user.id,
          professionalProfileId: profile.id,
          plan: dto.plan,
          status: SubscriptionStatus.EXPIRED,
          startedAt: now,
          currentPeriodEnd: new Date(0),
          autoRenew: dto.autoRenew ?? true,
        },
      });
      const createdIntent = await tx.paymentIntent.create({
        data: {
          reference,
          clientId: user.id,
          subscriptionId: createdSubscription.id,
          provider: PaymentProvider.CINETPAY,
          amountCents,
          currency: 'XOF',
          status: PaymentStatus.PENDING,
          providerPaymentId: payment.providerPaymentId,
          checkoutUrl: payment.checkoutUrl,
          expiresAt: new Date(now.getTime() + INTENT_TTL_MS),
        },
      });
      await this.audit.write(
        {
          actorId: user.id,
          action: 'SUBSCRIPTION.INTENT_CREATED',
          targetType: 'Subscription',
          targetId: createdSubscription.id,
          after: { plan: dto.plan, amountCents, intentId: createdIntent.id },
        },
        tx,
      );
      return { subscription: createdSubscription, intent: createdIntent };
    });
    void subscription;
    return this.toCheckout(intent);
  }

  async listMine(user: AuthUser, query: PaginationQueryDto = {}): Promise<SubscriptionPageDto> {
    const limit = resolveLimit(query.limit);
    const where: Prisma.SubscriptionWhereInput = { userId: user.id };
    const cursor = decodeCursor<{ id: string }>(query.cursor);
    if (cursor) {
      where.id = { lt: cursor.id };
    }
    const rows = await this.prisma.subscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const page = buildPage(rows, limit, (row) => row.id);
    return {
      data: page.data.map((row) => this.toResponse(row)),
      nextCursor: page.nextCursor,
    };
  }

  async listAll(query: PaginationQueryDto = {}): Promise<SubscriptionPageDto> {
    const limit = resolveLimit(query.limit);
    const where: Prisma.SubscriptionWhereInput = {};
    const cursor = decodeCursor<{ id: string }>(query.cursor);
    if (cursor) {
      where.id = { lt: cursor.id };
    }
    const rows = await this.prisma.subscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const page = buildPage(rows, limit, (row) => row.id);
    return {
      data: page.data.map((row) => this.toResponse(row)),
      nextCursor: page.nextCursor,
    };
  }

  async cancel(
    user: AuthUser,
    id: string,
    dto: CancelSubscriptionDto = {},
  ): Promise<SubscriptionResponseDto> {
    const subscription = await this.prisma.subscription.findUnique({ where: { id } });
    if (!subscription) {
      throw new ApiError(ERROR_CODES.NOT_FOUND, 404, 'Abonnement introuvable.');
    }
    const isAdmin = user.roles.includes(RoleCode.ADMIN);
    if (!isAdmin && subscription.userId !== user.id) {
      throw new ApiError(ERROR_CODES.FORBIDDEN, 403, 'Abonnement non appartenu.');
    }
    if (subscription.status === SubscriptionStatus.CANCELLED) {
      throw new ApiError(ERROR_CODES.SUBSCRIPTION_EXPIRED, 409, 'Abonnement deja annule.');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.subscription.update({
        where: { id },
        data: {
          status: SubscriptionStatus.CANCELLED,
          cancelledAt: new Date(),
          autoRenew: false,
        },
      });
      await this.audit.write(
        {
          actorId: user.id,
          action: 'SUBSCRIPTION.CANCELLED',
          targetType: 'Subscription',
          targetId: id,
          after: { reason: dto.reason ?? null, plan: subscription.plan },
        },
        tx,
      );
      return result;
    });
    return this.toResponse(updated);
  }

  async assertActiveSubscription(
    userId: string,
    professionalProfileId?: string,
  ): Promise<Subscription> {
    return assertActiveSubscription(this.prisma, userId, this.graceDays(), professionalProfileId);
  }

  private graceDays(): number {
    return this.config.get<number>('SUBSCRIPTION_GRACE_DAYS', 7);
  }

  private priceFor(plan: SubscriptionPlan): number {
    const value =
      plan === SubscriptionPlan.PREMIUM
        ? this.config.get<number>('SUBSCRIPTION_PREMIUM_PRICE_CENTS', 15000)
        : this.config.get<number>('SUBSCRIPTION_PRO_PRICE_CENTS', 5000);
    if (!Number.isInteger(value) || value < 0) {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Tarif d’abonnement invalide.');
    }
    return value;
  }

  private toCheckout(intent: PaymentIntent): SubscriptionCheckoutResponseDto {
    return {
      subscriptionId: intent.subscriptionId ?? '',
      intentId: intent.id,
      reference: intent.reference,
      checkoutUrl: intent.checkoutUrl ?? '',
      amountCents: intent.amountCents,
    };
  }

  private toResponse(subscription: Subscription): SubscriptionResponseDto {
    return {
      id: subscription.id,
      plan: subscription.plan,
      status: subscription.status,
      startedAt: subscription.startedAt,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelledAt: subscription.cancelledAt,
      autoRenew: subscription.autoRenew,
      professionalProfileId: subscription.professionalProfileId,
    };
  }
}
