import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  IconButton,
  Skeleton,
  Alert,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
} from '@mui/icons-material';
import { useTrackerStore } from '../store/trackerStore';
import DurationCard from '../components/DurationCard';
import AppUsageList from '../components/AppUsageList';
import TimeChart from '../components/TimeChart';
import { formatDuration, formatShortDate } from '../utils/format';
import { getWeekStart } from '../utils/format';
import type { CategorySummary } from '../types/models';

export default function WeeklyPage() {
  const { t } = useTranslation();
  const {
    weeklyReport,
    weeklyLoading,
    weeklyError,
    fetchWeeklyReport,
  } = useTrackerStore();

  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'app' | 'category'>('app');
  const [categoryData, setCategoryData] = useState<CategorySummary[]>([]);

  const baseMonday = getWeekStart();
  const monday = new Date(baseMonday);
  monday.setDate(monday.getDate() + weekOffset * 7);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  const today = new Date();
  const canGoNext: boolean = sunday < today;

  const weekLabel: string = `${formatShortDate(monday)} – ${formatShortDate(sunday)}`;
  const weekStartStr: string = monday.toISOString().slice(0, 10);

  const fetch = useCallback(() => {
    fetchWeeklyReport(weekStartStr);
  }, [fetchWeeklyReport, weekStartStr]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  // Fetch category data when viewMode switches to 'category'
  useEffect(() => {
    if (viewMode === 'category') {
      const endStr = sunday.toISOString().slice(0, 10);
      window.electronAPI.data.getCategorizedReport(weekStartStr, endStr).then((res) => {
        if (res.success && res.data) {
          setCategoryData(res.data);
        }
      });
    }
  }, [viewMode, weekStartStr]);

  const totalSeconds: number =
    weeklyReport?.daily_totals?.reduce((s, d) => s + d.total_seconds, 0) ?? 0;
  const dailyAvg: number =
    weeklyReport?.daily_totals?.length
      ? Math.round(totalSeconds / weeklyReport.daily_totals.length)
      : 0;
  const maxDaySeconds: number = Math.max(
    ...(weeklyReport?.daily_totals?.map((d) => d.total_seconds) ?? [0])
  );
  const busiestDay =
    weeklyReport?.daily_totals?.find(
      (d) => d.total_seconds === maxDaySeconds
    )?.date ?? '--';

  /* Daily bar chart */
  const dailyChartData =
    weeklyReport?.daily_totals?.map((d) => ({
      label: formatShortDate(d.date),
      value: d.duration ?? d.total_seconds,
    })) ?? [];

  /* App distribution for ranking */
  const appDist = weeklyReport?.app_distribution ?? [];

  /* Trend vs previous week */
  const diffPercent: number =
    weeklyReport?.previous_week_comparison?.diff_percent ?? 0;

  /* Category view data */
  const categoryTotal: number = categoryData.reduce((s, c) => s + c.total_duration, 0);
  const categoryListItems = categoryData.map((c) => ({
    app_name: c.category.charAt(0).toUpperCase() + c.category.slice(1),
    duration: c.total_duration,
    percentage: categoryTotal > 0 ? Math.round((c.total_duration / categoryTotal) * 100) : 0,
    formattedDuration: formatDuration(c.total_duration),
  }));
  const categoryPieData = categoryData.map((c) => ({
    label: c.category.charAt(0).toUpperCase() + c.category.slice(1),
    value: c.total_duration,
  }));

  if (weeklyLoading && !weeklyReport) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
          {t('weekly.title')}
        </Typography>
        <Skeleton variant="rounded" height={400} />
      </Box>
    );
  }

  if (weeklyError) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
          {t('weekly.title')}
        </Typography>
        <Alert severity="error">{weeklyError}</Alert>
      </Box>
    );
  }

  const isEmpty: boolean = totalSeconds === 0;

  return (
    <Box sx={{ p: 3, pb: 6 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
        {t('weekly.title')}
      </Typography>

      {/* Week selector */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 3,
        }}
      >
        <IconButton
          size="small"
          onClick={() => setWeekOffset((o) => o - 1)}
        >
          <ChevronLeftIcon />
        </IconButton>
        <Typography variant="subtitle1" fontWeight={600}>
          {weekLabel}
        </Typography>
        <IconButton
          size="small"
          onClick={() => canGoNext && setWeekOffset((o) => o + 1)}
          disabled={!canGoNext}
        >
          <ChevronRightIcon />
        </IconButton>
        {diffPercent !== 0 && (
          <Typography
            variant="caption"
            fontWeight={600}
            color={diffPercent > 0 ? 'error.main' : 'success.main'}
            sx={{ ml: 2 }}
          >
            {diffPercent > 0 ? '↑' : '↓'} {Math.abs(diffPercent)}% {t('weekly.vsLastWeek')}
          </Typography>
        )}
      </Box>

      {isEmpty ? (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <Typography variant="h6" gutterBottom>
            {t('weekly.noData')}
          </Typography>
          <Typography variant="body2">
            {t('weekly.noDataHint')}
          </Typography>
        </Box>
      ) : (
        <>
          {/* Summary cards */}
          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            <DurationCard
              title={t('weekly.weekTotal')}
              value={formatDuration(totalSeconds)}
              subtitle={weekLabel}
              color="#6366F1"
            />
            <DurationCard
              title={t('weekly.dailyAverage')}
              value={formatDuration(dailyAvg)}
              subtitle={t('weekly.perDay')}
              color="#8B5CF6"
            />
            <DurationCard
              title={t('weekly.mostActiveDay')}
              value={formatDuration(maxDaySeconds)}
              subtitle={busiestDay !== '--' ? formatShortDate(busiestDay) : '--'}
              color="#EC4899"
            />
          </Box>

          {/* Daily bar chart */}
          <Box
            sx={{
              bgcolor: 'background.paper',
              borderRadius: 2,
              p: 2,
              mb: 3,
              boxShadow:
                '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
            }}
          >
            <TimeChart
              data={dailyChartData}
              type="bar"
              height={200}
              title={t('weekly.dailyBreakdown')}
            />
          </Box>

          {/* App ranking */}
          <Box
            sx={{
              bgcolor: 'background.paper',
              borderRadius: 2,
              p: 2,
              boxShadow:
                '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                {t('weekly.view')}
              </Typography>
              <ToggleButtonGroup
                size="small"
                value={viewMode}
                exclusive
                onChange={(_e, v) => v && setViewMode(v)}
              >
                <ToggleButton value="app">{t('weekly.byApp')}</ToggleButton>
                <ToggleButton value="category">{t('weekly.byCategory')}</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            {viewMode === 'app' ? (
              <AppUsageList
                apps={appDist}
                title={t('weekly.topAppsThisWeek')}
                emptyMessage={t('weekly.noAppData')}
              />
            ) : (
              <AppUsageList
                apps={categoryListItems}
                title={t('weekly.byCategory')}
                emptyMessage={t('weekly.byCategoryEmpty')}
              />
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
