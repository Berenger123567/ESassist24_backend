import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminEvaluationGridsController } from './admin-evaluation-grids.controller';
import { AdminEvaluationsController } from './admin-evaluations.controller';
import { EvaluationsService } from './evaluations.service';
import { EvaluatorEvaluationsController } from './evaluator-evaluations.controller';
import { ProCertificationController } from './pro-certification.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [
    AdminEvaluationGridsController,
    AdminEvaluationsController,
    EvaluatorEvaluationsController,
    ProCertificationController,
  ],
  providers: [EvaluationsService],
  exports: [EvaluationsService],
})
export class EvaluationsModule {}
