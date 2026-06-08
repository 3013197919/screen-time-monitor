import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppUsageItem } from '../types/models';
import { formatDuration, formatPercentageString } from '../utils/format';
import { CHART_COLORS } from '../utils/constants';
import {
  Box,
  Typography,
  LinearProgress,
  List,
  ListItem,
  Avatar,
  TextField,
  InputAdornment,
  Chip,
} from '@mui/material';
import {
  Search as SearchIcon,
} from '@mui/icons-material';

/** Icon initials mapping for common apps (displayed in Avatar). */
const APP_ICON_MAP: Record<string, { initials: string; color: string }> = {
  chrome: { initials: 'Ch', color: '#4285F4' },
  'chrome.exe': { initials: 'Ch', color: '#4285F4' },
  'msedge.exe': { initials: 'Ed', color: '#0078D7' },
  'firefox.exe': { initials: 'Fx', color: '#FF7139' },
  'code.exe': { initials: 'VS', color: '#007ACC' },
  'Code.exe': { initials: 'VS', color: '#007ACC' },
  'devenv.exe': { initials: 'VS', color: '#5C2D91' },
  'notepad++.exe': { initials: 'NP', color: '#90E59A' },
  'excel.exe': { initials: 'XL', color: '#217346' },
  'winword.exe': { initials: 'Wd', color: '#2B579A' },
  'powerpnt.exe': { initials: 'PP', color: '#D24726' },
  'outlook.exe': { initials: 'OL', color: '#0078D4' },
  slack: { initials: 'Sl', color: '#4A154B' },
  'slack.exe': { initials: 'Sl', color: '#4A154B' },
  'teams.exe': { initials: 'Tm', color: '#6264A7' },
  'spotify.exe': { initials: 'Sp', color: '#1DB954' },
  'steam.exe': { initials: 'St', color: '#171D25' },
  'discord.exe': { initials: 'Di', color: '#5865F2' },
  'explorer.exe': { initials: 'Ex', color: '#F3A921' },
  'terminal.exe': { initials: 'Tl', color: '#1E1E1E' },
  'cmd.exe': { initials: 'Cm', color: '#1E1E1E' },
};

function getAppIcon(appName: string): { initials: string; color: string } {
  const key = appName.toLowerCase();
  if (APP_ICON_MAP[key]) return APP_ICON_MAP[key];
  // Try partial match (e.g. "chrome" matches "chrome.exe")
  for (const [k, v] of Object.entries(APP_ICON_MAP)) {
    if (key.includes(k)) return v;
  }
  // Fallback: first 2 chars uppercase
  const name = appName.replace(/\.exe$/i, '');
  return {
    initials: name.slice(0, 2).toUpperCase(),
    color: CHART_COLORS[0],
  };
}

interface AppUsageListProps {
  apps: AppUsageItem[];
  title?: string;
  emptyMessage?: string;
  focusModeEnabled?: boolean;
  focusWhitelist?: string[];
}

export default function AppUsageList({
  apps,
  title = 'App Usage',
  emptyMessage = 'No data to display',
  focusModeEnabled = false,
  focusWhitelist = [],
}: AppUsageListProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  // Client-side search filter (case-insensitive, < 50ms for typical app counts)
  const filteredApps = useMemo(() => {
    if (!searchQuery.trim()) return apps;
    const q = searchQuery.toLowerCase();
    return apps.filter((app) => app.app_name.toLowerCase().includes(q));
  }, [apps, searchQuery]);

  /**
   * Determine if an app is in the Focus Mode whitelist.
   * Case-insensitive comparison.
   */
  function isInWhitelist(appName: string): boolean {
    if (!focusModeEnabled || focusWhitelist.length === 0) return false;
    return focusWhitelist.some(
      (w) => appName.toLowerCase() === w.toLowerCase()
    );
  }

  if (apps.length === 0) {
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: 6,
          color: 'text.secondary',
        }}
      >
        <Typography variant="body2">{emptyMessage}</Typography>
      </Box>
    );
  }

  /* Find the maximum percentage for relative bar width scaling */
  const displayApps = filteredApps.slice(0, 10);
  const maxPct: number = Math.max(...displayApps.map((a) => a.percentage), 1);

  return (
    <Box>
      {title && (
        <Typography
          variant="subtitle2"
          fontWeight={600}
          color="text.secondary"
          textTransform="uppercase"
          letterSpacing={0.5}
          sx={{ mb: 1.5 }}
        >
          {title}
        </Typography>
      )}

      {/* Search box */}
      <TextField
        size="small"
        placeholder={t('common.search')}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        fullWidth
        sx={{ mb: 1.5 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
            </InputAdornment>
          ),
        }}
      />

      {filteredApps.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
          {t('common.noMatching')}
        </Typography>
      ) : (
        <List disablePadding>
          {displayApps.map((app, idx) => {
            const color: string = CHART_COLORS[idx % CHART_COLORS.length];
            const relativePct: number = (app.percentage / maxPct) * 100;

            return (
              <ListItem
                key={app.app_name}
                disableGutters
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  py: 0.75,
                }}
              >
                {/* App icon or rank badge */}
                {['Work', 'Study', 'Entertainment', 'Other'].includes(app.app_name) ? (
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: idx < 3 ? color : 'action.hover',
                      color: idx < 3 ? '#fff' : 'text.secondary',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {idx + 1}
                  </Box>
                ) : (
                  (() => {
                    const icon = getAppIcon(app.app_name);
                    return (
                      <Avatar
                        sx={{
                          width: 28,
                          height: 28,
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          bgcolor: icon.color,
                          flexShrink: 0,
                        }}
                      >
                        {icon.initials}
                      </Avatar>
                    );
                  })()
                )}

                {/* App name + bar */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      mb: 0.3,
                    }}
                  >
                    <Typography variant="body2" fontWeight={500} noWrap>
                      {app.app_name}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ ml: 1, flexShrink: 0 }}
                    >
                      {app.formattedDuration || formatDuration(app.duration)}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={relativePct}
                    sx={{
                      height: 6,
                      borderRadius: 3,
                      bgcolor: 'action.hover',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: color,
                        borderRadius: 3,
                      },
                    }}
                  />
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 0.2, display: 'block' }}
                  >
                    {formatPercentageString(app.duration, 0) || `${app.percentage}%`}
                  </Typography>
                </Box>

                {/* Focus / Distracted Chip */}
                {focusModeEnabled && (
                  <Chip
                    label={isInWhitelist(app.app_name) ? t('common.focus') : t('common.distraction')}
                    size="small"
                    sx={{
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      height: 20,
                      bgcolor: isInWhitelist(app.app_name)
                        ? 'rgba(34, 197, 94, 0.12)'
                        : 'rgba(249, 115, 22, 0.12)',
                      color: isInWhitelist(app.app_name) ? '#16A34A' : '#EA580C',
                      flexShrink: 0,
                    }}
                  />
                )}
              </ListItem>
            );
          })}
        </List>
      )}
    </Box>
  );
}
