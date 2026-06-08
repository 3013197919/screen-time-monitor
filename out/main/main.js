"use strict";
const electron = require("electron");
const electronUpdater = require("electron-updater");
const path = require("path");
const BetterSqlite3 = require("better-sqlite3");
const AutoLaunch = require("auto-launch");
class Migrations {
  /** Current latest schema version. */
  static CURRENT_VERSION = 1;
  /**
   * Run all pending migrations to bring the database to the latest schema version.
   *
   * @param db - The better-sqlite3 database instance.
   */
  static run(db2) {
    const currentVersion = db2.pragma("user_version", { simple: true });
    if (currentVersion >= Migrations.CURRENT_VERSION) {
      console.log(
        `[Migrations] Schema is up to date (version ${currentVersion}).`
      );
      return;
    }
    console.log(
      `[Migrations] Upgrading from version ${currentVersion} to ${Migrations.CURRENT_VERSION}...`
    );
    for (let version = currentVersion + 1; version <= Migrations.CURRENT_VERSION; version++) {
      Migrations.applyMigration(db2, version);
    }
    db2.pragma(`user_version = ${Migrations.CURRENT_VERSION}`);
    console.log(`[Migrations] Schema upgraded to version ${Migrations.CURRENT_VERSION}.`);
  }
  /**
   * Apply a single migration version.
   *
   * @param db - The better-sqlite3 database instance.
   * @param version - The migration version to apply.
   */
  static applyMigration(db2, version) {
    switch (version) {
      case 1:
        Migrations.createAppEventsTable(db2);
        Migrations.createDailySummaryTable(db2);
        Migrations.createUsageLimitsTable(db2);
        Migrations.createSettingsTable(db2);
        Migrations.createAppCategoriesTable(db2);
        break;
      default:
        throw new Error(`[Migrations] Unknown migration version: ${version}`);
    }
  }
  /**
   * Create the app_events table.
   * Stores raw foreground-window-switch events with timing data.
   */
  static createAppEventsTable(db2) {
    db2.exec(`
      CREATE TABLE IF NOT EXISTS app_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_name TEXT NOT NULL,
        window_title TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        duration INTEGER NOT NULL,
        date TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_date ON app_events(date);
      CREATE INDEX IF NOT EXISTS idx_events_app ON app_events(app_name, date);
    `);
    console.log("[Migrations] Created app_events table.");
  }
  /**
   * Create the daily_summary table.
   * Pre-aggregated daily usage data for fast dashboard queries.
   */
  static createDailySummaryTable(db2) {
    db2.exec(`
      CREATE TABLE IF NOT EXISTS daily_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_name TEXT NOT NULL,
        date TEXT NOT NULL,
        total_duration INTEGER NOT NULL,
        UNIQUE(app_name, date)
      );
      CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_summary(date);
    `);
    console.log("[Migrations] Created daily_summary table.");
  }
  /**
   * Create the usage_limits table.
   * Stores per-app daily usage time limits configured by the user.
   */
  static createUsageLimitsTable(db2) {
    db2.exec(`
      CREATE TABLE IF NOT EXISTS usage_limits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_name TEXT NOT NULL UNIQUE,
        limit_minutes INTEGER NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1
      );
    `);
    console.log("[Migrations] Created usage_limits table.");
  }
  /**
   * Create the settings table.
   * Key-value store for application configuration.
   */
  static createSettingsTable(db2) {
    db2.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    console.log("[Migrations] Created settings table.");
  }
  /**
   * Create the app_categories table (P2 — planned for future release).
   * Maps application names to user-defined categories.
   */
  static createAppCategoriesTable(db2) {
    db2.exec(`
      CREATE TABLE IF NOT EXISTS app_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_name TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL
      );
    `);
    console.log("[Migrations] Created app_categories table.");
  }
}
class Database {
  db;
  dbPath;
  /**
   * Initialize the database connection.
   *
   * @param dbPath - Full path to the SQLite database file.
   * @param encryptionKey - (Future) Encryption key for SQLCipher. Currently unused.
   */
  constructor(dbPath, encryptionKey) {
    this.dbPath = dbPath;
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("cache_size = -8000");
    console.log("[Database] Connected to", dbPath);
  }
  /**
   * Get the underlying better-sqlite3 Database instance.
   * Used by Queries and other services to execute SQL.
   */
  getDb() {
    return this.db;
  }
  /**
   * Run all pending database migrations.
   * Delegates to the static Migrations.run() method.
   */
  runMigrations() {
    console.log("[Database] Running migrations...");
    Migrations.run(this.db);
    console.log("[Database] Migrations complete.");
  }
  /**
   * Gracefully close the database connection.
   * Should be called during app shutdown.
   */
  close() {
    if (this.db && this.db.open) {
      try {
        this.db.close();
        console.log("[Database] Connection closed.");
      } catch (err) {
        console.error("[Database] Error closing connection:", err);
      }
    }
  }
}
class Queries {
  db;
  constructor(db2) {
    this.db = db2;
  }
  // ── Event Recording ──────────────────────────────────────────
  /**
   * Insert a new app-switch event into app_events.
   *
   * @param event - The app event data to insert.
   */
  insertEvent(event) {
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
      date: event.date
    });
  }
  /**
   * Retrieve all app events within a date range (inclusive).
   *
   * @param start - Start date in YYYY-MM-DD format.
   * @param end - End date in YYYY-MM-DD format.
   * @returns Array of AppEvent rows.
   */
  getEventsInRange(start, end) {
    const stmt = this.db.prepare(`
      SELECT * FROM app_events
      WHERE date >= @start AND date <= @end
      ORDER BY started_at ASC
    `);
    return stmt.all({ start, end });
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
  upsertDailySummary(appName, date, duration) {
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
  getDailySummary(date) {
    const stmt = this.db.prepare(`
      SELECT * FROM daily_summary
      WHERE date = @date
      ORDER BY total_duration DESC
    `);
    return stmt.all({ date });
  }
  /**
   * Get aggregated weekly summary grouped by date.
   *
   * @param weekStart - Monday of the target week in YYYY-MM-DD format.
   * @returns Array of { date, total_duration } rows.
   */
  getWeeklySummary(weekStart) {
    const stmt = this.db.prepare(`
      SELECT
        date,
        SUM(total_duration) AS total_duration
      FROM daily_summary
      WHERE date >= @week_start AND date <= @week_end
      GROUP BY date
      ORDER BY date ASC
    `);
    const startDate = /* @__PURE__ */ new Date(weekStart + "T00:00:00Z");
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 6);
    const weekEnd = endDate.toISOString().slice(0, 10);
    return stmt.all({
      week_start: weekStart,
      week_end: weekEnd
    });
  }
  /**
   * Get aggregated monthly summary grouped by app.
   *
   * @param month - Month in YYYY-MM format (e.g., "2026-06").
   * @returns Array of { app_name, total_duration } rows.
   */
  getMonthlySummary(month) {
    const monthPrefix = month + "-";
    const stmt = this.db.prepare(`
      SELECT
        app_name,
        SUM(total_duration) AS total_duration
      FROM daily_summary
      WHERE date LIKE @month_prefix || '%'
      GROUP BY app_name
      ORDER BY total_duration DESC
    `);
    return stmt.all({ month_prefix: monthPrefix });
  }
  // ── Hourly Heatmap ───────────────────────────────────────────
  /**
   * Get hourly activity heatmap by aggregating event durations from
   * app_events grouped by the hour of started_at.
   *
   * @param date - Date in YYYY-MM-DD format.
   * @returns Array of 24 numbers representing total seconds per hour (0–23).
   */
  getHourlyHeatmap(date) {
    const stmt = this.db.prepare(`
      SELECT
        CAST(strftime('%H', started_at) AS INTEGER) AS hour,
        SUM(duration) AS total_duration
      FROM app_events
      WHERE date = @date
      GROUP BY hour
      ORDER BY hour
    `);
    const rows = stmt.all({ date });
    const heatmap = new Array(24).fill(0);
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
  getWeeklyAppSummary(weekStart) {
    const startDate = /* @__PURE__ */ new Date(weekStart + "T00:00:00Z");
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 6);
    const weekEnd = endDate.toISOString().slice(0, 10);
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
      week_end: weekEnd
    });
  }
  // ── App Ranking ──────────────────────────────────────────────
  /**
   * Get top-N apps ranked by usage duration for a specific date.
   *
   * @param date - Date in YYYY-MM-DD format.
   * @param limit - Maximum number of results to return.
   * @returns Array of AppRankingRow sorted by total_duration descending.
   */
  getAppRanking(date, limit) {
    const stmt = this.db.prepare(`
      SELECT
        app_name,
        total_duration
      FROM daily_summary
      WHERE date = @date
      ORDER BY total_duration DESC
      LIMIT @limit
    `);
    return stmt.all({ date, limit });
  }
  // ── Usage Limits ─────────────────────────────────────────────
  /**
   * Get all configured usage limits.
   *
   * @returns Array of UsageLimit rows.
   */
  getUsageLimits() {
    const stmt = this.db.prepare(`
      SELECT * FROM usage_limits ORDER BY app_name ASC
    `);
    const rows = stmt.all();
    return rows.map((row) => ({
      id: row.id,
      app_name: row.app_name,
      limit_minutes: row.limit_minutes,
      enabled: row.enabled === 1
    }));
  }
  /**
   * Create or update a usage limit for an application.
   *
   * @param limit - The usage limit to set.
   */
  setUsageLimit(limit) {
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
      enabled
    });
  }
  /**
   * Delete a usage limit by ID.
   *
   * @param id - The ID of the usage limit to delete.
   */
  deleteUsageLimit(id) {
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
  getSetting(key) {
    const stmt = this.db.prepare(`
      SELECT value FROM settings WHERE key = @key
    `);
    const row = stmt.get({ key });
    return row ? row.value : null;
  }
  /**
   * Set (insert or update) a setting key-value pair.
   *
   * @param key - The setting key.
   * @param value - The setting value.
   */
  setSetting(key, value) {
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
  getExportData(startDate, endDate) {
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
      end_date: endDate
    });
  }
  // ── App Categories ──────────────────────────────────────────
  /**
   * Get all configured app-category mappings.
   *
   * @returns Array of AppCategoryRow.
   */
  getCategories() {
    const stmt = this.db.prepare(`
      SELECT id, app_name, category FROM app_categories ORDER BY app_name ASC
    `);
    return stmt.all();
  }
  /**
   * Create or update a category mapping for an application.
   *
   * @param appName - The application process name.
   * @param category - One of 'work', 'study', 'entertainment', 'other'.
   */
  setCategory(appName, category) {
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
  deleteCategory(id) {
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
  getCategorizedReport(startDate, endDate) {
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
    return stmt.all({ start: startDate, end: endDate });
  }
  // ── Data Cleanup ───────────────────────────────────────────
  /** Delete event + summary rows older than N days, then optimize. Returns total deleted count. */
  deleteOldData(retentionDays) {
    const cutoff = /* @__PURE__ */ new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const d1 = this.db.prepare("DELETE FROM app_events WHERE date < @cutoff").run({ cutoff: cutoffStr });
    const d2 = this.db.prepare("DELETE FROM daily_summary WHERE date < @cutoff").run({ cutoff: cutoffStr });
    this.db.pragma("optimize");
    return d1.changes + d2.changes;
  }
  /** Count old events that would be deleted. */
  countOldEvents(retentionDays) {
    const cutoff = /* @__PURE__ */ new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const row = this.db.prepare("SELECT COUNT(*) AS cnt FROM app_events WHERE date < @cutoff").get({ cutoff: cutoffStr });
    return row.cnt;
  }
  // ── v3: Focus Mode ────────────────────────────────────────────
  /**
   * Get focus mode status: whether it's enabled and the whitelist.
   *
   * @returns FocusModeStatus with enabled flag and list of app names.
   */
  getFocusStatus() {
    const enabled = this.getSetting("focus_mode_enabled");
    const whitelistJson = this.getSetting("focus_whitelist");
    let whitelist = [];
    if (whitelistJson) {
      try {
        whitelist = JSON.parse(whitelistJson);
        if (!Array.isArray(whitelist)) whitelist = [];
      } catch {
        whitelist = [];
      }
    }
    return {
      enabled: enabled === "true",
      whitelist
    };
  }
  /**
   * Get focus report for a specific date — classifies apps as focused/distracted
   * based on the focus_whitelist setting.
   *
   * @param date - Date in YYYY-MM-DD format.
   * @returns FocusReportData with focused/distracted breakdown.
   */
  getFocusReport(date) {
    const { whitelist } = this.getFocusStatus();
    const dailyRows = this.getDailySummary(date);
    const totalSeconds = dailyRows.reduce((s, r) => s + r.total_duration, 0);
    const focusedApps = [];
    const distractedApps = [];
    let focusedTotal = 0;
    let distractedTotal = 0;
    for (const row of dailyRows) {
      const isFocused = whitelist.length === 0 ? false : whitelist.some((w) => row.app_name.toLowerCase() === w.toLowerCase());
      const item = {
        app_name: row.app_name,
        duration: row.total_duration,
        percentage: totalSeconds > 0 ? Math.round(row.total_duration / totalSeconds * 100) : 0,
        formattedDuration: this.formatDuration(row.total_duration),
        is_focused: isFocused
      };
      if (isFocused) {
        focusedApps.push(item);
        focusedTotal += row.total_duration;
      } else {
        distractedApps.push(item);
        distractedTotal += row.total_duration;
      }
    }
    focusedApps.sort((a, b) => b.duration - a.duration);
    distractedApps.sort((a, b) => b.duration - a.duration);
    return {
      date,
      focused_apps: focusedApps.slice(0, 10),
      distracted_apps: distractedApps.slice(0, 10),
      focused_total_seconds: focusedTotal,
      distracted_total_seconds: distractedTotal,
      total_seconds: totalSeconds
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
  getCustomRangeReport(startDate, endDate) {
    const stmt = this.db.prepare(`
      SELECT
        app_name,
        SUM(total_duration) AS total_duration
      FROM daily_summary
      WHERE date >= @start AND date <= @end
      GROUP BY app_name
      ORDER BY total_duration DESC
    `);
    const rows = stmt.all({ start: startDate, end: endDate });
    const totalSeconds = rows.reduce((s, r) => s + r.total_duration, 0);
    const topApp = rows.length > 0 ? rows[0] : null;
    const dayStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT date) AS cnt
      FROM daily_summary
      WHERE date >= @start AND date <= @end
    `);
    const dayRow = dayStmt.get({ start: startDate, end: endDate });
    const activeDays = dayRow ? dayRow.cnt : 0;
    const dailyAverageSeconds = activeDays > 0 ? Math.round(totalSeconds / activeDays) : 0;
    return {
      total_seconds: totalSeconds,
      formatted_total: this.formatDuration(totalSeconds),
      active_days: activeDays,
      daily_average_seconds: dailyAverageSeconds,
      formatted_daily_average: this.formatDuration(dailyAverageSeconds),
      top_app_name: topApp ? topApp.app_name : null,
      top_app_duration: topApp ? topApp.total_duration : 0
    };
  }
  /**
   * Get daily trend data for a custom date range (for line/bar chart).
   *
   * @param startDate - Start date in YYYY-MM-DD format.
   * @param endDate - End date in YYYY-MM-DD format.
   * @returns Array of DailyTrendItem, one per day.
   */
  getCustomRangeTrend(startDate, endDate) {
    const stmt = this.db.prepare(`
      SELECT
        date,
        SUM(total_duration) AS total_seconds
      FROM daily_summary
      WHERE date >= @start AND date <= @end
      GROUP BY date
      ORDER BY date ASC
    `);
    const rows = stmt.all({ start: startDate, end: endDate });
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
  getCustomRangeRanking(startDate, endDate, limit) {
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
    const rows = stmt.all({ start: startDate, end: endDate, limit });
    const totalSeconds = rows.reduce((s, r) => s + r.total_duration, 0);
    return rows.map((r) => ({
      app_name: r.app_name,
      duration: r.total_duration,
      percentage: totalSeconds > 0 ? Math.round(r.total_duration / totalSeconds * 100) : 0,
      formattedDuration: this.formatDuration(r.total_duration)
    }));
  }
  /**
   * Format seconds into a human-friendly duration string.
   * Convenience method used by focus/custom-range queries.
   */
  formatDuration(seconds) {
    if (seconds <= 0) return "0s";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = seconds % 60;
    const parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 && parts.length === 0) parts.push(`${s}s`);
    return parts.join(" ") || "0s";
  }
}
class NotificationService {
  /**
   * Show a desktop notification warning that an app's usage limit has been
   * reached or exceeded.
   *
   * @param appName - The process name of the application (e.g., "chrome.exe").
   * @param usedMinutes - The number of minutes already used today.
   * @param limitMinutes - The configured daily limit in minutes.
   */
  static showLimitWarning(appName, usedMinutes, limitMinutes) {
    try {
      const notification = new electron.Notification({
        title: "⚠️ App Limit Reached",
        body: `${appName}: ${usedMinutes}/${limitMinutes} minutes used today.`
      });
      notification.show();
      console.log(
        `[Notification] Limit warning shown for ${appName}: ${usedMinutes}/${limitMinutes} min`
      );
    } catch (err) {
      console.error("[Notification] Failed to show limit warning:", err);
    }
  }
  /**
   * Show a generic informational notification.
   *
   * @param title - Notification title.
   * @param body - Notification body text.
   */
  static showInfo(title, body) {
    try {
      const notification = new electron.Notification({ title, body });
      notification.show();
      console.log(`[Notification] Info shown: ${title}`);
    } catch (err) {
      console.error("[Notification] Failed to show info notification:", err);
    }
  }
}
let activeWinFn = null;
try {
  activeWinFn = require("active-win");
} catch {
  activeWinFn = null;
  console.log("[WindowTracker] active-win not available — running in mock mode.");
}
class WindowTracker {
  db;
  queries;
  status;
  currentApp;
  currentWindowTitle;
  currentSessionStart;
  lastSwitchTime;
  idleThresholdMs;
  pollIntervalMs;
  timer;
  isIdle;
  lastSummaryUpsertTime;
  summaryUpsertIntervalMs;
  /** v4 E-04: Optional callbacks for tracking state changes. */
  callbacks;
  /**
   * Create a new WindowTracker instance.
   *
   * @param db - The better-sqlite3 Database instance.
   * @param queries - The Queries layer for SQL operations.
   */
  constructor(db2, queries2, callbacks) {
    this.db = db2;
    this.queries = queries2;
    this.callbacks = callbacks ?? {};
    this.status = "stopped";
    this.currentApp = null;
    this.currentWindowTitle = null;
    this.currentSessionStart = null;
    this.lastSwitchTime = Date.now();
    this.idleThresholdMs = 5 * 60 * 1e3;
    this.pollIntervalMs = 2e3;
    this.timer = null;
    this.isIdle = false;
    this.lastSummaryUpsertTime = Date.now();
    this.summaryUpsertIntervalMs = 60 * 1e3;
  }
  /**
   * Start the window tracking engine.
   *
   * Begins polling the foreground window at the configured interval.
   * If already running or paused, this is a no-op.
   */
  start() {
    if (this.status === "running") {
      console.log("[WindowTracker] Already running.");
      return;
    }
    this.status = "running";
    this.isIdle = false;
    this.lastSwitchTime = Date.now();
    this.lastSummaryUpsertTime = Date.now();
    this.callbacks.onTrackingStateChange?.("started");
    console.log("[WindowTracker] Started. Polling every", this.pollIntervalMs, "ms");
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
  stop() {
    if (this.status === "stopped") {
      return;
    }
    console.log("[WindowTracker] Stopping...");
    if (this.currentApp && this.currentSessionStart) {
      this.finalizeCurrentEvent();
    }
    this.status = "stopped";
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.callbacks.onTrackingStateChange?.("stopped");
    console.log("[WindowTracker] Stopped.");
  }
  /**
   * Pause tracking without stopping.
   *
   * The polling interval continues to run but events are not recorded.
   * The current session is NOT finalized — it resumes when resume() is called.
   */
  pause() {
    if (this.status !== "running") {
      return;
    }
    this.status = "paused";
    this.callbacks.onTrackingStateChange?.("paused");
    console.log("[WindowTracker] Paused.");
  }
  /**
   * Resume tracking after a pause.
   *
   * Idle state is reset so the current session restarts fresh.
   */
  resume() {
    if (this.status !== "paused") {
      return;
    }
    this.status = "running";
    this.isIdle = false;
    this.lastSwitchTime = Date.now();
    this.callbacks.onTrackingStateChange?.("resumed");
    console.log("[WindowTracker] Resumed.");
  }
  /**
   * Get the current tracker state as a TrackerStatus object.
   *
   * @returns The current tracking state.
   */
  getState() {
    return {
      is_tracking: this.status === "running",
      is_paused: this.status === "paused",
      current_app: this.currentApp,
      current_session_start: this.currentSessionStart
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
  async poll() {
    if (this.status !== "running") {
      return;
    }
    const result = await this.getActiveWindowInfo();
    if (!result) {
      return;
    }
    const appName = result.appName;
    const windowTitle = result.windowTitle;
    const now = Date.now();
    if (this.currentApp !== appName) {
      if (this.currentApp && this.currentSessionStart) {
        this.finalizeCurrentEvent();
      }
      this.currentApp = appName;
      this.currentWindowTitle = windowTitle;
      this.currentSessionStart = now;
      this.lastSwitchTime = now;
      this.isIdle = false;
      console.log(
        `[WindowTracker] Switched to ${appName} — "${windowTitle}"`
      );
      try {
        const focusEnabled = this.queries.getSetting("focus_mode_enabled");
        if (focusEnabled === "true") {
          const whitelistJson = this.queries.getSetting("focus_whitelist") || "[]";
          let whitelist = [];
          try {
            whitelist = JSON.parse(whitelistJson);
            if (!Array.isArray(whitelist)) whitelist = [];
          } catch {
            whitelist = [];
          }
          const isFocused = whitelist.some(
            (w) => appName.toLowerCase() === w.toLowerCase()
          );
          console.log(
            `[Focus] ${appName}: ${isFocused ? "FOCUSED" : "DISTRACTED"}`
          );
        }
      } catch {
      }
    } else {
      const timeSinceSwitch = now - this.lastSwitchTime;
      if (timeSinceSwitch >= this.idleThresholdMs && !this.isIdle) {
        this.isIdle = true;
        this.callbacks.onTrackingStateChange?.("idle");
        console.log(
          `[WindowTracker] Entered idle state on ${appName} after ${Math.round(timeSinceSwitch / 1e3)}s`
        );
        if (this.currentSessionStart) {
          this.finalizeCurrentEvent();
          this.currentSessionStart = now;
        }
      }
      if (this.currentWindowTitle !== windowTitle && !this.isIdle) {
        this.currentWindowTitle = windowTitle;
      }
    }
    if (now - this.lastSummaryUpsertTime >= this.summaryUpsertIntervalMs) {
      this.upsertDailySummaryForCurrentApp();
      this.lastSummaryUpsertTime = now;
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
  async getActiveWindowInfo() {
    if (!activeWinFn) {
      return null;
    }
    try {
      const win = await activeWinFn();
      if (!win) {
        return null;
      }
      const processName = path.basename(win.owner.path);
      const appName = processName || win.owner.name || "Unknown";
      return {
        appName,
        windowTitle: win.title || ""
      };
    } catch (err) {
      console.error("[WindowTracker] Error getting active window:", err);
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
  finalizeCurrentEvent() {
    if (!this.currentApp || !this.currentSessionStart) {
      return;
    }
    if (this.isIdle) {
      return;
    }
    const now = Date.now();
    const durationMs = now - this.currentSessionStart;
    const durationSec = Math.max(0, Math.round(durationMs / 1e3));
    if (durationSec <= 0) {
      return;
    }
    const nowIso = new Date(now).toISOString();
    const startIso = new Date(this.currentSessionStart).toISOString();
    const todayStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    let effectiveTitle = this.currentWindowTitle || "";
    try {
      const privacyMode = this.queries.getSetting("privacy_mode");
      if (privacyMode === "true") {
        effectiveTitle = "(Privacy Mode)";
      }
    } catch {
    }
    const event = {
      app_name: this.currentApp,
      window_title: effectiveTitle,
      started_at: startIso,
      ended_at: nowIso,
      duration: durationSec,
      date: todayStr
    };
    try {
      this.queries.insertEvent(event);
      console.log(
        `[WindowTracker] Recorded ${durationSec}s for ${this.currentApp}`
      );
      this.queries.upsertDailySummary(this.currentApp, todayStr, durationSec);
    } catch (err) {
      console.error("[WindowTracker] Error recording event:", err);
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
  upsertDailySummaryForCurrentApp() {
    if (!this.currentApp || !this.currentSessionStart || this.isIdle) {
      return;
    }
    const now = Date.now();
    const durationMs = now - this.currentSessionStart;
    const durationSec = Math.max(0, Math.round(durationMs / 1e3));
    if (durationSec <= 0) {
      return;
    }
    const todayStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    try {
      this.queries.upsertDailySummary(this.currentApp, todayStr, durationSec);
      this.currentSessionStart = now;
    } catch (err) {
      console.error("[WindowTracker] Error upserting daily summary:", err);
    }
  }
  // ── Private: Usage Limit Checking ─────────────────────────────
  /**
   * Check all enabled usage limits for the current app and show a
   * desktop notification if any limit has been reached or exceeded.
   */
  checkUsageLimits() {
    if (!this.currentApp) {
      return;
    }
    try {
      const limits = this.queries.getUsageLimits();
      const todayStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      for (const limit of limits) {
        if (!limit.enabled) {
          continue;
        }
        if (limit.app_name !== this.currentApp) {
          continue;
        }
        const dailyRows = this.queries.getDailySummary(todayStr);
        const appRow = dailyRows.find((r) => r.app_name === limit.app_name);
        if (appRow) {
          const usedMinutes = Math.round(appRow.total_duration / 60);
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
      console.error("[WindowTracker] Error checking usage limits:", err);
    }
  }
}
class AutoLaunchService {
  autoLauncher = null;
  /**
   * Initialize the service. Must be called once during app startup.
   * Must be called AFTER `app.whenReady()` to ensure `process.execPath`
   * is stable.
   */
  init() {
    if (!electron.app.isPackaged) {
      console.log("[AutoLaunch] Skipped — not packaged (development mode).");
      return;
    }
    try {
      this.autoLauncher = new AutoLaunch({
        name: "Screen Time Monitor",
        path: process.execPath
      });
      console.log("[AutoLaunch] Service initialized.");
    } catch (err) {
      console.error("[AutoLaunch] Failed to initialize:", err);
    }
  }
  /**
   * Enable auto-launch on system startup.
   * Writes the necessary registry/plist/desktop entry.
   */
  async enable() {
    if (!this.autoLauncher) {
      console.warn("[AutoLaunch] enable() called but service not initialized (dev mode?).");
      return;
    }
    try {
      await this.autoLauncher.enable();
      console.log("[AutoLaunch] Enabled — app will start on system login.");
    } catch (err) {
      console.error("[AutoLaunch] Failed to enable:", err);
      throw err;
    }
  }
  /**
   * Disable auto-launch on system startup.
   * Removes the registry/plist/desktop entry.
   */
  async disable() {
    if (!this.autoLauncher) {
      console.warn("[AutoLaunch] disable() called but service not initialized (dev mode?).");
      return;
    }
    try {
      await this.autoLauncher.disable();
      console.log("[AutoLaunch] Disabled — app will NOT start on system login.");
    } catch (err) {
      console.error("[AutoLaunch] Failed to disable:", err);
      throw err;
    }
  }
  /**
   * Check if auto-launch is currently enabled in the OS.
   * Always returns `false` in dev mode.
   */
  async isEnabled() {
    if (!this.autoLauncher) {
      return false;
    }
    try {
      return await this.autoLauncher.isEnabled();
    } catch (err) {
      console.error("[AutoLaunch] Failed to check status:", err);
      return false;
    }
  }
  /**
   * Repair auto-start state: if the DB says enabled but the registry
   * is missing the entry, re-enable it. If DB says disabled but registry
   * has the entry, remove it.
   *
   * Called once during app startup to self-heal any inconsistencies.
   *
   * @param dbEnabled — whether auto_start is 'true' in the settings DB.
   */
  async repair(dbEnabled) {
    if (!this.autoLauncher) return;
    try {
      const registryEnabled = await this.isEnabled();
      if (dbEnabled && !registryEnabled) {
        console.log("[AutoLaunch] Self-repair: DB says enabled, registry missing — enabling.");
        await this.enable();
      } else if (!dbEnabled && registryEnabled) {
        console.log("[AutoLaunch] Self-repair: DB says disabled, registry present — disabling.");
        await this.disable();
      } else {
        console.log("[AutoLaunch] Self-repair: state consistent (enabled=" + dbEnabled + ").");
      }
    } catch (err) {
      console.error("[AutoLaunch] Self-repair failed:", err);
    }
  }
}
const autoLaunchService = new AutoLaunchService();
class ReminderService {
  mainWindow;
  queries;
  checkInterval;
  // ── State ──────────────────────────────────────────────────
  /** Total accumulated tracking time since last pomodoro fire (seconds). */
  pomodoroAccumulator = 0;
  /** Last time (epoch ms) the pomodoro timer was updated. */
  pomodoroLastUpdate = 0;
  /** Whether pomodoro timer is actively accumulating (tracking is running). */
  pomodoroActive = false;
  /** Accumulated consecutive sedentary time (seconds). */
  sedentaryAccumulator = 0;
  /** Last time (epoch ms) the sedentary timer was updated. */
  sedentaryLastUpdate = 0;
  /** Whether sedentary timer is actively accumulating. */
  sedentaryActive = false;
  constructor(queries2, mainWindow2) {
    this.queries = queries2;
    this.mainWindow = mainWindow2;
    this.checkInterval = null;
  }
  /**
   * Start the periodic check loop. Called once during app startup.
   */
  start() {
    if (this.checkInterval) return;
    console.log("[ReminderService] Started — checking every 60s.");
    this.check();
    this.checkInterval = setInterval(() => {
      this.check();
    }, 6e4);
  }
  /**
   * Notify the service that tracking has started or resumed.
   * Pomodoro continues accumulating; sedentary resets to 0.
   */
  onTrackingStarted() {
    const now = Date.now();
    this.pomodoroActive = true;
    this.pomodoroLastUpdate = now;
    this.sedentaryActive = true;
    this.sedentaryAccumulator = 0;
    this.sedentaryLastUpdate = now;
    console.log("[ReminderService] Tracking started — timers active.");
  }
  /**
   * Notify the service that tracking has been paused.
   * Pomodoro pauses accumulation (preserves current value);
   * Sedentary resets to 0.
   */
  onTrackingPaused() {
    this.pomodoroActive = false;
    this.sedentaryActive = false;
    this.sedentaryAccumulator = 0;
    console.log("[ReminderService] Tracking paused — timers suspended.");
  }
  /**
   * Notify the service that an idle state has been detected.
   * Sedentary resets to 0; pomodoro pauses.
   */
  onIdleDetected() {
    this.pomodoroActive = false;
    this.sedentaryActive = false;
    this.sedentaryAccumulator = 0;
    console.log("[ReminderService] Idle detected — sedentary reset.");
  }
  /**
   * Clean up all timers. Called on app quit.
   */
  destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log("[ReminderService] Destroyed.");
  }
  // ── Private: Check Loop ────────────────────────────────────
  /**
   * Periodic check: update accumulators based on elapsed wall-clock
   * time, then evaluate both timers against their thresholds.
   */
  check() {
    const now = Date.now();
    const settings = this.readSettings();
    if (this.pomodoroActive && this.pomodoroLastUpdate > 0) {
      const elapsed = Math.max(0, (now - this.pomodoroLastUpdate) / 1e3);
      this.pomodoroAccumulator += elapsed;
      this.pomodoroLastUpdate = now;
      if (settings.pomodoroEnabled) {
        const thresholdSec = settings.pomodoroInterval * 60;
        if (this.pomodoroAccumulator >= thresholdSec) {
          this.pomodoroAccumulator = 0;
          this.firePomodoro(settings.pomodoroInterval);
        }
      }
    }
    if (this.sedentaryActive && this.sedentaryLastUpdate > 0) {
      const elapsed = Math.max(0, (now - this.sedentaryLastUpdate) / 1e3);
      this.sedentaryAccumulator += elapsed;
      this.sedentaryLastUpdate = now;
      if (settings.sedentaryEnabled) {
        const thresholdSec = settings.sedentaryInterval * 60;
        if (this.sedentaryAccumulator >= thresholdSec) {
          this.sedentaryAccumulator = 0;
          this.fireSedentary(settings.sedentaryInterval);
        }
      }
    }
  }
  /**
   * Read reminder settings from the database.
   * Returns defaults if any key is missing.
   */
  readSettings() {
    const pomodoroEnabled = this.queries.getSetting("pomodoro_enabled");
    const pomodoroInterval = this.queries.getSetting("pomodoro_interval");
    const sedentaryEnabled = this.queries.getSetting("sedentary_enabled");
    const sedentaryInterval = this.queries.getSetting("sedentary_interval");
    return {
      pomodoroEnabled: pomodoroEnabled !== "false",
      // default true
      pomodoroInterval: parseInt(pomodoroInterval || "25", 10),
      sedentaryEnabled: sedentaryEnabled !== "false",
      // default true
      sedentaryInterval: parseInt(sedentaryInterval || "60", 10)
    };
  }
  /**
   * Push a pomodoro reminder event to the renderer process.
   */
  firePomodoro(intervalMinutes) {
    console.log(`[ReminderService] Pomodoro fired — ${intervalMinutes}min interval.`);
    this.mainWindow?.webContents.send("reminder:pomodoro-triggered", {
      intervalMinutes
    });
  }
  /**
   * Push a sedentary reminder event to the renderer process.
   */
  fireSedentary(accumulatedMinutes) {
    console.log(`[ReminderService] Sedentary fired — ${accumulatedMinutes}min accumulated.`);
    this.mainWindow?.webContents.send("reminder:sedentary-triggered", {
      accumulatedMinutes
    });
  }
}
class FocusAutomationService {
  queries;
  timer = null;
  toggleCallback = null;
  constructor(queries2) {
    this.queries = queries2;
  }
  /** Register a callback that toggles Focus Mode on/off. */
  setToggleCallback(cb) {
    this.toggleCallback = cb;
  }
  /** Start the automation interval (checks every 60 seconds). */
  start() {
    if (this.timer) return;
    console.log("[FocusAutomation] Started — polling every 60s.");
    this.check();
    this.timer = setInterval(() => this.check(), 6e4);
  }
  /** Stop and clean up the interval. */
  destroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log("[FocusAutomation] Stopped.");
  }
  /** Perform a single schedule check and toggle if needed. */
  check() {
    try {
      const scheduleEnabled = this.queries.getSetting("focus_schedule_enabled") === "true";
      if (!scheduleEnabled) return;
      const daysJson = this.queries.getSetting("focus_schedule_days") || "[]";
      let days = [];
      try {
        days = JSON.parse(daysJson);
        if (!Array.isArray(days)) days = [];
      } catch {
        days = [];
      }
      const startHour = parseInt(
        this.queries.getSetting("focus_schedule_start") || "9",
        10
      );
      const endHour = parseInt(
        this.queries.getSetting("focus_schedule_end") || "18",
        10
      );
      const now = /* @__PURE__ */ new Date();
      const currentHour = now.getHours();
      const currentDay = now.getDay();
      const isScheduledDay = days.includes(currentDay);
      const isScheduledTime = currentHour >= startHour && currentHour < endHour;
      const shouldBeEnabled = isScheduledDay && isScheduledTime;
      const currentlyEnabled = this.queries.getSetting("focus_mode_enabled") === "true";
      if (shouldBeEnabled !== currentlyEnabled && this.toggleCallback) {
        console.log(
          `[FocusAutomation] State mismatch — scheduled:${shouldBeEnabled} actual:${currentlyEnabled} — toggling`
        );
        this.toggleCallback(shouldBeEnabled);
      }
    } catch (err) {
      console.error("[FocusAutomation] Check failed:", err);
    }
  }
}
let floatingWindow = null;
function getFloatingWindow() {
  return floatingWindow;
}
function createFloatingWindow() {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.focus();
    return;
  }
  const { width: screenWidth } = electron.screen.getPrimaryDisplay().workAreaSize;
  floatingWindow = new electron.BrowserWindow({
    width: 220,
    height: 72,
    x: screenWidth - 240,
    y: 80,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "../preload/preload.js")
    }
  });
  floatingWindow.setVisibleOnAllWorkspaces(true);
  floatingWindow.setAlwaysOnTop(true, "floating");
  floatingWindow.setIgnoreMouseEvents(false);
  const html = getFloatingWindowHTML();
  floatingWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  floatingWindow.on("closed", () => {
    floatingWindow = null;
  });
}
function updateFloatingWindow(data) {
  if (!floatingWindow || floatingWindow.isDestroyed()) return;
  floatingWindow.webContents.send("floating:update", data);
}
function destroyFloatingWindow() {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.close();
    floatingWindow = null;
  }
}
function getFloatingWindowHTML() {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Inter, system-ui, -apple-system, sans-serif;
    background: transparent;
    overflow: hidden;
    -webkit-app-region: drag;
    user-select: none;
  }
  .card {
    background: rgba(15, 23, 42, 0.92);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 14px;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    transition: all 0.3s ease;
  }
  .indicator {
    width: 10px; height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .indicator.tracking { background: #22C55E; box-shadow: 0 0 8px rgba(34,197,94,0.6); }
  .indicator.paused { background: #F97316; box-shadow: 0 0 8px rgba(249,115,22,0.6); }
  .indicator.stopped { background: #6B7280; }
  .info { flex: 1; min-width: 0; }
  .app { color: #E2E8F0; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .duration { color: #94A3B8; font-size: 11px; margin-top: 2px; }
  .badge {
    font-size: 10px; padding: 2px 6px; border-radius: 8px;
    font-weight: 600; flex-shrink: 0;
  }
  .badge.focus { background: rgba(129,140,248,0.2); color: #A5B4FC; }
  .badge.off { background: rgba(148,163,184,0.15); color: #64748B; }
  .close-btn {
    position: absolute; top: 4px; right: 8px;
    color: #475569; font-size: 14px; cursor: pointer;
    line-height: 1; -webkit-app-region: no-drag;
  }
  .close-btn:hover { color: #94A3B8; }
</style>
</head>
<body>
  <div class="card" id="card">
    <div class="indicator stopped" id="indicator"></div>
    <div class="info">
      <div class="app" id="app">未开始追踪</div>
      <div class="duration" id="duration">今日 --</div>
    </div>
    <div class="badge off" id="badge">--</div>
    <div class="close-btn" id="closeBtn" onclick="handleClose()">✕</div>
  </div>
  <script>
    const appEl = document.getElementById('app');
    const durEl = document.getElementById('duration');
    const badgeEl = document.getElementById('badge');
    const indicatorEl = document.getElementById('indicator');

    function handleClose() {
      window.electronAPI?.app?.quitFloatingWindow?.();
    }

    window.electronAPI?.reminder?.onFloatingUpdate?.(function(data) {
      appEl.textContent = data.currentApp || '未开始追踪';
      durEl.textContent = '今日 ' + (data.todayDuration || '--');
      badgeEl.textContent = data.focusMode ? '专注' : '--';
      badgeEl.className = 'badge ' + (data.focusMode ? 'focus' : 'off');

      indicatorEl.className = 'indicator ' + (data.isTracking ? 'tracking' : 'stopped');
      if (data.currentApp && !data.isTracking) {
        indicatorEl.className = 'indicator paused';
      }
    });
  <\/script>
</body>
</html>`;
}
function formatDurationStr(seconds) {
  if (seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = seconds % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 && parts.length === 0) parts.push(`${s}s`);
  return parts.join(" ") || "0s";
}
function getMondayStr(date) {
  const d = new Date(Date.now());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}
function getPrevMondayStr(mondayStr) {
  const d = /* @__PURE__ */ new Date(mondayStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}
let mainWindow = null;
let tray = null;
let db = null;
let queries = null;
let tracker = null;
let reminderService = null;
let focusAutomation = null;
const APP_VERSION = electron.app.getVersion();
function createMainWindow() {
  const preloadPath = path.join(__dirname, "../preload/preload.js");
  const rendererPath = path.join(__dirname, "../renderer/index.html");
  console.log("[Main] __dirname:", __dirname);
  console.log("[Main] Preload path:", preloadPath);
  console.log("[Main] Renderer path:", rendererPath);
  mainWindow = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Screen Time Monitor",
    icon: path.join(__dirname, "../../resources/icon.png"),
    show: false,
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  let shown = false;
  const doShow = () => {
    if (!shown) {
      shown = true;
      mainWindow?.show();
      console.log("[Main] Window shown.");
    }
  };
  mainWindow.on("ready-to-show", doShow);
  setTimeout(doShow, 5e3);
  mainWindow.webContents.on("did-fail-load", (_event, code, desc, url) => {
    console.error("[Main] Renderer failed to load:", code, desc, url);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(rendererPath);
  }
  return mainWindow;
}
function initDatabase() {
  const dbPath = path.join(electron.app.getPath("userData"), "data.db");
  const encryptionKey = "screen_time_monitor_placeholder_key";
  db = new Database(dbPath, encryptionKey);
  db.runMigrations();
  queries = new Queries(db.getDb());
  reminderService = new ReminderService(queries, mainWindow);
  focusAutomation = new FocusAutomationService(queries);
  focusAutomation.setToggleCallback((enabled) => {
    queries.setSetting("focus_mode_enabled", String(enabled));
    console.log("[FocusAutomation] Focus Mode " + (enabled ? "enabled" : "disabled") + " by schedule.");
  });
  tracker = new WindowTracker(db.getDb(), queries, {
    onTrackingStateChange: (state) => {
      if (!reminderService) return;
      switch (state) {
        case "started":
        case "resumed":
          reminderService.onTrackingStarted();
          break;
        case "paused":
        case "stopped":
          reminderService.onTrackingPaused();
          break;
        case "idle":
          reminderService.onIdleDetected();
          break;
      }
    }
  });
  console.log("[DB] Database initialized at", dbPath);
}
function createTray() {
  if (!mainWindow) return;
  const trayIconPath = path.join(
    __dirname,
    "../../resources/tray-icon.png"
  );
  try {
    tray = new electron.Tray(trayIconPath);
    tray.setToolTip("Screen Time Monitor");
    rebuildTrayMenu();
    tray.on("double-click", () => {
      mainWindow?.show();
      mainWindow?.focus();
    });
    setInterval(() => {
      rebuildTrayMenu();
    }, 6e4);
    console.log("[Tray] Tray icon created with dynamic context menu.");
  } catch (err) {
    console.warn("[Tray] Failed to create tray icon:", err);
  }
}
function rebuildTrayMenu() {
  if (!tray || !queries) return;
  try {
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const rows = queries.getDailySummary(today);
    const topApps = rows.slice(0, 5);
    const isPaused = tracker ? tracker.getState().is_paused : false;
    const menuItems = [];
    menuItems.push({
      label: trayMenuLabels.todaySummary + " — " + today,
      enabled: false
    });
    if (topApps.length === 0) {
      menuItems.push({
        label: "  " + trayMenuLabels.noActivity,
        enabled: false
      });
    } else {
      for (const row of topApps) {
        menuItems.push({
          label: `  ${row.app_name}  —  ${formatDurationStr(row.total_duration)}`,
          enabled: false
        });
      }
    }
    menuItems.push({ type: "separator" });
    if (isPaused) {
      menuItems.push({
        label: trayMenuLabels.pauseTracking,
        click: () => {
          if (tracker) {
            tracker.resume();
            rebuildTrayMenu();
            mainWindow?.webContents.send("tracker:status-change", tracker.getState());
          }
        }
      });
    } else {
      menuItems.push({
        label: trayMenuLabels.resumeTracking,
        click: () => {
          if (tracker) {
            tracker.pause();
            rebuildTrayMenu();
            mainWindow?.webContents.send("tracker:status-change", tracker.getState());
          }
        }
      });
    }
    menuItems.push({
      label: trayMenuLabels.openPanel,
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      }
    });
    menuItems.push({ type: "separator" });
    menuItems.push({
      label: trayMenuLabels.quit,
      click: () => {
        electron.app.quit();
      }
    });
    tray.setContextMenu(electron.Menu.buildFromTemplate(menuItems));
  } catch (err) {
    console.warn("[Tray] Failed to rebuild tray menu:", err);
  }
}
let trayMenuLabels = {
  todaySummary: "Today",
  pauseTracking: "▶ Resume Tracking",
  resumeTracking: "⏸ Pause Tracking",
  openPanel: "📊 Open Main Panel",
  quit: "❌ Quit",
  noActivity: "  No activity recorded yet"
};
function rebuildTrayMenuWithLabels(labels) {
  trayMenuLabels = { ...trayMenuLabels, ...labels };
  rebuildTrayMenu();
}
function registerIpcHandlers() {
  if (!queries) return;
  electron.ipcMain.handle("app:get-version", () => {
    return APP_VERSION;
  });
  electron.ipcMain.on("app:quit", () => {
    electron.app.quit();
  });
  electron.ipcMain.handle(
    "app:get-auto-start-status",
    async () => {
      try {
        const enabled = await autoLaunchService.isEnabled();
        return { success: true, data: { enabled } };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle("floating:show", () => {
    createFloatingWindow();
  });
  electron.ipcMain.handle("floating:hide", () => {
    destroyFloatingWindow();
  });
  electron.ipcMain.handle("floating:is-visible", () => {
    return getFloatingWindow() !== null;
  });
  electron.ipcMain.on("floating:hide", () => {
    destroyFloatingWindow();
  });
  electron.ipcMain.handle(
    "settings:get",
    (_event, key) => {
      return queries.getSetting(key);
    }
  );
  electron.ipcMain.handle(
    "settings:set",
    (_event, key, value) => {
      try {
        queries.setSetting(key, value);
        if (key === "auto_start") {
          if (value === "true") {
            autoLaunchService.enable().catch(
              (err) => console.error("[Settings] AutoLaunchService.enable() failed:", err)
            );
          } else {
            autoLaunchService.disable().catch(
              (err) => console.error("[Settings] AutoLaunchService.disable() failed:", err)
            );
          }
          console.log("[Settings] Auto-start " + (value === "true" ? "enabled" : "disabled"));
        }
        if (key === "show_tray") {
          if (value === "true" && !tray) {
            createTray();
            console.log("[Settings] Tray icon created");
          } else if (value === "false" && tray) {
            tray.destroy();
            tray = null;
            console.log("[Settings] Tray icon destroyed");
          }
        }
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "settings:get-all",
    () => {
      try {
        const keys = [
          "auto_start",
          "idle_threshold",
          "auto_track",
          "notifications",
          "data_retention",
          "privacy_mode",
          "show_tray",
          "focus_mode_enabled",
          "focus_whitelist",
          "language",
          "pomodoro_enabled",
          "pomodoro_interval",
          "sedentary_enabled",
          "sedentary_interval",
          "focus_schedule_enabled",
          "focus_schedule_days",
          "focus_schedule_start",
          "focus_schedule_end"
        ];
        const result = {};
        for (const key of keys) {
          const val = queries.getSetting(key);
          if (val !== null) {
            result[key] = val;
          }
        }
        return { success: true, data: result };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "tracker:get-status",
    () => {
      if (!tracker) {
        return { success: false, error: "Tracker not initialized" };
      }
      return { success: true, data: tracker.getState() };
    }
  );
  electron.ipcMain.handle(
    "tracker:pause",
    () => {
      if (!tracker) {
        return { success: false, error: "Tracker not initialized" };
      }
      tracker.pause();
      mainWindow?.webContents.send("tracker:status-change", tracker.getState());
      rebuildTrayMenu();
      return { success: true };
    }
  );
  electron.ipcMain.handle(
    "tracker:resume",
    () => {
      if (!tracker) {
        return { success: false, error: "Tracker not initialized" };
      }
      tracker.resume();
      mainWindow?.webContents.send("tracker:status-change", tracker.getState());
      rebuildTrayMenu();
      return { success: true };
    }
  );
  electron.ipcMain.handle(
    "tracker:start",
    () => {
      if (!tracker) {
        return { success: false, error: "Tracker not initialized" };
      }
      tracker.start();
      return { success: true };
    }
  );
  electron.ipcMain.handle(
    "tracker:stop",
    () => {
      if (!tracker) {
        return { success: false, error: "Tracker not initialized" };
      }
      tracker.stop();
      return { success: true };
    }
  );
  electron.ipcMain.handle(
    "data:get-today-summary",
    () => {
      try {
        const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        const rows = queries.getDailySummary(today);
        const totalSeconds = rows.reduce((s, r) => s + r.total_duration, 0);
        const topApps = rows.slice(0, 10).map((r) => ({
          app_name: r.app_name,
          duration: r.total_duration,
          percentage: totalSeconds > 0 ? Math.round(r.total_duration / totalSeconds * 100) : 0,
          formattedDuration: formatDurationStr(r.total_duration)
        }));
        const hourlyHeatmap = queries.getHourlyHeatmap(today);
        return {
          success: true,
          data: {
            total_seconds: totalSeconds,
            formatted_total: formatDurationStr(totalSeconds),
            active_apps_count: rows.length,
            top_apps: topApps,
            hourly_heatmap: hourlyHeatmap
          }
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "data:get-weekly-report",
    (_event, ...args) => {
      try {
        const weekStart = args[0] || getMondayStr();
        const weeklyRows = queries.getWeeklySummary(weekStart);
        const dailyTotals = weeklyRows.map((r) => ({
          date: r.date,
          total_seconds: r.total_duration
        }));
        const weeklyAppRows = queries.getWeeklyAppSummary(weekStart);
        const weeklyTotal = weeklyAppRows.reduce(
          (s, r) => s + r.total_duration,
          0
        );
        const appDist = weeklyAppRows.slice(0, 10).map((r) => ({
          app_name: r.app_name,
          duration: r.total_duration,
          percentage: weeklyTotal > 0 ? Math.round(r.total_duration / weeklyTotal * 100) : 0,
          formattedDuration: formatDurationStr(r.total_duration)
        }));
        const prevWeekStart = getPrevMondayStr(weekStart);
        const prevRows = queries.getWeeklySummary(prevWeekStart);
        const prevTotal = prevRows.reduce((s, r) => s + r.total_duration, 0);
        const totalCurr = weeklyRows.reduce(
          (s, r) => s + r.total_duration,
          0
        );
        const diffPercent = prevTotal > 0 ? Math.round((totalCurr - prevTotal) / prevTotal * 100) : 0;
        return {
          success: true,
          data: {
            week_label: weekStart,
            daily_totals: dailyTotals,
            app_distribution: appDist,
            trend_data: dailyTotals.map((d) => ({
              date: d.date,
              duration: d.total_seconds
            })),
            previous_week_comparison: { diff_percent: diffPercent }
          }
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "data:get-monthly-report",
    (_event, ...args) => {
      try {
        const month = args[0] || (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
        const monthlyRows = queries.getMonthlySummary(month);
        const totalMonth = monthlyRows.reduce(
          (s, r) => s + r.total_duration,
          0
        );
        const appDist = monthlyRows.slice(0, 10).map((r) => ({
          app_name: r.app_name,
          duration: r.total_duration,
          percentage: totalMonth > 0 ? Math.round(r.total_duration / totalMonth * 100) : 0,
          formattedDuration: formatDurationStr(r.total_duration)
        }));
        const targetYear = parseInt(month.slice(0, 4), 10);
        const targetMonth = parseInt(month.slice(5, 7), 10);
        const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
        const weeklyTotals = [];
        for (let w = 1; w <= 4; w++) {
          const wStart = w * 7 - 6;
          const wEnd = Math.min(w * 7, daysInMonth);
          const label = `${wStart}-${wEnd}`;
          weeklyTotals.push({ week: label, total_seconds: Math.round(totalMonth / 4) });
        }
        const prevYear = targetMonth === 1 ? targetYear - 1 : targetYear;
        const prevMonth = targetMonth === 1 ? 12 : targetMonth - 1;
        const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
        const prevRows = queries.getMonthlySummary(prevMonthStr);
        const prevTotal = prevRows.reduce(
          (s, r) => s + r.total_duration,
          0
        );
        const diffPercent = prevTotal > 0 ? Math.round((totalMonth - prevTotal) / prevTotal * 100) : 0;
        return {
          success: true,
          data: {
            month_label: month,
            weekly_totals: weeklyTotals,
            app_distribution: appDist,
            previous_month_comparison: { diff_percent: diffPercent }
          }
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "data:get-app-ranking",
    (_event, date, limit) => {
      try {
        const rows = queries.getAppRanking(date, limit);
        return { success: true, data: rows };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "limits:get-all",
    () => {
      try {
        const limits = queries.getUsageLimits();
        return { success: true, data: limits };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "limits:set",
    (_event, appName, limitMinutes) => {
      try {
        queries.setUsageLimit({
          app_name: appName,
          limit_minutes: limitMinutes
        });
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "limits:delete",
    (_event, id) => {
      try {
        queries.deleteUsageLimit(id);
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "export:csv",
    async (_event, ...args) => {
      try {
        const [startDate, endDate] = args;
        const exportRows = queries.getExportData(startDate, endDate);
        const header = "Date,App Name,Window Title,Duration (s),Started At,Ended At";
        const csvRows = exportRows.map(
          (r) => `"${r.date}","${r.app_name}","${(r.window_title || "").replace(/"/g, '""')}",${r.duration},"${r.started_at}","${r.ended_at}"`
        );
        const csv = [header, ...csvRows].join("\n");
        const { dialog: dialog2 } = require("electron");
        const { writeFileSync } = require("fs");
        const result = await dialog2.showSaveDialog({
          defaultPath: `screen-time-export-${startDate}-to-${endDate}.csv`,
          filters: [{ name: "CSV", extensions: ["csv"] }]
        });
        if (!result.canceled && result.filePath) {
          writeFileSync(result.filePath, csv, "utf-8");
          return { success: true, data: result.filePath };
        }
        return { success: true, data: "" };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "categories:get-all",
    () => {
      try {
        const cats = queries.getCategories();
        return { success: true, data: cats };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "categories:set",
    (_event, appName, category) => {
      try {
        queries.setCategory(appName, category);
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "categories:delete",
    (_event, id) => {
      try {
        queries.deleteCategory(id);
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "data:get-categorized-report",
    (_event, startDate, endDate) => {
      try {
        const rows = queries.getCategorizedReport(startDate, endDate);
        return { success: true, data: rows };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "data:cleanup",
    (_event, retentionDays) => {
      try {
        const deleted = queries.deleteOldData(retentionDays);
        return { success: true, data: { deleted } };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "export:save-file",
    async (_event, bufferData, defaultName, filters) => {
      try {
        const { dialog: dialog2 } = require("electron");
        const { writeFileSync } = require("fs");
        const result = await dialog2.showSaveDialog({
          defaultPath: defaultName,
          filters
        });
        if (!result.canceled && result.filePath) {
          writeFileSync(result.filePath, Buffer.from(bufferData));
          return { success: true, data: result.filePath };
        }
        return { success: true, data: "" };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "focus:get-status",
    () => {
      try {
        const status = queries.getFocusStatus();
        return { success: true, data: status };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "focus:toggle",
    (_event, enabled) => {
      try {
        queries.setSetting("focus_mode_enabled", String(enabled));
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "focus:set-whitelist",
    (_event, appNames) => {
      try {
        if (!Array.isArray(appNames)) {
          return { success: false, error: "appNames must be an array" };
        }
        queries.setSetting("focus_whitelist", JSON.stringify(appNames));
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "focus:get-report",
    (_event, date) => {
      try {
        const report = queries.getFocusReport(date);
        return { success: true, data: report };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "data:get-custom-range-report",
    (_event, startDate, endDate) => {
      try {
        const report = queries.getCustomRangeReport(startDate, endDate);
        return { success: true, data: report };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "data:get-custom-range-trend",
    (_event, startDate, endDate) => {
      try {
        const trend = queries.getCustomRangeTrend(startDate, endDate);
        return { success: true, data: trend };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "data:get-custom-range-ranking",
    (_event, startDate, endDate, limit) => {
      try {
        const ranking = queries.getCustomRangeRanking(startDate, endDate, limit || 10);
        return { success: true, data: ranking };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "app:check-for-updates",
    async () => {
      try {
        if (!electron.app.isPackaged) {
          return { success: true, data: { updateAvailable: false } };
        }
        const result = await electronUpdater.autoUpdater.checkForUpdates();
        const updateAvailable = result && result.updateInfo && result.updateInfo.version !== electron.app.getVersion();
        return {
          success: true,
          data: {
            updateAvailable,
            version: updateAvailable ? result.updateInfo.version : void 0
          }
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "app:install-update",
    () => {
      try {
        electronUpdater.autoUpdater.quitAndInstall();
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        };
      }
    }
  );
  electron.ipcMain.on(
    "tray:update-menu-labels",
    (_event, labels) => {
      try {
        rebuildTrayMenuWithLabels(labels);
      } catch (err) {
        console.error("[Tray] Failed to update menu labels:", err);
      }
    }
  );
}
function initAutoUpdater() {
  if (!electron.app.isPackaged) {
    console.log("[AutoUpdater] Skipped — not packaged (development mode).");
    return;
  }
  electronUpdater.autoUpdater.autoDownload = false;
  electronUpdater.autoUpdater.autoInstallOnAppQuit = true;
  electronUpdater.autoUpdater.on("update-available", (info) => {
    console.log("[AutoUpdater] Update available:", info.version);
    mainWindow?.webContents.send("app:update-available", { version: info.version });
  });
  electronUpdater.autoUpdater.on("update-downloaded", (info) => {
    console.log("[AutoUpdater] Update downloaded:", info.version);
    mainWindow?.webContents.send("app:update-downloaded", { version: info.version });
  });
  electronUpdater.autoUpdater.on("error", (err) => {
    console.error("[AutoUpdater] Error:", err.message);
    mainWindow?.webContents.send("app:update-available", { version: "error", error: err.message });
  });
  electronUpdater.autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error("[AutoUpdater] checkForUpdatesAndNotify failed:", err.message);
  });
}
function cleanup() {
  console.log("[App] Cleaning up before quit...");
  destroyFloatingWindow();
  if (focusAutomation) {
    focusAutomation.destroy();
    focusAutomation = null;
  }
  if (reminderService) {
    reminderService.destroy();
    reminderService = null;
  }
  if (tracker) {
    tracker.stop();
    tracker = null;
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }
  if (db) {
    db.close();
    db = null;
  }
}
const gotSingleInstanceLock = electron.app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  electron.app.quit();
} else {
  electron.app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  electron.app.whenReady().then(() => {
    try {
      initDatabase();
      createMainWindow();
      createTray();
      registerIpcHandlers();
      autoLaunchService.init();
      if (queries) {
        const autoStartVal = queries.getSetting("auto_start");
        const dbAutoStart = autoStartVal === "true";
        autoLaunchService.repair(dbAutoStart).catch(
          (err) => console.error("[App] AutoLaunchService.repair() failed:", err)
        );
      }
      if (tracker) {
        tracker.start();
      }
      if (reminderService) {
        reminderService.start();
      }
      if (focusAutomation) {
        focusAutomation.start();
      }
      setInterval(() => {
        if (!getFloatingWindow()) return;
        if (!tracker || !queries) return;
        const status = tracker.getState();
        const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        const dailyRows = queries.getDailySummary(today);
        const todayTotal = dailyRows.reduce((s, r) => s + r.total_duration, 0);
        const hours = Math.floor(todayTotal / 3600);
        const mins = Math.floor(todayTotal % 3600 / 60);
        const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        const focusEnabled = queries.getSetting("focus_mode_enabled") === "true";
        updateFloatingWindow({
          currentApp: status.current_app,
          focusMode: focusEnabled,
          todayDuration: durationStr,
          isTracking: status.is_tracking && !status.is_paused
        });
      }, 2e3);
      initAutoUpdater();
      console.log("[App] Screen Time Monitor started — v" + APP_VERSION);
    } catch (err) {
      console.error("[App] Fatal startup error:", err);
      if (!mainWindow) {
        createMainWindow();
      }
      mainWindow?.show();
      electron.dialog.showErrorBox("Startup Error", String(err));
    }
  });
  electron.app.on("window-all-closed", () => {
  });
  electron.app.on("before-quit", () => {
    cleanup();
  });
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}
