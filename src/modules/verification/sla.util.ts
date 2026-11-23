import { ConfigService } from '@nestjs/config';

export interface SlaConfig {
  hours: number;
  startHour: number;
  endHour: number;
  timeZone: string;
  holidays: string[];
}

export interface SlaInfo {
  dueAt: Date;
  ageDays: number;
  overdue: boolean;
}

export function parseHolidays(value?: string | null): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry));
}

export function getSlaConfig(config: ConfigService): SlaConfig {
  const startHour = config.get<number>('VERIFICATION_WORK_START_HOUR', 8);
  const configuredEnd = config.get<number>('VERIFICATION_WORK_END_HOUR', 18);
  return {
    hours: config.get<number>('VERIFICATION_SLA_HOURS', 48),
    startHour,
    endHour: configuredEnd > startHour ? configuredEnd : startHour + 1,
    timeZone: config.get<string>('VERIFICATION_TIMEZONE', 'Africa/Porto-Novo'),
    holidays: parseHolidays(config.get<string>('VERIFICATION_HOLIDAYS', '')),
  };
}

export function addBusinessHours(start: Date, hours: number, config: SlaConfig): Date {
  let remaining = Math.max(0, Math.floor(hours * 60));
  let cursor = new Date(start.getTime());

  while (remaining > 0) {
    if (isWorkingMinute(cursor, config)) {
      remaining -= 1;
    }
    cursor = new Date(cursor.getTime() + 60_000);
  }

  return cursor;
}

export function computeSla(submittedAt: Date, config: SlaConfig, now: Date = new Date()): SlaInfo {
  const dueAt = addBusinessHours(submittedAt, config.hours, config);
  const ageDays = Math.max(0, Math.floor((now.getTime() - submittedAt.getTime()) / 86_400_000));
  return { dueAt, ageDays, overdue: dueAt.getTime() < now.getTime() };
}

function isWorkingMinute(instant: Date, config: SlaConfig): boolean {
  const parts = getZonedParts(instant, config.timeZone);
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') {
    return false;
  }
  if (parts.hour < config.startHour || parts.hour >= config.endHour) {
    return false;
  }
  return !config.holidays.includes(parts.dateKey);
}

function getZonedParts(
  instant: Date,
  timeZone: string,
): {
  hour: number;
  weekday: string;
  dateKey: string;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(instant);
  const find = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    hour: Number(find('hour')),
    weekday: find('weekday'),
    dateKey: `${find('year')}-${find('month')}-${find('day')}`,
  };
}
