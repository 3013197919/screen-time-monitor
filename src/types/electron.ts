/**
 * ElectronAPI type definitions for the renderer process.
 *
 * This file mirrors the interface exposed via contextBridge in electron/preload.ts.
 * Import these types in renderer code to get full type safety on window.electronAPI calls.
 */

import type {
  TrackerStatus,
  TodaySummaryData,
  WeeklyReportData,
  MonthlyReportData,
  AppUsageItem,
  UsageLimit,
  LimitReachedData,
  CategorySummary,
  AppCategoryRow,
  FocusModeStatus,
  FocusReportData,
  CustomRangeReport,
  DailyTrendItem,
  IpcResponse,
} from './models';

/**
 * The complete electronAPI surface exposed to the renderer process.
 * Use `window.electronAPI` to access these methods.
 */
export interface ElectronAPI {
  tracker: {
    getStatus: () => Promise<IpcResponse<TrackerStatus>>;
    pause: () => Promise<IpcResponse<void>>;
    resume: () => Promise<IpcResponse<void>>;
    start: () => Promise<IpcResponse<void>>;
    stop: () => Promise<IpcResponse<void>>;
    onStatusChange: (callback: (status: TrackerStatus) => void) => () => void;
  };

  data: {
    getTodaySummary: () => Promise<IpcResponse<TodaySummaryData>>;
    getWeeklyReport: (weekStart?: string) => Promise<IpcResponse<WeeklyReportData>>;
    getMonthlyReport: (month?: string) => Promise<IpcResponse<MonthlyReportData>>;
    getAppRanking: (
      date: string,
      limit: number
    ) => Promise<IpcResponse<AppUsageItem[]>>;
    getCategorizedReport: (
      startDate: string,
      endDate: string
    ) => Promise<IpcResponse<CategorySummary[]>>;
    getCustomRangeReport: (params: {
      startDate: string;
      endDate: string;
    }) => Promise<IpcResponse<CustomRangeReport>>;
    getCustomRangeTrend: (params: {
      startDate: string;
      endDate: string;
    }) => Promise<IpcResponse<DailyTrendItem[]>>;
    getCustomRangeRanking: (params: {
      startDate: string;
      endDate: string;
      limit: number;
    }) => Promise<IpcResponse<AppUsageItem[]>>;
  };

  categories: {
    getAll: () => Promise<IpcResponse<AppCategoryRow[]>>;
    set: (appName: string, category: string) => Promise<IpcResponse<void>>;
    delete: (id: number) => Promise<IpcResponse<void>>;
  };

  limits: {
    getAll: () => Promise<IpcResponse<UsageLimit[]>>;
    set: (appName: string, limitMinutes: number) => Promise<IpcResponse<void>>;
    delete: (id: number) => Promise<IpcResponse<void>>;
    onLimitReached: (
      callback: (data: LimitReachedData) => void
    ) => () => void;
  };

  export: {
    csv: (startDate: string, endDate: string) => Promise<IpcResponse<string>>;
    saveFile: (
      bufferData: number[],
      defaultName: string,
      filters: Array<{ name: string; extensions: string[] }>
    ) => Promise<IpcResponse<string>>;
  };

  cleanup: {
    run: (retentionDays: number) => Promise<IpcResponse<{ deleted: number }>>;
  };

  settings: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    getAll: () => Promise<Record<string, string>>;
  };

  app: {
    getVersion: () => Promise<string>;
    /** v4 E-03: Query OS registry for auto-start status. */
    getAutoStartStatus: () => Promise<IpcResponse<{ enabled: boolean }>>;
    quit: () => void;
    checkForUpdates: () => Promise<IpcResponse<{ updateAvailable: boolean; version?: string }>>;
    installUpdate: () => Promise<IpcResponse<void>>;
    onUpdateAvailable: (callback: (data: { version: string }) => void) => () => void;
    onUpdateDownloaded: (callback: (data: { version: string }) => void) => () => void;
  };

  focus: {
    getStatus: () => Promise<IpcResponse<FocusModeStatus>>;
    toggle: (enabled: boolean) => Promise<IpcResponse<void>>;
    setWhitelist: (appNames: string[]) => Promise<IpcResponse<void>>;
    getReport: (date: string) => Promise<IpcResponse<FocusReportData>>;
  };

  tray: {
    updateMenuLabels: (labels: Record<string, string>) => void;
  };

  /** v4 E-04: Reminder events from main process. */
  reminder: {
    onPomodoro: (callback: (data: { intervalMinutes: number }) => void) => () => void;
    onSedentary: (callback: (data: { accumulatedMinutes: number }) => void) => () => void;
  };
}

/**
 * IPC channel name constants.
 * Format: {domain}:{action}
 */
export const IPC_CHANNELS = {
  // Tracker
  TRACKER_GET_STATUS: 'tracker:get-status',
  TRACKER_PAUSE: 'tracker:pause',
  TRACKER_RESUME: 'tracker:resume',
  TRACKER_START: 'tracker:start',
  TRACKER_STOP: 'tracker:stop',
  TRACKER_STATUS_CHANGE: 'tracker:status-change',

  // Data
  DATA_GET_TODAY_SUMMARY: 'data:get-today-summary',
  DATA_GET_WEEKLY_REPORT: 'data:get-weekly-report',
  DATA_GET_MONTHLY_REPORT: 'data:get-monthly-report',
  DATA_GET_APP_RANKING: 'data:get-app-ranking',
  DATA_GET_CATEGORIZED_REPORT: 'data:get-categorized-report',

  // Categories
  CATEGORIES_GET_ALL: 'categories:get-all',
  CATEGORIES_SET: 'categories:set',
  CATEGORIES_DELETE: 'categories:delete',

  // Limits
  LIMITS_GET_ALL: 'limits:get-all',
  LIMITS_SET: 'limits:set',
  LIMITS_DELETE: 'limits:delete',
  LIMITS_LIMIT_REACHED: 'limits:limit-reached',

  // Export
  EXPORT_CSV: 'export:csv',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_ALL: 'settings:get-all',

  // App
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

  // v4 E-03: Auto-launch
  APP_GET_AUTO_START_STATUS: 'app:get-auto-start-status',

  // v4 E-04: Reminder
  REMINDER_POMODORO_TRIGGERED: 'reminder:pomodoro-triggered',
  REMINDER_SEDENTARY_TRIGGERED: 'reminder:sedentary-triggered',
} as const;

/** Augment the global Window interface to include electronAPI. */
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
