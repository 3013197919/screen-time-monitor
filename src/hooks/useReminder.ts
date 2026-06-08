import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * useReminder — v4 E-04
 *
 * A hook that subscribes to main-process reminder events (pomodoro +
 * sedentary) and dispatches desktop notifications via the Web Notification
 * API.
 *
 * Must be mounted once at the app root level (AppContent). The hook
 * handles notification permission requests and graceful degradation
 * when permissions are denied.
 *
 * IMPORTANT: The hook is a singleton — mount it only once. It manages
 * its own cleanup on unmount.
 */
export function useReminder(): void {
  const { t } = useTranslation();

  useEffect(() => {
    // ── Ensure notification permission ──────────────────────
    let permissionDenied = false;

    if (typeof Notification !== 'undefined') {
      if (Notification.permission === 'default') {
        Notification.requestPermission().then((perm) => {
          console.log('[useReminder] Notification permission:', perm);
          if (perm === 'denied') {
            permissionDenied = true;
            console.warn(
              '[useReminder] Notification permission denied — reminders will be silent.'
            );
          }
        });
      } else if (Notification.permission === 'denied') {
        permissionDenied = true;
        console.warn(
          '[useReminder] Notification permission denied — reminders will be silent.'
        );
      }
    }

    // ── Subscribe to pomodoro events ──
    const unsubPomodoro = window.electronAPI.reminder.onPomodoro(
      (data: { intervalMinutes: number }) => {
        if (permissionDenied) return;

        try {
          new Notification(t('reminder.pomodoroTitle'), {
            body: t('reminder.pomodoroBody', {
              minutes: data.intervalMinutes,
            }),
            icon: undefined, // Electron handles app icon automatically
          });
        } catch (err) {
          console.error('[useReminder] Failed to show pomodoro notification:', err);
        }
      }
    );

    // ── Subscribe to sedentary events ──
    const unsubSedentary = window.electronAPI.reminder.onSedentary(
      (data: { accumulatedMinutes: number }) => {
        if (permissionDenied) return;

        try {
          new Notification(t('reminder.sedentaryTitle'), {
            body: t('reminder.sedentaryBody', {
              minutes: data.accumulatedMinutes,
            }),
          });
        } catch (err) {
          console.error('[useReminder] Failed to show sedentary notification:', err);
        }
      }
    );

    // ── Cleanup ─────────────────────────────────────────────
    return () => {
      unsubPomodoro();
      unsubSedentary();
    };
  }, [t]);
}
