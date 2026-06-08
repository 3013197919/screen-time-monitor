import type BetterSqlite3 from 'better-sqlite3';

/**
 * Database schema migration manager.
 *
 * Uses PRAGMA user_version to track the current schema version.
 * Each migration is idempotent — it checks if the version is already applied.
 *
 * Current schema version: 1
 *   - v1: Initial schema — app_events, daily_summary, usage_limits, settings, app_categories
 */
export class Migrations {
  /** Current latest schema version. */
  private static readonly CURRENT_VERSION: number = 1;

  /**
   * Run all pending migrations to bring the database to the latest schema version.
   *
   * @param db - The better-sqlite3 database instance.
   */
  static run(db: BetterSqlite3.Database): void {
    const currentVersion = db.pragma('user_version', { simple: true }) as number;

    if (currentVersion >= Migrations.CURRENT_VERSION) {
      console.log(
        `[Migrations] Schema is up to date (version ${currentVersion}).`
      );
      return;
    }

    console.log(
      `[Migrations] Upgrading from version ${currentVersion} to ${Migrations.CURRENT_VERSION}...`
    );

    // Run migrations sequentially from currentVersion+1 to CURRENT_VERSION
    for (let version = currentVersion + 1; version <= Migrations.CURRENT_VERSION; version++) {
      Migrations.applyMigration(db, version);
    }

    db.pragma(`user_version = ${Migrations.CURRENT_VERSION}`);
    console.log(`[Migrations] Schema upgraded to version ${Migrations.CURRENT_VERSION}.`);
  }

  /**
   * Apply a single migration version.
   *
   * @param db - The better-sqlite3 database instance.
   * @param version - The migration version to apply.
   */
  private static applyMigration(db: BetterSqlite3.Database, version: number): void {
    switch (version) {
      case 1:
        Migrations.createAppEventsTable(db);
        Migrations.createDailySummaryTable(db);
        Migrations.createUsageLimitsTable(db);
        Migrations.createSettingsTable(db);
        Migrations.createAppCategoriesTable(db);
        break;
      default:
        throw new Error(`[Migrations] Unknown migration version: ${version}`);
    }
  }

  /**
   * Create the app_events table.
   * Stores raw foreground-window-switch events with timing data.
   */
  private static createAppEventsTable(db: BetterSqlite3.Database): void {
    db.exec(`
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
    console.log('[Migrations] Created app_events table.');
  }

  /**
   * Create the daily_summary table.
   * Pre-aggregated daily usage data for fast dashboard queries.
   */
  private static createDailySummaryTable(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS daily_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_name TEXT NOT NULL,
        date TEXT NOT NULL,
        total_duration INTEGER NOT NULL,
        UNIQUE(app_name, date)
      );
      CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_summary(date);
    `);
    console.log('[Migrations] Created daily_summary table.');
  }

  /**
   * Create the usage_limits table.
   * Stores per-app daily usage time limits configured by the user.
   */
  private static createUsageLimitsTable(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS usage_limits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_name TEXT NOT NULL UNIQUE,
        limit_minutes INTEGER NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1
      );
    `);
    console.log('[Migrations] Created usage_limits table.');
  }

  /**
   * Create the settings table.
   * Key-value store for application configuration.
   */
  private static createSettingsTable(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    console.log('[Migrations] Created settings table.');
  }

  /**
   * Create the app_categories table (P2 — planned for future release).
   * Maps application names to user-defined categories.
   */
  private static createAppCategoriesTable(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_name TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL
      );
    `);
    console.log('[Migrations] Created app_categories table.');
  }
}
