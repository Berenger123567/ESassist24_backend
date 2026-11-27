import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FeeKind,
  LedgerAccount,
  LedgerAccountType,
  LedgerEntry,
  LedgerEntryReason,
  LedgerEntryType,
  Prisma,
  QuoteStatus,
} from '@prisma/client';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { buildPage, decodeCursor, resolveLimit } from '../../common/pagination/pagination';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { AuthUser } from '../../common/types/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  LedgerAccountResponseDto,
  LedgerEntryPageDto,
  LedgerEntryResponseDto,
} from './dto/ledger.dto';

export const PLATFORM_LEDGER_OWNER_ID = '00000000-0000-0000-0000-000000000000';

export type LedgerClient = PrismaService | Prisma.TransactionClient;

export interface LedgerParty {
  ownerType: LedgerAccountType;
  ownerId: string;
}

export interface LedgerPostInput extends LedgerParty {
  entryType: LedgerEntryType;
  amountCents: number;
  reason: LedgerEntryReason;
  reference: string;
  currency?: string;
  metadata?: Record<string, unknown>;
  reversalOfId?: bigint;
}

export interface LedgerDoubleEntryInput {
  debit: LedgerParty;
  credit: LedgerParty;
  amountCents: number;
  reason: LedgerEntryReason;
  reference: string;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export interface LedgerTransferInput extends Omit<LedgerDoubleEntryInput, 'debit' | 'credit'> {
  from: LedgerParty;
  to: LedgerParty;
}

export interface MissionFeeAmounts {
  quoteTotalCents: number;
  rateBps: number;
  commissionCents: number;
  matchingCents: number;
  verificationCents: number;
  totalCents: number;
}

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async getOrCreateAccount(
    ownerType: LedgerAccountType,
    ownerId: string,
    currency = 'XOF',
    client: LedgerClient = this.prisma,
  ): Promise<LedgerAccount> {
    const key = { ownerType, ownerId, currency };
    const existing = await client.ledgerAccount.findUnique({
      where: { ownerType_ownerId_currency: key },
    });
    if (existing) {
      return existing;
    }
    try {
      return await client.ledgerAccount.create({ data: key });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const race = await client.ledgerAccount.findUnique({
          where: { ownerType_ownerId_currency: key },
        });
        if (race) {
          return race;
        }
      }
      throw error;
    }
  }

  async getAccount(
    ownerType: LedgerAccountType,
    ownerId: string,
    currency = 'XOF',
    client: LedgerClient = this.prisma,
  ): Promise<LedgerAccount> {
    return this.getOrCreateAccount(ownerType, ownerId, currency, client);
  }

  verifyBalance(
    priorBalanceCents: number,
    entryType: LedgerEntryType,
    amountCents: number,
    balanceCents: number,
  ): void {
    const expected = priorBalanceCents + this.signedAmount(entryType, amountCents);
    if (balanceCents !== expected) {
      throw new ApiError(ERROR_CODES.LEDGER_INCONSISTENT, 500, 'Solde du grand livre incoherent.', {
        expected,
        actual: balanceCents,
      });
    }
  }

  verifyEntry(entry: LedgerEntry): void {
    this.verifyBalance(
      entry.priorBalanceCents,
      entry.entryType,
      entry.amountCents,
      entry.balanceCents,
    );
  }

  async postEntry(
    input: LedgerPostInput,
    client: LedgerClient = this.prisma,
  ): Promise<LedgerEntry> {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Montant de grand livre invalide.');
    }
    const existing = await client.ledgerEntry.findUnique({ where: { reference: input.reference } });
    if (existing) {
      this.verifyEntry(existing);
      const account = await client.ledgerAccount.findUnique({ where: { id: existing.accountId } });
      if (
        !account ||
        account.ownerType !== input.ownerType ||
        account.ownerId !== input.ownerId ||
        existing.entryType !== input.entryType ||
        existing.amountCents !== input.amountCents ||
        existing.reason !== input.reason
      ) {
        throw new ApiError(
          ERROR_CODES.LEDGER_ENTRY_IMMUTABLE,
          409,
          'Ecriture de grand livre immuable.',
        );
      }
      return existing;
    }

    const account = await this.getOrCreateAccount(
      input.ownerType,
      input.ownerId,
      input.currency ?? 'XOF',
      client,
    );
    const last = await client.ledgerEntry.findFirst({
      where: { accountId: account.id },
      orderBy: { id: 'desc' },
    });
    const priorBalanceCents = last?.balanceCents ?? 0;
    const balanceCents = priorBalanceCents + this.signedAmount(input.entryType, input.amountCents);
    const created = await client.ledgerEntry.create({
      data: {
        accountId: account.id,
        entryType: input.entryType,
        amountCents: input.amountCents,
        reason: input.reason,
        reference: input.reference,
        priorBalanceCents,
        balanceCents,
        reversalOfId: input.reversalOfId ?? null,
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
    this.verifyEntry(created);
    return created;
  }

  async appendEntry(
    input: LedgerPostInput,
    client: LedgerClient = this.prisma,
  ): Promise<LedgerEntry> {
    return this.postEntry(input, client);
  }

  async postDoubleEntry(
    input: LedgerDoubleEntryInput,
    client: LedgerClient = this.prisma,
  ): Promise<{ debit: LedgerEntry; credit: LedgerEntry }> {
    const metadata = input.metadata ?? {};
    const debit = await this.postEntry(
      {
        ...input.debit,
        entryType: LedgerEntryType.DEBIT,
        amountCents: input.amountCents,
        reason: input.reason,
        reference: `${input.reference}:debit`,
        currency: input.currency,
        metadata: { ...metadata, side: 'DEBIT' },
      },
      client,
    );
    const credit = await this.postEntry(
      {
        ...input.credit,
        entryType: LedgerEntryType.CREDIT,
        amountCents: input.amountCents,
        reason: input.reason,
        reference: `${input.reference}:credit`,
        currency: input.currency,
        metadata: { ...metadata, side: 'CREDIT' },
      },
      client,
    );
    return { debit, credit };
  }

  async transfer(
    input: LedgerTransferInput,
    client: LedgerClient = this.prisma,
  ): Promise<{ debit: LedgerEntry; credit: LedgerEntry }> {
    return this.postDoubleEntry(
      {
        debit: input.to,
        credit: input.from,
        amountCents: input.amountCents,
        reason: input.reason,
        reference: input.reference,
        currency: input.currency,
        metadata: input.metadata,
      },
      client,
    );
  }

  async reverseEntry(
    entryId: bigint,
    reference: string,
    client: LedgerClient = this.prisma,
  ): Promise<LedgerEntry> {
    const original = await client.ledgerEntry.findUnique({ where: { id: entryId } });
    if (!original) {
      throw new ApiError(ERROR_CODES.NOT_FOUND, 404, 'Ecriture de grand livre introuvable.');
    }
    const account = await client.ledgerAccount.findUnique({ where: { id: original.accountId } });
    if (!account) {
      throw new ApiError(
        ERROR_CODES.LEDGER_INCONSISTENT,
        500,
        'Compte de grand livre introuvable.',
      );
    }
    return this.postEntry(
      {
        ownerType: account.ownerType,
        ownerId: account.ownerId ?? PLATFORM_LEDGER_OWNER_ID,
        currency: account.currency,
        entryType:
          original.entryType === LedgerEntryType.DEBIT
            ? LedgerEntryType.CREDIT
            : LedgerEntryType.DEBIT,
        amountCents: original.amountCents,
        reason: LedgerEntryReason.REVERSAL,
        reference,
        reversalOfId: original.id,
        metadata: { originalEntryId: original.id.toString() },
      },
      client,
    );
  }

  async getCommissionRate(
    client: LedgerClient = this.prisma,
  ): Promise<Prisma.CommissionRateGetPayload<object>> {
    let latest: Prisma.CommissionRateGetPayload<object> | null = null;
    if (typeof client.commissionRate.findFirst === 'function') {
      latest = await client.commissionRate.findFirst({
        where: { effectiveFrom: { lte: new Date() } },
        orderBy: { effectiveFrom: 'desc' },
      });
    }
    if (latest) {
      return latest;
    }
    const percent = this.config.get<number>('COMMISSION_RATE_PERCENT', 5);
    const effectiveFrom = new Date(
      this.config.get<string>('COMMISSION_RATE_EFFECTIVE_FROM', '2026-01-01'),
    );
    const resolvedDate = Number.isNaN(effectiveFrom.getTime())
      ? new Date('2026-01-01')
      : effectiveFrom;
    const rateBps = Math.round(percent * 100);
    if (typeof client.commissionRate.findUnique === 'function') {
      const byDate = await client.commissionRate.findUnique({
        where: { effectiveFrom: resolvedDate },
      });
      if (byDate) {
        return byDate;
      }
    }
    return client.commissionRate.create({
      data: {
        rateBps,
        effectiveFrom: resolvedDate,
      },
    });
  }

  computeFees(quoteTotalCents: number, rateBps: number): MissionFeeAmounts {
    if (!Number.isInteger(quoteTotalCents) || quoteTotalCents < 0) {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Total du devis invalide.');
    }
    const commissionCents = Math.round((quoteTotalCents * rateBps) / 10000);
    const matchingCents = this.config.get<number>('FEE_MATCHING_CENTS', 500);
    const verificationCents = this.config.get<number>('FEE_VERIFICATION_CENTS', 1000);
    return {
      quoteTotalCents,
      rateBps,
      commissionCents,
      matchingCents,
      verificationCents,
      totalCents: quoteTotalCents + commissionCents + matchingCents + verificationCents,
    };
  }

  async computeMissionFees(
    quoteTotalCents: number,
    client: LedgerClient = this.prisma,
  ): Promise<MissionFeeAmounts> {
    const rate = await this.getCommissionRate(client);
    return this.computeFees(quoteTotalCents, rate.rateBps);
  }

  async recordMissionCommission(
    user: AuthUser,
    missionId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const mission = await tx.mission.findUnique({
      where: { id: missionId },
      select: { id: true, professionalProfileId: true },
    });
    if (!mission) {
      throw new ApiError(ERROR_CODES.NOT_FOUND, 404, 'Mission introuvable.');
    }
    const quote = await tx.quote.findFirst({
      where: { missionId, status: QuoteStatus.ACCEPTED },
      orderBy: { version: 'desc' },
    });
    if (!quote) {
      throw new ApiError(ERROR_CODES.NOT_FOUND, 404, 'Devis accepte introuvable.');
    }
    const fees = await this.computeMissionFees(quote.totalCents, tx);
    const charges: Array<{ kind: FeeKind; reason: LedgerEntryReason; amountCents: number }> = [
      {
        kind: FeeKind.COMMISSION,
        reason: LedgerEntryReason.COMMISSION,
        amountCents: fees.commissionCents,
      },
      {
        kind: FeeKind.MATCHING,
        reason: LedgerEntryReason.MATCHING_FEE,
        amountCents: fees.matchingCents,
      },
      {
        kind: FeeKind.VERIFICATION,
        reason: LedgerEntryReason.VERIFICATION_FEE,
        amountCents: fees.verificationCents,
      },
    ];
    let recorded = 0;
    for (const charge of charges) {
      const reference = `mission-fee:${missionId}:${charge.kind.toLowerCase()}`;
      const existing = await tx.feeCharge.findUnique({ where: { reference } });
      if (existing) {
        continue;
      }
      await tx.feeCharge.create({
        data: {
          missionId,
          userId: user.id,
          kind: charge.kind,
          amountCents: charge.amountCents,
          currency: quote.currency,
          reference,
          metadata: {
            quoteId: quote.id,
            rateBps: fees.rateBps,
          } as Prisma.InputJsonValue,
        },
      });
      if (charge.amountCents > 0) {
        await this.postDoubleEntry(
          {
            debit: {
              ownerType: LedgerAccountType.PLATFORM,
              ownerId: PLATFORM_LEDGER_OWNER_ID,
            },
            credit: {
              ownerType: LedgerAccountType.PROFESSIONAL,
              ownerId: mission.professionalProfileId,
            },
            amountCents: charge.amountCents,
            reason: charge.reason,
            reference,
            currency: quote.currency,
            metadata: { missionId, quoteId: quote.id, kind: charge.kind },
          },
          tx,
        );
      }
      recorded += 1;
    }
    if (recorded > 0) {
      await this.audit.write(
        {
          actorId: user.id,
          action: 'PAYMENT.COMMISSION_RECORDED',
          targetType: 'Mission',
          targetId: missionId,
          after: {
            quoteTotalCents: fees.quoteTotalCents,
            commissionCents: fees.commissionCents,
            matchingCents: fees.matchingCents,
            verificationCents: fees.verificationCents,
          },
        },
        tx,
      );
    }
  }

  async getMyAccounts(user: AuthUser): Promise<LedgerAccountResponseDto[]> {
    const accounts = await this.prisma.ledgerAccount.findMany({
      where: { OR: await this.accountFilter(user, this.prisma) },
      orderBy: { createdAt: 'asc' },
    });
    return accounts.map((account) => this.toAccountDto(account));
  }

  async getMyEntries(user: AuthUser, query: PaginationQueryDto): Promise<LedgerEntryPageDto> {
    const limit = resolveLimit(query.limit);
    const accountIds = await this.accountIds(user, this.prisma);
    if (accountIds.length === 0) {
      return { data: [], nextCursor: null };
    }
    const where: Prisma.LedgerEntryWhereInput = { accountId: { in: accountIds } };
    const cursor = decodeCursor<{ id: string }>(query.cursor);
    if (cursor) {
      try {
        where.id = { lt: BigInt(cursor.id) };
      } catch {
        throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Curseur de grand livre invalide.');
      }
    }
    const entries = await this.prisma.ledgerEntry.findMany({
      where,
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const page = buildPage(entries, limit, (entry) => entry.id.toString());
    return {
      data: page.data.map((entry) => this.toEntryDto(entry)),
      nextCursor: page.nextCursor,
    };
  }

  private async accountFilter(
    user: AuthUser,
    client: LedgerClient,
  ): Promise<Prisma.LedgerAccountWhereInput[]> {
    const filters: Prisma.LedgerAccountWhereInput[] = [
      { ownerType: LedgerAccountType.USER, ownerId: user.id },
    ];
    const profiles = await client.professionalProfile.findMany({
      where: { userId: user.id },
      select: { id: true },
    });
    for (const profile of profiles) {
      filters.push({ ownerType: LedgerAccountType.PROFESSIONAL, ownerId: profile.id });
    }
    return filters;
  }

  private async accountIds(user: AuthUser, client: LedgerClient): Promise<string[]> {
    const accounts = await client.ledgerAccount.findMany({
      where: { OR: await this.accountFilter(user, client) },
      select: { id: true },
    });
    return accounts.map((account) => account.id);
  }

  private signedAmount(entryType: LedgerEntryType, amountCents: number): number {
    return entryType === LedgerEntryType.DEBIT ? amountCents : -amountCents;
  }

  private toAccountDto(account: LedgerAccount): LedgerAccountResponseDto {
    return {
      id: account.id,
      ownerType: account.ownerType,
      currency: account.currency,
      createdAt: account.createdAt,
    };
  }

  private toEntryDto(entry: LedgerEntry): LedgerEntryResponseDto {
    return {
      id: entry.id.toString(),
      accountId: entry.accountId,
      entryType: entry.entryType,
      amountCents: entry.amountCents,
      reason: entry.reason,
      reference: entry.reference,
      priorBalanceCents: entry.priorBalanceCents,
      balanceCents: entry.balanceCents,
      reversalOfId: entry.reversalOfId === null ? null : entry.reversalOfId.toString(),
      createdAt: entry.createdAt,
    };
  }
}
