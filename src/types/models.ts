/**
 * Business data model types for Screen Time Monitor.
 *
 * These types are shared between the main process (database layer) and
 * the renderer process (UI layer). All duration values are in seconds.
 * All date strings use YYYY-MM-DD format. All timestamps use ISO 8601 UTC.
 */

// ─── Database Row Types ────────────────────────────────────────

/** Raw window-switch event stored in app_events table. */
export interface AppEvent {
  id: number;
  app_name: string;
  window_title: string;
  started_at: string; // ISO 8601 UTC
  ended_at: string; // ISO 8601 UTC
  duration: number; // seconds
  date: string; // YYYY-MM-DD
}

/** Input type for inserting a new app event (no auto-generated id). */
export interface AppEventInput {
  app_name: string;
  window_title: string;
  started_at: string;
  ended_at: string;
  duration: number;
  date: string;
}

/** Pre-aggregated daily summary row from daily_summary table. */
export interface DailySummary {
  id: number;
  app_name: string;
  date: string; // YYYY-MM-DD
  total_duration: number; // seconds
}

/** Usage limit configuration row from usage_limits table. */
export interface UsageLimit {
  id: number;
  app_name: string;
  limit_minutes: number;
  enabled: boolean;
}

/** Input type for creating/updating a usage limit. */
export interface UsageLimitInput {
  app_name: string;
  limit_minutes: number;
  enabled?: boolean;
}

/** Settings key-value pair from settings table. */
export interface Setting {
  key: string;
  value: string;
}

/** Application category row from app_categories table (P2). */
export interface AppCategory {
  id: number;
  app_name: string;
  category: 'work' | 'study' | 'entertainment' | 'other';
}

// ─── Display / Aggregation Types ───────────────────────────────

/** Single app usage item for display (ranking lists, distribution charts). */
export interface AppUsageItem {
  app_name: string;
  duration: number; // seconds
  percentage: number; // 0-100
  formattedDuration: string; // e.g., "2h 35m"
  is_focused?: boolean; // v3: Focus Mode 开启时返回
}

/** Today's summary data returned by getTodaySummary(). */
export interface TodaySummaryData {
  total_seconds: number;
  formatted_total: string;
  active_apps_count: number;
  top_apps: AppUsageItem[];
  hourly_heatmap: number[]; // 24 values, active minutes per hour
  focused_total_seconds?: number; // v3: Focus Mode 开启时返回
  distracted_total_seconds?: number; // v3: Focus Mode 开启时返回
}

/** Weekly report data returned by getWeeklyReport(). */
export interface WeeklyReportData {
  week_label: string;
  daily_totals: { date: string; total_seconds: number }[];
  app_distribution: AppUsageItem[];
  trend_data: { date: string; duration: number }[];
  previous_week_comparison: { diff_percent: number };
}

/** Monthly report data returned by getMonthlyReport(). */
export interface MonthlyReportData {
  month_label: string;
  weekly_totals: { week: string; total_seconds: number }[];
  app_distribution: AppUsageItem[];
  previous_month_comparison: { diff_percent: number };
}

/** Ranking row from getAppRanking(). */
export interface AppRankingRow {
  app_name: string;
  total_duration: number; // seconds
}

/** Weekly aggregation row from getWeeklySummary(). */
export interface WeeklySummaryRow {
  date: string;
  total_duration: number;
}

/** Monthly aggregation row from getMonthlySummary(). */
export interface MonthlySummaryRow {
  app_name: string;
  total_duration: number;
}

// ─── Tracker / IPC Types ────────────────────────────────────────

/** Real-time tracker status exposed to the renderer. */
export interface TrackerStatus {
  is_tracking: boolean;
  is_paused: boolean;
  current_app: string | null;
  current_session_start: number | null; // Unix timestamp ms
}

/** Data pushed when a usage limit is reached. */
export interface LimitReachedData {
  app_name: string;
  limit_minutes: number;
  used_minutes: number;
}

/** Event emitted on foreground window switch. */
export interface AppSwitchEvent {
  previous_app: string | null;
  current_app: string;
  current_window: string;
  session_duration: number; // seconds spent in previous_app
  timestamp: number; // Unix timestamp ms
}

/** Result of a limit check. */
export interface LimitCheckResult {
  is_limited: boolean;
  limit_minutes: number;
  used_minutes: number;
  remaining_minutes: number;
}

/** Export row for CSV/PDF output. */
export interface ExportRow {
  date: string;
  app_name: string;
  window_title: string;
  duration: number;
  started_at: string;
  ended_at: string;
}

/** Category-summary row for aggregated category breakdowns. */
export interface CategorySummary {
  category: string;
  total_duration: number; // seconds
}

/** Full category entry from app_categories table. */
export interface AppCategoryRow {
  id: number;
  app_name: string;
  category: string;
}

// ─── v3: Focus Mode (F-09) ────────────────────────────────────

/** Focus mode status returned by getFocusStatus(). */
export interface FocusModeStatus {
  enabled: boolean;
  whitelist: string[];
}

/** Focus report for a specific date, broken down by app. */
export interface FocusReportData {
  date: string;
  focused_apps: AppUsageItem[];
  distracted_apps: AppUsageItem[];
  focused_total_seconds: number;
  distracted_total_seconds: number;
  total_seconds: number;
}

// ─── v3: Custom Range (F-12) ──────────────────────────────────

/** Aggregated custom date range report. */
export interface CustomRangeReport {
  total_seconds: number;
  formatted_total: string;
  active_days: number;
  daily_average_seconds: number;
  formatted_daily_average: string;
  top_app_name: string | null;
  top_app_duration: number;
}

/** Daily trend data point for custom range chart. */
export interface DailyTrendItem {
  date: string;
  total_seconds: number;
}

/** App ranking for custom date range. */
export interface CustomRangeAppRankingItem {
  app_name: string;
  total_duration: number;
}

// ─── v3: Auto Update (F-11) ───────────────────────────────────

/** Auto-update state managed by updateStore. */
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateInfo {
  status: UpdateStatus;
  version?: string;
  error?: string;
}

// ─── IPC Response Wrapper ───────────────────────────────────────

/**
 * Standard IPC response format.
 * All main-process IPC handlers return this shape.
 */
export interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
