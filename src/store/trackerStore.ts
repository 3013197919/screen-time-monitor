import { create } from 'zustand';
import type {
  TrackerStatus,
  TodaySummaryData,
  WeeklyReportData,
  MonthlyReportData,
  AppUsageItem,
} from '../types/models';

/**
 * Zustand store for tracker state and report data.
 *
 * Holds the current tracking status, today's summary, weekly report,
 * and monthly report data. Actions load data via electronAPI IPC calls.
 */

interface TrackerState {
  // ── Tracking Status ──────────────────────────────────────────
  status: TrackerStatus;
  setStatus: (status: TrackerStatus) => void;

  // ── Today Summary ────────────────────────────────────────────
  todaySummary: TodaySummaryData | null;
  todayLoading: boolean;
  todayError: string | null;
  fetchTodaySummary: () => Promise<void>;

  // ── Weekly Report ────────────────────────────────────────────
  weeklyReport: WeeklyReportData | null;
  weeklyLoading: boolean;
  weeklyError: string | null;
  fetchWeeklyReport: (weekStart?: string) => Promise<void>;

  // ── Monthly Report ────────────────────────────────────────────
  monthlyReport: MonthlyReportData | null;
  monthlyLoading: boolean;
  monthlyError: string | null;
  fetchMonthlyReport: (month?: string) => Promise<void>;

  // ── App Ranking ──────────────────────────────────────────────
  appRanking: AppUsageItem[];
  appRankingLoading: boolean;
  appRankingError: string | null;
  fetchAppRanking: (date: string, limit?: number) => Promise<void>;

  // ── Tracker Controls ─────────────────────────────────────────
  pauseTracker: () => Promise<void>;
  resumeTracker: () => Promise<void>;

  // ── Reset ────────────────────────────────────────────────────
  reset: () => void;
}

const initialStatus: TrackerStatus = {
  is_tracking: false,
  is_paused: false,
  current_app: null,
  current_session_start: null,
};

export const useTrackerStore = create<TrackerState>((set, get) => ({
  // ── Tracking Status ──────────────────────────────────────────
  status: initialStatus,
  setStatus: (status: TrackerStatus): void => set({ status }),

  // ── Today Summary ────────────────────────────────────────────
  todaySummary: null,
  todayLoading: false,
  todayError: null,

  fetchTodaySummary: async (): Promise<void> => {
    if (get().todayLoading) return; // Prevent concurrent requests
    set({ todayLoading: true, todayError: null });

    try {
      const response = await window.electronAPI.data.getTodaySummary();
      if (response.success && response.data) {
        set({ todaySummary: response.data, todayLoading: false });
      } else {
        set({
          todayError: response.error ?? 'Failed to fetch today summary',
          todayLoading: false,
        });
      }
    } catch (err) {
      set({
        todayError: err instanceof Error ? err.message : 'Unknown error',
        todayLoading: false,
      });
    }
  },

  // ── Weekly Report ────────────────────────────────────────────
  weeklyReport: null,
  weeklyLoading: false,
  weeklyError: null,

  fetchWeeklyReport: async (weekStart?: string): Promise<void> => {
    if (get().weeklyLoading) return;
    set({ weeklyLoading: true, weeklyError: null });

    try {
      const response = await window.electronAPI.data.getWeeklyReport(weekStart);
      if (response.success && response.data) {
        set({ weeklyReport: response.data, weeklyLoading: false });
      } else {
        set({
          weeklyError: response.error ?? 'Failed to fetch weekly report',
          weeklyLoading: false,
        });
      }
    } catch (err) {
      set({
        weeklyError: err instanceof Error ? err.message : 'Unknown error',
        weeklyLoading: false,
      });
    }
  },

  // ── Monthly Report ────────────────────────────────────────────
  monthlyReport: null,
  monthlyLoading: false,
  monthlyError: null,

  fetchMonthlyReport: async (month?: string): Promise<void> => {
    if (get().monthlyLoading) return;
    set({ monthlyLoading: true, monthlyError: null });

    try {
      const response = await window.electronAPI.data.getMonthlyReport(month);
      if (response.success && response.data) {
        set({ monthlyReport: response.data, monthlyLoading: false });
      } else {
        set({
          monthlyError: response.error ?? 'Failed to fetch monthly report',
          monthlyLoading: false,
        });
      }
    } catch (err) {
      set({
        monthlyError: err instanceof Error ? err.message : 'Unknown error',
        monthlyLoading: false,
      });
    }
  },

  // ── App Ranking ──────────────────────────────────────────────
  appRanking: [],
  appRankingLoading: false,
  appRankingError: null,

  fetchAppRanking: async (date: string, limit: number = 10): Promise<void> => {
    if (get().appRankingLoading) return;
    set({ appRankingLoading: true, appRankingError: null });

    try {
      const response = await window.electronAPI.data.getAppRanking(date, limit);
      if (response.success && response.data) {
        set({ appRanking: response.data, appRankingLoading: false });
      } else {
        set({
          appRankingError: response.error ?? 'Failed to fetch app ranking',
          appRankingLoading: false,
        });
      }
    } catch (err) {
      set({
        appRankingError: err instanceof Error ? err.message : 'Unknown error',
        appRankingLoading: false,
      });
    }
  },

  // ── Tracker Controls ─────────────────────────────────────────
  pauseTracker: async (): Promise<void> => {
    try {
      await window.electronAPI.tracker.pause();
      const status = get().status;
      set({ status: { ...status, is_paused: true } });
    } catch (err) {
      console.error('[TrackerStore] Failed to pause tracker:', err);
    }
  },

  resumeTracker: async (): Promise<void> => {
    try {
      await window.electronAPI.tracker.resume();
      const status = get().status;
      set({ status: { ...status, is_paused: false } });
    } catch (err) {
      console.error('[TrackerStore] Failed to resume tracker:', err);
    }
  },

  // ── Reset ────────────────────────────────────────────────────
  reset: (): void =>
    set({
      status: initialStatus,
      todaySummary: null,
      todayLoading: false,
      todayError: null,
      weeklyReport: null,
      weeklyLoading: false,
      weeklyError: null,
      monthlyReport: null,
      monthlyLoading: false,
      monthlyError: null,
      appRanking: [],
      appRankingLoading: false,
      appRankingError: null,
    }),
}));
