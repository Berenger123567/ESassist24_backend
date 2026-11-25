-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'BREAKDOWN_PHOTO';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SERVICE_REQUEST_CREATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SERVICE_REQUEST_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PROPOSAL_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PROPOSAL_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MISSION_CREATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ARRIVAL_CODE_READY';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ARRIVAL_CODE_VERIFIED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PROFESSIONAL_REASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MESSAGE_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'QUOTE_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'QUOTE_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'QUOTE_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WORK_AUTHORIZED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MISSION_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REPORT_READY';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MISSION_CLOSED';

-- CreateEnum
CREATE TYPE "ServiceRequestType" AS ENUM ('ELECTRICAL_FAILURE', 'GENERATOR_FAILURE', 'SOLAR_FAILURE', 'PANEL_FAILURE', 'OTHER');
CREATE TYPE "UrgencyLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "ServiceRequestStatus" AS ENUM ('OPEN', 'MATCHED', 'ACCEPTED', 'CANCELLED', 'COMPLETED');
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'BUSY', 'UNAVAILABLE');
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
CREATE TYPE "MissionStatus" AS ENUM ('ACCEPTED', 'CODE_VERIFIED', 'PENDING_QUOTE', 'WORK_AUTHORIZED', 'COMPLETED', 'CLOSED', 'CANCELLED');
CREATE TYPE "MissionEventType" AS ENUM ('CREATED', 'ACCEPTED', 'CODE_VERIFIED', 'DEPARTED', 'ARRIVED', 'COMPLETED', 'CLOSED', 'REASSIGNED');
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "professional_profiles"
  ADD COLUMN "availabilityStatus" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN "availableFrom" TIMESTAMP(3),
  ADD COLUMN "availableUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "service_requests" (
  "id" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "type" "ServiceRequestType" NOT NULL,
  "urgency" "UrgencyLevel" NOT NULL,
  "zoneId" UUID NOT NULL,
  "description" TEXT NOT NULL,
  "status" "ServiceRequestStatus" NOT NULL DEFAULT 'OPEN',
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_request_photos" (
  "id" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "documentId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "service_request_photos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "favorites" (
  "clientId" UUID NOT NULL,
  "professionalProfileId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "favorites_pkey" PRIMARY KEY ("clientId", "professionalProfileId")
);

CREATE TABLE "service_proposals" (
  "id" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "professionalProfileId" UUID NOT NULL,
  "message" TEXT NOT NULL,
  "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "service_proposals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "missions" (
  "id" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "proposalId" UUID,
  "clientId" UUID NOT NULL,
  "professionalProfileId" UUID NOT NULL,
  "status" "MissionStatus" NOT NULL DEFAULT 'ACCEPTED',
  "arrivalCodeHash" TEXT,
  "arrivalCodeExpiresAt" TIMESTAMP(3),
  "arrivalCodeAttempts" INTEGER NOT NULL DEFAULT 0,
  "arrivalCodeUsedAt" TIMESTAMP(3),
  "previousProfessionalId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "missions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversations" (
  "id" UUID NOT NULL,
  "missionId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversation_participants" (
  "conversationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "lastReadMessageId" BIGINT,
  "lastReadAt" TIMESTAMP(3),

  CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("conversationId", "userId")
);

CREATE TABLE "messages" (
  "id" BIGSERIAL NOT NULL,
  "conversationId" UUID NOT NULL,
  "senderId" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quotes" (
  "id" UUID NOT NULL,
  "missionId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
  "validUntil" TIMESTAMP(3) NOT NULL,
  "totalCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quote_lines" (
  "id" UUID NOT NULL,
  "quoteId" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPriceCents" INTEGER NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mission_events" (
  "id" BIGSERIAL NOT NULL,
  "missionId" UUID NOT NULL,
  "type" "MissionEventType" NOT NULL,
  "actorId" UUID NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "mission_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mission_positions" (
  "id" BIGSERIAL NOT NULL,
  "missionId" UUID NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "accuracyMeters" INTEGER,
  "recordedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "mission_positions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_reports" (
  "id" UUID NOT NULL,
  "missionId" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "summary" TEXT NOT NULL,
  "checklist" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "service_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_request_photos_documentId_key" ON "service_request_photos"("documentId");
CREATE INDEX "service_request_photos_requestId_idx" ON "service_request_photos"("requestId");
CREATE INDEX "favorites_professionalProfileId_idx" ON "favorites"("professionalProfileId");
CREATE UNIQUE INDEX "service_proposals_requestId_professionalProfileId_key" ON "service_proposals"("requestId", "professionalProfileId");
CREATE INDEX "service_proposals_professionalProfileId_status_idx" ON "service_proposals"("professionalProfileId", "status");
CREATE UNIQUE INDEX "missions_requestId_key" ON "missions"("requestId");
CREATE UNIQUE INDEX "missions_proposalId_key" ON "missions"("proposalId");
CREATE INDEX "missions_clientId_createdAt_idx" ON "missions"("clientId", "createdAt");
CREATE INDEX "missions_professionalProfileId_status_idx" ON "missions"("professionalProfileId", "status");
CREATE INDEX "missions_status_idx" ON "missions"("status");
CREATE UNIQUE INDEX "conversations_missionId_key" ON "conversations"("missionId");
CREATE INDEX "conversations_lastMessageAt_idx" ON "conversations"("lastMessageAt");
CREATE INDEX "messages_conversationId_id_idx" ON "messages"("conversationId", "id");
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");
CREATE UNIQUE INDEX "quotes_missionId_version_key" ON "quotes"("missionId", "version");
CREATE INDEX "quotes_missionId_status_idx" ON "quotes"("missionId", "status");
CREATE INDEX "quote_lines_quoteId_sortOrder_idx" ON "quote_lines"("quoteId", "sortOrder");
CREATE INDEX "mission_events_missionId_id_idx" ON "mission_events"("missionId", "id");
CREATE INDEX "mission_events_missionId_createdAt_idx" ON "mission_events"("missionId", "createdAt");
CREATE INDEX "mission_positions_missionId_id_idx" ON "mission_positions"("missionId", "id");
CREATE INDEX "mission_positions_createdAt_idx" ON "mission_positions"("createdAt");
CREATE UNIQUE INDEX "service_reports_missionId_key" ON "service_reports"("missionId");
CREATE INDEX "service_requests_clientId_createdAt_idx" ON "service_requests"("clientId", "createdAt");
CREATE INDEX "service_requests_zoneId_status_idx" ON "service_requests"("zoneId", "status");

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "service_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_request_photos" ADD CONSTRAINT "service_request_photos_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_request_photos" ADD CONSTRAINT "service_request_photos_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_proposals" ADD CONSTRAINT "service_proposals_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_proposals" ADD CONSTRAINT "service_proposals_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "missions" ADD CONSTRAINT "missions_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "missions" ADD CONSTRAINT "missions_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "service_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "missions" ADD CONSTRAINT "missions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "missions" ADD CONSTRAINT "missions_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mission_events" ADD CONSTRAINT "mission_events_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mission_events" ADD CONSTRAINT "mission_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mission_positions" ADD CONSTRAINT "mission_positions_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
