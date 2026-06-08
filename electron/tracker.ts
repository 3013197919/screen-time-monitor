import type BetterSqlite3 from 'better-sqlite3';
import { Queries } from './db/queries';
import { NotificationService } from './notifications';
import type { TrackerStatus, AppEventInput, UsageLimit } from '../src/types/models';
import { basename } from 'path';

// ── active-win with fallback for development environments ─────

let activeWinFn: ((options?: {
  screenRecordingPermission?: boolean;
}) => Promise<{
  owner: { name: string; path: string; processId: number };
  title: string;
  id: number;
  bounds: { x: number; y: number; width: number; height: number };
  memoryUsage: number;
} | undefined>) | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  activeWinFn = require('active-win');
} catch {
  // Development environment without native module — return null (tracker will skip)
  activeWinFn = null;
  console.log('[WindowTracker] active-win not available — running in mock mode.');
}

// ── Interfaces ─────────────────────────────────────────────────

/** Result of a single poll operation. */
interface PollResult {
  appName: string;
  windowTitle: string;
}

/** v4 E-04: Callback types for tracking state changes. */
export type TrackingStateChange = 'started' | 'paused' | 'resumed' | 'stopped' | 'idle';

export interface TrackerCallbacks {
  onTrackingStateChange?: (state: TrackingStateChange) => void;
}

// ── WindowTracker ──────────────────────────────────────────────

/**
 * WindowTracker is the core tracking engine for Screen Time Monitor.
 *
 * It periodically polls the foreground window, detects app switches,
 * records usage events to the database, tracks idle time, and triggers
 * desktop notifications when usage limits are exceeded.
 *
 * Lifecycle: start() → poll() loop → stop()
 *
 * The tracker uses active-win (native Node module) on Windows/macOS/Linux
 * to detect the current foreground application and window title. In
 * development environments where active-win is unavailable, it gracefully
 * falls back to mock mode (poll returns null → tracker skips the cycle).
 */
export class WindowTracker {
  private db: BetterSqlite3.Database;
  private queries: Queries;
  private status: 'running' | 'paused' | 'stopped';
  private currentApp: string | null;
  private currentWindowTitle: string | null;
  private currentSessionStart: number | null;
  private lastSwitchTime: number;
  private idleThresholdMs: number;
  private pollIntervalMs: number;
  private timer: NodeJS.Timeout | null;
  private isIdle: boolean;
  private lastSummaryUpsertTime: number;
  private summaryUpsertIntervalMs: number;
  /** v4 E-04: Optional callbacks for tracking state changes. */
  private callbacks: TrackerCallbacks;

  /**
   * Create a new WindowTracker instance.
   *
   * @param db - The better-sqlite3 Database instance.
   * @param queries - The Queries layer for SQL operations.
   */
  constructor(db: BetterSqlite3.Database, queries: Queries, callbacks?: TrackerCallbacks) {
    this.db = db;
    this.queries = queries;
    this.callbacks = callbacks ?? {};
    this.status = 'stopped';
    this.currentApp = null;
    this.currentWindowTitle = null;
    this.currentSessionStart = null;
    this.lastSwitchTime = Date.now();
    this.idleThresholdMs = 5 * 60 * 1000; // 5 minutes default
    this.pollIntervalMs = 2000; // Poll every 2 seconds
    this.timer = null;
    this.isIdle = false;
    this.lastSummaryUpsertTime = Date.now();
    this.summaryUpsertIntervalMs = 60 * 1000; // Upsert summary every 60 seconds
  }

  /**
   * Start the window tracking engine.
   *
   * Begins polling the foreground window at the configured interval.
   * If already running or paused, this is a no-op.
   */
  start(): void {
    if (this.status === 'running') {
      console.log('[WindowTracker] Already running.');
      return;
    }

    this.status = 'running';
    this.isIdle = false;
    this.lastSwitchTime = Date.now();
    this.lastSummaryUpsertTime = Date.now();

    // v4 E-04: Notify ReminderService
    this.callbacks.onTrackingStateChange?.('started');

    console.log('[WindowTracker] Started. Polling every', this.pollIntervalMs, 'ms');

    // Perform an immediate first poll, then schedule the interval
    this.poll();
    this.timer = setInterval(() => {
      this.poll();
    }, this.pollIntervalMs);
  }

  /**
   * Stop the window tracking engine completely.
   *
   * If there is an active session (currentApp is non-null), the session is
   * finalized by recording the final event. Clears the polling interval.
   */
  stop(): void {
    if (this.status === 'stopped') {
      return;
    }

    console.log('[WindowTracker] Stopping...');

    // Finalize the current session if one is active
    if (this.currentApp && this.currentSessionStart) {
      this.finalizeCurrentEvent();
    }

    this.status = 'stopped';

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // v4 E-04: Notify ReminderService
    this.callbacks.onTrackingStateChange?.('stopped');

    console.log('[WindowTracker] Stopped.');
  }

