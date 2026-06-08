import { Notification } from 'electron';

/**
 * Desktop notification service for Screen Time Monitor.
 *
 * Provides static helper methods to show system-level notifications
 * when app usage limits are reached or other important events occur.
 *
 * Usage:
 *   NotificationService.showLimitWarning('chrome.exe', 65, 60);
 */
export class NotificationService {
  /**
   * Show a desktop notification warning that an app's usage limit has been
   * reached or exceeded.
   *
   * @param appName - The process name of the application (e.g., "chrome.exe").
   * @param usedMinutes - The number of minutes already used today.
   * @param limitMinutes - The configured daily limit in minutes.
   */
  static showLimitWarning(
    appName: string,
    usedMinutes: number,
    limitMinutes: number
  ): void {
    try {
      const notification: Notification = new Notification({
        title: '\u26a0\ufe0f App Limit Reached',
        body: `${appName}: ${usedMinutes}/${limitMinutes} minutes used today.`,
      });
      notification.show();
      console.log(
        `[Notification] Limit warning shown for ${appName}: ${usedMinutes}/${limitMinutes} min`
      );
    } catch (err) {
      console.error('[Notification] Failed to show limit warning:', err);
    }
  }

  /**
   * Show a generic informational notification.
   *
   * @param title - Notification title.
   * @param body - Notification body text.
   */
  static showInfo(title: string, body: string): void {
    try {
      const notification: Notification = new Notification({ title, body });
      notification.show();
      console.log(`[Notification] Info shown: ${title}`);
    } catch (err) {
      console.error('[Notification] Failed to show info notification:', err);
    }
  }
}
