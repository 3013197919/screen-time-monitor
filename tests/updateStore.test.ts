import { describe, it, expect, beforeEach } from 'vitest';
import { useUpdateStore } from '../src/store/updateStore';

beforeEach(() => {
  useUpdateStore.getState().reset();
});

describe('updateStore', () => {
  it('initial status is idle', () => {
    const state = useUpdateStore.getState();
    expect(state.status).toBe('idle');
    expect(state.latestVersion).toBeNull();
    expect(state.error).toBeNull();
  });

  it('setUpdateAvailable transitions to available state', () => {
    useUpdateStore.getState().setUpdateAvailable('1.2.0');
    const state = useUpdateStore.getState();
    expect(state.status).toBe('available');
    expect(state.latestVersion).toBe('1.2.0');
    expect(state.error).toBeNull();
  });

  it('setUpdateDownloaded transitions to downloaded state', () => {
    useUpdateStore.getState().setUpdateDownloaded('1.2.0');
    const state = useUpdateStore.getState();
    expect(state.status).toBe('downloaded');
    expect(state.latestVersion).toBe('1.2.0');
  });

  it('setUpdateError transitions to error state', () => {
    useUpdateStore.getState().setUpdateError('Network timeout');
    const state = useUpdateStore.getState();
    expect(state.status).toBe('error');
    expect(state.error).toBe('Network timeout');
  });

  it('checkForUpdates handles missing IPC by transitioning to error', async () => {
    await useUpdateStore.getState().checkForUpdates();
    const state = useUpdateStore.getState();
    // Without window.electronAPI, the call throws and enters error state
    expect(state.status).toBe('error');
    expect(state.error).toBeTruthy();
  });

  it('checkForUpdates is idempotent when already checking', async () => {
    // Manually set to checking state
    useUpdateStore.setState({ status: 'checking' });
    await useUpdateStore.getState().checkForUpdates();
    // Should remain checking (guard prevents re-entry)
    expect(useUpdateStore.getState().status).toBe('checking');
  });

  it('downloadUpdate does nothing from idle status', async () => {
    await useUpdateStore.getState().downloadUpdate();
    expect(useUpdateStore.getState().status).toBe('idle');
  });

  it('downloadUpdate from available goes to downloading then error (no IPC)', async () => {
    useUpdateStore.setState({ status: 'available' });
    await useUpdateStore.getState().downloadUpdate();
    // In test env, window.electronAPI is unavailable so it errors after downloading
    expect(useUpdateStore.getState().status).toBe('error');
  });

  it('installUpdate handles missing IPC gracefully', async () => {
    await useUpdateStore.getState().installUpdate();
    // Install fails silently, state transitions to error
    const state = useUpdateStore.getState();
    expect(state.status).toBe('error');
  });

  it('reset returns all fields to initial idle state', () => {
    useUpdateStore.getState().setUpdateAvailable('2.0.0');
    useUpdateStore.getState().setUpdateError('some error');
    useUpdateStore.getState().reset();

    const state = useUpdateStore.getState();
    expect(state.status).toBe('idle');
    expect(state.latestVersion).toBeNull();
    expect(state.error).toBeNull();
  });

  it('setUpdateAvailable clears previous error', () => {
    useUpdateStore.getState().setUpdateError('previous error');
    useUpdateStore.getState().setUpdateAvailable('1.0.0');
    const state = useUpdateStore.getState();
    expect(state.status).toBe('available');
    expect(state.error).toBeNull();
    expect(state.latestVersion).toBe('1.0.0');
  });

  it('full state machine: idle -> checking -> error -> reset -> idle', async () => {
    // idle -> checking (via checkForUpdates)
    await useUpdateStore.getState().checkForUpdates();
    expect(useUpdateStore.getState().status).toBe('error'); // ends at error without IPC

    useUpdateStore.getState().setUpdateError('network issue');
    expect(useUpdateStore.getState().status).toBe('error');

    // reset
    useUpdateStore.getState().reset();
    expect(useUpdateStore.getState().status).toBe('idle');
  });
});