  /**
   * Pause tracking without stopping.
   *
   * The polling interval continues to run but events are not recorded.
   * The current session is NOT finalized — it resumes when resume() is called.
   */
  pause(): void {
    if (this.status !== 'running') {
      return;
    }
    this.status = 'paused';
    // v4 E-04: Notify ReminderService
    this.callbacks.onTrackingStateChange?.('paused');
    console.log('[WindowTracker] Paused.');
  }

  /**
   * Resume tracking after a pause.
   *
   * Idle state is reset so the current session restarts fresh.
   */
  resume(): void {
    if (this.status !== 'paused') {
      return;
    }
    this.status = 'running';
    this.isIdle = false;
    this.lastSwitchTime = Date.now();
    // v4 E-04: Notify ReminderService
    this.callbacks.onTrackingStateChange?.('resumed');
    console.log('[WindowTracker] Resumed.');
  }

  /**
   * Get the current tracker state as a TrackerStatus object.
   *
   * @returns The current tracking state.
   */
  getState(): TrackerStatus {
    return {
      is_tracking: this.status === 'running',
      is_paused: this.status === 'paused',
      current_app: this.currentApp,
      current_session_start: this.currentSessionStart,
    };
  }

  // ── Private: Polling ──────────────────────────────────────────

  /**
   * Poll the foreground window and process state transitions.
   *
   * This is the heart of the tracker. It:
   * 1. Gets the current foreground window via active-win (or mock)
   * 2. Detects app switches and records events
   * 3. Detects idle state
   * 4. Periodically upserts daily summary
   * 5. Checks usage limits
   */
  private async poll(): Promise<void> {
    // Skip if not running
    if (this.status !== 'running') {
      return;
    }

    // Get current foreground window
    const result: PollResult | null = await this.getActiveWindowInfo();
    if (!result) {
      // Could not get window info — skip this cycle
      return;
    }

    const appName: string = result.appName;
    const windowTitle: string = result.windowTitle;
    const now: number = Date.now();

    // Check if the foreground app has changed
    if (this.currentApp !== appName) {
      // Finalize the previous event if there was one
      if (this.currentApp && this.currentSessionStart) {
        this.finalizeCurrentEvent();
      }

      // Start a new session for the new app
      this.currentApp = appName;
      this.currentWindowTitle = windowTitle;
      this.currentSessionStart = now;
      this.lastSwitchTime = now;
      this.isIdle = false;

      console.log(
        `[WindowTracker] Switched to ${appName} — "${windowTitle}"`
      );

      // v3: Check if Focus Mode is enabled and log focus/distracted status
      try {
        const focusEnabled = this.queries.getSetting('focus_mode_enabled');
        if (focusEnabled === 'true') {
          const whitelistJson = this.queries.getSetting('focus_whitelist') || '[]';
          let whitelist: string[] = [];
          try {
            whitelist = JSON.parse(whitelistJson);
            if (!Array.isArray(whitelist)) whitelist = [];
          } catch {
            whitelist = [];
          }
          const isFocused = whitelist.some(
            (w: string) => appName.toLowerCase() === w.toLowerCase()
          );
          console.log(
            `[Focus] ${appName}: ${isFocused ? 'FOCUSED' : 'DISTRACTED'}`
          );
        }
      } catch {
        // If setting read fails, silently skip focus logging
      }
    } else {
      // Same app — check for idle
      const timeSinceSwitch: number = now - this.lastSwitchTime;

      if (timeSinceSwitch >= this.idleThresholdMs && !this.isIdle) {
        // Enter idle state
        this.isIdle = true;
        // v4 E-04: Notify ReminderService
        this.callbacks.onTrackingStateChange?.('idle');
        console.log(
          `[WindowTracker] Entered idle state on ${appName} after ${Math.round(timeSinceSwitch / 1000)}s`
        );

        // Finalize the current event up to this point
        if (this.currentSessionStart) {
          this.finalizeCurrentEvent();
          // Reset session start so duration is not double-counted
          this.currentSessionStart = now;
        }
      }

      // Update window title if changed (but same app)
      if (this.currentWindowTitle !== windowTitle && !this.isIdle) {
        this.currentWindowTitle = windowTitle;
      }
    }

    // Periodically upsert daily summary (every 60 seconds)
    if (now - this.lastSummaryUpsertTime >= this.summaryUpsertIntervalMs) {
      this.upsertDailySummaryForCurrentApp();
      this.lastSummaryUpsertTime = now;

      // Check usage limits after summary update
      this.checkUsageLimits();
    }
  }

  // ── Private: Active Window Detection ──────────────────────────

