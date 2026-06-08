import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';

/**
 * Integration-style tests for database queries.
 * Uses an in-memory SQLite database.
 */

let db: Database.Database;

function runMigrations(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL,
      window_title TEXT DEFAULT '',
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      duration INTEGER NOT NULL,
      date TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS daily_summary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL,
      date TEXT NOT NULL,
      total_duration INTEGER NOT NULL DEFAULT 0,
      UNIQUE(app_name, date)
    );
    CREATE TABLE IF NOT EXISTS usage_limits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL UNIQUE,
      limit_minutes INTEGER NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL
    );
  `);
}

beforeAll(() => {
  db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  runMigrations(db);
});

afterAll(() => {
  db.close();
});

function insertEvent(app_name: string, date: string, duration: number, window_title = 'test') {
  const stmt = db.prepare(`
    INSERT INTO app_events (app_name, window_title, started_at, ended_at, duration, date)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const ts = `${date}T10:00:00Z`;
  const end = `${date}T10:${String(duration % 60).padStart(2, '0')}:00Z`;
  stmt.run(app_name, window_title, ts, end, duration, date);
}

function upsertDailySummary(appName: string, date: string, duration: number) {
  const stmt = db.prepare(`
    INSERT INTO daily_summary (app_name, date, total_duration)
    VALUES (?, ?, ?)
    ON CONFLICT(app_name, date)
    DO UPDATE SET total_duration = total_duration + ?
  `);
  stmt.run(appName, date, duration, duration);
}

describe('app_events CRUD', () => {
  it('inserts and queries events', () => {
    insertEvent('chrome.exe', '2026-06-07', 3600);
    insertEvent('code.exe', '2026-06-07', 1800);

    const rows = db.prepare('SELECT * FROM app_events WHERE date = ?').all('2026-06-07') as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0].app_name).toBe('chrome.exe');
    expect(rows[1].app_name).toBe('code.exe');
  });

  it('filters by date range', () => {
    insertEvent('chrome.exe', '2026-06-06', 900);
    const rows = db.prepare(
      'SELECT * FROM app_events WHERE date >= ? AND date <= ?'
    ).all('2026-06-06', '2026-06-07') as any[];
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });
});

describe('daily_summary upsert', () => {
  it('inserts new summary', () => {
    upsertDailySummary('chrome.exe', '2026-06-07', 3600);
    const row = db.prepare(
      'SELECT * FROM daily_summary WHERE app_name = ? AND date = ?'
    ).get('chrome.exe', '2026-06-07') as any;
    expect(row.total_duration).toBe(3600);
  });

  it('accumulates on upsert', () => {
    upsertDailySummary('chrome.exe', '2026-06-07', 1800);
    const row = db.prepare(
      'SELECT * FROM daily_summary WHERE app_name = ? AND date = ?'
    ).get('chrome.exe', '2026-06-07') as any;
    expect(row.total_duration).toBe(5400); // 3600 + 1800
  });
});

describe('settings CRUD', () => {
  it('inserts and reads settings', () => {
    db.prepare(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
    ).run('test_key', 'test_value');

    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('test_key') as any;
    expect(row.value).toBe('test_value');
  });

  it('returns null for missing key', () => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('nonexistent') as any;
    expect(row).toBeUndefined();
  });
});

describe('usage_limits CRUD', () => {
  it('inserts and reads limits', () => {
    db.prepare(
      'INSERT INTO usage_limits (app_name, limit_minutes) VALUES (?, ?)'
    ).run('chrome.exe', 120);

    const row = db.prepare('SELECT * FROM usage_limits WHERE app_name = ?').get('chrome.exe') as any;
    expect(row.limit_minutes).toBe(120);
    expect(row.enabled).toBe(1);
  });

  it('deletes limits', () => {
    db.prepare('DELETE FROM usage_limits WHERE app_name = ?').run('chrome.exe');
    const row = db.prepare('SELECT * FROM usage_limits WHERE app_name = ?').get('chrome.exe') as any;
    expect(row).toBeUndefined();
  });
});

