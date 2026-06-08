/**
 * Global constants for Screen Time Monitor.
 *
 * Centralizes all magic numbers, configuration values, and shared constants
 * used across the application (both main and renderer processes).
 */

// ── Application ────────────────────────────────────────────────

/** Application display name. */
export const APP_NAME: string = 'Screen Time Monitor';

/** Application version — overridden at build time. */
export const APP_VERSION: string = '1.0.0';

// ── Tracker ────────────────────────────────────────────────────

/** Polling interval for active window detection (milliseconds). */
export const POLL_INTERVAL_MS: number = 1000;

/** Default idle detection threshold (minutes of no input). */
export const DEFAULT_IDLE_TIMEOUT_MINUTES: number = 5;

/** Convert default idle timeout to milliseconds. */
export const DEFAULT_IDLE_TIMEOUT_MS: number =
  DEFAULT_IDLE_TIMEOUT_MINUTES * 60 * 1000;

/** Minimum allowed polling interval (milliseconds). */
export const MIN_POLL_INTERVAL_MS: number = 500;

/** Maximum allowed polling interval (milliseconds). */
export const MAX_POLL_INTERVAL_MS: number = 10000;

// ── Window ─────────────────────────────────────────────────────

/** Default main window width. */
export const DEFAULT_WINDOW_WIDTH: number = 1200;

/** Default main window height. */
export const DEFAULT_WINDOW_HEIGHT: number = 800;

/** Minimum window width. */
export const MIN_WINDOW_WIDTH: number = 800;

/** Minimum window height. */
export const MIN_WINDOW_HEIGHT: number = 600;

// ── Database ────────────────────────────────────────────────────

/** Encryption salt for key derivation (used when sqlcipher is integrated). */
export const ENCRYPTION_SALT: string = 'screen_time_monitor_salt';

/** Database WAL checkpoint interval (number of pages). */
export const WAL_CHECKPOINT_PAGES: number = 1000;

// ── Heatmap ────────────────────────────────────────────────────

/** Number of hours in the daily heatmap (0-23). */
export const HEATMAP_HOURS: number = 24;

/** Default number of top apps to show in rankings. */
export const DEFAULT_RANKING_LIMIT: number = 10;

// ── Chart Colors ───────────────────────────────────────────────

/**
 * Standard color palette for all recharts visualizations.
 * Ten distinct colors optimized for accessibility and contrast.
 */
export const CHART_COLORS: string[] = [
  '#6366F1', // Indigo
  '#8B5CF6', // Violet
  '#EC4899', // Pink
  '#F43F5E', // Rose
  '#F97316', // Orange
  '#EAB308', // Yellow
  '#22C55E', // Green
  '#14B8A6', // Teal
  '#3B82F6', // Blue
  '#6366F1', // Indigo (repeat for 10th)
];

// ── Heatmap Color Scale ────────────────────────────────────────

/**
 * Color scale for the active hours heatmap (24-hour grid).
 * From low activity (light indigo) to high activity (deep indigo).
 */
export const HEATMAP_COLORS: string[] = [
  '#EEF2FF', // 0 min  — near white
  '#E0E7FF', // 1-5 min
  '#C7D2FE', // 6-15 min
  '#A5B4FC', // 16-30 min
  '#818CF8', // 31-45 min
  '#6366F1', // 46-55 min
  '#4F46E5', // 56-59 min
  '#4338CA', // 60 min — max
];

// ── IPC Channels ───────────────────────────────────────────────

/**
 * All IPC channel names used in the application.
 * Format: {domain}:{action} or {domain}:on-{event}
 */
export const IPC_CHANNELS = {
  TRACKER_GET_STATUS: 'tracker:get-status',
  TRACKER_PAUSE: 'tracker:pause',
  TRACKER_RESUME: 'tracker:resume',
  TRACKER_STATUS_CHANGE: 'tracker:status-change',

  DATA_GET_TODAY_SUMMARY: 'data:get-today-summary',
  DATA_GET_WEEKLY_REPORT: 'data:get-weekly-report',
  DATA_GET_MONTHLY_REPORT: 'data:get-monthly-report',
  DATA_GET_APP_RANKING: 'data:get-app-ranking',

  LIMITS_GET_ALL: 'limits:get-all',
  LIMITS_SET: 'limits:set',
  LIMITS_DELETE: 'limits:delete',
  LIMITS_LIMIT_REACHED: 'limits:limit-reached',

  EXPORT_CSV: 'export:csv',

  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_ALL: 'settings:get-all',

  APP_GET_VERSION: 'app:get-version',
  APP_QUIT: 'app:quit',

  // v3: Focus
  FOCUS_GET_STATUS: 'focus:get-status',
  FOCUS_TOGGLE: 'focus:toggle',
  FOCUS_SET_WHITELIST: 'focus:set-whitelist',
  FOCUS_GET_REPORT: 'focus:get-report',

  // v3: Update
  APP_CHECK_FOR_UPDATES: 'app:check-for-updates',
  APP_INSTALL_UPDATE: 'app:install-update',
  APP_UPDATE_AVAILABLE: 'app:update-available',
  APP_UPDATE_DOWNLOADED: 'app:update-downloaded',

  // v3: Custom Range
  DATA_GET_CUSTOM_RANGE_REPORT: 'data:get-custom-range-report',
  DATA_GET_CUSTOM_RANGE_TREND: 'data:get-custom-range-trend',
  DATA_GET_CUSTOM_RANGE_RANKING: 'data:get-custom-range-ranking',

  // v3: Tray i18n
  TRAY_UPDATE_MENU_LABELS: 'tray:update-menu-labels',
} as const;

// ── Settings Keys ──────────────────────────────────────────────

/** Valid setting keys stored in the settings table. */
export const SETTINGS_KEYS = {
  AUTO_START: 'auto_start',
  IDLE_THRESHOLD: 'idle_threshold',
  AUTO_TRACK: 'auto_track',
  NOTIFICATIONS: 'notifications',
  DATA_RETENTION: 'data_retention',
  PRIVACY_MODE: 'privacy_mode',
  SHOW_TRAY: 'show_tray',
  FOCUS_MODE_ENABLED: 'focus_mode_enabled',
  FOCUS_WHITELIST: 'focus_whitelist',
  LANGUAGE: 'language',
} as const;

// ── Progress Bar Thresholds ────────────────────────────────────

/** Progress bar color threshold: green (safe) below this percentage. */
export const PROGRESS_SAFE_THRESHOLD: number = 50;

/** Progress bar color threshold: yellow (warning) below this percentage. */
export const PROGRESS_WARNING_THRESHOLD: number = 80;

/** Above this threshold, progress bar is red (danger). */
// Implicit: > PROGRESS_WARNING_THRESHOLD → danger