  /**
   * Get information about the currently focused foreground window.
   *
   * Uses the active-win native module. Falls back to null in dev environments
   * where the native module is unavailable.
   *
   * @returns PollResult with appName and windowTitle, or null if unavailable.
   */
  private async getActiveWindowInfo(): Promise<PollResult | null> {
    if (!activeWinFn) {
      // Development environment — return null
      return null;
    }

    try {
      const win = await activeWinFn();

      if (!win) {
        return null;
      }

      // Extract process name from full path
      const processName: string = basename(win.owner.path);
      const appName: string = processName || win.owner.name || 'Unknown';

      return {
        appName,
        windowTitle: win.title || '',
      };
    } catch (err) {
      console.error('[WindowTracker] Error getting active window:', err);
      return null;
    }
  }

  // ── Private: Event Finalization ───────────────────────────────

  /**
   * Finalize the current tracking session by inserting an app_events row
   * and upserting the daily summary.
   *
   * The duration is calculated as (now - currentSessionStart) in seconds.
   * If the tracker is in idle state, no event is recorded (duration would be
   * meaningless since the user is not actively using the app).
   */
  private finalizeCurrentEvent(): void {
    if (!this.currentApp || !this.currentSessionStart) {
      return;
    }

    // Skip event recording during idle (the session was already finalized
    // when idle was detected; this prevents double-recording)
    if (this.isIdle) {
      return;
    }

    const now: number = Date.now();
    const durationMs: number = now - this.currentSessionStart;
    const durationSec: number = Math.max(0, Math.round(durationMs / 1000));

    // Skip events with 0 duration
    if (durationSec <= 0) {
      return;
    }

    const nowIso: string = new Date(now).toISOString();
    const startIso: string = new Date(this.currentSessionStart).toISOString();
    const todayStr: string = new Date().toISOString().slice(0, 10);

    // Check privacy mode — if enabled, mask window title
    let effectiveTitle: string = this.currentWindowTitle || '';
    try {
      const privacyMode = this.queries.getSetting('privacy_mode');
      if (privacyMode === 'true') {
        effectiveTitle = '(Privacy Mode)';
      }
    } catch {
      // If setting read fails, use the original title (don't break tracking)
    }

    const event: AppEventInput = {
      app_name: this.currentApp,
      window_title: effectiveTitle,
      started_at: startIso,
      ended_at: nowIso,
      duration: durationSec,
      date: todayStr,
    };

    try {
      this.queries.insertEvent(event);
      console.log(
        `[WindowTracker] Recorded ${durationSec}s for ${this.currentApp}`
      );

      // Also upsert daily summary immediately when finalizing an event
      this.queries.upsertDailySummary(this.currentApp, todayStr, durationSec);
    } catch (err) {
      console.error('[WindowTracker] Error recording event:', err);
    }
  }

  // ── Private: Daily Summary Upsert ─────────────────────────────

  /**
   * Upsert the daily summary for the current app and today's date.
   *
   * Calculates the duration since the last switch and adds it to the
   * daily_summary table. This is called periodically (every 60 seconds)
   * and also when finalizing an event.
   */
  private upsertDailySummaryForCurrentApp(): void {
    if (!this.currentApp || !this.currentSessionStart || this.isIdle) {
      return;
    }

    const now: number = Date.now();
    const durationMs: number = now - this.currentSessionStart;
    const durationSec: number = Math.max(0, Math.round(durationMs / 1000));

    if (durationSec <= 0) {
      return;
    }

    const todayStr: string = new Date().toISOString().slice(0, 10);

    try {
      this.queries.upsertDailySummary(this.currentApp, todayStr, durationSec);
      // Reset session start to avoid double-counting the same time
      this.currentSessionStart = now;
    } catch (err) {
      console.error('[WindowTracker] Error upserting daily summary:', err);
    }
  }

  // ── Private: Usage Limit Checking ─────────────────────────────

  /**
   * Check all enabled usage limits for the current app and show a
   * desktop notification if any limit has been reached or exceeded.
   */
  private checkUsageLimits(): void {
    if (!this.currentApp) {
      return;
    }

    try {
      const limits: UsageLimit[] = this.queries.getUsageLimits();
      const todayStr: string = new Date().toISOString().slice(0, 10);

      for (const limit of limits) {
        if (!limit.enabled) {
          continue;
        }

        // Only check the limit for the current app
        if (limit.app_name !== this.currentApp) {
          continue;
        }

        // Get the current usage for this app today
        const dailyRows = this.queries.getDailySummary(todayStr);
        const appRow = dailyRows.find((r) => r.app_name === limit.app_name);

        if (appRow) {
          const usedMinutes: number = Math.round(appRow.total_duration / 60);

          if (usedMinutes >= limit.limit_minutes) {
            console.log(
              `[WindowTracker] Limit reached for ${limit.app_name}: ${usedMinutes}/${limit.limit_minutes} min`
            );
            NotificationService.showLimitWarning(
              limit.app_name,
              usedMinutes,
              limit.limit_minutes
            );
          }
        }
      }
    } catch (err) {
      console.error('[WindowTracker] Error checking usage limits:', err);
    }
  }
}
