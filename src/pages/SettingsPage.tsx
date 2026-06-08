import { useEffect, useState } from 'react';
import {
  Box, Typography, Slider, Switch, FormControlLabel, Divider,
  Autocomplete, TextField, Chip, Button, CircularProgress, ToggleButtonGroup, ToggleButton,
  Snackbar, Alert, Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import {
  Check as CheckIcon,
  Download as DownloadIcon,
  RestartAlt as RestartIcon,
  Translate as TranslateIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../store/settingsStore';
import { useUpdateStore } from '../store/updateStore';
import { useThemeMode } from '../contexts/ThemeContext';
import type { ThemeMode } from '../contexts/ThemeContext';
import LimitsSection from '../components/settings/LimitsSection';
import CategoriesSection from '../components/settings/CategoriesSection';
import DataSection from '../components/settings/DataSection';

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const {
    autoStart, autoStartLoading, idleThresholdMinutes, privacyMode, showTray,
    focusModeEnabled, focusWhitelist, language,
    pomodoroEnabled, pomodoroInterval, sedentaryEnabled, sedentaryInterval,
    loadSettings, setAutoStart, setIdleThreshold, setPrivacyMode, setShowTray,
    toggleFocusMode, setFocusWhitelist, setLanguage,
    setPomodoroEnabled, setPomodoroInterval, setSedentaryEnabled, setSedentaryInterval,
    focusScheduleEnabled, focusScheduleDays, focusScheduleStart, focusScheduleEnd,
    setFocusScheduleEnabled, setFocusScheduleDays, setFocusScheduleStart, setFocusScheduleEnd,
    loadLimits,
  } = useSettingsStore();

  const {
    status: updateStatus, latestVersion, error: updateError,
    checkForUpdates, installUpdate, setUpdateAvailable, setUpdateDownloaded, setUpdateError,
  } = useUpdateStore();

  const { mode: themeMode, setMode: setThemeMode } = useThemeMode();

  const [appVersion, setAppVersion] = useState('1.0.0');
  const [whitelistInput, setWhitelistInput] = useState<string[]>(focusWhitelist);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  useEffect(() => { loadSettings(); loadLimits(); }, [loadSettings, loadLimits]);

  // Sync whitelist input when focusWhitelist changes from store
  useEffect(() => {
    setWhitelistInput(focusWhitelist);
  }, [focusWhitelist]);

  // Get app version
  useEffect(() => {
    if (window.electronAPI?.app?.getVersion) {
      window.electronAPI.app.getVersion().then(setAppVersion).catch(() => {});
    }
  }, []);

  // Subscribe to update events from main process
  useEffect(() => {
    const unsubAvailable = window.electronAPI.app.onUpdateAvailable((data) => {
      setUpdateAvailable(data.version);
    });
    const unsubDownloaded = window.electronAPI.app.onUpdateDownloaded((data) => {
      setUpdateDownloaded(data.version);
    });
    return () => {
      unsubAvailable();
      unsubDownloaded();
    };
  }, [setUpdateAvailable, setUpdateDownloaded]);

  const handleSaveWhitelist = async () => {
    await setFocusWhitelist(whitelistInput);
  };

  const handleAutoStartToggle = async (enabled: boolean) => {
    try {
      await setAutoStart(enabled);
    } catch {
      setSnackbar({ open: true, message: t('settings.autoStartError'), severity: 'error' });
    }
  };

  const handleCheckUpdate = async () => {
    await checkForUpdates();
  };

  const handleInstallUpdate = async () => {
    await installUpdate();
  };

  // Language change handler
  const handleLanguageChange = async (lang: 'zh-CN' | 'en' | 'system') => {
    await setLanguage(lang);
    let effectiveLang: string;
    if (lang === 'system') {
      effectiveLang = navigator.language.startsWith('zh') ? 'zh-CN' : 'en';
    } else {
      effectiveLang = lang;
    }
    await i18n.changeLanguage(effectiveLang);
    localStorage.setItem('app_language', effectiveLang);

    // Update tray menu labels
    const labels = {
      todaySummary: t('tray.todaySummary'),
      pauseTracking: t('tray.pauseTracking'),
      resumeTracking: t('tray.resumeTracking'),
      openPanel: t('tray.openPanel'),
      quit: t('tray.quit'),
      noActivity: t('tray.noActivity'),
    };
    window.electronAPI.tray.updateMenuLabels(labels);
  };

  return (
    <Box sx={{ p: 3, pb: 6 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>{t('settings.title')}</Typography>

      {/* Tracking */}
      <Section title={t('settings.tracking')}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" gutterBottom>{t('settings.idleThreshold', { min: idleThresholdMinutes })}</Typography>
          <Slider value={idleThresholdMinutes} onChange={(_e, v) => setIdleThreshold(v as number)}
            min={1} max={30} step={1} valueLabelDisplay="auto" sx={{ maxWidth: 400 }} />
          <Typography variant="caption" color="text.secondary">{t('settings.idleHelper')}</Typography>
        </Box>

        <FormControlLabel
          control={<Switch checked={useSettingsStore.getState().autoTrackOnLaunch}
            onChange={(e) => window.electronAPI.settings.set('auto_track', String(e.target.checked))} />}
          label={t('settings.autoTrack')} />

        <Box sx={{ mt: 2 }}>
          <FormControlLabel
            control={<Switch checked={privacyMode} onChange={(_e, c) => setPrivacyMode(c)} />}
            label={t('settings.privacyMode')} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4 }}>
            {t('settings.privacyHelper')}
          </Typography>
        </Box>
      </Section>

      {/* App Limits */}
      <LimitsSection />

      {/* App Categories */}
      <CategoriesSection />

      {/* v3: Focus Mode */}
      <Section title={t('settings.focusMode')}>
        <FormControlLabel
          control={<Switch checked={focusModeEnabled} onChange={() => toggleFocusMode()} />}
          label={t('settings.focusEnable')}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4, mb: 2 }}>
          {t('settings.focusHelper')}
        </Typography>

        {focusModeEnabled && (
          <Box sx={{ ml: 4, mt: 1 }}>
            <Typography variant="body2" fontWeight={500} gutterBottom>
              {t('settings.whitelist')}
            </Typography>
            <Autocomplete
              multiple
              freeSolo
              size="small"
              options={[]}
              value={whitelistInput}
              onChange={(_e, newValue) => setWhitelistInput(newValue)}
              renderTags={(value: readonly string[], getTagProps) =>
                value.map((option: string, index: number) => (
                  <Chip
                    variant="outlined"
                    label={option}
                    size="small"
                    {...getTagProps({ index })}
                    key={index}
                  />
                ))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder={t('settings.whitelistPlaceholder')}
                  helperText={t('settings.whitelistHelper')}
                />
              )}
              sx={{ maxWidth: 500, mb: 1.5 }}
            />
            <Button
              variant="contained"
              size="small"
              onClick={handleSaveWhitelist}
            >
              {t('settings.saveWhitelist')}
            </Button>
          </Box>
        )}
      </Section>

      {/* v4: Focus Mode Schedule */}
      {focusModeEnabled && (
        <Section title={t('settings.focusSchedule')}>
          <FormControlLabel
            control={
              <Switch
                checked={focusScheduleEnabled}
                onChange={(e) => setFocusScheduleEnabled(e.target.checked)}
              />
            }
            label={t('settings.focusScheduleEnable')}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4, mb: 2 }}>
            {t('settings.focusScheduleHelper')}
          </Typography>

          {focusScheduleEnabled && (
            <Box sx={{ ml: 4 }}>
              {/* Day selection */}
              <Typography variant="body2" fontWeight={500} gutterBottom>
                {t('settings.focusScheduleDays')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, mb: 2, flexWrap: 'wrap' }}>
                {(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const).map((d, i) => (
                  <Chip
                    key={d}
                    label={t(`settings.focusScheduleDaysShort.${d}`)}
                    size="small"
                    variant={focusScheduleDays.includes(i) ? 'filled' : 'outlined'}
                    color={focusScheduleDays.includes(i) ? 'primary' : 'default'}
                    onClick={() => {
                      const next = focusScheduleDays.includes(i)
                        ? focusScheduleDays.filter((x) => x !== i)
                        : [...focusScheduleDays, i].sort();
                      setFocusScheduleDays(next);
                    }}
                  />
                ))}
              </Box>

              {/* Time range */}
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <FormControl size="small" sx={{ minWidth: 100 }}>
                  <InputLabel>{t('settings.focusScheduleStart')}</InputLabel>
                  <Select
                    value={focusScheduleStart}
                    label={t('settings.focusScheduleStart')}
                    onChange={(e) => setFocusScheduleStart(Number(e.target.value))}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <MenuItem key={i} value={i}>{`${i}:00`}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Typography color="text.secondary">—</Typography>
                <FormControl size="small" sx={{ minWidth: 100 }}>
                  <InputLabel>{t('settings.focusScheduleEnd')}</InputLabel>
                  <Select
                    value={focusScheduleEnd}
                    label={t('settings.focusScheduleEnd')}
                    onChange={(e) => setFocusScheduleEnd(Number(e.target.value))}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <MenuItem key={i} value={i}>{`${i}:00`}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </Box>
          )}
        </Section>
      )}

      {/* v4 E-04: Notifications */}
      <Section title={t('settings.notifications')}>
        {/* Pomodoro */}
        <Box sx={{ mb: 3 }}>
          <FormControlLabel
            control={<Switch checked={pomodoroEnabled} onChange={(e) => setPomodoroEnabled(e.target.checked)} />}
            label={t('settings.pomodoro')}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4, mb: 1 }}>
            {t('settings.pomodoroHelper')}
          </Typography>
          {pomodoroEnabled && (
            <Box sx={{ ml: 4, maxWidth: 200 }}>
              <FormControl fullWidth size="small">
                <InputLabel>{t('settings.pomodoroInterval')}</InputLabel>
                <Select
                  value={pomodoroInterval}
                  label={t('settings.pomodoroInterval')}
                  onChange={(e) => setPomodoroInterval(Number(e.target.value))}
                >
                  {[15, 20, 25, 30, 35, 40, 45, 50, 55, 60].map((m) => (
                    <MenuItem key={m} value={m}>{t('settings.minutes', { count: m })}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}
        </Box>

        {/* Sedentary */}
        <Box>
          <FormControlLabel
            control={<Switch checked={sedentaryEnabled} onChange={(e) => setSedentaryEnabled(e.target.checked)} />}
            label={t('settings.sedentary')}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4, mb: 1 }}>
            {t('settings.sedentaryHelper')}
          </Typography>
          {sedentaryEnabled && (
            <Box sx={{ ml: 4, maxWidth: 200 }}>
              <FormControl fullWidth size="small">
                <InputLabel>{t('settings.sedentaryInterval')}</InputLabel>
                <Select
                  value={sedentaryInterval}
                  label={t('settings.sedentaryInterval')}
                  onChange={(e) => setSedentaryInterval(Number(e.target.value))}
                >
                  {[30, 40, 50, 60, 75, 90, 105, 120].map((m) => (
                    <MenuItem key={m} value={m}>{t('settings.minutes', { count: m })}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}
        </Box>
      </Section>

      {/* v4 E-02: Appearance */}
      <Section title={t('settings.appearance')}>
        <ToggleButtonGroup
          size="small"
          value={themeMode}
          exclusive
          onChange={(_e, v) => v && setThemeMode(v as ThemeMode)}
        >
          <ToggleButton value="light">{t('settings.light')}</ToggleButton>
          <ToggleButton value="dark">{t('settings.dark')}</ToggleButton>
          <ToggleButton value="system">{t('settings.followSystem')}</ToggleButton>
        </ToggleButtonGroup>
      </Section>

      {/* v3: About / Update */}
      <Section title={t('settings.about')}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">
            {t('settings.version', { version: appVersion })}
          </Typography>

          {updateStatus === 'idle' && (
            <Button size="small" variant="outlined" onClick={handleCheckUpdate}>
              {t('settings.checkUpdate')}
            </Button>
          )}

          {updateStatus === 'checking' && (
            <Button size="small" variant="outlined" disabled startIcon={<CircularProgress size={14} />}>
              {t('settings.checking')}
            </Button>
          )}

          {updateStatus === 'available' && (
            <Button
              size="small"
              variant="contained"
              color="primary"
              startIcon={<DownloadIcon />}
              onClick={handleCheckUpdate}
            >
              {t('settings.download', { version: latestVersion })}
            </Button>
          )}

          {updateStatus === 'downloading' && (
            <Button size="small" variant="outlined" disabled startIcon={<CircularProgress size={14} />}>
              {t('settings.downloading')}
            </Button>
          )}

          {updateStatus === 'downloaded' && (
            <Button
              size="small"
              variant="contained"
              color="success"
              startIcon={<RestartIcon />}
              onClick={handleInstallUpdate}
            >
              {t('settings.installRestart')}
            </Button>
          )}

          {updateStatus === 'error' && (
            <Box>
              <Button size="small" variant="outlined" color="error" onClick={handleCheckUpdate}>
                {t('settings.retry')}
              </Button>
              <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                {updateError || t('settings.updateError')}
              </Typography>
            </Box>
          )}
        </Box>

        {/* v4 E-01: Restart onboarding */}
        <Box sx={{ mt: 2 }}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              localStorage.removeItem('onboarding_completed');
              window.location.reload();
            }}
          >
            {t('settings.restartOnboarding')}
          </Button>
        </Box>
      </Section>

      {/* General */}
      <Section title={t('settings.general')}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FormControlLabel
            control={
              <Switch
                checked={autoStart}
                disabled={autoStartLoading}
                onChange={(e) => handleAutoStartToggle(e.target.checked)}
              />
            }
            label={t('settings.launchAtStartup')}
          />
          {autoStartLoading && <CircularProgress size={16} />}
        </Box>
        <Box sx={{ mt: 2 }}><FormControlLabel control={<Switch checked={showTray} onChange={(e) => setShowTray(e.target.checked)} />} label={t('settings.showInTray')} /></Box>

        {/* v3: Language */}
        <Box sx={{ mt: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <TranslateIcon fontSize="small" color="action" />
            <Typography variant="body2" fontWeight={600}>
              {t('language.title')} / Language
            </Typography>
          </Box>
          <ToggleButtonGroup
            size="small"
            value={language}
            exclusive
            onChange={(_e, v) => v && handleLanguageChange(v)}
          >
            <ToggleButton value="zh-CN">{t('language.zhCN')}</ToggleButton>
            <ToggleButton value="en">{t('language.english')}</ToggleButton>
            <ToggleButton value="system">{t('language.followSystem')}</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Section>

      {/* Data Management */}
      <DataSection />

      {/* Snackbar for error feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>{title}</Typography>
      <Divider sx={{ mb: 2 }} />
      {children}
    </Box>
  );
}
