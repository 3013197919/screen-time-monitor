import type BetterSqlite3 from 'better-sqlite3';
import type {
  AppEvent,
  AppEventInput,
  DailySummary,
  UsageLimit,
  UsageLimitInput,
  AppRankingRow,
  WeeklySummaryRow,
  MonthlySummaryRow,
  ExportRow,
  CategorySummary,
  AppCategoryRow,
  FocusModeStatus,
  FocusReportData,
  CustomRangeReport,
  DailyTrendItem,
  CustomRangeAppRankingItem,
  AppUsageItem,
} from '../../src/types/models';

/**
 * Data query layer for Screen Time Monitor.
 *
 * Encapsulates all SQL operations on the SQLite database.
 * All methods use parameterized queries to prevent SQL injection.
 * All duration values are stored and returned in seconds.
 */
export class Queries {
  private db: BetterSqlite3.Database;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
  }

  // ── Event Recording ──────────────────────────────────────────

  /**
   * Insert a new app-switch event into app_events.
   *
   * @param event - The app event data to insert.
   */
  insertEvent(event: AppEventInput): void {
    const stmt = this.db.prepare(`
      INSERT INTO app_events (app_name, window_title, started_at, ended_at, duration, date)
      VALUES (@app_name, @window_title, @started_at, @ended_at, @duration, @date)
    `);
    stmt.run({
      app_name: event.app_name,
      window_title: event.window_title,
      started_at: event.started_at,
      ended_at: event.ended_at,
      duration: event.duration,
      date: event.date,
    });
  }

  /**
   * Retrieve all app events within a date range (inclusive).
   *
   * @param start - Start date in YYYY-MM-DD format.
   * @param end - End date in YYYY-MM-DD format.
   * @returns Array of AppEvent rows.
   */
  getEventsInRange(start: string, end: string): AppEvent[] {
    const stmt = this.db.prepare(`
      SELECT * FROM app_events
      WHERE date >= @start AND date <= @end
      ORDER BY started_at ASC
    `);
    return stmt.all({ start, end }) as AppEvent[];
  }

  // ── Daily Aggregation ────────────────────────────────────────

  /**
   * Insert or update a daily summary row for a specific app and date.
   * Uses INSERT ... ON CONFLICT UPSERT to accumulate duration.
   *
   * @param appName - The application process name.
   * @param date - Date in YYYY-MM-DD format.
   * @param duration - Duration in seconds to add.
   */
  upsertDailySummary(appName: string, date: string, duration: number): void {
    const stmt = this.db.prepare(`
      INSERT INTO daily_summary (app_name, date, total_duration)
      VALUES (@app_name, @date, @duration)
      ON CONFLICT(app_name, date)
      DO UPDATE SET total_duration = total_duration + @duration
    `);
    stmt.run({ app_name: appName, date, duration });
  }

  /**
   * Get the daily summary for a given date.
   *
   * @param date - Date in YYYY-MM-DD format.
   * @returns Array of DailySummary rows.
   */
  getDailySummary(date: string): DailySummary[] {
    const stmt = this.db.prepare(`
      SELECT * FROM daily_summary
      WHERE date = @date
      ORDER BY total_duration DESC
    `);
    return stmt.all({ date }) as DailySummary[];
  }

  /**
   * Get aggregated weekly summary grouped by date.
   *
   * @param weekStart - Monday of the target week in YYYY-MM-DD format.
   * @returns Array of { date, total_duration } rows.
   */
  getWeeklySummary(weekStart: string): WeeklySummaryRow[] {
    // Calculate the end of the week (Sunday)
    const stmt = this.db.prepare(`
      SELECT
        date,
        SUM(total_duration) AS total_duration
      FROM daily_summary
      WHERE date >= @week_start AND date <= @week_end
      GROUP BY date
      ORDER BY date ASC
    `);

    // Compute week_end = weekStart + 6 days
    const startDate = new Date(weekStart + 'T00:00:00Z');
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 6);
    const weekEnd = endDate.toISOString().slice(0, 10);

    return stmt.all({
      week_start: weekStart,
      week_end: weekEnd,
    }) as WeeklySummaryRow[];
  }

  /**
   * Get aggregated monthly summary grouped by app.
   *
   * @param month - Month in YYYY-MM format (e.g., "2026-06").
   * @returns Array of { app_name, total_duration } rows.
   */
  getMonthlySummary(month: string): MonthlySummaryRow[] {
    const monthPrefix = month + '-'; // e.g., "2026-06-"
    const stmt = this.db.prepare(`
      SELECT
        app_name,
        SUM(total_duration) AS total_duration
      FROM daily_summary
      WHERE date LIKE @month_prefix || '%'
      GROUP BY app_name
      ORDER BY total_duration DESC
    `);
    return stmt.all({ month_prefix: monthPrefix }) as MonthlySummaryRow[];
  }

  // ── Hourly Heatmap ───────────────────────────────────────────

  /**
   * Get hourly activity heatmap by aggregating event durations from
   * app_events grouped by the hour of started_at.
   *
   * @param date - Date in YYYY-MM-DD format.
   * @returns Array of 24 numbers representing total seconds per hour (0–23).
   */
  getHourlyHeatmap(date: string): number[] {
    const stmt = this.db.prepare(`
      SELECT
        CAST(strftime('%H', started_at) AS INTEGER) AS hour,
        SUM(duration) AS total_duration
      FROM app_events
      WHERE date = @date
      GROUP BY hour
      ORDER BY hour
    `);
    const rows = stmt.all({ date }) as {
      hour: number;
      total_duration: number;
    }[];

    const heatmap: number[] = new Array(24).fill(0);
    for (const row of rows) {
      if (row.hour >= 0 && row.hour < 24) {
        heatmap[row.hour] = row.total_duration;
      }
    }
    return heatmap;
  }

  // ── Weekly App Aggregation ───────────────────────────────────

  /**
   * Get aggregated weekly app summary summed across all 7 days of the week.
   *
   * @param weekStart - Monday of the target week in YYYY-MM-DD format.
   * @returns Array of { app_name, total_duration } sorted by total_duration DESC.
   */
  getWeeklyAppSummary(weekStart: string): MonthlySummaryRow[] {
    const startDate = new Date(weekStart + 'T00:00:00Z');
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 6);
    const weekEnd: string = endDate.toISOString().slice(0, 10);

    const stmt = this.db.prepare(`
      SELECT
        app_name,
        SUM(total_duration) AS total_duration
      FROM daily_summary
      WHERE date >= @week_start AND date <= @week_end
      GROUP BY app_name
      ORDER BY total_duration DESC
    `);
    return stmt.all({
      week_start: weekStart,
      week_end: weekEnd,
    }) as MonthlySummaryRow[];
  }

  // ── App Ranking ──────────────────────────────────────────────

  /**
   * Get top-N apps ranked by usage duration for a specific date.
   *
   * @param date - Date in YYYY-MM-DD format.
   * @param limit - Maximum number of results to return.
   * @returns Array of AppRankingRow sorted by total_duration descending.
   */
  getAppRanking(date: string, limit: number): AppRankingRow[] {
    const stmt = this.db.prepare(`
      SELECT
        app_name,
        total_duration
      FROM daily_summary
      WHERE date = @date
      ORDER BY total_duration DESC
      LIMIT @limit
    `);
    return stmt.all({ date, limit }) as AppRankingRow[];
  }

  // ── Usage Limits ─────────────────────────────────────────────

  /**
   * Get all configured usage limits.
   *
   * @returns Array of UsageLimit rows.
   */
  getUsageLimits(): UsageLimit[] {
    const stmt = this.db.prepare(`
      SELECT * FROM usage_limits ORDER BY app_name ASC
    `);
    const rows = stmt.all() as Array<{
      id: number;
      app_name: string;
      limit_minutes: number;
      enabled: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      app_name: row.app_name,
      limit_minutes: row.limit_minutes,
      enabled: row.enabled === 1,
    }));
  }

  /**
   * Create or update a usage limit for an application.
   *
   * @param limit - The usage limit to set.
   */
  setUsageLimit(limit: UsageLimitInput): void {
    const enabled = limit.enabled !== false ? 1 : 0;
    const stmt = this.db.prepare(`
      INSERT INTO usage_limits (app_name, limit_minutes, enabled)
      VALUES (@app_name, @limit_minutes, @enabled)
      ON CONFLICT(app_name)
      DO UPDATE SET limit_minutes = @limit_minutes, enabled = @enabled
    `);
    stmt.run({
      app_name: limit.app_name,
      limit_minutes: limit.limit_minutes,
      enabled,
    });
  }

  /**
   * Delete a usage limit by ID.
   *
   * @param id - The ID of the usage limit to delete.
   */
  deleteUsageLimit(id: number): void {
    const stmt = this.db.prepare(`
      DELETE FROM usage_limits WHERE id = @id
    `);
    stmt.run({ id });
  }

  // ── Settings ─────────────────────────────────────────────────

  /**
   * Get a setting value by key.
   *
   * @param key - The setting key.
   * @returns The setting value, or null if not found.
   */
  getSetting(key: string): string | null {
    const stmt = this.db.prepare(`
      SELECT value FROM settings WHERE key = @key
    `);
    const row = stmt.get({ key }) as { value: string } | undefined;
    return row ? row.value : null;
  }

  /**
   * Set (insert or update) a setting key-value pair.
   *
   * @param key - The setting key.
   * @param value - The setting value.
   */
  setSetting(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO settings (key, value) VALUES (@key, @value)
      ON CONFLICT(key) DO UPDATE SET value = @value
    `);
    stmt.run({ key, value });
  }

  // ── Data Export ──────────────────────────────────────────────

  /**
   * Get all event data for export within a date range.
   *
   * @param startDate - Start date in YYYY-MM-DD format.
   * @param endDate - End date in YYYY-MM-DD format.
   * @returns Array of ExportRow for CSV/PDF generation.
   */
  getExportData(startDate: string, endDate: string): ExportRow[] {
    const stmt = this.db.prepare(`
      SELECT
        date,
        app_name,
        window_title,
        duration,
        started_at,
        ended_at
      FROM app_events
      WHERE date >= @start_date AND date <= @end_date
      ORDER BY started_at ASC
    `);
    return stmt.all({
      start_date: startDate,
      end_date: endDate,
    }) as ExportRow[];
  }

  // ── App Categories ──────────────────────────────────────────

  /**
   * Get all configured app-category mappings.
   *
   * @returns Array of AppCategoryRow.
   */
  getCategories(): AppCategoryRow[] {
    const stmt = this.db.prepare(`
      SELECT id, app_name, category FROM app_categories ORDER BY app_name ASC
    `);
    return stmt.all() as AppCategoryRow[];
  }

  /**
   * Create or update a category mapping for an application.
   *
   * @param appName - The application process name.
   * @param category - One of 'work', 'study', 'entertainment', 'other'.
   */
  setCategory(appName: string, category: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO app_categories (app_name, category)
      VALUES (@app_name, @category)
      ON CONFLICT(app_name)
      DO UPDATE SET category = @category
    `);
    stmt.run({ app_name: appName, category });
  }

  /**
   * Delete a category mapping by ID.
   *
   * @param id - The ID of the category mapping to delete.
   */
  deleteCategory(id: number): void {
    const stmt = this.db.prepare(`
      DELETE FROM app_categories WHERE id = @id
    `);
    stmt.run({ id });
  }

  /**
   * Get categorized duration summary for a date range.
   * Joins daily_summary with app_categories to aggregate by category.
   * Uncategorized apps fall under 'other'.
   *
   * @param startDate - Start date in YYYY-MM-DD format.
   * @param endDate - End date in YYYY-MM-DD format.
   * @returns Array of CategorySummary sorted by total_duration DESC.
   */
  getCategorizedReport(startDate: string, endDate: string): CategorySummary[] {
    const stmt = this.db.prepare(`
      SELECT
        COALESCE(ac.category, 'other') AS category,
        SUM(ds.total_duration) AS total_duration
      FROM daily_summary ds
      LEFT JOIN app_categories ac ON ds.app_name = ac.app_name
      WHERE ds.date >= @start AND ds.date <= @end
      GROUP BY COALESCE(ac.category, 'other')
      ORDER BY total_duration DESC
    `);
    return stmt.all({ start: startDate, end: endDate }) as CategorySummary[];
  }

  // ── Data Cleanup ───────────────────────────────────────────

  /** Delete event + summary rows older than N days, then optimize. Returns total deleted count. */
  deleteOldData(retentionDays: number): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const d1 = this.db.prepare('DELETE FROM app_events WHERE date < @cutoff').run({ cutoff: cutoffStr });
    const d2 = this.db.prepare('DELETE FROM daily_summary WHERE date < @cutoff').run({ cutoff: cutoffStr });
    this.db.pragma('optimize');
    return d1.changes + d2.changes;
  }

  /** Count old events that would be deleted. */
  countOldEvents(retentionDays: number): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const row = this.db.prepare('SELECT COUNT(*) AS cnt FROM app_events WHERE date < @cutoff').get({ cutoff: cutoffStr }) as { cnt: number };
    return row.cnt;
  }

  // ── v3: Focus Mode ────────────────────────────────────────────

  /**
   * Get focus mode status: whether it's enabled and the whitelist.
   *
   * @returns FocusModeStatus with enabled flag and list of app names.
   */
  getFocusStatus(): FocusModeStatus {
    const enabled: string | null = this.getSetting('focus_mode_enabled');
    const whitelistJson: string | null = this.getSetting('focus_whitelist');
    let whitelist: string[] = [];
    if (whitelistJson) {
      try {
        whitelist = JSON.parse(whitelistJson);
        if (!Array.isArray(whitelist)) whitelist = [];
      } catch {
        whitelist = [];
      }
    }
    return {
      enabled: enabled === 'true',
      whitelist,
    };
  }

  /**
   * Get focus report for a specific date — classifies apps as focused/distracted
   * based on the focus_whitelist setting.
   *
   * @param date - Date in YYYY-MM-DD format.
   * @returns FocusReportData with focused/distracted breakdown.
   */
  getFocusReport(date: string): FocusReportData {
    const { whitelist } = this.getFocusStatus();
    const dailyRows = this.getDailySummary(date);
    const totalSeconds: number = dailyRows.reduce((s, r) => s + r.total_duration, 0);

    const focusedApps: AppUsageItem[] = [];
    const distractedApps: AppUsageItem[] = [];
    let focusedTotal = 0;
    let distractedTotal = 0;

    for (const row of dailyRows) {
      const isFocused: boolean = whitelist.length === 0
        ? false
        : whitelist.some((w: string) => row.app_name.toLowerCase() === w.toLowerCase());
      const item: AppUsageItem = {
        app_name: row.app_name,
        duration: row.total_duration,
        percentage: totalSeconds > 0 ? Math.round((row.total_duration / totalSeconds) * 100) : 0,
        formattedDuration: this.formatDuration(row.total_duration),
        is_focused: isFocused,
      };

      if (isFocused) {
        focusedApps.push(item);
        focusedTotal += row.total_duration;
      } else {
        distractedApps.push(item);
        distractedTotal += row.total_duration;
      }
    }

    // Sort each group by duration descending
    focusedApps.sort((a, b) => b.duration - a.duration);
    distractedApps.sort((a, b) => b.duration - a.duration);

    return {
      date,
      focused_apps: focusedApps.slice(0, 10),
      distracted_apps: distractedApps.slice(0, 10),
      focused_total_seconds: focusedTotal,
      distracted_total_seconds: distractedTotal,
      total_seconds: totalSeconds,
    };
  }

  // ── v3: Custom Range ──────────────────────────────────────────

  /**
   * Get aggregated custom date range report.
   *
   * @param startDate - Start date in YYYY-MM-DD format.
   * @param endDate - End date in YYYY-MM-DD format.
   * @returns CustomRangeReport with totals, daily average, top app.
   */
  getCustomRangeReport(startDate: string, endDate: string): CustomRangeReport {
    const stmt = this.db.prepare(`
      SELECT
        app_name,
        SUM(total_duration) AS total_duration
      FROM daily_summary
      WHERE date >= @start AND date <= @end
      GROUP BY app_name
      ORDER BY total_duration DESC
    `);
    const rows = stmt.all({ start: startDate, end: endDate }) as { app_name: string; total_duration: number }[];

    const totalSeconds: number = rows.reduce((s, r) => s + r.total_duration, 0);
    const topApp = rows.length > 0 ? rows[0] : null;

    // Count days with data
    const dayStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT date) AS cnt
      FROM daily_summary
      WHERE date >= @start AND date <= @end
    `);
    const dayRow = dayStmt.get({ start: startDate, end: endDate }) as { cnt: number };
    const activeDays: number = dayRow ? dayRow.cnt : 0;
    const dailyAverageSeconds: number = activeDays > 0 ? Math.round(totalSeconds / activeDays) : 0;

    return {
      total_seconds: totalSeconds,
      formatted_total: this.formatDuration(totalSeconds),
      active_days: activeDays,
      daily_average_seconds: dailyAverageSeconds,
      formatted_daily_average: this.formatDuration(dailyAverageSeconds),
      top_app_name: topApp ? topApp.app_name : null,
      top_app_duration: topApp ? topApp.total_duration : 0,
    };
  }

  /**
   * Get daily trend data for a custom date range (for line/bar chart).
   *
   * @param startDate - Start date in YYYY-MM-DD format.
   * @param endDate - End date in YYYY-MM-DD format.
   * @returns Array of DailyTrendItem, one per day.
   */
  getCustomRangeTrend(startDate: string, endDate: string): DailyTrendItem[] {
    const stmt = this.db.prepare(`
      SELECT
        date,
        SUM(total_duration) AS total_seconds
      FROM daily_summary
      WHERE date >= @start AND date <= @end
      GROUP BY date
      ORDER BY date ASC
    `);
    const rows = stmt.all({ start: startDate, end: endDate }) as { date: string; total_seconds: number }[];
    return rows.map((r) => ({ date: r.date, total_seconds: r.total_seconds }));
  }

  /**
   * Get app ranking for a custom date range.
   *
   * @param startDate - Start date in YYYY-MM-DD format.
   * @param endDate - End date in YYYY-MM-DD format.
   * @param limit - Max number of results.
   * @returns Array of AppUsageItem sorted by duration DESC.
   */
  getCustomRangeRanking(startDate: string, endDate: string, limit: number): AppUsageItem[] {
    const stmt = this.db.prepare(`
      SELECT
        app_name,
        SUM(total_duration) AS total_duration
      FROM daily_summary
      WHERE date >= @start AND date <= @end
      GROUP BY app_name
      ORDER BY total_duration DESC
      LIMIT @limit
    `);
    const rows = stmt.all({ start: startDate, end: endDate, limit }) as { app_name: string; total_duration: number }[];

    const totalSeconds: number = rows.reduce((s, r) => s + r.total_duration, 0);

    return rows.map((r) => ({
      app_name: r.app_name,
      duration: r.total_duration,
      percentage: totalSeconds > 0 ? Math.round((r.total_duration / totalSeconds) * 100) : 0,
      formattedDuration: this.formatDuration(r.total_duration),
    }));
  }

  /**
   * Format seconds into a human-friendly duration string.
   * Convenience method used by focus/custom-range queries.
   */
  private formatDuration(seconds: number): string {
    if (seconds <= 0) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts: string[] = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 && parts.length === 0) parts.push(`${s}s`);
    return parts.join(' ') || '0s';
  }
}
