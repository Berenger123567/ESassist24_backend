import { MissionStatus } from '@prisma/client';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';

const TRANSITIONS: Record<MissionStatus, MissionStatus[]> = {
  [MissionStatus.ACCEPTED]: [MissionStatus.CODE_VERIFIED, MissionStatus.CANCELLED],
  [MissionStatus.CODE_VERIFIED]: [
    MissionStatus.PENDING_QUOTE,
    MissionStatus.WORK_AUTHORIZED,
    MissionStatus.CANCELLED,
  ],
  [MissionStatus.PENDING_QUOTE]: [MissionStatus.WORK_AUTHORIZED, MissionStatus.CANCELLED],
  [MissionStatus.WORK_AUTHORIZED]: [MissionStatus.COMPLETED, MissionStatus.CANCELLED],
  [MissionStatus.COMPLETED]: [MissionStatus.CLOSED],
  [MissionStatus.CLOSED]: [],
  [MissionStatus.CANCELLED]: [],
};

export function assertMissionTransition(from: MissionStatus, to: MissionStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new ApiError(
      ERROR_CODES.MISSION_INVALID_TRANSITION,
      409,
      'Transition de mission interdite.',
      { from, to },
    );
  }
}
