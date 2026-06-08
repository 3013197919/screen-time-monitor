/**
 * Formatting utility functions for Screen Time Monitor.
 *
 * Centralizes display formatting logic — all durations are stored in seconds
 * and formatted for human-readable display here.
 */

/**
 * Format a duration (in seconds) to a human-readable string.
 *
 * Examples:
 *   formatDuration(9030)   → "2h 30m"
 *   formatDuration(2700)   → "45m"
 *   formatDuration(30)     → "30s"
 *   formatDuration(0)      → "0s"
 *   formatDuration(3661)   → "1h 1m"
 *
 * @param seconds - Duration in seconds (non-negative).
 * @returns Formatted duration string.
 */
export function formatDuration(seconds: number): string {
  if (seconds < 0) {
    return '0s';
  }

  if (seconds === 0) {
    return '0s';
  }

  const hours: number = Math.floor(seconds / 3600);
  const minutes: number = Math.floor((seconds % 3600) / 60);
  const secs: number = seconds % 60;

  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  // Only show seconds if less than a minute total, or if there are no hours/minutes
  if (secs > 0 && parts.length === 0) {
    parts.push(`${secs}s`);
  }

  return parts.length > 0 ? parts.join(' ') : '0s';
}

/**
 * Format a date string or Date object to YYYY-MM-DD format.
 *
 * @param date - Date object, ISO string, or YYYY-MM-DD string.
 * @returns Date string in YYYY-MM-DD format.
 */
export function formatDate(date: Date | string): string {
  if (typeof date === 'string') {
    // If already in YYYY-MM-DD format, return as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }
    date = new Date(date);
  }

  const year: string = date.getFullYear().toString();
  const month: string = (date.getMonth() + 1).toString().padStart(2, '0');
  const day: string = date.getDate().toString().padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Format a Date object to a human-friendly short date.
 *
 * @param date - Date object or date string.
 * @returns Formatted date like "Jun 7" or "Jun 7, 2026".
 */
export function formatShortDate(date: Date | string): string {
  const d: Date = typeof date === 'string' ? new Date(date) : date;

  const months: string[] = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  const month: string = months[d.getMonth()];
  const day: number = d.getDate();
  const year: number = d.getFullYear();
  const currentYear: number = new Date().getFullYear();

  if (year === currentYear) {
    return `${month} ${day}`;
  }
  return `${month} ${day}, ${year}`;
}

/**
 * Calculate and format a percentage value.
 *
 * @param value - The numerator.
 * @param total - The denominator.
 * @returns Percentage as a number (0-100), or 0 if total is 0.
 */
export function formatPercentage(value: number, total: number): number {
  if (total <= 0 || value <= 0) {
    return 0;
  }
  return Math.round((value / total) * 100);
}

/**
 * Format a percentage for display with a % sign.
 *
 * @param value - The numerator.
 * @param total - The denominator.
 * @returns Formatted string like "42%".
 */
export function formatPercentageString(value: number, total: number): string {
  return `${formatPercentage(value, total)}%`;
}

/**
 * Get the start of the current week (Monday 00:00:00) as a Date.
 *
 * @param date - Reference date (defaults to now).
 * @returns Date object for Monday 00:00:00 of the reference week.
 */
export function getWeekStart(date: Date = new Date()): Date {
  const d: Date = new Date(date);
  const day: number = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff: number = day === 0 ? -6 : 1 - day; // Monday offset
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the current month label in YYYY-MM format.
 *
 * @param date - Reference date (defaults to now).
 * @returns Month string like "2026-06".
 */
export function getMonthLabel(date: Date = new Date()): string {
  const year: string = date.getFullYear().toString();
  const month: string = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
}
