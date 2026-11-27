import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { PrismaService } from '../../src/prisma/prisma.service';

export async function createTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
}> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.use(cookieParser());
  configureApp(app);
  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

export async function resetData(prisma: PrismaService): Promise<void> {
  await prisma.appeal.deleteMany();
  await prisma.suspension.deleteMany();
  await prisma.legalConsent.deleteMany();
  await prisma.legalDocument.deleteMany();
  await prisma.backupRecord.deleteMany();
  await prisma.reviewContest.deleteMany();
  await prisma.reviewResponse.deleteMany();
  await prisma.reviewFlag.deleteMany();
  await prisma.review.deleteMany();
  await prisma.reputationSnapshot.deleteMany();
  await prisma.claim.deleteMany();
  await prisma.guarantee.deleteMany();
  await prisma.reconciliationReport.deleteMany();
  await prisma.feeCharge.deleteMany();
  await prisma.paymentIntent.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.providerWebhookEvent.deleteMany();
  await prisma.commissionRate.deleteMany();
  await prisma.$executeRawUnsafe('ALTER TABLE "ledger_entries" DISABLE TRIGGER ALL');
  try {
    await prisma.ledgerEntry.deleteMany();
  } finally {
    await prisma.$executeRawUnsafe('ALTER TABLE "ledger_entries" ENABLE TRIGGER ALL');
  }
  await prisma.ledgerAccount.deleteMany();
  await prisma.serviceReport.deleteMany();
  await prisma.missionPosition.deleteMany();
  await prisma.missionEvent.deleteMany();
  await prisma.quoteLine.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversationParticipant.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.mission.deleteMany();
  await prisma.serviceProposal.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.serviceRequestPhoto.deleteMany();
  await prisma.serviceRequest.deleteMany();
  await prisma.evaluationResult.deleteMany();
  await prisma.evaluationSubmission.deleteMany();
  await prisma.evaluationAssignment.deleteMany();
  await prisma.evaluationCriterion.deleteMany();
  await prisma.evaluationGrid.deleteMany();
  await prisma.notificationOutbox.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.device.deleteMany();
  await prisma.documentReminder.deleteMany();
  await prisma.verificationDecision.deleteMany();
  await prisma.idempotencyRecord.deleteMany();
  await prisma.dataRequest.deleteMany();
  await prisma.documentEvent.deleteMany();
  await prisma.document.deleteMany();
  await prisma.adminInvitation.deleteMany();
  await prisma.otpDelivery.deleteMany();
  await prisma.adminCredential.deleteMany();
  await prisma.session.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.user.deleteMany();
}

export async function ensureRoles(prisma: PrismaService): Promise<void> {
  const roles = [
    { code: 'CLIENT' as const, label: 'Client' },
    { code: 'PROFESSIONAL' as const, label: 'Électricien' },
    { code: 'EVALUATOR' as const, label: 'Évaluateur' },
    { code: 'ADMIN' as const, label: 'Administrateur' },
  ];

  for (const role of roles) {
    await prisma.role.upsert({ where: { code: role.code }, update: {}, create: role });
  }
}
