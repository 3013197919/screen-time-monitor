import { contextBridge, ipcRenderer } from 'electron';

/**
 * ElectronAPI — type-safe bridge between Electron main process and renderer.
 *
 * All IPC communication goes through this API. The renderer process MUST NOT
 * use ipcRenderer directly — always access via `window.electronAPI`.
 *
 * Channel naming convention: {domain}:{action} (e.g., tracker:pause, data:get-today-summary)
 * Main→Renderer push channels: {domain}:on-{event} (e.g., tracker:status-change)
 */

const electronAPI = {
  // ── Tracker Control ──────────────────────────────────────────
  tracker: {
    getStatus: (): Promise<{
      success: boolean;
      data?: unknown;
      error?: string;
    }> => ipcRenderer.invoke('tracker:get-status'),

    pause: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('tracker:pause'),

    resume: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('tracker:resume'),

    start: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('tracker:start'),

    stop: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('tracker:stop'),

    /**
     * Subscribe to tracker status changes pushed from the main process.
     * @param callback — receives the updated TrackerStatus object.
     * @returns A cleanup function to remove the listener.
     */
    onStatusChange: (
      callback: (status: unknown) => void
    ): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: unknown): void =>
        callback(status);
      ipcRenderer.on('tracker:status-change', handler);
      return (): void => {
        ipcRenderer.removeListener('tracker:status-change', handler);
      };
    },
  },

  // ── Data Queries ─────────────────────────────────────────────
  data: {
    getTodaySummary: (): Promise<{
      success: boolean;
      data?: unknown;
      error?: string;
    }> => ipcRenderer.invoke('data:get-today-summary'),

    getWeeklyReport: (
      weekStart?: string
    ): Promise<{
      success: boolean;
      data?: unknown;
      error?: string;
    }> => ipcRenderer.invoke('data:get-weekly-report', weekStart),

    getMonthlyReport: (
      month?: string
    ): Promise<{
      success: boolean;
      data?: unknown;
      error?: string;
    }> => ipcRenderer.invoke('data:get-monthly-report', month),

    getAppRanking: (
      date: string,
      limit: number
    ): Promise<{
      success: boolean;
      data?: unknown;
      error?: string;
    }> => ipcRenderer.invoke('data:get-app-ranking', date, limit),

    getCategorizedReport: (
      startDate: string,
      endDate: string
    ): Promise<{
      success: boolean;
      data?: unknown;
      error?: string;
    }> => ipcRenderer.invoke('data:get-categorized-report', startDate, endDate),

    getCustomRangeReport: (
      startDate: string,
      endDate: string
    ): Promise<{
      success: boolean;
      data?: unknown;
      error?: string;
    }> => ipcRenderer.invoke('data:get-custom-range-report', startDate, endDate),

    getCustomRangeTrend: (
      startDate: string,
      endDate: string
    ): Promise<{
      success: boolean;
      data?: unknown;
      error?: string;
    }> => ipcRenderer.invoke('data:get-custom-range-trend', startDate, endDate),

    getCustomRangeRanking: (
      startDate: string,
      endDate: string,
      limit: number
    ): Promise<{
      success: boolean;
      data?: unknown;
      error?: string;
    }> => ipcRenderer.invoke('data:get-custom-range-ranking', startDate, endDate, limit),
  },

  // ── Categories ────────────────────────────────────────────────
  categories: {
    getAll: (): Promise<{
      success: boolean;
      data?: unknown;
      error?: string;
    }> => ipcRenderer.invoke('categories:get-all'),

    set: (
      appName: string,
      category: string
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('categories:set', appName, category),

    delete: (
      id: number
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('categories:delete', id),
  },

  // ── Usage Limits ─────────────────────────────────────────────
  limits: {
    getAll: (): Promise<{
      success: boolean;
      data?: unknown;
      error?: string;
    }> => ipcRenderer.invoke('limits:get-all'),

    set: (
      appName: string,
      limitMinutes: number
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('limits:set', appName, limitMinutes),

    delete: (
      id: number
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('limits:delete', id),

    /** Subscribe to limit-reached notifications from the main process.
     * @param callback — receives LimitReachedData when a usage limit is exceeded.
     * @returns A cleanup function to remove the listener.
     */
    onLimitReached: (
      callback: (data: unknown) => void
    ): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown): void =>
        callback(data);
      ipcRenderer.on('limits:limit-reached', handler);
      return (): void => {
        ipcRenderer.removeListener('limits:limit-reached', handler);
      };
    },
  },

  // ── Export ───────────────────────────────────────────────────
  export: {
    csv: (
      startDate: string,
      endDate: string
    ): Promise<{
      success: boolean;
      data?: string;
      error?: string;
    }> => ipcRenderer.invoke('export:csv', startDate, endDate),

    saveFile: (
      bufferData: number[],
      defaultName: string,
      filters: Array<{ name: string; extensions: string[] }>
    ): Promise<{ success: boolean; data?: string; error?: string }> =>
      ipcRenderer.invoke('export:save-file', bufferData, defaultName, filters),
  },

  // ── Data Cleanup ──────────────────────────────────────────────
  cleanup: {
    run: (
      retentionDays: number
    ): Promise<{ success: boolean; data?: { deleted: number }; error?: string }> =>
      ipcRenderer.invoke('data:cleanup', retentionDays),
  },

  // ── Settings ─────────────────────────────────────────────────
  settings: {
    get: (
      key: string
    ): Promise<string | null> => ipcRenderer.invoke('settings:get', key),

    set: (key: string, value: string): Promise<void> =>
      ipcRenderer.invoke('settings:set', key, value),

    getAll: (): Promise<Record<string, string>> =>
      ipcRenderer.invoke('settings:get-all'),
  },

  // ── App ───────────────────────────────────────────────────────
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),

    /** v4 E-03: Query the OS registry for auto-start status. */
    getAutoStartStatus: (): Promise<{ success: boolean; data?: { enabled: boolean }; error?: string }> =>
      ipcRenderer.invoke('app:get-auto-start-status'),

    quit: (): void => {
      ipcRenderer.send('app:quit');
    },

    checkForUpdates: (): Promise<{
      success: boolean;
      data?: { updateAvailable: boolean; version?: string };
      error?: string;
    }> => ipcRenderer.invoke('app:check-for-updates'),

    installUpdate: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('app:install-update'),

    onUpdateAvailable: (
      callback: (data: { version: string }) => void
    ): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { version: string }): void =>
        callback(data);
      ipcRenderer.on('app:update-available', handler);
      return (): void => {
        ipcRenderer.removeListener('app:update-available', handler);
      };
    },

    onUpdateDownloaded: (
      callback: (data: { version: string }) => void
    ): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { version: string }): void =>
        callback(data);
      ipcRenderer.on('app:update-downloaded', handler);
      return (): void => {
        ipcRenderer.removeListener('app:update-downloaded', handler);
      };
    },

    /** v4: Show the floating mini window. */
    showFloatingWindow: (): Promise<void> => ipcRenderer.invoke('floating:show'),

    /** v4: Hide the floating mini window. */
    hideFloatingWindow: (): Promise<void> => ipcRenderer.invoke('floating:hide'),

    /** v4: Check if floating window is visible. */
    isFloatingWindowVisible: (): Promise<boolean> => ipcRenderer.invoke('floating:is-visible'),

    /** v4: Close floating window from the floating window's close button. */
    quitFloatingWindow: (): void => {
      ipcRenderer.send('floating:hide');
    },
  },

  // ── v3: Focus Mode ────────────────────────────────────────────
  focus: {
    getStatus: (): Promise<{
      success: boolean;
      data?: unknown;
      error?: string;
    }> => ipcRenderer.invoke('focus:get-status'),

    toggle: (
      enabled: boolean
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('focus:toggle', enabled),

    setWhitelist: (
      appNames: string[]
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('focus:set-whitelist', appNames),

    getReport: (
      date: string
    ): Promise<{
      success: boolean;
      data?: unknown;
      error?: string;
    }> => ipcRenderer.invoke('focus:get-report', date),
  },

  // ── v3: Tray i18n ────────────────────────────────────────────
  tray: {
    updateMenuLabels: (labels: Record<string, string>): void => {
      ipcRenderer.send('tray:update-menu-labels', labels);
    },
  },

  // ── v4 E-04: Reminder ─────────────────────────────────────────
  reminder: {
    /** Subscribe to pomodoro reminder events from the main process. */
    onPomodoro: (
      callback: (data: { intervalMinutes: number }) => void
    ): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { intervalMinutes: number }): void =>
        callback(data);
      ipcRenderer.on('reminder:pomodoro-triggered', handler);
      return (): void => {
        ipcRenderer.removeListener('reminder:pomodoro-triggered', handler);
      };
    },

    /** Subscribe to sedentary reminder events from the main process. */
    onSedentary: (
      callback: (data: { accumulatedMinutes: number }) => void
    ): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { accumulatedMinutes: number }): void =>
        callback(data);
      ipcRenderer.on('reminder:sedentary-triggered', handler);
      return (): void => {
        ipcRenderer.removeListener('reminder:sedentary-triggered', handler);
      };
    },

    /** v4: Subscribe to floating window data updates from the main process. */
    onFloatingUpdate: (
      callback: (data: {
        currentApp: string | null;
        focusMode: boolean;
        todayDuration: string;
        isTracking: boolean;
      }) => void
    ): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: {
        currentApp: string | null;
        focusMode: boolean;
        todayDuration: string;
        isTracking: boolean;
      }): void => callback(data);
      ipcRenderer.on('floating:update', handler);
      return (): void => {
        ipcRenderer.removeListener('floating:update', handler);
      };
    },
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
