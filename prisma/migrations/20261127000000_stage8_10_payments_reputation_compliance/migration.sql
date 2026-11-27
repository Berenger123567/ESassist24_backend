-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_ACTIVATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REVIEW_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REVIEW_RESPONSE_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CLAIM_OPENED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CLAIM_STATUS_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'GUARANTEE_ACTIVATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUSPENSION_APPLIED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUSPENSION_LIFTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'APPEAL_DECIDED';

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('CINETPAY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ProviderEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('USER', 'PROFESSIONAL', 'PLATFORM', 'PROVIDER');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "LedgerEntryReason" AS ENUM ('PAYMENT', 'COMMISSION', 'MATCHING_FEE', 'VERIFICATION_FEE', 'PAYOUT', 'REVERSAL', 'SUBSCRIPTION', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "FeeKind" AS ENUM ('COMMISSION', 'MATCHING', 'VERIFICATION', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('PRO', 'PREMIUM');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('OK', 'DISCREPANCY');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'PUBLISHED', 'SUSPICIOUS', 'REJECTED', 'CONTESTED');

-- CreateEnum
CREATE TYPE "SuspicionReason" AS ENUM ('VELOCITY', 'DUPLICATE_TEXT', 'DUPLICATE_PAIR', 'SELF_REVIEW', 'LOW_SCORE_BURST');

-- CreateEnum
CREATE TYPE "ReputationLevel" AS ENUM ('BRONZE', 'ARGENT', 'OR', 'PLATINE');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'ESCALATED', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GuaranteeStatus" AS ENUM ('ACTIVE', 'CLAIMED', 'EXPIRED', 'VOID');

-- CreateEnum
CREATE TYPE "SuspensionStatus" AS ENUM ('ACTIVE', 'APPEALED', 'LIFTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LegalDocumentType" AS ENUM ('TERMS', 'PRIVACY', 'GEO_CONSENT');

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "commission_rates" (
    "id" UUID NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_intents" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "missionId" UUID,
    "subscriptionId" UUID,
    "provider" "PaymentProvider" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "providerPaymentId" TEXT,
    "checkoutUrl" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_webhook_events" (
    "id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" "ProviderEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "provider_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" UUID NOT NULL,
    "ownerType" "LedgerAccountType" NOT NULL,
    "ownerId" UUID,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" BIGSERIAL NOT NULL,
    "accountId" UUID NOT NULL,
    "entryType" "LedgerEntryType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" "LedgerEntryReason" NOT NULL,
    "reference" TEXT NOT NULL,
    "priorBalanceCents" INTEGER NOT NULL,
    "balanceCents" INTEGER NOT NULL,
    "reversalOfId" BIGINT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_charges" (
    "id" UUID NOT NULL,
    "missionId" UUID,
    "userId" UUID,
    "kind" "FeeKind" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "reference" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "professionalProfileId" UUID,
    "plan" "SubscriptionPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "providerSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_reports" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "ReconciliationStatus" NOT NULL,
    "expectedCents" INTEGER NOT NULL,
    "actualCents" INTEGER NOT NULL,
    "discrepancyCents" INTEGER NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "missionId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "professionalProfileId" UUID NOT NULL,
    "quality" INTEGER NOT NULL,
    "timeliness" INTEGER NOT NULL,
    "behaviour" INTEGER NOT NULL,
    "quoteCompliance" INTEGER NOT NULL,
    "safety" INTEGER NOT NULL,
    "weightedScore" DOUBLE PRECISION NOT NULL,
    "comment" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_flags" (
    "id" BIGSERIAL NOT NULL,
    "reviewId" UUID NOT NULL,
    "reason" "SuspicionReason" NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_responses" (
    "id" UUID NOT NULL,
    "reviewId" UUID NOT NULL,
    "professionalProfileId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_contests" (
    "id" UUID NOT NULL,
    "reviewId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "review_contests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reputation_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "professionalProfileId" UUID NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "level" "ReputationLevel" NOT NULL,
    "missionCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reputation_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claims" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "missionId" UUID,
    "claimantId" UUID NOT NULL,
    "respondentProfileId" UUID,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'OPEN',
    "ackDueAt" TIMESTAMP(3) NOT NULL,
    "resolutionDueAt" TIMESTAMP(3) NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guarantees" (
    "id" UUID NOT NULL,
    "missionId" UUID NOT NULL,
    "coverageCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" "GuaranteeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guarantees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suspensions" (
    "id" UUID NOT NULL,
    "professionalProfileId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" JSONB,
    "suspendedBy" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "status" "SuspensionStatus" NOT NULL DEFAULT 'ACTIVE',
    "liftedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suspensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeals" (
    "id" UUID NOT NULL,
    "suspensionId" UUID NOT NULL,
    "submittedBy" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'PENDING',
    "decidedBy" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_documents" (
    "id" UUID NOT NULL,
    "type" "LegalDocumentType" NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_consents" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "legal_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_records" (
    "id" UUID NOT NULL,
    "status" "BackupStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "sizeBytes" INTEGER,
    "location" TEXT,
    "checksum" TEXT,
    "restoredAt" TIMESTAMP(3),

    CONSTRAINT "backup_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commission_rates_effectiveFrom_key" ON "commission_rates"("effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_reference_key" ON "payment_intents"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_missionId_key" ON "payment_intents"("missionId");

-- CreateIndex
CREATE INDEX "payment_intents_clientId_createdAt_idx" ON "payment_intents"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "payment_intents_status_idx" ON "payment_intents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "provider_webhook_events_eventId_key" ON "provider_webhook_events"("eventId");

-- CreateIndex
CREATE INDEX "provider_webhook_events_provider_receivedAt_idx" ON "provider_webhook_events"("provider", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_ownerType_ownerId_currency_key" ON "ledger_accounts"("ownerType", "ownerId", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_reference_key" ON "ledger_entries"("reference");

-- CreateIndex
CREATE INDEX "ledger_entries_accountId_id_idx" ON "ledger_entries"("accountId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_charges_reference_key" ON "fee_charges"("reference");

-- CreateIndex
CREATE INDEX "fee_charges_missionId_kind_idx" ON "fee_charges"("missionId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_providerSubscriptionId_key" ON "subscriptions"("providerSubscriptionId");

-- CreateIndex
CREATE INDEX "subscriptions_userId_status_idx" ON "subscriptions"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_reports_date_key" ON "reconciliation_reports"("date");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_missionId_key" ON "reviews"("missionId");

-- CreateIndex
CREATE INDEX "reviews_professionalProfileId_createdAt_idx" ON "reviews"("professionalProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "review_flags_reviewId_idx" ON "review_flags"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "review_responses_reviewId_key" ON "review_responses"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "review_contests_reviewId_key" ON "review_contests"("reviewId");

-- CreateIndex
CREATE INDEX "reputation_snapshots_professionalProfileId_createdAt_idx" ON "reputation_snapshots"("professionalProfileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "claims_number_key" ON "claims"("number");

-- CreateIndex
CREATE INDEX "claims_status_resolutionDueAt_idx" ON "claims"("status", "resolutionDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "guarantees_missionId_key" ON "guarantees"("missionId");

-- CreateIndex
CREATE INDEX "guarantees_status_validUntil_idx" ON "guarantees"("status", "validUntil");

-- CreateIndex
CREATE INDEX "suspensions_professionalProfileId_status_idx" ON "suspensions"("professionalProfileId", "status");

-- CreateIndex
CREATE INDEX "appeals_suspensionId_status_idx" ON "appeals"("suspensionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_type_version_key" ON "legal_documents"("type", "version");

-- CreateIndex
CREATE UNIQUE INDEX "legal_consents_userId_documentId_key" ON "legal_consents"("userId", "documentId");

-- CreateIndex
CREATE INDEX "backup_records_startedAt_idx" ON "backup_records"("startedAt");

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_flags" ADD CONSTRAINT "review_flags_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_responses" ADD CONSTRAINT "review_responses_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_responses" ADD CONSTRAINT "review_responses_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_contests" ADD CONSTRAINT "review_contests_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_contests" ADD CONSTRAINT "review_contests_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reputation_snapshots" ADD CONSTRAINT "reputation_snapshots_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_claimantId_fkey" FOREIGN KEY ("claimantId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_respondentProfileId_fkey" FOREIGN KEY ("respondentProfileId") REFERENCES "professional_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guarantees" ADD CONSTRAINT "guarantees_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suspensions" ADD CONSTRAINT "suspensions_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suspensions" ADD CONSTRAINT "suspensions_suspendedBy_fkey" FOREIGN KEY ("suspendedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_suspensionId_fkey" FOREIGN KEY ("suspensionId") REFERENCES "suspensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_decidedBy_fkey" FOREIGN KEY ("decidedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_consents" ADD CONSTRAINT "legal_consents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_consents" ADD CONSTRAINT "legal_consents_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "legal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "reject_ledger_entry_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger entries are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_entries_no_update"
  BEFORE UPDATE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION "reject_ledger_entry_mutation"();

CREATE TRIGGER "ledger_entries_no_delete"
  BEFORE DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION "reject_ledger_entry_mutation"();
