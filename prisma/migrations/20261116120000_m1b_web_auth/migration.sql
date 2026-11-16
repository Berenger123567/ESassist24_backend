-- CreateEnum
CREATE TYPE "ClientPlatform" AS ENUM ('WEB', 'ANDROID', 'IOS', 'UNKNOWN');

-- AlterTable
ALTER TABLE "otp_codes"
ADD COLUMN "clientPlatform" "ClientPlatform" NOT NULL DEFAULT 'UNKNOWN';

-- AlterTable
ALTER TABLE "sessions"
ADD COLUMN "clientPlatform" "ClientPlatform" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "clientDeviceId" TEXT;
