import { Queries } from '../db/queries';

/**
 * FocusAutomationService — v4
 *
 * Automatically enables/disables Focus Mode based on a user-defined
 * schedule (days of week + time range). Runs a 60-second interval
 * check against the current time and day-of-week.
 *
 * Only toggles Focus Mode when there's a mismatch between the
 * scheduled state and the current state.
 */
export class FocusAutomationService {
  private queries: Queries;
  private timer: ReturnType<typeof setInterval> | null = null;
  private toggleCallback: ((enabled: boolean) => void) | null = null;

  constructor(queries: Queries) {
    this.queries = queries;
  }

  /** Register a callback that toggles Focus Mode on/off. */
  setToggleCallback(cb: (enabled: boolean) => void): void {
    this.toggleCallback = cb;
  }

  /** Start the automation interval (checks every 60 seconds). */
  start(): void {
    if (this.timer) return;

    console.log('[FocusAutomation] Started — polling every 60s.');

    // Immediate first check
    this.check();

    this.timer = setInterval(() => this.check(), 60_000);
  }

  /** Stop and clean up the interval. */
  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[FocusAutomation] Stopped.');
  }

  /** Perform a single schedule check and toggle if needed. */
  private check(): void {
    try {
      const scheduleEnabled =
        this.queries.getSetting('focus_schedule_enabled') === 'true';
      if (!scheduleEnabled) return;

      // Parse schedule settings
      const daysJson =
        this.queries.getSetting('focus_schedule_days') || '[]';
      let days: number[] = [];
      try {
        days = JSON.parse(daysJson);
        if (!Array.isArray(days)) days = [];
      } catch {
        days = [];
      }

      const startHour = parseInt(
        this.queries.getSetting('focus_schedule_start') || '9',
        10
      );
      const endHour = parseInt(
        this.queries.getSetting('focus_schedule_end') || '18',
        10
      );

      const now = new Date();
      const currentHour = now.getHours();
      const currentDay = now.getDay(); // 0 = Sunday

      const isScheduledDay = days.includes(currentDay);
      const isScheduledTime =
        currentHour >= startHour && currentHour < endHour;
      const shouldBeEnabled = isScheduledDay && isScheduledTime;

      // Only toggle if state doesn't match
      const currentlyEnabled =
        this.queries.getSetting('focus_mode_enabled') === 'true';

      if (shouldBeEnabled !== currentlyEnabled && this.toggleCallback) {
        console.log(
          `[FocusAutomation] State mismatch — ` +
            `scheduled:${shouldBeEnabled} actual:${currentlyEnabled} — toggling`
        );
        this.toggleCallback(shouldBeEnabled);
      }
    } catch (err) {
      console.error('[FocusAutomation] Check failed:', err);
    }
  }
}
