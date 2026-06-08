import BetterSqlite3 from 'better-sqlite3';
import { Migrations } from './migrations';

/**
 * Database connection manager for Screen Time Monitor.
 *
 * Wraps better-sqlite3 with lifecycle management and migration support.
 * The database file is stored at %APPDATA%/screen_time_monitor/data.db.
 *
 * NOTE: SQLCipher encryption is planned but not yet integrated.
 * The encryptionKey parameter is accepted but currently unused.
 * When sqlcipher is added, replace better-sqlite3 with @journeyapps/sqlcipher.
 */
export class Database {
  private db: BetterSqlite3.Database;
  private dbPath: string;

  /**
   * Initialize the database connection.
   *
   * @param dbPath - Full path to the SQLite database file.
   * @param encryptionKey - (Future) Encryption key for SQLCipher. Currently unused.
   */
  constructor(dbPath: string, encryptionKey: string) {
    this.dbPath = dbPath;

    // TODO: When sqlcipher is integrated, use the encryptionKey parameter:
    // this.db = new BetterSqlite3(dbPath, { nativeBinding: sqlcipher });
    // this.db.pragma(`key = '${encryptionKey}'`);

    this.db = new BetterSqlite3(dbPath);

    // Performance pragmas
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('cache_size = -8000'); // 8 MB cache

    console.log('[Database] Connected to', dbPath);
  }

  /**
   * Get the underlying better-sqlite3 Database instance.
   * Used by Queries and other services to execute SQL.
   */
  getDb(): BetterSqlite3.Database {
    return this.db;
  }

  /**
   * Run all pending database migrations.
   * Delegates to the static Migrations.run() method.
   */
  runMigrations(): void {
    console.log('[Database] Running migrations...');
    Migrations.run(this.db);
    console.log('[Database] Migrations complete.');
  }

  /**
   * Gracefully close the database connection.
   * Should be called during app shutdown.
   */
  close(): void {
    if (this.db && this.db.open) {
      try {
        this.db.close();
        console.log('[Database] Connection closed.');
      } catch (err) {
        console.error('[Database] Error closing connection:', err);
      }
    }
  }
}
