import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  shell,
  ipcMain,
  dialog,
  nativeImage,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { Database } from './db/database';
import { Queries } from './db/queries';
import { WindowTracker } from './tracker';
import { autoLaunchService } from './services/auto-launch-service';
import { ReminderService } from './services/reminder-service';
import { FocusAutomationService } from './services/focus-automation-service';
import { createFloatingWindow, destroyFloatingWindow, updateFloatingWindow, getFloatingWindow } from './floating-window';
import type { TrackerStatus, FocusReportData, CustomRangeReport, DailyTrendItem, AppUsageItem } from '../src/types/models';

// ── Helper Utilities ──────────────────────────────────────────

/** Format seconds into a human-friendly duration string (e.g. "2h 35m", "45m", "30s"). */
function formatDurationStr(seconds: number): string {
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

/** Get the Monday of the current week as YYYY-MM-DD. */
function getMondayStr(date?: Date): string {
  const d = new Date(date || Date.now());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Get the previous Monday date string given a Monday date string. */
function getPrevMondayStr(mondayStr: string): string {
  const d = new Date(mondayStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve a resource file path that works in both dev and production (ASAR-safe).
 * In production, use `process.resourcesPath` (the `resources/` folder next to app.asar).
 * In development, use `__dirname`-relative path.
 */
function getResourcePath(filename: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, filename)
    : join(__dirname, '../../resources', filename);
}

/** Main application window reference. */
let mainWindow: BrowserWindow | null = null;

/** Tray manager reference — will be replaced by TrayManager class in T03. */
let tray: Tray | null = null;

/** Database instance — shared across services. */
let db: Database | null = null;

/** Queries instance — shared across services. */
let queries: Queries | null = null;

/** WindowTracker instance — the core tracking engine. */
let tracker: WindowTracker | null = null;

/** v4 E-04: ReminderService instance — pomodoro & sedentary reminders. */
let reminderService: ReminderService | null = null;

/** v4: FocusAutomationService instance — scheduled focus mode toggle. */
let focusAutomation: FocusAutomationService | null = null;

/** Application version from package.json. */
const APP_VERSION: string = app.getVersion();

/** Quit flag — set to true when app is genuinely quitting (not just hiding to tray). */
let isQuitting = false;

/**
 * Create the main BrowserWindow with default dimensions and security settings.
 */
function createMainWindow(): BrowserWindow {
  const preloadPath = join(__dirname, '../preload/preload.js');
  const rendererPath = join(__dirname, '../renderer/index.html');

  console.log('[Main] __dirname:', __dirname);
  console.log('[Main] Preload path:', preloadPath);
  console.log('[Main] Renderer path:', rendererPath);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Screen Time Monitor',
    icon: getResourcePath('icon.png'),
    show: false,
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Show window on ready, but also add a safety timeout
  let shown = false;
  const doShow = () => {
    if (!shown) {
      shown = true;
      mainWindow?.show();
      console.log('[Main] Window shown.');
    }
  };

  mainWindow.on('ready-to-show', doShow);

  // Fallback: show window after 5s even if renderer isn't ready
  setTimeout(doShow, 5000);

  // Log renderer errors
  mainWindow.webContents.on('did-fail-load', (_event, code, desc, url) => {
    console.error('[Main] Renderer failed to load:', code, desc, url);
  });

  // Hide window instead of closing — keep the app alive in tray
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      console.log('[Main] Window hidden to tray.');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Load renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(rendererPath);
  }

  return mainWindow;
}

/**
 * Initialize the database connection and run migrations.
 */
function initDatabase(): void {
  const dbPath: string = join(app.getPath('userData'), 'data.db');
  // NOTE: encryptionKey is accepted but sqlcipher is skipped for now.
  // Using plain better-sqlite3 until sqlcipher is integrated.
  const encryptionKey: string = 'screen_time_monitor_placeholder_key';
  db = new Database(dbPath, encryptionKey);
  db.runMigrations();
  queries = new Queries(db.getDb());

  // v4 E-04: Create ReminderService before tracker so callbacks can reference it
  reminderService = new ReminderService(queries, mainWindow);

  // v4: Create FocusAutomationService
  focusAutomation = new FocusAutomationService(queries);
  focusAutomation.setToggleCallback((enabled: boolean) => {
    // Toggle focus mode via settings layer (same as settings:set handler)
    queries.setSetting('focus_mode_enabled', String(enabled));
    console.log('[FocusAutomation] Focus Mode ' + (enabled ? 'enabled' : 'disabled') + ' by schedule.');
  });

  tracker = new WindowTracker(db.getDb(), queries, {
    onTrackingStateChange: (state) => {
      if (!reminderService) return;
      switch (state) {
        case 'started':
        case 'resumed':
          reminderService.onTrackingStarted();
          break;
        case 'paused':
        case 'stopped':
          reminderService.onTrackingPaused();
          break;
        case 'idle':
          reminderService.onIdleDetected();
          break;
      }
    },
  });

  console.log('[DB] Database initialized at', dbPath);
}

/**
 * Create a fallback tray icon (solid indigo circle on opaque background)
 * for when the real tray-icon.png file cannot be loaded.
 *
 * Returns a 32×32 NativeImage — compatible with HiDPI Windows displays.
 */
function createFallbackTrayIcon(): Electron.NativeImage {
  const size = 32;
  const pixels = Buffer.alloc(size * size * 4, 255); // solid white (opaque)
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const radius = size * 0.4;
  const r = 99, g = 102, b = 241; // indigo #6366F1

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (Math.sqrt(dx * dx + dy * dy) <= radius) {
        const idx = (y * size + x) * 4;
        pixels[idx] = r;
        pixels[idx + 1] = g;
        pixels[idx + 2] = b;
        pixels[idx + 3] = 255;
      }
    }
  }

  // Encode raw RGBA pixels as a valid PNG buffer
  const zlib = require('zlib');
  // Minimal PNG encoder for raw RGBA → PNG
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(25); // len(4) + "IHDR"(4) + data(13) + crc(4)
  ihdr.writeUInt32BE(13, 0); // data length
  ihdr.write('IHDR', 4);
  ihdr.writeUInt32BE(size, 8);  // width
  ihdr.writeUInt32BE(size, 12); // height
  ihdr[16] = 8;  // bit depth
  ihdr[17] = 6;  // color type RGBA
  ihdr[18] = 0;  // compression
  ihdr[19] = 0;  // filter
  ihdr[20] = 0;  // interlace

  // CRC-32 for IHDR
  const crcTable: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c;
  }
  function crc32(buf: Buffer): number {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  const ihdrCrc = Buffer.alloc(4);
  ihdrCrc.writeUInt32BE(crc32(ihdr.slice(4, 21)), 0);
  ihdr.set(ihdrCrc, 21);

  // IDAT — raw scanlines (1 filter byte per row)
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0; // filter: None
    pixels.copy(raw, y * (1 + size * 4) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  const idat = Buffer.alloc(8 + compressed.length + 4);
  idat.writeUInt32BE(compressed.length, 0);
  idat.write('IDAT', 4);
  compressed.copy(idat, 8);
  idat.writeUInt32BE(crc32(idat.slice(4, 8 + compressed.length)), 8 + compressed.length);

  // IEND
  const iend = Buffer.alloc(12);
  iend.writeUInt32BE(0, 0);
  iend.write('IEND', 4);
  iend.writeUInt32BE(crc32(iend.slice(4, 8)), 8);

  const pngBuf = Buffer.concat([sig, ihdr, idat, iend]);
  return nativeImage.createFromBuffer(pngBuf, { width: size, height: size });
}

/**
 * Create a system tray icon with a rich context menu showing today's summary.
 *
 * Icon loading strategy (Windows-aware):
 *   1. Try tray-icon@2x.png (32×32) for HiDPI displays
 *   2. Fall back to tray-icon.png (16×16)
 *   3. Last resort: programmatic 32×32 icon with solid background
 *
 * Using readFileSync + createFromBuffer instead of createFromPath for
 * reliable loading in packaged (ASAR) environments.
 */
function createTray(): void {
  if (!mainWindow) return;

  let trayIcon: Electron.NativeImage | null = null;

  // Strategy 1: Try @2x PNG for HiDPI displays
  const hiDpiPath = getResourcePath('tray-icon@2x.png');
  const normalPath = getResourcePath('tray-icon.png');

  for (const [label, iconPath] of [
    ['HiDPI (@2x)', hiDpiPath],
    ['Standard (1x)', normalPath],
  ] as const) {
    if (!existsSync(iconPath)) {
      console.log(`[Tray] ${label} icon not found at: ${iconPath}`);
      continue;
    }
    try {
      const pngBuffer = readFileSync(iconPath);
      trayIcon = nativeImage.createFromBuffer(pngBuffer);
      if (!trayIcon.isEmpty()) {
        console.log(`[Tray] Loaded ${label} tray icon (${pngBuffer.length} bytes).`);
        break;
      }
      console.warn(`[Tray] ${label} icon loaded but was empty.`);
    } catch (err) {
      console.warn(`[Tray] Failed to read ${label} icon:`, err);
    }
  }

  // Strategy 3: Programmatic fallback (opaque background for Windows)
  if (!trayIcon || trayIcon.isEmpty()) {
    console.warn('[Tray] All icon files failed — using programmatic fallback icon.');
    trayIcon = createFallbackTrayIcon();
  }

  try {
    tray = new Tray(trayIcon);
    tray.setToolTip('Screen Time Monitor');

    // Build initial menu (no data yet — shows "Loading...")
    rebuildTrayMenu();

    tray.on('double-click', () => {
      mainWindow?.show();
      mainWindow?.focus();
    });

    // Periodically refresh the tray menu with latest data (every 60s)
    setInterval(() => {
      rebuildTrayMenu();
    }, 60_000);

    console.log('[Tray] Tray icon created successfully.');
  } catch (err) {
    console.warn('[Tray] Failed to create tray icon:', err);
  }
}

/**
 * Rebuild the tray context menu with today's top apps and tracker controls.
 * Called on tray creation, periodically, and after pause/resume actions.
 */
function rebuildTrayMenu(): void {
  if (!tray || !queries) return;

  try {
    const today: string = new Date().toISOString().slice(0, 10);
    const rows = queries.getDailySummary(today);
    const topApps = rows.slice(0, 5);
    const isPaused: boolean = tracker ? tracker.getState().is_paused : false;

    const menuItems: Electron.MenuItemConstructorOptions[] = [];

    // ── Today's Summary Section ──
    menuItems.push({
      label: trayMenuLabels.todaySummary + ' — ' + today,
      enabled: false,
    });

    if (topApps.length === 0) {
      menuItems.push({
        label: '  ' + trayMenuLabels.noActivity,
        enabled: false,
      });
    } else {
      for (const row of topApps) {
        menuItems.push({
          label: `  ${row.app_name}  —  ${formatDurationStr(row.total_duration)}`,
          enabled: false,
        });
      }
    }

    menuItems.push({ type: 'separator' });

    // ── Control Section ──
    if (isPaused) {
      menuItems.push({
        label: trayMenuLabels.resumeTracking,
        click: (): void => {
          if (tracker) {
            tracker.resume();
            rebuildTrayMenu();
            mainWindow?.webContents.send('tracker:status-change', tracker.getState());
          }
        },
      });
    } else {
      menuItems.push({
        label: trayMenuLabels.pauseTracking,
        click: (): void => {
          if (tracker) {
            tracker.pause();
            rebuildTrayMenu();
            mainWindow?.webContents.send('tracker:status-change', tracker.getState());
          }
        },
      });
    }

    menuItems.push({
      label: trayMenuLabels.openPanel,
      click: (): void => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    });

    menuItems.push({ type: 'separator' });

    menuItems.push({
      label: trayMenuLabels.quit,
      click: (): void => {
        app.quit();
      },
    });

    tray.setContextMenu(Menu.buildFromTemplate(menuItems));
  } catch (err) {
    console.warn('[Tray] Failed to rebuild tray menu:', err);
  }
}

/** Cached i18n labels for tray menu (updated via IPC). */
let trayMenuLabels: Record<string, string> = {
  todaySummary: 'Today',
  pauseTracking: '⏸ Pause Tracking',
  resumeTracking: '▶ Resume Tracking',
  openPanel: '📊 Open Main Panel',
  quit: '❌ Quit',
  noActivity: '  No activity recorded yet',
};

/**
 * Rebuild tray menu using translated labels from the renderer process.
 * Called when the user changes language in Settings.
 */
function rebuildTrayMenuWithLabels(labels: Record<string, string>): void {
  trayMenuLabels = { ...trayMenuLabels, ...labels };
  rebuildTrayMenu();
}

/**
 * Rebuild the tray context menu (updated to use i18n labels).
 * Register placeholder IPC handlers.
 * Full IPC handlers will be implemented in T03 (electron/ipc/handlers.ts).
 */
function registerIpcHandlers(): void {
  if (!queries) return;

  // ── App ─────────────────────────────────────────────────────

  ipcMain.handle('app:get-version', (): string => {
    return APP_VERSION;
  });

  ipcMain.on('app:quit', (): void => {
    app.quit();
  });

  // ── v4 E-03: Auto-start status check ─────────────────────────
  ipcMain.handle(
    'app:get-auto-start-status',
    async (): Promise<{ success: boolean; data?: { enabled: boolean }; error?: string }> => {
      try {
        const enabled = await autoLaunchService.isEnabled();
        return { success: true, data: { enabled } };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  // ── v4: Floating window ──────────────────────────────────────
  ipcMain.handle('floating:show', (): void => {
    createFloatingWindow();
  });

  ipcMain.handle('floating:hide', (): void => {
    destroyFloatingWindow();
  });

  ipcMain.handle('floating:is-visible', (): boolean => {
    return getFloatingWindow() !== null;
  });

  // Handle close from the floating window's close button
  ipcMain.on('floating:hide', (): void => {
    destroyFloatingWindow();
  });

  // ── Settings ────────────────────────────────────────────────

  ipcMain.handle(
    'settings:get',
    (_event: Electron.IpcMainInvokeEvent, key: string): string | null => {
      return queries!.getSetting(key);
    }
  );

  ipcMain.handle(
    'settings:set',
    (
      _event: Electron.IpcMainInvokeEvent,
      key: string,
      value: string
    ): { success: boolean; error?: string } => {
      try {
        queries!.setSetting(key, value);

        // Apply side effects for special settings keys
        if (key === 'auto_start') {
          if (value === 'true') {
            autoLaunchService.enable().catch((err) =>
              console.error('[Settings] AutoLaunchService.enable() failed:', err)
            );
          } else {
            autoLaunchService.disable().catch((err) =>
              console.error('[Settings] AutoLaunchService.disable() failed:', err)
            );
          }
          console.log('[Settings] Auto-start ' + (value === 'true' ? 'enabled' : 'disabled'));
        }

        if (key === 'show_tray') {
          if (value === 'true' && !tray) {
            createTray();
            console.log('[Settings] Tray icon created');
          } else if (value === 'false' && tray) {
            tray.destroy();
            tray = null;
            console.log('[Settings] Tray icon destroyed');
          }
        }

        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  ipcMain.handle(
    'settings:get-all',
    (): { success: boolean; data?: Record<string, string>; error?: string } => {
      try {
        const keys = [
          'auto_start',
          'idle_threshold',
          'auto_track',
          'notifications',
          'data_retention',
          'privacy_mode',
          'show_tray',
          'focus_mode_enabled',
          'focus_whitelist',
          'language',
          'pomodoro_enabled',
          'pomodoro_interval',
          'sedentary_enabled',
          'sedentary_interval',
          'focus_schedule_enabled',
          'focus_schedule_days',
          'focus_schedule_start',
          'focus_schedule_end',
        ];
        const result: Record<string, string> = {};
        for (const key of keys) {
          const val = queries!.getSetting(key);
          if (val !== null) {
            result[key] = val;
          }
        }
        return { success: true, data: result };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  // ── Tracker ─────────────────────────────────────────────────

  ipcMain.handle(
    'tracker:get-status',
    (): { success: boolean; data?: TrackerStatus; error?: string } => {
      if (!tracker) {
        return { success: false, error: 'Tracker not initialized' };
      }
      return { success: true, data: tracker.getState() };
    }
  );

  ipcMain.handle(
    'tracker:pause',
    (): { success: boolean; error?: string } => {
      if (!tracker) {
        return { success: false, error: 'Tracker not initialized' };
      }
      tracker.pause();
      // Notify renderer + rebuild tray to reflect updated state
      mainWindow?.webContents.send('tracker:status-change', tracker.getState());
      rebuildTrayMenu();
      return { success: true };
    }
  );

  ipcMain.handle(
    'tracker:resume',
    (): { success: boolean; error?: string } => {
      if (!tracker) {
        return { success: false, error: 'Tracker not initialized' };
      }
      tracker.resume();
      // Notify renderer + rebuild tray to reflect updated state
      mainWindow?.webContents.send('tracker:status-change', tracker.getState());
      rebuildTrayMenu();
      return { success: true };
    }
  );

  ipcMain.handle(
    'tracker:start',
    (): { success: boolean; error?: string } => {
      if (!tracker) {
        return { success: false, error: 'Tracker not initialized' };
      }
      tracker.start();
      return { success: true };
    }
  );

  ipcMain.handle(
    'tracker:stop',
    (): { success: boolean; error?: string } => {
      if (!tracker) {
        return { success: false, error: 'Tracker not initialized' };
      }
      tracker.stop();
      return { success: true };
    }
  );

  // ── Data: Today Summary ─────────────────────────────────────

  ipcMain.handle(
    'data:get-today-summary',
    (): { success: boolean; data?: unknown; error?: string } => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const rows = queries!.getDailySummary(today);
        const totalSeconds = rows.reduce((s, r) => s + r.total_duration, 0);
        const topApps = rows.slice(0, 10).map((r) => ({
          app_name: r.app_name,
          duration: r.total_duration,
          percentage: totalSeconds > 0
            ? Math.round((r.total_duration / totalSeconds) * 100)
            : 0,
          formattedDuration: formatDurationStr(r.total_duration),
        }));

        // Hourly heatmap aggregated from app_events by hour of started_at
        const hourlyHeatmap: number[] = queries!.getHourlyHeatmap(today);

        return {
          success: true,
          data: {
            total_seconds: totalSeconds,
            formatted_total: formatDurationStr(totalSeconds),
            active_apps_count: rows.length,
            top_apps: topApps,
            hourly_heatmap: hourlyHeatmap,
          },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  // ── Data: Weekly Report ─────────────────────────────────────

  ipcMain.handle(
    'data:get-weekly-report',
    (
      _event: Electron.IpcMainInvokeEvent,
      ...args: string[]
    ): { success: boolean; data?: unknown; error?: string } => {
      try {
        const weekStart = args[0] || getMondayStr();
        const weeklyRows = queries!.getWeeklySummary(weekStart);

        const dailyTotals = weeklyRows.map((r) => ({
          date: r.date,
          total_seconds: r.total_duration,
        }));

        // app_distribution: aggregate across ALL 7 days of the week by app_name
        const weeklyAppRows = queries!.getWeeklyAppSummary(weekStart);
        const weeklyTotal = weeklyAppRows.reduce(
          (s, r) => s + r.total_duration,
          0,
        );
        const appDist = weeklyAppRows.slice(0, 10).map((r) => ({
          app_name: r.app_name,
          duration: r.total_duration,
          percentage:
            weeklyTotal > 0
              ? Math.round((r.total_duration / weeklyTotal) * 100)
              : 0,
          formattedDuration: formatDurationStr(r.total_duration),
        }));

        // previous week comparison
        const prevWeekStart = getPrevMondayStr(weekStart);
        const prevRows = queries!.getWeeklySummary(prevWeekStart);
        const prevTotal = prevRows.reduce((s, r) => s + r.total_duration, 0);
        const totalCurr = weeklyRows.reduce(
          (s, r) => s + r.total_duration,
          0
        );
        const diffPercent =
          prevTotal > 0
            ? Math.round(((totalCurr - prevTotal) / prevTotal) * 100)
            : 0;

        return {
          success: true,
          data: {
            week_label: weekStart,
            daily_totals: dailyTotals,
            app_distribution: appDist,
            trend_data: dailyTotals.map((d) => ({
              date: d.date,
              duration: d.total_seconds,
            })),
            previous_week_comparison: { diff_percent: diffPercent },
          },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  // ── Data: Monthly Report ────────────────────────────────────

  ipcMain.handle(
    'data:get-monthly-report',
    (
      _event: Electron.IpcMainInvokeEvent,
      ...args: string[]
    ): { success: boolean; data?: unknown; error?: string } => {
      try {
        const month =
          args[0] || new Date().toISOString().slice(0, 7);
        const monthlyRows = queries!.getMonthlySummary(month);

        // Group by weeks of the month
        const totalMonth = monthlyRows.reduce(
          (s, r) => s + r.total_duration,
          0
        );

        const appDist = monthlyRows.slice(0, 10).map((r) => ({
          app_name: r.app_name,
          duration: r.total_duration,
          percentage:
            totalMonth > 0
              ? Math.round((r.total_duration / totalMonth) * 100)
              : 0,
          formattedDuration: formatDurationStr(r.total_duration),
        }));

        // Weekly totals (approximate: split by 4 weeks)
        const targetYear = parseInt(month.slice(0, 4), 10);
        const targetMonth = parseInt(month.slice(5, 7), 10);
        const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
        const weeklyTotals: { week: string; total_seconds: number }[] = [];
        for (let w = 1; w <= 4; w++) {
          const wStart = w * 7 - 6;
          const wEnd = Math.min(w * 7, daysInMonth);
          const label = `${wStart}-${wEnd}`;
          weeklyTotals.push({ week: label, total_seconds: Math.round(totalMonth / 4) });
        }

        // Previous month comparison
        const prevYear = targetMonth === 1 ? targetYear - 1 : targetYear;
        const prevMonth = targetMonth === 1 ? 12 : targetMonth - 1;
        const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
        const prevRows = queries!.getMonthlySummary(prevMonthStr);
        const prevTotal = prevRows.reduce(
          (s, r) => s + r.total_duration,
          0
        );
        const diffPercent =
          prevTotal > 0
            ? Math.round(((totalMonth - prevTotal) / prevTotal) * 100)
            : 0;

        return {
          success: true,
          data: {
            month_label: month,
            weekly_totals: weeklyTotals,
            app_distribution: appDist,
            previous_month_comparison: { diff_percent: diffPercent },
          },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  // ── Data: App Ranking ───────────────────────────────────────

  ipcMain.handle(
    'data:get-app-ranking',
    (
      _event: Electron.IpcMainInvokeEvent,
      date: string,
      limit: number
    ): { success: boolean; data?: unknown; error?: string } => {
      try {
        const rows = queries!.getAppRanking(date, limit);
        return { success: true, data: rows };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  // ── Limits ──────────────────────────────────────────────────

  ipcMain.handle(
    'limits:get-all',
    (): { success: boolean; data?: unknown; error?: string } => {
      try {
        const limits = queries!.getUsageLimits();
        return { success: true, data: limits };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  ipcMain.handle(
    'limits:set',
    (
      _event: Electron.IpcMainInvokeEvent,
      appName: string,
      limitMinutes: number
    ): { success: boolean; error?: string } => {
      try {
        queries!.setUsageLimit({
          app_name: appName,
          limit_minutes: limitMinutes,
        });
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  ipcMain.handle(
    'limits:delete',
    (
      _event: Electron.IpcMainInvokeEvent,
      id: number
    ): { success: boolean; error?: string } => {
      try {
        queries!.deleteUsageLimit(id);
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  // ── Export ──────────────────────────────────────────────────

  ipcMain.handle(
    'export:csv',
    async (
      _event: Electron.IpcMainInvokeEvent,
      ...args: string[]
    ): Promise<{ success: boolean; data?: string; error?: string }> => {
      try {
        const [startDate, endDate] = args as [string, string];
        const exportRows = queries!.getExportData(startDate, endDate);

        // Build CSV string
        const header =
          'Date,App Name,Window Title,Duration (s),Started At,Ended At';
        const csvRows = exportRows.map(
          (r) =>
            `"${r.date}","${r.app_name}","${(
              r.window_title || ''
            ).replace(/"/g, '""')}",${r.duration},"${r.started_at}","${r.ended_at}"`
        );
        const csv = [header, ...csvRows].join('\n');

        // Save via dialog
        const { dialog } = require('electron');
        const { writeFileSync } = require('fs');
        const result = await dialog.showSaveDialog({
          defaultPath: `screen-time-export-${startDate}-to-${endDate}.csv`,
          filters: [{ name: 'CSV', extensions: ['csv'] }],
        });

        if (!result.canceled && result.filePath) {
          writeFileSync(result.filePath, csv, 'utf-8');
          return { success: true, data: result.filePath };
        }
        return { success: true, data: '' };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  // ── Categories ───────────────────────────────────────────────

  ipcMain.handle(
    'categories:get-all',
    (): { success: boolean; data?: unknown; error?: string } => {
      try {
        const cats = queries!.getCategories();
        return { success: true, data: cats };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  ipcMain.handle(
    'categories:set',
    (
      _event: Electron.IpcMainInvokeEvent,
      appName: string,
      category: string
    ): { success: boolean; error?: string } => {
      try {
        queries!.setCategory(appName, category);
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  ipcMain.handle(
    'categories:delete',
    (
      _event: Electron.IpcMainInvokeEvent,
      id: number
    ): { success: boolean; error?: string } => {
      try {
        queries!.deleteCategory(id);
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  ipcMain.handle(
    'data:get-categorized-report',
    (
      _event: Electron.IpcMainInvokeEvent,
      startDate: string,
      endDate: string
    ): { success: boolean; data?: unknown; error?: string } => {
      try {
        const rows = queries!.getCategorizedReport(startDate, endDate);
        return { success: true, data: rows };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  // ── Data Cleanup ────────────────────────────────────────────

  ipcMain.handle(
    'data:cleanup',
    (
      _event: Electron.IpcMainInvokeEvent,
      retentionDays: number
    ): { success: boolean; data?: { deleted: number }; error?: string } => {
      try {
        const deleted = queries!.deleteOldData(retentionDays);
        return { success: true, data: { deleted } };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  // ── Save File (used by PDF export in renderer) ──────────────

  ipcMain.handle(
    'export:save-file',
    async (
      _event: Electron.IpcMainInvokeEvent,
      bufferData: number[],
      defaultName: string,
      filters: Array<{ name: string; extensions: string[] }>
    ): Promise<{ success: boolean; data?: string; error?: string }> => {
      try {
        const { dialog } = require('electron');
        const { writeFileSync } = require('fs');
        const result = await dialog.showSaveDialog({
          defaultPath: defaultName,
          filters,
        });
        if (!result.canceled && result.filePath) {
          writeFileSync(result.filePath, Buffer.from(bufferData));
          return { success: true, data: result.filePath };
        }
        return { success: true, data: '' };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  // ── v3: Focus Mode ───────────────────────────────────────────

  ipcMain.handle(
    'focus:get-status',
    (): { success: boolean; data?: unknown; error?: string } => {
      try {
        const status = queries!.getFocusStatus();
        return { success: true, data: status };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  ipcMain.handle(
    'focus:toggle',
    (
      _event: Electron.IpcMainInvokeEvent,
      enabled: boolean
    ): { success: boolean; error?: string } => {
      try {
        queries!.setSetting('focus_mode_enabled', String(enabled));
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  ipcMain.handle(
    'focus:set-whitelist',
    (
      _event: Electron.IpcMainInvokeEvent,
      appNames: string[]
    ): { success: boolean; error?: string } => {
      try {
        if (!Array.isArray(appNames)) {
          return { success: false, error: 'appNames must be an array' };
        }
        queries!.setSetting('focus_whitelist', JSON.stringify(appNames));
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  ipcMain.handle(
    'focus:get-report',
    (
      _event: Electron.IpcMainInvokeEvent,
      date: string
    ): { success: boolean; data?: FocusReportData; error?: string } => {
      try {
        const report = queries!.getFocusReport(date);
        return { success: true, data: report };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  // ── v3: Custom Range ─────────────────────────────────────────

  ipcMain.handle(
    'data:get-custom-range-report',
    (
      _event: Electron.IpcMainInvokeEvent,
      startDate: string,
      endDate: string
    ): { success: boolean; data?: CustomRangeReport; error?: string } => {
      try {
        const report = queries!.getCustomRangeReport(startDate, endDate);
        return { success: true, data: report };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  ipcMain.handle(
    'data:get-custom-range-trend',
    (
      _event: Electron.IpcMainInvokeEvent,
      startDate: string,
      endDate: string
    ): { success: boolean; data?: DailyTrendItem[]; error?: string } => {
      try {
        const trend = queries!.getCustomRangeTrend(startDate, endDate);
        return { success: true, data: trend };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  ipcMain.handle(
    'data:get-custom-range-ranking',
    (
      _event: Electron.IpcMainInvokeEvent,
      startDate: string,
      endDate: string,
      limit: number
    ): { success: boolean; data?: AppUsageItem[]; error?: string } => {
      try {
        const ranking = queries!.getCustomRangeRanking(startDate, endDate, limit || 10);
        return { success: true, data: ranking };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  // ── v3: Auto Update ──────────────────────────────────────────

  ipcMain.handle(
    'app:check-for-updates',
    async (): Promise<{
      success: boolean;
      data?: { updateAvailable: boolean; version?: string };
      error?: string;
    }> => {
      try {
        if (!app.isPackaged) {
          return { success: true, data: { updateAvailable: false } };
        }
        const result = await autoUpdater.checkForUpdates();
        const updateAvailable = result && result.updateInfo && result.updateInfo.version !== app.getVersion();
        return {
          success: true,
          data: {
            updateAvailable,
            version: updateAvailable ? result.updateInfo.version : undefined,
          },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  ipcMain.handle(
    'app:install-update',
    (): { success: boolean; error?: string } => {
      try {
        autoUpdater.quitAndInstall();
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  // ── v3: Tray i18n ────────────────────────────────────────────

  ipcMain.on(
    'tray:update-menu-labels',
    (_event: Electron.IpcMainEvent, labels: Record<string, string>) => {
      try {
        rebuildTrayMenuWithLabels(labels);
      } catch (err) {
        console.error('[Tray] Failed to update menu labels:', err);
      }
    }
  );
}

/**
 * Initialize auto-update via electron-updater.
 * Only activates when the app is packaged (not in development).
 */
function initAutoUpdater(): void {
  if (!app.isPackaged) {
    console.log('[AutoUpdater] Skipped — not packaged (development mode).');
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
    mainWindow?.webContents.send('app:update-available', { version: info.version });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info.version);
    mainWindow?.webContents.send('app:update-downloaded', { version: info.version });
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err.message);
    mainWindow?.webContents.send('app:update-available', { version: 'error', error: err.message });
  });

  // Check for updates on startup
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error('[AutoUpdater] checkForUpdatesAndNotify failed:', err.message);
  });
}

/**
 * Graceful shutdown: stop tracking, close database, destroy tray.
 */
function cleanup(): void {
  console.log('[App] Cleaning up before quit...');
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

// ─── App Lifecycle ────────────────────────────────────────────

// Ensure single instance lock
const gotSingleInstanceLock: boolean = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (): void => {
    // If window was closed (hidden to tray), recreate it
    if (!mainWindow || mainWindow.isDestroyed()) {
      createMainWindow();
    } else {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then((): void => {
    try {
      initDatabase();
      createMainWindow();
      createTray();
      registerIpcHandlers();

    // v4 E-03: Initialize AutoLaunchService and self-repair
    autoLaunchService.init();
    if (queries) {
      const autoStartVal: string | null = queries.getSetting('auto_start');
      const dbAutoStart = autoStartVal === 'true';
      // Self-repair: sync registry with DB state (fire-and-forget)
      autoLaunchService.repair(dbAutoStart).catch((err) =>
        console.error('[App] AutoLaunchService.repair() failed:', err)
      );
    }

    // Auto-start tracking
    if (tracker) {
      tracker.start();
    }

    // v4 E-04: Start reminder service
    if (reminderService) {
      reminderService.start();
    }

    // v4: Start focus automation scheduler
    if (focusAutomation) {
      focusAutomation.start();
    }

    // v4: Floating window periodic update (every 2s when window is visible)
    setInterval(() => {
      if (!getFloatingWindow()) return;
      if (!tracker || !queries) return;

      const status = tracker.getState();
      const today = new Date().toISOString().slice(0, 10);
      const dailyRows = queries.getDailySummary(today);
      const todayTotal = dailyRows.reduce((s: number, r: { total_duration: number }) => s + r.total_duration, 0);
      const hours = Math.floor(todayTotal / 3600);
      const mins = Math.floor((todayTotal % 3600) / 60);
      const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      const focusEnabled = queries.getSetting('focus_mode_enabled') === 'true';

      updateFloatingWindow({
        currentApp: status.current_app,
        focusMode: focusEnabled,
        todayDuration: durationStr,
        isTracking: status.is_tracking && !status.is_paused,
      });
    }, 2000);

    // Initialize auto-update (packaged mode only)
    initAutoUpdater();

    console.log('[App] Screen Time Monitor started — v' + APP_VERSION);
    } catch (err) {
      console.error('[App] Fatal startup error:', err);
      // Fallback: try to show window anyway
      if (!mainWindow) {
        createMainWindow();
      }
      mainWindow?.show();
      // Show a dialog box so the user knows something went wrong
      dialog.showErrorBox('Startup Error', String(err));
    }
  });

  app.on('window-all-closed', (): void => {
    // On Windows, keep the app running in the tray
    // Do not quit automatically
  });

  app.on('before-quit', (): void => {
    isQuitting = true;
    cleanup();
  });

  app.on('activate', (): void => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}
