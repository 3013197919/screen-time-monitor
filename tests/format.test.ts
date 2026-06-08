import { describe, it, expect } from 'vitest';
import { formatDuration, formatDate, formatShortDate, formatPercentage, formatPercentageString, getWeekStart } from '../src/utils/format';

describe('formatDuration', () => {
  it('returns "0s" for 0', () => {
    expect(formatDuration(0)).toBe('0s');
  });

  it('returns "0s" for negative', () => {
    expect(formatDuration(-1)).toBe('0s');
  });

  it('formats seconds only', () => {
    expect(formatDuration(30)).toBe('30s');
    expect(formatDuration(59)).toBe('59s');
  });

  it('formats minutes only', () => {
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(120)).toBe('2m');
    expect(formatDuration(2700)).toBe('45m');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(3660)).toBe('1h 1m');
    expect(formatDuration(9030)).toBe('2h 30m');
    expect(formatDuration(7200)).toBe('2h');
  });

  it('hides seconds when hours exist', () => {
    expect(formatDuration(3661)).toBe('1h 1m');
  });
});

describe('formatDate', () => {
  it('passes through YYYY-MM-DD strings', () => {
    expect(formatDate('2026-06-07')).toBe('2026-06-07');
  });

  it('formats Date objects', () => {
    expect(formatDate(new Date('2026-01-15T12:00:00Z'))).toBe('2026-01-15');
  });
});

describe('formatShortDate', () => {
  it('returns short month+day for current year', () => {
    const now = new Date();
    const d = new Date(now.getFullYear(), 5, 7); // Jun 7
    expect(formatShortDate(d)).toBe('Jun 7');
  });
});

describe('formatPercentage', () => {
  it('returns 0 when total is 0', () => {
    expect(formatPercentage(10, 0)).toBe(0);
  });

  it('returns 0 when value is 0', () => {
    expect(formatPercentage(0, 100)).toBe(0);
  });

  it('calculates percentage', () => {
    expect(formatPercentage(50, 100)).toBe(50);
    expect(formatPercentage(1, 3)).toBe(33); // rounding
  });
});

describe('formatPercentageString', () => {
  it('returns formatted string', () => {
    expect(formatPercentageString(50, 100)).toBe('50%');
    expect(formatPercentageString(0, 100)).toBe('0%');
  });
});

describe('getWeekStart', () => {
  it('returns a Monday', () => {
    const monday = getWeekStart(new Date('2026-06-10')); // Wednesday
    expect(monday.getUTCDay()).toBe(1); // Monday
  });
});
