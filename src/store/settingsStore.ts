import { create } from 'zustand';
import type { UsageLimit } from '../types/models';

/**
 * Zustand store for application settings and usage limits.
 *
 * Manages user preferences (auto-start, idle threshold, etc.) and
 * the configured per-app daily usage limits.
 */

export interface SettingsState {
  // ── Settings ─────────────────────────────────────────────────
  /** Whether the app launches on system startup. */
  autoStart: boolean;
  /** Idle detection threshold in minutes. Default: 5. */
  idleThresholdMinutes: number;
  /** Whether the tracker starts tracking automatically on launch. */
  autoTrackOnLaunch: boolean;
  /** Whether to show desktop notifications for limit warnings. */
  notificationsEnabled: boolean;
  /** Data retention period in days (0 = keep forever). */
  dataRetentionDays: number;
  /** Whether privacy mode is enabled (masks window titles). */
  privacyMode: boolean;
  /** Whether to show in system tray. */
  showTray: boolean;

  // ── v3: Focus Mode ───────────────────────────────────────────
  /** Whether Focus Mode is currently enabled. */
  focusModeEnabled: boolean;
  /** List of app names in the Focus Mode whitelist. */
  focusWhitelist: string[];

  // ── v3: Language ─────────────────────────────────────────────
  /** UI language preference. */
  language: 'zh-CN' | 'en' | 'system';

  // ── v4 E-03: Auto-start loading state ────────────────────────
  /** Whether auto-start toggle is pending (loading). */
  autoStartLoading: boolean;

  // ── v4 E-04: Reminder settings ────────────────────────────────
  /** Whether pomodoro reminders are enabled. Default: true. */
  pomodoroEnabled: boolean;
  /** Pomodoro reminder interval in minutes. Default: 25. */
  pomodoroInterval: number;
  /** Whether sedentary reminders are enabled. Default: true. */
  sedentaryEnabled: boolean;
  /** Sedentary reminder interval in minutes. Default: 60. */
  sedentaryInterval: number;

  // ── v4: Focus Schedule ───────────────────────────────────────
  /** Whether focus mode auto-scheduling is enabled. Default: false. */
  focusScheduleEnabled: boolean;
  /** Days of week for schedule (0=Sun, 6=Sat). Default: [1,2,3,4,5] (Mon-Fri). */
  focusScheduleDays: number[];
  /** Start hour (0-23) for focus mode auto-enable. Default: 9. */
  focusScheduleStart: number;
  /** End hour (0-23) for focus mode auto-disable. Default: 18. */
  focusScheduleEnd: number;

  /** Load all settings from the main process via electronAPI. */
  loadSettings: () => Promise<void>;
  /** Update a single setting key-value pair. */
  updateSetting: (key: string, value: string) => Promise<void>;
  /** Set auto-start enabled/disabled. */
  setAutoStart: (enabled: boolean) => Promise<void>;
  /** Set idle detection threshold in minutes. */
  setIdleThreshold: (minutes: number) => Promise<void>;
  /** Set privacy mode on/off. */
  setPrivacyMode: (enabled: boolean) => Promise<void>;
  /** Set show in system tray on/off. */
  setShowTray: (enabled: boolean) => Promise<void>;

  // ── v3: Focus Mode actions ───────────────────────────────────
  /** Toggle Focus Mode on/off. */
  toggleFocusMode: () => Promise<void>;
  /** Set the Focus Mode whitelist. */
  setFocusWhitelist: (appNames: string[]) => Promise<void>;

  // ── v3: Language action ──────────────────────────────────────
  /** Set the UI language. */
  setLanguage: (lang: 'zh-CN' | 'en' | 'system') => Promise<void>;

  // ── v4 E-04: Reminder actions ─────────────────────────────────
  /** Set pomodoro enabled/disabled. */
  setPomodoroEnabled: (enabled: boolean) => Promise<void>;
  /** Set pomodoro interval in minutes. */
  setPomodoroInterval: (minutes: number) => Promise<void>;
  /** Set sedentary reminder enabled/disabled. */
  setSedentaryEnabled: (enabled: boolean) => Promise<void>;
  /** Set sedentary reminder interval in minutes. */
  setSedentaryInterval: (minutes: number) => Promise<void>;

  // ── v4: Focus Schedule actions ───────────────────────────────
  /** Set focus schedule enabled/disabled. */
  setFocusScheduleEnabled: (enabled: boolean) => Promise<void>;
  /** Set focus schedule days. */
  setFocusScheduleDays: (days: number[]) => Promise<void>;
  /** Set focus schedule start hour. */
  setFocusScheduleStart: (hour: number) => Promise<void>;
  /** Set focus schedule end hour. */
  setFocusScheduleEnd: (hour: number) => Promise<void>;

