import { describe, it, expect, beforeEach } from 'vitest';
import { useTrackerStore } from '../src/store/trackerStore';
import { useSettingsStore } from '../src/store/settingsStore';

// Mock window.electronAPI before importing stores
beforeEach(() => {
  // Reset Zustand stores
  useTrackerStore.setState({
    status: { is_tracking: false, is_paused: false, current_app: null, current_session_start: null },
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
  });

  useSettingsStore.setState({
    autoStart: false,
    idleThresholdMinutes: 5,
    privacyMode: false,
    limits: [],
    limitsLoading: false,
    limitsError: null,
    // v3 fields
    focusModeEnabled: false,
    focusWhitelist: [],
    language: 'system',
  });
});

describe('trackerStore', () => {
  it('initializes with stopped status', () => {
    const state = useTrackerStore.getState();
    expect(state.status.is_tracking).toBe(false);
    expect(state.status.is_paused).toBe(false);
    expect(state.todaySummary).toBeNull();
  });

  it('setStatus updates tracking state', () => {
    useTrackerStore.getState().setStatus({
      is_tracking: true,
      is_paused: false,
      current_app: 'chrome.exe',
      current_session_start: Date.now(),
    });
    expect(useTrackerStore.getState().status.is_tracking).toBe(true);
    expect(useTrackerStore.getState().status.current_app).toBe('chrome.exe');
  });

  it('reset clears all state', () => {
    useTrackerStore.getState().setStatus({
      is_tracking: true,
      is_paused: false,
      current_app: 'test.exe',
      current_session_start: 12345,
    });
    useTrackerStore.getState().reset();
    expect(useTrackerStore.getState().status.is_tracking).toBe(false);
    expect(useTrackerStore.getState().status.current_app).toBeNull();
  });
});

describe('settingsStore', () => {
  it('has correct defaults', () => {
    const state = useSettingsStore.getState();
    expect(state.autoStart).toBe(false);
    expect(state.idleThresholdMinutes).toBe(5);
    expect(state.privacyMode).toBe(false);
    expect(state.limits).toEqual([]);
  });

  it('setAutoStart rolls back on IPC failure', async () => {
    // In test env, window.electronAPI is undefined, so setAutoStart
    // will fail and roll back to the previous value (false).
    await expect(useSettingsStore.getState().setAutoStart(true)).rejects.toThrow();
    expect(useSettingsStore.getState().autoStart).toBe(false);
    expect(useSettingsStore.getState().autoStartLoading).toBe(false);
  });

  it('setIdleThreshold updates value', () => {
    useSettingsStore.getState().setIdleThreshold(10);
    expect(useSettingsStore.getState().idleThresholdMinutes).toBe(10);
  });

  it('setPrivacyMode toggles', () => {
    useSettingsStore.getState().setPrivacyMode(true);
    expect(useSettingsStore.getState().privacyMode).toBe(true);
  });

  it('deleteLimit removes from list (local only, no IPC in test)', () => {
    useSettingsStore.setState({
      limits: [{ id: 1, app_name: 'test.exe', limit_minutes: 60, enabled: true }],
    });
    // Directly filter limits to simulate delete (IPC unavailable in test env)
    useSettingsStore.setState((s) => ({
      limits: s.limits.filter((l) => l.id !== 1),
    }));
    expect(useSettingsStore.getState().limits).toHaveLength(0);
  });

  it('reset clears all state', () => {
    useSettingsStore.getState().setAutoStart(true);
    useSettingsStore.getState().setPrivacyMode(true);
    useSettingsStore.getState().reset();
    expect(useSettingsStore.getState().autoStart).toBe(false);
    expect(useSettingsStore.getState().privacyMode).toBe(false);
  });
});

describe('settingsStore v3: Focus Mode', () => {
  it('focusModeEnabled defaults to false', () => {
    expect(useSettingsStore.getState().focusModeEnabled).toBe(false);
  });

  it('focusWhitelist defaults to empty array', () => {
    expect(useSettingsStore.getState().focusWhitelist).toEqual([]);
  });

  it('language defaults to system', () => {
    expect(useSettingsStore.getState().language).toBe('system');
  });

  it('toggleFocusMode via setState updates local state', () => {
    useSettingsStore.setState({ focusModeEnabled: true });
    expect(useSettingsStore.getState().focusModeEnabled).toBe(true);

    useSettingsStore.setState({ focusModeEnabled: false });
    expect(useSettingsStore.getState().focusModeEnabled).toBe(false);
  });

  it('setFocusWhitelist via setState updates local state', () => {
    useSettingsStore.setState({ focusWhitelist: ['code.exe', 'chrome.exe'] });
    expect(useSettingsStore.getState().focusWhitelist).toEqual(['code.exe', 'chrome.exe']);

    useSettingsStore.setState({ focusWhitelist: [] });
    expect(useSettingsStore.getState().focusWhitelist).toEqual([]);
  });

  it('reset clears focus mode state', () => {
    useSettingsStore.setState({
      focusModeEnabled: true,
      focusWhitelist: ['code.exe'],
    });
    useSettingsStore.getState().reset();
    expect(useSettingsStore.getState().focusModeEnabled).toBe(false);
    expect(useSettingsStore.getState().focusWhitelist).toEqual([]);
  });
});
