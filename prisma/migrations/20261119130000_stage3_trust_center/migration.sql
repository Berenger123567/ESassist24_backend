-- CreateEnum
CREATE TYPE "VerificationDecisionType" AS ENUM ('VERIFIED', 'REFUSED', 'COMPLEMENT_REQUESTED');

-- CreateEnum
CREATE TYPE "VerifiedReasonCode" AS ENUM ('VERIFIED_OK', 'DOCUMENT_MISSING', 'DOCUMENT_UNREADABLE', 'DOCUMENT_EXPIRED', 'DOCUMENT_MISMATCH', 'EXPERIENCE_INSUFFICIENT', 'SPECIALTY_NOT_JUSTIFIED', 'ZONE_NOT_COVERED', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'DENIED');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('WEB', 'ANDROID', 'IOS');

-- CreateEnum
CREATE TYPE "PushProvider" AS ENUM ('FCM', 'WEB_PUSH', 'EXPO');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'READ');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('VERIFICATION_APPROVED', 'VERIFICATION_REFUSED', 'COMPLEMENT_REQUESTED', 'DOCUMENT_EXPIRING', 'DOCUMENT_EXPIRED', 'ADMIN_DOCUMENT_EXPIRING');

-- AlterEnum
ALTER TYPE "DocumentEventType" ADD VALUE IF NOT EXISTS 'VIEW_LINK_ISSUED';

-- AlterTable
ALTER TABLE "professional_profiles" ADD COLUMN "complementRequestedAt" TIMESTAMP(3),
ADD COLUMN "complementDueAt" TIMESTAMP(3),
ADD COLUMN "submissionCount" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actorId" UUID,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "sessionId" UUID,
    "requestId" TEXT,
    "deviceId" TEXT,
    "result" "AuditResult" NOT NULL DEFAULT 'SUCCESS',
    "reason" TEXT,
    "previousHash" TEXT,
    "hash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_decisions" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "adminId" UUID NOT NULL,
    "decision" "VerificationDecisionType" NOT NULL,
    "reasonCode" "VerifiedReasonCode" NOT NULL,
    "reasonText" TEXT NOT NULL,
    "requestedItems" JSONB,
    "complementDueAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "requestHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "adminId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "deviceId" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "pushProvider" "PushProvider" NOT NULL DEFAULT 'WEB_PUSH',
    "pushToken" TEXT,
    "pushSubscription" JSONB,
    "appVersion" TEXT,
    "osVersion" TEXT,
    "locale" TEXT,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entityId" TEXT,
    "route" TEXT,
    "data" JSONB,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_outbox" (
    "id" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "deviceId" TEXT,
    "channel" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_reminders" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "thresholdDays" INTEGER NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_targetType_targetId_idx" ON "audit_logs"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "audit_logs_requestId_idx" ON "audit_logs"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "verification_decisions_adminId_idempotencyKey_key" ON "verification_decisions"("adminId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "verification_decisions_profileId_createdAt_idx" ON "verification_decisions"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "verification_decisions_decision_createdAt_idx" ON "verification_decisions"("decision", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_scope_adminId_key_key" ON "idempotency_records"("scope", "adminId", "key");

-- CreateIndex
CREATE INDEX "idempotency_records_expiresAt_idx" ON "idempotency_records"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "devices_userId_deviceId_key" ON "devices"("userId", "deviceId");

-- CreateIndex
CREATE INDEX "devices_userId_revokedAt_idx" ON "devices"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "devices_pushProvider_idx" ON "devices"("pushProvider");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_status_createdAt_idx" ON "notifications"("status", "createdAt");

-- CreateIndex
CREATE INDEX "notification_outbox_status_availableAt_idx" ON "notification_outbox"("status", "availableAt");

-- CreateIndex
CREATE INDEX "notification_outbox_notificationId_idx" ON "notification_outbox"("notificationId");

-- CreateIndex
CREATE UNIQUE INDEX "document_reminders_documentId_thresholdDays_key" ON "document_reminders"("documentId", "thresholdDays");

-- CreateIndex
CREATE INDEX "document_reminders_status_scheduledFor_idx" ON "document_reminders"("status", "scheduledFor");

-- AddForeignKey
ALTER TABLE "verification_decisions" ADD CONSTRAINT "verification_decisions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_reminders" ADD CONSTRAINT "document_reminders_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'electro_audit_owner') THEN
    CREATE ROLE "electro_audit_owner" NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'electro_audit_app') THEN
    CREATE ROLE "electro_audit_app" NOLOGIN;
  END IF;
END
$$;

ALTER TABLE "audit_logs" OWNER TO "electro_audit_owner";
GRANT "electro_audit_app" TO "electro_audit_owner";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'electro') THEN
    GRANT "electro_audit_app" TO "electro";
    GRANT SELECT, INSERT ON "audit_logs" TO "electro";
    GRANT USAGE, SELECT ON SEQUENCE "audit_logs_id_seq" TO "electro";
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs est append-only';
END;
$$;

CREATE TRIGGER "audit_logs_append_only"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

CREATE TRIGGER "audit_logs_no_truncate"
BEFORE TRUNCATE ON "audit_logs"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_log_mutation();
