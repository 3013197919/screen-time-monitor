import type { BrowserWindow } from 'electron';
import type { Queries } from '../db/queries';

/**
 * ReminderService — v4 E-04
 *
 * Manages two independent timer-based reminder systems:
 * 1. **Pomodoro Timer**: Counts active tracking time, fires every N minutes.
 * 2. **Sedentary Timer**: Counts consecutive tracking time, fires when the
 *    user sits for too long, resets on pause/idle/stop.
 *
 * The service does NOT directly show UI notifications. Instead, it pushes
 * IPC events to the renderer process, which uses the Web Notification API
 * to display desktop notifications.
 *
 * All settings are read from the database (via Queries) on each check cycle,
 * so changes take effect immediately without restarting timers.
 */
export class ReminderService {
  private mainWindow: BrowserWindow | null;
  private queries: Queries;
  private checkInterval: NodeJS.Timeout | null;

  // ── State ──────────────────────────────────────────────────

  /** Total accumulated tracking time since last pomodoro fire (seconds). */
  private pomodoroAccumulator: number = 0;
  /** Last time (epoch ms) the pomodoro timer was updated. */
  private pomodoroLastUpdate: number = 0;
  /** Whether pomodoro timer is actively accumulating (tracking is running). */
  private pomodoroActive: boolean = false;

  /** Accumulated consecutive sedentary time (seconds). */
  private sedentaryAccumulator: number = 0;
  /** Last time (epoch ms) the sedentary timer was updated. */
  private sedentaryLastUpdate: number = 0;
  /** Whether sedentary timer is actively accumulating. */
  private sedentaryActive: boolean = false;

  constructor(queries: Queries, mainWindow: BrowserWindow | null) {
    this.queries = queries;
    this.mainWindow = mainWindow;
    this.checkInterval = null;
  }

  /**
   * Start the periodic check loop. Called once during app startup.
   */
  start(): void {
    if (this.checkInterval) return;

    console.log('[ReminderService] Started — checking every 60s.');

    // Check immediately after start
    this.check();

    this.checkInterval = setInterval(() => {
      this.check();
    }, 60_000);
  }

  /**
   * Notify the service that tracking has started or resumed.
   * Pomodoro continues accumulating; sedentary resets to 0.
   */
  onTrackingStarted(): void {
    const now = Date.now();
    this.pomodoroActive = true;
    this.pomodoroLastUpdate = now;

    this.sedentaryActive = true;
    this.sedentaryAccumulator = 0;
    this.sedentaryLastUpdate = now;

    console.log('[ReminderService] Tracking started — timers active.');
  }

  /**
   * Notify the service that tracking has been paused.
   * Pomodoro pauses accumulation (preserves current value);
   * Sedentary resets to 0.
   */
  onTrackingPaused(): void {
    this.pomodoroActive = false;
    this.sedentaryActive = false;
    this.sedentaryAccumulator = 0;

    console.log('[ReminderService] Tracking paused — timers suspended.');
  }

  /**
   * Notify the service that an idle state has been detected.
   * Sedentary resets to 0; pomodoro pauses.
   */
  onIdleDetected(): void {
    this.pomodoroActive = false;
    this.sedentaryActive = false;
    this.sedentaryAccumulator = 0;

    console.log('[ReminderService] Idle detected — sedentary reset.');
  }

  /**
   * Clean up all timers. Called on app quit.
   */
  destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log('[ReminderService] Destroyed.');
  }

  // ── Private: Check Loop ────────────────────────────────────

  /**
   * Periodic check: update accumulators based on elapsed wall-clock
   * time, then evaluate both timers against their thresholds.
   */
  private check(): void {
    const now = Date.now();

    // ── Read latest settings from DB on every check ──
    const settings = this.readSettings();

    // ── Update pomodoro accumulator ──
    if (this.pomodoroActive && this.pomodoroLastUpdate > 0) {
      const elapsed = Math.max(0, (now - this.pomodoroLastUpdate) / 1000);
      this.pomodoroAccumulator += elapsed;
      this.pomodoroLastUpdate = now;

      // Check pomodoro threshold
      if (settings.pomodoroEnabled) {
        const thresholdSec = settings.pomodoroInterval * 60;
        if (this.pomodoroAccumulator >= thresholdSec) {
          this.pomodoroAccumulator = 0; // Reset after firing
          this.firePomodoro(settings.pomodoroInterval);
        }
      }
    }

    // ── Update sedentary accumulator ──
    if (this.sedentaryActive && this.sedentaryLastUpdate > 0) {
      const elapsed = Math.max(0, (now - this.sedentaryLastUpdate) / 1000);
      this.sedentaryAccumulator += elapsed;
      this.sedentaryLastUpdate = now;

      // Check sedentary threshold
      if (settings.sedentaryEnabled) {
        const thresholdSec = settings.sedentaryInterval * 60;
        if (this.sedentaryAccumulator >= thresholdSec) {
          this.sedentaryAccumulator = 0; // Reset after firing
          this.fireSedentary(settings.sedentaryInterval);
        }
      }
    }
  }

  /**
   * Read reminder settings from the database.
   * Returns defaults if any key is missing.
   */
  private readSettings() {
    const pomodoroEnabled = this.queries.getSetting('pomodoro_enabled');
    const pomodoroInterval = this.queries.getSetting('pomodoro_interval');
    const sedentaryEnabled = this.queries.getSetting('sedentary_enabled');
    const sedentaryInterval = this.queries.getSetting('sedentary_interval');

    return {
      pomodoroEnabled: pomodoroEnabled !== 'false', // default true
      pomodoroInterval: parseInt(pomodoroInterval || '25', 10),
      sedentaryEnabled: sedentaryEnabled !== 'false', // default true
      sedentaryInterval: parseInt(sedentaryInterval || '60', 10),
    };
  }

  /**
   * Push a pomodoro reminder event to the renderer process.
   */
  private firePomodoro(intervalMinutes: number): void {
    console.log(`[ReminderService] Pomodoro fired — ${intervalMinutes}min interval.`);
    this.mainWindow?.webContents.send('reminder:pomodoro-triggered', {
      intervalMinutes,
    });
  }

  /**
   * Push a sedentary reminder event to the renderer process.
   */
  private fireSedentary(accumulatedMinutes: number): void {
    console.log(`[ReminderService] Sedentary fired — ${accumulatedMinutes}min accumulated.`);
    this.mainWindow?.webContents.send('reminder:sedentary-triggered', {
      accumulatedMinutes,
    });
  }
}