  // ── Usage Limits ─────────────────────────────────────────────
  limits: UsageLimit[];
  limitsLoading: boolean;
  limitsError: string | null;

  /** Load all usage limits from the main process. */
  loadLimits: () => Promise<void>;
  /** Add or update a usage limit for an app. */
  setLimit: (appName: string, limitMinutes: number) => Promise<void>;
  /** Remove a usage limit by ID. */
  deleteLimit: (id: number) => Promise<void>;

  // ── Reset ────────────────────────────────────────────────────
  reset: () => void;
}

const SETTINGS_KEYS = {
  AUTO_START: 'auto_start',
  IDLE_THRESHOLD: 'idle_threshold',
  AUTO_TRACK: 'auto_track',
  NOTIFICATIONS: 'notifications',
  DATA_RETENTION: 'data_retention',
  PRIVACY_MODE: 'privacy_mode',
  SHOW_TRAY: 'show_tray',
  FOCUS_MODE_ENABLED: 'focus_mode_enabled',
  FOCUS_WHITELIST: 'focus_whitelist',
  LANGUAGE: 'language',
  // v4 E-04
  POMODORO_ENABLED: 'pomodoro_enabled',
  POMODORO_INTERVAL: 'pomodoro_interval',
  SEDENTARY_ENABLED: 'sedentary_enabled',
  SEDENTARY_INTERVAL: 'sedentary_interval',
  // v4 Focus Schedule
  FOCUS_SCHEDULE_ENABLED: 'focus_schedule_enabled',
  FOCUS_SCHEDULE_DAYS: 'focus_schedule_days',
  FOCUS_SCHEDULE_START: 'focus_schedule_start',
  FOCUS_SCHEDULE_END: 'focus_schedule_end',
} as const;

