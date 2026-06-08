import AutoLaunch from 'auto-launch';
import { app } from 'electron';

/**
 * AutoLaunchService — v4 E-03
 *
 * Wraps the `auto-launch` npm package to manage the application's
 * "launch at system startup" setting via the OS registry (Windows),
 * plist (macOS), or .desktop file (Linux).
 *
 * Replaces the legacy `app.setLoginItemSettings()` approach (Electron
 * built-in API) with a cross-platform, registry-level solution that
 * survives application updates and re-installs.
 *
 * In development mode (`app.isPackaged === false`), all operations are
 * no-ops to avoid polluting the developer's real registry.
 */
export class AutoLaunchService {
  private autoLauncher: AutoLaunch | null = null;

  /**
   * Initialize the service. Must be called once during app startup.
   * Must be called AFTER `app.whenReady()` to ensure `process.execPath`
   * is stable.
   */
  init(): void {
    // In development mode, do not touch the system registry
    if (!app.isPackaged) {
      console.log('[AutoLaunch] Skipped — not packaged (development mode).');
      return;
    }

    try {
      this.autoLauncher = new AutoLaunch({
        name: 'Screen Time Monitor',
        path: process.execPath,
      });
      console.log('[AutoLaunch] Service initialized.');
    } catch (err) {
      console.error('[AutoLaunch] Failed to initialize:', err);
    }
  }

  /**
   * Enable auto-launch on system startup.
   * Writes the necessary registry/plist/desktop entry.
   */
  async enable(): Promise<void> {
    if (!this.autoLauncher) {
      console.warn('[AutoLaunch] enable() called but service not initialized (dev mode?).');
      return;
    }

    try {
      await this.autoLauncher.enable();
      console.log('[AutoLaunch] Enabled — app will start on system login.');
    } catch (err) {
      console.error('[AutoLaunch] Failed to enable:', err);
      throw err;
    }
  }

  /**
   * Disable auto-launch on system startup.
   * Removes the registry/plist/desktop entry.
   */
  async disable(): Promise<void> {
    if (!this.autoLauncher) {
      console.warn('[AutoLaunch] disable() called but service not initialized (dev mode?).');
      return;
    }

    try {
      await this.autoLauncher.disable();
      console.log('[AutoLaunch] Disabled — app will NOT start on system login.');
    } catch (err) {
      console.error('[AutoLaunch] Failed to disable:', err);
      throw err;
    }
  }

  /**
   * Check if auto-launch is currently enabled in the OS.
   * Always returns `false` in dev mode.
   */
  async isEnabled(): Promise<boolean> {
    if (!this.autoLauncher) {
      // Dev mode: return false without touching registry
      return false;
    }

    try {
      return await this.autoLauncher.isEnabled();
    } catch (err) {
      console.error('[AutoLaunch] Failed to check status:', err);
      return false;
    }
  }

  /**
   * Repair auto-start state: if the DB says enabled but the registry
   * is missing the entry, re-enable it. If DB says disabled but registry
   * has the entry, remove it.
   *
   * Called once during app startup to self-heal any inconsistencies.
   *
   * @param dbEnabled — whether auto_start is 'true' in the settings DB.
   */
  async repair(dbEnabled: boolean): Promise<void> {
    if (!this.autoLauncher) return;

    try {
      const registryEnabled = await this.isEnabled();

      if (dbEnabled && !registryEnabled) {
        console.log('[AutoLaunch] Self-repair: DB says enabled, registry missing — enabling.');
        await this.enable();
      } else if (!dbEnabled && registryEnabled) {
        console.log('[AutoLaunch] Self-repair: DB says disabled, registry present — disabling.');
        await this.disable();
      } else {
        console.log('[AutoLaunch] Self-repair: state consistent (enabled=' + dbEnabled + ').');
      }
    } catch (err) {
      console.error('[AutoLaunch] Self-repair failed:', err);
    }
  }
}

/** Singleton instance — created once, shared across the app. */
export const autoLaunchService = new AutoLaunchService();
