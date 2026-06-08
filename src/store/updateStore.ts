import { create } from 'zustand';
import type { UpdateStatus } from '../types/models';

/**
 * Zustand store for auto-update state management (F-11).
 *
 * Tracks the lifecycle of electron-updater: checking → available → downloading → downloaded.
 * The renderer subscribes to main process push events via window.electronAPI.app callbacks.
 */

interface UpdateState {
  /** Current update status. */
  status: UpdateStatus;
  /** Latest available version string (if any). */
  latestVersion: string | null;
  /** Last error message (if any). */
  error: string | null;

  /** Manually check for updates. */
  checkForUpdates: () => Promise<void>;
  /** Download the available update. */
  downloadUpdate: () => Promise<void>;
  /** Install the downloaded update and restart. */
  installUpdate: () => Promise<void>;
  /** Set status to 'available' (called from main process push). */
  setUpdateAvailable: (version: string) => void;
  /** Set status to 'downloaded' (called from main process push). */
  setUpdateDownloaded: (version: string) => void;
  /** Set status to 'error'. */
  setUpdateError: (error: string) => void;
  /** Reset to initial idle state. */
  reset: () => void;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: 'idle',
  latestVersion: null,
  error: null,

  checkForUpdates: async (): Promise<void> => {
    if (get().status === 'checking') return;
    set({ status: 'checking', error: null });

    try {
      const res = await window.electronAPI.app.checkForUpdates();
      if (res.success && res.data) {
        if (res.data.updateAvailable && res.data.version) {
          set({ status: 'available', latestVersion: res.data.version });
        } else {
          set({ status: 'idle' });
        }
      } else {
        set({
          status: 'error',
          error: res.error ?? 'Check for updates failed',
        });
      }
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  },

  downloadUpdate: async (): Promise<void> => {
    if (get().status !== 'available') return;
    set({ status: 'downloading' });
    // autoUpdater downloads automatically when autoDownload is true
    // For now, just transition state — actual download is triggered by main process
    try {
      const res = await window.electronAPI.app.checkForUpdates();
      if (!res.success) {
        set({ status: 'error', error: res.error ?? 'Download failed' });
      }
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  },

  installUpdate: async (): Promise<void> => {
    try {
      await window.electronAPI.app.installUpdate();
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : 'Install failed',
      });
    }
  },

  setUpdateAvailable: (version: string): void => {
    set({ status: 'available', latestVersion: version, error: null });
  },

  setUpdateDownloaded: (version: string): void => {
    set({ status: 'downloaded', latestVersion: version, error: null });
  },

  setUpdateError: (error: string): void => {
    set({ status: 'error', error });
  },

  reset: (): void => {
    set({ status: 'idle', latestVersion: null, error: null });
  },
}));