describe('app_categories CRUD', () => {
  it('inserts and reads categories', () => {
    db.prepare(
      'INSERT OR REPLACE INTO app_categories (app_name, category) VALUES (?, ?)'
    ).run('chrome.exe', 'work');

    const row = db.prepare('SELECT * FROM app_categories WHERE app_name = ?').get('chrome.exe') as any;
    expect(row.category).toBe('work');
  });

  it('categorized report joins correctly', () => {
    // Clean up from previous tests
    db.prepare('DELETE FROM daily_summary').run();
    db.prepare('DELETE FROM app_events').run();

    insertEvent('chrome.exe', '2026-06-07', 3600);
    insertEvent('code.exe', '2026-06-07', 1800);
    upsertDailySummary('chrome.exe', '2026-06-07', 3600);
    upsertDailySummary('code.exe', '2026-06-07', 1800);

    const rows = db.prepare(`
      SELECT COALESCE(ac.category, 'other') AS category,
             SUM(ds.total_duration) AS total_duration
      FROM daily_summary ds
      LEFT JOIN app_categories ac ON ds.app_name = ac.app_name
      WHERE ds.date = ?
      GROUP BY COALESCE(ac.category, 'other')
    `).all('2026-06-07') as any[];

    // chrome.exe = work, code.exe = uncategorized → other
    const work = rows.find((r: any) => r.category === 'work');
    const other = rows.find((r: any) => r.category === 'other');
    expect(work?.total_duration).toBe(3600);
    expect(other?.total_duration).toBe(1800);
  });
});

// ── v3: Focus Mode & Custom Range Queries ──────────────────────

import { Queries } from '../electron/db/queries';

let queries: Queries;

describe('v3: Focus Mode queries', () => {
  beforeAll(() => {
    queries = new Queries(db);
  });

  beforeEach(() => {
    db.prepare('DELETE FROM settings WHERE key LIKE ?').run('focus_%');
    db.prepare('DELETE FROM daily_summary').run();
  });

  it('getFocusStatus returns disabled and empty whitelist when no settings', () => {
    const status = queries.getFocusStatus();
    expect(status.enabled).toBe(false);
    expect(status.whitelist).toEqual([]);
  });

  it('getFocusStatus parses enabled focus mode with whitelist', () => {
    queries.setSetting('focus_mode_enabled', 'true');
    queries.setSetting('focus_whitelist', JSON.stringify(['code.exe', 'chrome.exe']));

    const status = queries.getFocusStatus();
    expect(status.enabled).toBe(true);
    expect(status.whitelist).toEqual(['code.exe', 'chrome.exe']);
  });

  it('getFocusStatus handles corrupt JSON in whitelist gracefully', () => {
    queries.setSetting('focus_mode_enabled', 'true');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('focus_whitelist', '{not valid json!!!}');

    const status = queries.getFocusStatus();
    expect(status.enabled).toBe(true);
    expect(status.whitelist).toEqual([]); // falls back to empty array
  });

  it('getFocusStatus handles non-array JSON value gracefully', () => {
    queries.setSetting('focus_mode_enabled', 'false');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('focus_whitelist', '"just a string"');

    const status = queries.getFocusStatus();
    expect(status.enabled).toBe(false);
    expect(status.whitelist).toEqual([]);
  });

  it('getFocusReport with whitelist separates focused and distracted apps', () => {
    queries.setSetting('focus_mode_enabled', 'true');
    queries.setSetting('focus_whitelist', JSON.stringify(['code.exe']));

    upsertDailySummary('code.exe', '2026-06-07', 3600);
    upsertDailySummary('chrome.exe', '2026-06-07', 1800);
    upsertDailySummary('slack.exe', '2026-06-07', 900);

    const report = queries.getFocusReport('2026-06-07');
    expect(report.date).toBe('2026-06-07');
    expect(report.focused_total_seconds).toBe(3600);
    expect(report.distracted_total_seconds).toBe(2700);
    expect(report.total_seconds).toBe(6300);
    expect(report.focused_apps).toHaveLength(1);
    expect(report.focused_apps[0].app_name).toBe('code.exe');
    expect(report.distracted_apps).toHaveLength(2);
  });

  it('getFocusReport with empty whitelist marks all as distracted', () => {
    queries.setSetting('focus_whitelist', '[]');

    upsertDailySummary('code.exe', '2026-06-07', 3600);
    upsertDailySummary('chrome.exe', '2026-06-07', 1800);

    const report = queries.getFocusReport('2026-06-07');
    expect(report.focused_total_seconds).toBe(0);
    expect(report.focused_apps).toHaveLength(0);
    expect(report.distracted_total_seconds).toBe(5400);
    expect(report.distracted_apps).toHaveLength(2);
  });

  it('getFocusReport returns zero totals when no daily data', () => {
    queries.setSetting('focus_whitelist', JSON.stringify(['code.exe']));

    const report = queries.getFocusReport('2026-06-07');
    expect(report.total_seconds).toBe(0);
    expect(report.focused_total_seconds).toBe(0);
    expect(report.distracted_total_seconds).toBe(0);
    expect(report.focused_apps).toHaveLength(0);
    expect(report.distracted_apps).toHaveLength(0);
  });
});

