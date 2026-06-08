import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Chip,
  Button,
} from '@mui/material';
import {
  Pause as PauseIcon,
  PlayArrow as PlayIcon,
  CenterFocusStrong as FocusIcon,
} from '@mui/icons-material';
import { Sun, Moon, Monitor, PictureInPicture2 } from 'lucide-react';
import { useTrackerStore } from '../store/trackerStore';
import { useSettingsStore } from '../store/settingsStore';
import { useThemeMode, type ThemeMode } from '../contexts/ThemeContext';
import { formatDuration } from '../utils/format';

export default function StatusBar({ sidebarCollapsed = false }: { sidebarCollapsed?: boolean }) {
  const { t } = useTranslation();
  const { status, todaySummary, fetchTodaySummary, pauseTracker, resumeTracker } =
    useTrackerStore();
  const { focusModeEnabled, toggleFocusMode } = useSettingsStore();
  const { mode: themeMode, setMode: setThemeMode } = useThemeMode();
  const [floatingVisible, setFloatingVisible] = useState(false);

  // Check floating window initial state
  useEffect(() => {
    if (window.electronAPI?.app?.isFloatingWindowVisible) {
      window.electronAPI.app.isFloatingWindowVisible().then(setFloatingVisible).catch(() => {});
    }
  }, []);

  const sidebarWidth = sidebarCollapsed ? 56 : 240;

  const isTracking: boolean = status.is_tracking;
  const isPaused: boolean = status.is_paused;
  const totalSeconds: number = todaySummary?.total_seconds ?? 0;
  const currentApp: string | null = status.current_app;

  /* Poll for status every 5 seconds */
  useEffect(() => {
    fetchTodaySummary();
    const interval = setInterval(() => {
      window.electronAPI.tracker.getStatus().then((res) => {
        if (res.success && res.data) {
          useTrackerStore.getState().setStatus(res.data);
        }
      });
      fetchTodaySummary();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchTodaySummary]);

  const dotColor: string = isPaused
    ? '#EAB308'
    : isTracking
      ? '#22C55E'
      : '#9CA3AF';

  /* Theme cycle: light → dark → system → light */
  const themeCycle: Record<ThemeMode, ThemeMode> = {
    light: 'dark',
    dark: 'system',
    system: 'light',
  };
  const nextTheme = themeCycle[themeMode];
  const themeTooltipMap: Record<ThemeMode, string> = {
    light: t('statusBar.themeLight'),
    dark: t('statusBar.themeDark'),
    system: t('statusBar.themeSystem'),
  };
  const themeIconMap: Record<ThemeMode, { Icon: typeof Sun; color: string }> = {
    light: { Icon: Sun, color: '#EAB308' },
    dark: { Icon: Moon, color: '#60A5FA' },
    system: { Icon: Monitor, color: '#9CA3AF' },
  };
  const { Icon: ThemeIcon, color: themeIconColor } = themeIconMap[themeMode];

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 0,
        left: sidebarWidth,
        right: 0,
        ...(sidebarCollapsed ? { left: 56 } : { left: 240 }),
        height: 40,
        bgcolor: 'background.paper',
        borderTop: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        px: 2,
        gap: 1.5,
        zIndex: 1200,
      }}
    >
      {/* Status dot */}
      <Box
        sx={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          bgcolor: dotColor,
          boxShadow: isTracking && !isPaused
            ? `0 0 6px ${dotColor}`
            : 'none',
          animation:
            isTracking && !isPaused
              ? 'pulse 1.5s infinite'
              : 'none',
          '@keyframes pulse': {
            '0%, 100%': { opacity: 1 },
            '50%': { opacity: 0.4 },
          },
        }}
      />

      {/* Current app */}
      {currentApp && isTracking && !isPaused && (
        <Chip
          label={t('statusBar.tracking', { app: currentApp })}
          size="small"
          variant="outlined"
          sx={{ fontSize: '0.75rem' }}
        />
      )}
      {isPaused && (
        <Typography variant="caption" color="warning.main">
          {t('statusBar.paused')}
        </Typography>
      )}

      {/* Spacer */}
      <Box sx={{ flex: 1 }} />

      {/* Total today */}
      <Typography variant="caption" color="text.secondary">
        {t('statusBar.today', { duration: formatDuration(totalSeconds) })}
      </Typography>

      {/* Theme quick-switch */}
      <Tooltip title={themeTooltipMap[themeMode]}>
        <IconButton
          size="small"
          onClick={() => setThemeMode(nextTheme)}
          sx={{ color: themeIconColor }}
        >
          <ThemeIcon size={16} />
        </IconButton>
      </Tooltip>

      {/* Focus Mode Toggle */}
      <Tooltip title={focusModeEnabled ? t('statusBar.focusMode.disable') : t('statusBar.focusMode.enable')}>
        <Button
          size="small"
          onClick={toggleFocusMode}
          sx={{
            minWidth: 'auto',
            px: 1.5,
            py: 0.3,
            fontSize: '0.65rem',
            fontWeight: 600,
            borderRadius: 1,
            textTransform: 'none',
            bgcolor: focusModeEnabled ? 'rgba(139, 92, 246, 0.15)' : 'rgba(156, 163, 175, 0.15)',
            color: focusModeEnabled ? '#8B5CF6' : '#9CA3AF',
            border: focusModeEnabled ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid rgba(156, 163, 175, 0.3)',
            animation: focusModeEnabled ? 'focusPulse 2s infinite' : 'none',
            '@keyframes focusPulse': {
              '0%, 100%': {
                boxShadow: '0 0 0 0 rgba(139, 92, 246, 0.4)',
              },
              '50%': {
                boxShadow: '0 0 0 4px rgba(139, 92, 246, 0)',
              },
            },
            '&:hover': {
              bgcolor: focusModeEnabled ? 'rgba(139, 92, 246, 0.25)' : 'rgba(156, 163, 175, 0.25)',
            },
          }}
        >
          <FocusIcon sx={{ fontSize: 14, mr: 0.5 }} />
          {focusModeEnabled ? t('statusBar.focusMode.on') : t('statusBar.focusMode.off')}
        </Button>
      </Tooltip>

      {/* Floating window toggle */}
      <Tooltip title={floatingVisible ? t('statusBar.floatingHide') : t('statusBar.floatingShow')}>
        <IconButton
          size="small"
          onClick={async () => {
            if (floatingVisible) {
              await window.electronAPI?.app?.hideFloatingWindow?.();
              setFloatingVisible(false);
            } else {
              await window.electronAPI?.app?.showFloatingWindow?.();
              setFloatingVisible(true);
            }
          }}
          color={floatingVisible ? 'primary' : 'default'}
        >
          <PictureInPicture2 size={16} />
        </IconButton>
      </Tooltip>

      {/* Pause / Resume */}
      {isTracking && (
        <Tooltip title={isPaused ? t('statusBar.resume') : t('statusBar.pause')}>
          <IconButton
            size="small"
            onClick={isPaused ? resumeTracker : pauseTracker}
            color={isPaused ? 'success' : 'warning'}
          >
            {isPaused ? (
              <PlayIcon fontSize="small" />
            ) : (
              <PauseIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
