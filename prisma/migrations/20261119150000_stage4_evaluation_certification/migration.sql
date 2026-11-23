CREATE TYPE "EvaluationAssignmentStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'SUBMITTED');

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EVALUATION_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EVALUATION_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CERTIFICATION_OBTAINED';

ALTER TABLE "professional_profiles" ADD COLUMN "certifiedAt" TIMESTAMP(3),
ADD COLUMN "evaluationSubmissionId" UUID;

CREATE TABLE "evaluation_grids" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "passScore" INTEGER NOT NULL DEFAULT 70,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_grids_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evaluation_criteria" (
    "id" UUID NOT NULL,
    "gridId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "weight" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_criteria_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evaluation_assignments" (
    "id" UUID NOT NULL,
    "gridId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "evaluatorId" UUID NOT NULL,
    "assignedByAdminId" UUID NOT NULL,
    "status" "EvaluationAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "dueAt" TIMESTAMP(3),
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evaluation_results" (
    "id" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "criterionId" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evaluation_submissions" (
    "id" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "evaluatorId" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_submissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "evaluation_grids_code_key" ON "evaluation_grids"("code");
CREATE INDEX "evaluation_grids_active_idx" ON "evaluation_grids"("active");
CREATE INDEX "evaluation_criteria_gridId_sortOrder_idx" ON "evaluation_criteria"("gridId", "sortOrder");
CREATE UNIQUE INDEX "evaluation_criteria_gridId_code_key" ON "evaluation_criteria"("gridId", "code");
CREATE INDEX "evaluation_assignments_evaluatorId_status_idx" ON "evaluation_assignments"("evaluatorId", "status");
CREATE INDEX "evaluation_assignments_profileId_idx" ON "evaluation_assignments"("profileId");
CREATE INDEX "evaluation_assignments_status_dueAt_idx" ON "evaluation_assignments"("status", "dueAt");
CREATE UNIQUE INDEX "evaluation_assignments_profileId_gridId_key" ON "evaluation_assignments"("profileId", "gridId");
CREATE INDEX "evaluation_results_criterionId_idx" ON "evaluation_results"("criterionId");
CREATE UNIQUE INDEX "evaluation_results_assignmentId_criterionId_key" ON "evaluation_results"("assignmentId", "criterionId");
CREATE UNIQUE INDEX "evaluation_submissions_assignmentId_key" ON "evaluation_submissions"("assignmentId");
CREATE INDEX "evaluation_submissions_passed_createdAt_idx" ON "evaluation_submissions"("passed", "createdAt");
CREATE UNIQUE INDEX "professional_profiles_evaluationSubmissionId_key" ON "professional_profiles"("evaluationSubmissionId");

ALTER TABLE "professional_profiles" ADD CONSTRAINT "professional_profiles_evaluationSubmissionId_fkey" FOREIGN KEY ("evaluationSubmissionId") REFERENCES "evaluation_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evaluation_criteria" ADD CONSTRAINT "evaluation_criteria_gridId_fkey" FOREIGN KEY ("gridId") REFERENCES "evaluation_grids"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_assignments" ADD CONSTRAINT "evaluation_assignments_gridId_fkey" FOREIGN KEY ("gridId") REFERENCES "evaluation_grids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluation_assignments" ADD CONSTRAINT "evaluation_assignments_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_assignments" ADD CONSTRAINT "evaluation_assignments_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluation_assignments" ADD CONSTRAINT "evaluation_assignments_assignedByAdminId_fkey" FOREIGN KEY ("assignedByAdminId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "evaluation_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "evaluation_criteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluation_submissions" ADD CONSTRAINT "evaluation_submissions_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "evaluation_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_submissions" ADD CONSTRAINT "evaluation_submissions_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
