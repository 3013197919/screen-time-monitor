import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Button,
  Alert,
  AlertTitle,
  Skeleton,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  BarChart as BarChartIcon,
} from '@mui/icons-material';
import { useTrackerStore } from '../store/trackerStore';
import { useSettingsStore } from '../store/settingsStore';
import DurationCard from '../components/DurationCard';
import AppUsageList from '../components/AppUsageList';
import TimeChart from '../components/TimeChart';
import { formatDuration } from '../utils/format';
import type { CategorySummary, FocusReportData } from '../types/models';

export default function TodayPage() {
  const { t } = useTranslation();
  const {
    status,
    todaySummary,
    todayLoading,
    todayError,
    fetchTodaySummary,
    pauseTracker,
    resumeTracker,
  } = useTrackerStore();

  const [viewMode, setViewMode] = useState<'app' | 'category'>('app');
  const [categoryData, setCategoryData] = useState<CategorySummary[]>([]);
  const [privacyHint, setPrivacyHint] = useState(false);

  // v3: Focus Mode
  const focusModeEnabled = useSettingsStore((s) => s.focusModeEnabled);
  const focusWhitelist = useSettingsStore((s) => s.focusWhitelist);
  const [focusReport, setFocusReport] = useState<FocusReportData | null>(null);

  useEffect(() => {
    fetchTodaySummary();
    const id = setInterval(() => fetchTodaySummary(), 10000);
    return () => clearInterval(id);
  }, [fetchTodaySummary]);

  // Privacy first-run reminder
  useEffect(() => {
    const dismissed = localStorage.getItem('privacy_hint_dismissed');
    if (!dismissed && status.is_tracking) {
      setPrivacyHint(true);
    }
  }, [status.is_tracking]);

  const dismissPrivacyHint = () => {
    setPrivacyHint(false);
    localStorage.setItem('privacy_hint_dismissed', '1');
  };

  // Fetch category data when viewMode switches to 'category'
  useEffect(() => {
    if (viewMode === 'category') {
      const today = new Date().toISOString().slice(0, 10);
      window.electronAPI.data.getCategorizedReport(today, today).then((res) => {
        if (res.success && res.data) {
          setCategoryData(res.data);
        }
      });
    }
  }, [viewMode]);

  // v3: Fetch focus report when Focus Mode is enabled
  useEffect(() => {
    if (focusModeEnabled) {
      const today = new Date().toISOString().slice(0, 10);
      window.electronAPI.focus.getReport(today).then((res) => {
        if (res.success && res.data) {
          setFocusReport(res.data);
        }
      });
    } else {
      setFocusReport(null);
    }
  }, [focusModeEnabled]);

  const totalSeconds: number = todaySummary?.total_seconds ?? 0;
  const appCount: number = todaySummary?.active_apps_count ?? 0;
  const topApps = todaySummary?.top_apps ?? [];
  const heatmap: number[] = todaySummary?.hourly_heatmap ?? [];

  /* Hourly chart data from heatmap (convert minutes→count for chart) */
  const hourlyData = heatmap.map((v, h) => ({
    label: `${h}`,
    value: v,
  }));

  /* Pie chart data for app distribution */
  const pieData = topApps.slice(0, 8).map((a) => ({
    label: a.app_name,
    value: a.duration,
  }));

  /* Category pie chart data */
  const categoryPieData: { label: string; value: number }[] = categoryData.map((c) => ({
    label: c.category.charAt(0).toUpperCase() + c.category.slice(1),
    value: c.total_duration,
  }));
  const categoryTotal: number = categoryData.reduce((s, c) => s + c.total_duration, 0);
  const categoryListItems = categoryData.map((c) => ({
    app_name: c.category,
    duration: c.total_duration,
    percentage: categoryTotal > 0 ? Math.round((c.total_duration / categoryTotal) * 100) : 0,
    formattedDuration: formatDuration(c.total_duration),
  }));

  if (todayLoading && !todaySummary) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
          {t('today.title')}
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton
              key={i}
              variant="rounded"
              width="33%"
              height={100}
            />
          ))}
        </Box>
        <Skeleton variant="rounded" height={300} />
      </Box>
    );
  }

  if (todayError) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
          {t('today.title')}
        </Typography>
        <Alert severity="error">{todayError}</Alert>
      </Box>
    );
  }

  /* Empty state: no data yet */
  const isEmpty: boolean = totalSeconds === 0 && appCount === 0;

  return (
    <Box sx={{ p: 3, pb: 6 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
        {t('today.title')}
      </Typography>

      {/* Tracking control banner */}
      <Alert
        severity={status.is_tracking ? (status.is_paused ? 'warning' : 'success') : 'info'}
        icon={<BarChartIcon />}
        action={
          status.is_tracking ? (
            <Button
              color="inherit"
              size="small"
              startIcon={status.is_paused ? <PlayIcon /> : <PauseIcon />}
              onClick={status.is_paused ? resumeTracker : pauseTracker}
            >
              {status.is_paused ? t('today.resume') : t('today.pause')}
            </Button>
          ) : (
            <Button
              color="inherit"
              size="small"
              startIcon={<PlayIcon />}
              onClick={resumeTracker}
            >
              {t('today.startTracking')}
            </Button>
          )
        }
        sx={{ mb: 3 }}
      >
        <AlertTitle>
          {status.is_tracking
            ? status.is_paused
              ? t('today.trackingPaused')
              : t('today.trackingActive')
            : t('today.trackingStopped')}
        </AlertTitle>
        {status.is_tracking && !status.is_paused && status.current_app
          ? t('today.currentlyTracking', { app: status.current_app })
          : t('today.noTracking')}
      </Alert>

      {/* Privacy first-run reminder */}
      {privacyHint && (
        <Alert
          severity="info"
          onClose={dismissPrivacyHint}
          sx={{ mb: 2 }}
        >
          <AlertTitle>{t('today.privacyNote')}</AlertTitle>
          {t('today.privacyText')}
        </Alert>
      )}

      {isEmpty ? (
        /* Empty state */
        <Box
          sx={{
            textAlign: 'center',
            py: 8,
            color: 'text.secondary',
          }}
        >
          <BarChartIcon sx={{ fontSize: 64, mb: 2, opacity: 0.3 }} />
          <Typography variant="h6" gutterBottom>
            {t('today.noData')}
          </Typography>
          <Typography variant="body2">
            {t('today.noDataHint')}
          </Typography>
        </Box>
      ) : (
        <>
          {/* Summary cards */}
          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            {focusModeEnabled && focusReport ? (
              <>
                <DurationCard
                  title={t('today.productivityScore')}
                  value={
                    focusReport.total_seconds > 0
                      ? `${Math.round((focusReport.focused_total_seconds / focusReport.total_seconds) * 100)}%`
                      : '--'
                  }
                  subtitle={t('today.productivitySubtitle')}
                  color="#6366F1"
                />
                <DurationCard
                  title={t('today.focusedTime')}
                  value={formatDuration(focusReport.focused_total_seconds)}
                  subtitle={t('today.focusedSubtitle')}
                  color="#22C55E"
                />
                <DurationCard
                  title={t('today.distractedTime')}
                  value={formatDuration(focusReport.distracted_total_seconds)}
                  subtitle={t('today.distractedSubtitle')}
                  color="#F97316"
                />
              </>
            ) : (
              <>
                <DurationCard
                  title={t('today.totalActiveTime')}
                  value={formatDuration(totalSeconds)}
                  subtitle={t('today.todaySubtitle')}
                  color="#6366F1"
                />
                <DurationCard
                  title={t('today.activeApps')}
                  value={String(appCount)}
                  subtitle={t('today.uniqueApps')}
                  color="#22C55E"
                />
                <DurationCard
                  title={t('today.hourlyPeak')}
                  value={
                    totalSeconds > 0
                      ? `${heatmap.indexOf(Math.max(...heatmap))}:00`
                      : '--'
                  }
                  subtitle={t('today.mostActiveHour')}
                  color="#F97316"
                />
              </>
            )}
          </Box>

          {/* Main content: App list + Charts */}
          <Box
            sx={{
              display: 'flex',
              gap: 3,
              flexWrap: 'wrap',
            }}
          >
            {/* Left / Middle: App list */}
            <Box sx={{ flex: 2, minWidth: 280 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  {t('today.view')}
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  value={viewMode}
                  exclusive
                  onChange={(_e, v) => v && setViewMode(v)}
                >
                  <ToggleButton value="app">{t('today.byApp')}</ToggleButton>
                  <ToggleButton value="category">{t('today.byCategory')}</ToggleButton>
                </ToggleButtonGroup>
              </Box>
              {viewMode === 'app' ? (
                <AppUsageList
                  apps={focusModeEnabled && focusReport ? [...focusReport.focused_apps, ...focusReport.distracted_apps].slice(0, 10) : topApps}
                  title={t('today.topApps')}
                  emptyMessage={t('today.topAppsEmpty')}
                  focusModeEnabled={focusModeEnabled}
                  focusWhitelist={focusWhitelist}
                />
              ) : (
                <AppUsageList
                  apps={categoryListItems}
                  title={t('today.byCategory')}
                  emptyMessage={t('today.byCategoryEmpty')}
                />
              )}
            </Box>

            {/* Right column: Charts */}
            <Box
              sx={{
                flex: 1,
                minWidth: 260,
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
              }}
            >
              <Box
                sx={{
                  bgcolor: 'background.paper',
                  borderRadius: 2,
                  p: 2,
                  boxShadow:
                    '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
                }}
              >
                <TimeChart
                  data={hourlyData}
                  type="bar"
                  height={180}
                  title={t('today.hourlyActivity')}
                />
              </Box>

              {viewMode === 'app' && pieData.length > 0 && (
                <Box
                  sx={{
                    bgcolor: 'background.paper',
                    borderRadius: 2,
                    p: 2,
                    boxShadow:
                      '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
                  }}
                >
                  <TimeChart
                    data={pieData}
                    type="pie"
                    height={140}
                    title={t('today.appDistribution')}
                  />
                </Box>
              )}

              {viewMode === 'category' && categoryPieData.length > 0 && (
                <Box
                  sx={{
                    bgcolor: 'background.paper',
                    borderRadius: 2,
                    p: 2,
                    boxShadow:
                      '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
                  }}
                >
                  <TimeChart
                    data={categoryPieData}
                    type="pie"
                    height={140}
                    title={t('today.categoryDistribution')}
                  />
                </Box>
              )}
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
}