describe('v3: Custom Range queries', () => {
  beforeAll(() => {
    queries = new Queries(db);
  });

  beforeEach(() => {
    db.prepare('DELETE FROM daily_summary').run();
  });

  it('getCustomRangeReport aggregates data across date range', () => {
    // Seed: 3 days of data for 2 apps
    upsertDailySummary('code.exe', '2026-06-05', 3600);
    upsertDailySummary('code.exe', '2026-06-06', 1800);
    upsertDailySummary('code.exe', '2026-06-07', 5400);
    upsertDailySummary('chrome.exe', '2026-06-05', 900);
    upsertDailySummary('chrome.exe', '2026-06-07', 2700);

    const report = queries.getCustomRangeReport('2026-06-05', '2026-06-07');
    expect(report.total_seconds).toBe(14400); // 3600+1800+5400+900+2700
    expect(report.active_days).toBe(3);
    expect(report.daily_average_seconds).toBe(4800); // 14400/3
    expect(report.top_app_name).toBe('code.exe');
    expect(report.top_app_duration).toBe(10800);
    expect(report.formatted_total).toBeTruthy();
    expect(report.formatted_daily_average).toBeTruthy();
  });

  it('getCustomRangeReport returns zeros for empty range', () => {
    const report = queries.getCustomRangeReport('2020-01-01', '2020-01-31');
    expect(report.total_seconds).toBe(0);
    expect(report.active_days).toBe(0);
    expect(report.daily_average_seconds).toBe(0);
    expect(report.top_app_name).toBeNull();
    expect(report.top_app_duration).toBe(0);
  });

  it('getCustomRangeTrend returns daily trend data sorted by date', () => {
    upsertDailySummary('code.exe', '2026-06-05', 3600);
    upsertDailySummary('code.exe', '2026-06-06', 1800);
    upsertDailySummary('chrome.exe', '2026-06-06', 900);
    upsertDailySummary('code.exe', '2026-06-07', 5400);

    const trend = queries.getCustomRangeTrend('2026-06-05', '2026-06-07');
    expect(trend).toHaveLength(3);
    expect(trend[0]).toEqual({ date: '2026-06-05', total_seconds: 3600 });
    expect(trend[1]).toEqual({ date: '2026-06-06', total_seconds: 2700 }); // 1800+900
    expect(trend[2]).toEqual({ date: '2026-06-07', total_seconds: 5400 });
  });

  it('getCustomRangeTrend returns empty array for empty range', () => {
    const trend = queries.getCustomRangeTrend('2020-01-01', '2020-01-31');
    expect(trend).toEqual([]);
  });

  it('getCustomRangeRanking returns apps with percentage and formatted duration', () => {
    upsertDailySummary('code.exe', '2026-06-05', 3600);
    upsertDailySummary('code.exe', '2026-06-06', 1800);
    upsertDailySummary('chrome.exe', '2026-06-05', 900);
    upsertDailySummary('slack.exe', '2026-06-06', 300);

    const ranking = queries.getCustomRangeRanking('2026-06-05', '2026-06-06', 10);
    expect(ranking).toHaveLength(3);
    // code.exe should be first
    expect(ranking[0].app_name).toBe('code.exe');
    expect(ranking[0].duration).toBe(5400);
    expect(ranking[0].percentage).toBeGreaterThan(0);
    expect(ranking[0].formattedDuration).toBeTruthy();

    // chrome.exe second
    expect(ranking[1].app_name).toBe('chrome.exe');
    expect(ranking[1].duration).toBe(900);

    // slack.exe third
    expect(ranking[2].app_name).toBe('slack.exe');
    expect(ranking[2].duration).toBe(300);
  });

  it('getCustomRangeRanking respects the limit parameter', () => {
    upsertDailySummary('a.exe', '2026-06-05', 100);
    upsertDailySummary('b.exe', '2026-06-05', 200);
    upsertDailySummary('c.exe', '2026-06-05', 300);

    const ranking = queries.getCustomRangeRanking('2026-06-05', '2026-06-05', 2);
    expect(ranking).toHaveLength(2);
  });

  it('getCustomRangeRanking returns empty array for empty range', () => {
    const ranking = queries.getCustomRangeRanking('2020-01-01', '2020-01-31', 10);
    expect(ranking).toEqual([]);
  });
});

describe('data cleanup', () => {
  it('deletes old events', () => {
    insertEvent('old.exe', '2020-01-01', 100);
    const before = (db.prepare('SELECT COUNT(*) AS cnt FROM app_events WHERE date = ?').get('2020-01-01') as any).cnt;
    expect(before).toBeGreaterThan(0);

    db.prepare("DELETE FROM app_events WHERE date < ?").run('2025-01-01');
    const after = (db.prepare('SELECT COUNT(*) AS cnt FROM app_events WHERE date = ?').get('2020-01-01') as any).cnt;
    expect(after).toBe(0);
  });
});
