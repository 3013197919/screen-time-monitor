"use strict";
const electron = require("electron");
const electronAPI = {
  // ── Tracker Control ──────────────────────────────────────────
  tracker: {
    getStatus: () => electron.ipcRenderer.invoke("tracker:get-status"),
    pause: () => electron.ipcRenderer.invoke("tracker:pause"),
    resume: () => electron.ipcRenderer.invoke("tracker:resume"),
    start: () => electron.ipcRenderer.invoke("tracker:start"),
    stop: () => electron.ipcRenderer.invoke("tracker:stop"),
    /**
     * Subscribe to tracker status changes pushed from the main process.
     * @param callback — receives the updated TrackerStatus object.
     * @returns A cleanup function to remove the listener.
     */
    onStatusChange: (callback) => {
      const handler = (_event, status) => callback(status);
      electron.ipcRenderer.on("tracker:status-change", handler);
      return () => {
        electron.ipcRenderer.removeListener("tracker:status-change", handler);
      };
    }
  },
  // ── Data Queries ─────────────────────────────────────────────
  data: {
    getTodaySummary: () => electron.ipcRenderer.invoke("data:get-today-summary"),
    getWeeklyReport: (weekStart) => electron.ipcRenderer.invoke("data:get-weekly-report", weekStart),
    getMonthlyReport: (month) => electron.ipcRenderer.invoke("data:get-monthly-report", month),
    getAppRanking: (date, limit) => electron.ipcRenderer.invoke("data:get-app-ranking", date, limit),
    getCategorizedReport: (startDate, endDate) => electron.ipcRenderer.invoke("data:get-categorized-report", startDate, endDate),
    getCustomRangeReport: (startDate, endDate) => electron.ipcRenderer.invoke("data:get-custom-range-report", startDate, endDate),
    getCustomRangeTrend: (startDate, endDate) => electron.ipcRenderer.invoke("data:get-custom-range-trend", startDate, endDate),
    getCustomRangeRanking: (startDate, endDate, limit) => electron.ipcRenderer.invoke("data:get-custom-range-ranking", startDate, endDate, limit)
  },
  // ── Categories ────────────────────────────────────────────────
  categories: {
    getAll: () => electron.ipcRenderer.invoke("categories:get-all"),
    set: (appName, category) => electron.ipcRenderer.invoke("categories:set", appName, category),
    delete: (id) => electron.ipcRenderer.invoke("categories:delete", id)
  },
  // ── Usage Limits ─────────────────────────────────────────────
  limits: {
    getAll: () => electron.ipcRenderer.invoke("limits:get-all"),
    set: (appName, limitMinutes) => electron.ipcRenderer.invoke("limits:set", appName, limitMinutes),
    delete: (id) => electron.ipcRenderer.invoke("limits:delete", id),
    /** Subscribe to limit-reached notifications from the main process.
     * @param callback — receives LimitReachedData when a usage limit is exceeded.
     * @returns A cleanup function to remove the listener.
     */
    onLimitReached: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on("limits:limit-reached", handler);
      return () => {
        electron.ipcRenderer.removeListener("limits:limit-reached", handler);
      };
    }
  },
  // ── Export ───────────────────────────────────────────────────
  export: {
    csv: (startDate, endDate) => electron.ipcRenderer.invoke("export:csv", startDate, endDate),
    saveFile: (bufferData, defaultName, filters) => electron.ipcRenderer.invoke("export:save-file", bufferData, defaultName, filters)
  },
  // ── Data Cleanup ──────────────────────────────────────────────
  cleanup: {
    run: (retentionDays) => electron.ipcRenderer.invoke("data:cleanup", retentionDays)
  },
  // ── Settings ─────────────────────────────────────────────────
  settings: {
    get: (key) => electron.ipcRenderer.invoke("settings:get", key),
    set: (key, value) => electron.ipcRenderer.invoke("settings:set", key, value),
    getAll: () => electron.ipcRenderer.invoke("settings:get-all")
  },
  // ── App ───────────────────────────────────────────────────────
  app: {
    getVersion: () => electron.ipcRenderer.invoke("app:get-version"),
    /** v4 E-03: Query the OS registry for auto-start status. */
    getAutoStartStatus: () => electron.ipcRenderer.invoke("app:get-auto-start-status"),
    quit: () => {
      electron.ipcRenderer.send("app:quit");
    },
    checkForUpdates: () => electron.ipcRenderer.invoke("app:check-for-updates"),
    installUpdate: () => electron.ipcRenderer.invoke("app:install-update"),
    onUpdateAvailable: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on("app:update-available", handler);
      return () => {
        electron.ipcRenderer.removeListener("app:update-available", handler);
      };
    },
    onUpdateDownloaded: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on("app:update-downloaded", handler);
      return () => {
        electron.ipcRenderer.removeListener("app:update-downloaded", handler);
      };
    },
    /** v4: Show the floating mini window. */
    showFloatingWindow: () => electron.ipcRenderer.invoke("floating:show"),
    /** v4: Hide the floating mini window. */
    hideFloatingWindow: () => electron.ipcRenderer.invoke("floating:hide"),
    /** v4: Check if floating window is visible. */
    isFloatingWindowVisible: () => electron.ipcRenderer.invoke("floating:is-visible"),
    /** v4: Close floating window from the floating window's close button. */
    quitFloatingWindow: () => {
      electron.ipcRenderer.send("floating:hide");
    }
  },
  // ── v3: Focus Mode ────────────────────────────────────────────
  focus: {
    getStatus: () => electron.ipcRenderer.invoke("focus:get-status"),
    toggle: (enabled) => electron.ipcRenderer.invoke("focus:toggle", enabled),
    setWhitelist: (appNames) => electron.ipcRenderer.invoke("focus:set-whitelist", appNames),
    getReport: (date) => electron.ipcRenderer.invoke("focus:get-report", date)
  },
  // ── v3: Tray i18n ────────────────────────────────────────────
  tray: {
    updateMenuLabels: (labels) => {
      electron.ipcRenderer.send("tray:update-menu-labels", labels);
    }
  },
  // ── v4 E-04: Reminder ─────────────────────────────────────────
  reminder: {
    /** Subscribe to pomodoro reminder events from the main process. */
    onPomodoro: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on("reminder:pomodoro-triggered", handler);
      return () => {
        electron.ipcRenderer.removeListener("reminder:pomodoro-triggered", handler);
      };
    },
    /** Subscribe to sedentary reminder events from the main process. */
    onSedentary: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on("reminder:sedentary-triggered", handler);
      return () => {
        electron.ipcRenderer.removeListener("reminder:sedentary-triggered", handler);
      };
    },
    /** v4: Subscribe to floating window data updates from the main process. */
    onFloatingUpdate: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on("floating:update", handler);
      return () => {
        electron.ipcRenderer.removeListener("floating:update", handler);
      };
    }
  }
};
electron.contextBridge.exposeInMainWorld("electronAPI", electronAPI);
