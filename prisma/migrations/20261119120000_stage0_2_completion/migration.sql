CREATE TYPE "OtpChannel" AS ENUM ('SMS', 'WHATSAPP');

CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

CREATE TYPE "DataRequestType" AS ENUM ('EXPORT', 'RECTIFICATION', 'DELETION');

CREATE TYPE "DataRequestStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');

CREATE TYPE "DocumentEventType" AS ENUM ('UPLOADED', 'APPROVED', 'REJECTED', 'EXPIRED', 'ACCESSED');

ALTER TABLE "otp_codes" ADD COLUMN "clientDeviceId" TEXT;
ALTER TABLE "documents" ADD COLUMN "detectedContentType" TEXT;
ALTER TABLE "documents" ADD COLUMN "sha256" TEXT;
ALTER TABLE "documents" ADD COLUMN "uploadedAt" TIMESTAMP(3);

CREATE TABLE "otp_deliveries" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "channel" "OtpChannel" NOT NULL DEFAULT 'SMS',
    "status" "DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "otp_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_credentials" (
    "userId" UUID NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totpSecret" TEXT,
    "totpEnabledAt" TIMESTAMP(3),
    "totpLastUsedStep" INTEGER,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_credentials_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "admin_invitations" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "role" "RoleCode" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "invitedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "data_requests" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "DataRequestType" NOT NULL,
    "status" "DataRequestStatus" NOT NULL DEFAULT 'PENDING',
    "details" TEXT,
    "resolutionNote" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "data_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "document_events" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "type" "DocumentEventType" NOT NULL,
    "actorId" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "otp_deliveries_phone_createdAt_idx" ON "otp_deliveries"("phone", "createdAt");
CREATE INDEX "otp_deliveries_status_idx" ON "otp_deliveries"("status");
CREATE INDEX "admin_invitations_phone_idx" ON "admin_invitations"("phone");
CREATE INDEX "admin_invitations_status_idx" ON "admin_invitations"("status");
CREATE INDEX "data_requests_userId_requestedAt_idx" ON "data_requests"("userId", "requestedAt");
CREATE INDEX "data_requests_status_idx" ON "data_requests"("status");
CREATE INDEX "document_events_documentId_createdAt_idx" ON "document_events"("documentId", "createdAt");
CREATE INDEX "document_events_type_idx" ON "document_events"("type");
CREATE INDEX "documents_status_idx" ON "documents"("status");
CREATE INDEX "documents_expiresAt_idx" ON "documents"("expiresAt");

ALTER TABLE "admin_credentials" ADD CONSTRAINT "admin_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_invitations" ADD CONSTRAINT "admin_invitations_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_events" ADD CONSTRAINT "document_events_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "service_zones" SET "center" = ST_SetSRID(ST_MakePoint(2.3912, 6.3703), 4326) WHERE "code" = 'BJ-LIT-COTONOU';
UPDATE "service_zones" SET "center" = ST_SetSRID(ST_MakePoint(2.3420, 6.4430), 4326) WHERE "code" = 'BJ-ATL-ABOMEY-CALAVI';
UPDATE "service_zones" SET "center" = ST_SetSRID(ST_MakePoint(2.6045, 6.4969), 4326) WHERE "code" = 'BJ-OUE-PORTO-NOVO';
UPDATE "service_zones" SET "center" = ST_SetSRID(ST_MakePoint(2.6297, 9.3361), 4326) WHERE "code" = 'BJ-BOR-PARAKOU';
UPDATE "service_zones" SET "center" = ST_SetSRID(ST_MakePoint(1.3750, 10.3070), 4326) WHERE "code" = 'BJ-ATA-NATITINGOU';
UPDATE "service_zones" SET "center" = ST_SetSRID(ST_MakePoint(2.0240, 7.5230), 4326) WHERE "code" = 'BJ-ZOU-BOHICON';
UPDATE "service_zones" SET "center" = ST_SetSRID(ST_MakePoint(2.0030, 7.1790), 4326) WHERE "code" = 'BJ-ZOU-ABOMEY';
