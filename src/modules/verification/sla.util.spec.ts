import { addBusinessHours, computeSla, parseHolidays } from './sla.util';

const CONFIG = {
  hours: 48,
  startHour: 8,
  endHour: 18,
  timeZone: 'Africa/Porto-Novo',
  holidays: [],
};

describe('sla.util', () => {
  it('ignore les nuits et le week-end pour calculer 48 heures ouvrées', () => {
    const dueAt = addBusinessHours(new Date('2026-11-20T17:00:00.000Z'), 48, CONFIG);
    expect(dueAt.toISOString()).toBe('2026-11-27T15:00:00.000Z');
  });

  it('décale l’échéance lorsque’un jour férié est configuré', () => {
    const dueAt = addBusinessHours(new Date('2026-11-23T07:00:00.000Z'), 48, {
      ...CONFIG,
      holidays: ['2026-11-26'],
    });
    expect(dueAt.toISOString()).toBe('2026-11-30T15:00:00.000Z');
  });

  it('calcule overdue et ageDays', () => {
    const submittedAt = new Date('2026-11-20T17:00:00.000Z');
    const info = computeSla(submittedAt, CONFIG, new Date('2026-11-28T00:00:00.000Z'));
    expect(info.dueAt.toISOString()).toBe('2026-11-27T15:00:00.000Z');
    expect(info.ageDays).toBe(7);
    expect(info.overdue).toBe(true);
  });

  it('ne conserve que les jours fériés au format ISO', () => {
    expect(parseHolidays('2026-11-26, invalid,2026-12-01')).toEqual(['2026-11-26', '2026-12-01']);
  });
});