export const useSettingsStore = create<SettingsState>((set, get) => ({
  // ── Settings defaults ────────────────────────────────────────
  autoStart: false,
  autoStartLoading: false,
  idleThresholdMinutes: 5,
  autoTrackOnLaunch: true,
  notificationsEnabled: true,
  dataRetentionDays: 0,
  privacyMode: false,
  showTray: true,
  focusModeEnabled: false,
  focusWhitelist: [],
  language: 'system',
  pomodoroEnabled: true,
  pomodoroInterval: 25,
  sedentaryEnabled: true,
  sedentaryInterval: 60,
  focusScheduleEnabled: false,
  focusScheduleDays: [1, 2, 3, 4, 5],
  focusScheduleStart: 9,
  focusScheduleEnd: 18,

  loadSettings: async (): Promise<void> => {
    try {
      const all = await window.electronAPI.settings.getAll();

      set({
        autoStart: all[SETTINGS_KEYS.AUTO_START] === 'true',
        idleThresholdMinutes: parseInt(
          all[SETTINGS_KEYS.IDLE_THRESHOLD] ?? '5',
          10
        ),
        autoTrackOnLaunch:
          (all[SETTINGS_KEYS.AUTO_TRACK] ?? 'true') === 'true',
        notificationsEnabled:
          (all[SETTINGS_KEYS.NOTIFICATIONS] ?? 'true') === 'true',
        dataRetentionDays: parseInt(
          all[SETTINGS_KEYS.DATA_RETENTION] ?? '0',
          10
        ),
        privacyMode: (all[SETTINGS_KEYS.PRIVACY_MODE] ?? 'false') === 'true',
        showTray: (all[SETTINGS_KEYS.SHOW_TRAY] ?? 'true') === 'true',
        focusModeEnabled: (all[SETTINGS_KEYS.FOCUS_MODE_ENABLED] ?? 'false') === 'true',
        focusWhitelist: (() => {
          try {
            const raw = all[SETTINGS_KEYS.FOCUS_WHITELIST];
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
          } catch { return []; }
        })(),
        language: (all[SETTINGS_KEYS.LANGUAGE] ?? 'system') as 'zh-CN' | 'en' | 'system',
        pomodoroEnabled: (all[SETTINGS_KEYS.POMODORO_ENABLED] ?? 'true') === 'true',
        pomodoroInterval: parseInt(all[SETTINGS_KEYS.POMODORO_INTERVAL] ?? '25', 10),
        sedentaryEnabled: (all[SETTINGS_KEYS.SEDENTARY_ENABLED] ?? 'true') === 'true',
        sedentaryInterval: parseInt(all[SETTINGS_KEYS.SEDENTARY_INTERVAL] ?? '60', 10),
        focusScheduleEnabled: (all[SETTINGS_KEYS.FOCUS_SCHEDULE_ENABLED] ?? 'false') === 'true',
        focusScheduleDays: (() => {
          try {
            const d = JSON.parse(all[SETTINGS_KEYS.FOCUS_SCHEDULE_DAYS] ?? '[1,2,3,4,5]');
            return Array.isArray(d) ? d : [1, 2, 3, 4, 5];
          } catch { return [1, 2, 3, 4, 5]; }
        })(),
        focusScheduleStart: parseInt(all[SETTINGS_KEYS.FOCUS_SCHEDULE_START] ?? '9', 10),
        focusScheduleEnd: parseInt(all[SETTINGS_KEYS.FOCUS_SCHEDULE_END] ?? '18', 10),
      });
    } catch (err) {
      console.error('[SettingsStore] Failed to load settings:', err);
    }
  },

  updateSetting: async (key: string, value: string): Promise<void> => {
    try {
      await window.electronAPI.settings.set(key, value);
    } catch (err) {
      console.error('[SettingsStore] Failed to update setting:', err);
    }
  },

  setAutoStart: async (enabled: boolean): Promise<void> => {
    const prevAutoStart = get().autoStart;
    set({ autoStart: enabled, autoStartLoading: true });
    try {
      await window.electronAPI.settings.set(
        SETTINGS_KEYS.AUTO_START,
        String(enabled)
      );
      set({ autoStartLoading: false });
    } catch (err) {
      console.error('[SettingsStore] Failed to set auto-start:', err);
      // Rollback on failure
      set({ autoStart: prevAutoStart, autoStartLoading: false });
      throw err;
    }
  },

  setIdleThreshold: async (minutes: number): Promise<void> => {
    set({ idleThresholdMinutes: minutes });
    try {
      await window.electronAPI.settings.set(
        SETTINGS_KEYS.IDLE_THRESHOLD,
        String(minutes)
      );
    } catch (err) {
      console.error('[SettingsStore] Failed to set idle threshold:', err);
    }
  },

  setPrivacyMode: async (enabled: boolean): Promise<void> => {
    set({ privacyMode: enabled });
    try {
      await window.electronAPI.settings.set(
        SETTINGS_KEYS.PRIVACY_MODE,
        String(enabled)
      );
    } catch (err) {
      console.error('[SettingsStore] Failed to set privacy mode:', err);
    }
  },

  setShowTray: async (enabled: boolean): Promise<void> => {
    set({ showTray: enabled });
    try {
      await window.electronAPI.settings.set(
        SETTINGS_KEYS.SHOW_TRAY,
        String(enabled)
      );
    } catch (err) {
      console.error('[SettingsStore] Failed to set show tray:', err);
    }
  },

  // ── v3: Focus Mode ───────────────────────────────────────────
  toggleFocusMode: async (): Promise<void> => {
    const newVal = !get().focusModeEnabled;
    set({ focusModeEnabled: newVal });
    try {
      await window.electronAPI.focus.toggle(newVal);
    } catch (err) {
      console.error('[SettingsStore] Failed to toggle focus mode:', err);
      set({ focusModeEnabled: !newVal });
    }
  },

  setFocusWhitelist: async (appNames: string[]): Promise<void> => {
    set({ focusWhitelist: appNames });
    try {
      await window.electronAPI.focus.setWhitelist(appNames);
    } catch (err) {
      console.error('[SettingsStore] Failed to set focus whitelist:', err);
    }
  },

  // ── v3: Language ─────────────────────────────────────────────
  setLanguage: async (lang: 'zh-CN' | 'en' | 'system'): Promise<void> => {
    set({ language: lang });
    try {
      await window.electronAPI.settings.set(SETTINGS_KEYS.LANGUAGE, lang);
    } catch (err) {
      console.error('[SettingsStore] Failed to set language:', err);
    }
  },

  // ── v4 E-04: Reminder actions ─────────────────────────────────
  setPomodoroEnabled: async (enabled: boolean): Promise<void> => {
    set({ pomodoroEnabled: enabled });
    try {
      await window.electronAPI.settings.set(SETTINGS_KEYS.POMODORO_ENABLED, String(enabled));
    } catch (err) {
      console.error('[SettingsStore] Failed to set pomodoro enabled:', err);
    }
  },

  setPomodoroInterval: async (minutes: number): Promise<void> => {
    set({ pomodoroInterval: minutes });
    try {
      await window.electronAPI.settings.set(SETTINGS_KEYS.POMODORO_INTERVAL, String(minutes));
    } catch (err) {
      console.error('[SettingsStore] Failed to set pomodoro interval:', err);
    }
  },

  setSedentaryEnabled: async (enabled: boolean): Promise<void> => {
    set({ sedentaryEnabled: enabled });
    try {
      await window.electronAPI.settings.set(SETTINGS_KEYS.SEDENTARY_ENABLED, String(enabled));
    } catch (err) {
      console.error('[SettingsStore] Failed to set sedentary enabled:', err);
    }
  },

  setSedentaryInterval: async (minutes: number): Promise<void> => {
    set({ sedentaryInterval: minutes });
    try {
      await window.electronAPI.settings.set(SETTINGS_KEYS.SEDENTARY_INTERVAL, String(minutes));
    } catch (err) {
      console.error('[SettingsStore] Failed to set sedentary interval:', err);
    }
  },

  // ── v4: Focus Schedule actions ───────────────────────────────
  setFocusScheduleEnabled: async (enabled: boolean): Promise<void> => {
    set({ focusScheduleEnabled: enabled });
    try {
      await window.electronAPI.settings.set(SETTINGS_KEYS.FOCUS_SCHEDULE_ENABLED, String(enabled));
    } catch (err) {
      console.error('[SettingsStore] Failed to set focus schedule enabled:', err);
    }
  },

  setFocusScheduleDays: async (days: number[]): Promise<void> => {
    set({ focusScheduleDays: days });
    try {
      await window.electronAPI.settings.set(SETTINGS_KEYS.FOCUS_SCHEDULE_DAYS, JSON.stringify(days));
    } catch (err) {
      console.error('[SettingsStore] Failed to set focus schedule days:', err);
    }
  },

  setFocusScheduleStart: async (hour: number): Promise<void> => {
    set({ focusScheduleStart: hour });
    try {
      await window.electronAPI.settings.set(SETTINGS_KEYS.FOCUS_SCHEDULE_START, String(hour));
    } catch (err) {
      console.error('[SettingsStore] Failed to set focus schedule start:', err);
    }
  },

  setFocusScheduleEnd: async (hour: number): Promise<void> => {
    set({ focusScheduleEnd: hour });
    try {
      await window.electronAPI.settings.set(SETTINGS_KEYS.FOCUS_SCHEDULE_END, String(hour));
    } catch (err) {
      console.error('[SettingsStore] Failed to set focus schedule end:', err);
    }
  },

  // ── Usage Limits ─────────────────────────────────────────────
  limits: [],
  limitsLoading: false,
  limitsError: null,

  loadLimits: async (): Promise<void> => {
    if (get().limitsLoading) return;
    set({ limitsLoading: true, limitsError: null });

    try {
      const response = await window.electronAPI.limits.getAll();
      if (response.success && response.data) {
        set({ limits: response.data, limitsLoading: false });
      } else {
        set({
          limitsError: response.error ?? 'Failed to load limits',
          limitsLoading: false,
        });
      }
    } catch (err) {
      set({
        limitsError: err instanceof Error ? err.message : 'Unknown error',
        limitsLoading: false,
      });
    }
  },

  setLimit: async (appName: string, limitMinutes: number): Promise<void> => {
    try {
      await window.electronAPI.limits.set(appName, limitMinutes);
      // Reload limits to get the updated list with correct IDs
      await get().loadLimits();
    } catch (err) {
      console.error('[SettingsStore] Failed to set limit:', err);
    }
  },

  deleteLimit: async (id: number): Promise<void> => {
    try {
      await window.electronAPI.limits.delete(id);
      // Optimistically remove from local state
      set((state) => ({
        limits: state.limits.filter((l) => l.id !== id),
      }));
    } catch (err) {
      console.error('[SettingsStore] Failed to delete limit:', err);
    }
  },

  // ── Reset ────────────────────────────────────────────────────
  reset: (): void =>
    set({
      autoStart: false,
      autoStartLoading: false,
      idleThresholdMinutes: 5,
      autoTrackOnLaunch: true,
      notificationsEnabled: true,
      dataRetentionDays: 0,
      privacyMode: false,
      showTray: true,
      focusModeEnabled: false,
      focusWhitelist: [],
      language: 'system',
      pomodoroEnabled: true,
      pomodoroInterval: 25,
      sedentaryEnabled: true,
      sedentaryInterval: 60,
      focusScheduleEnabled: false,
      focusScheduleDays: [1, 2, 3, 4, 5],
      focusScheduleStart: 9,
      focusScheduleEnd: 18,
      limits: [],
      limitsLoading: false,
      limitsError: null,
    }),
}));
