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
import { formatDuration, getMonthLabel } from '../utils/format';
import type { CategorySummary } from '../types/models';

export default function MonthlyPage() {
  const { t } = useTranslation();
  const {
    monthlyReport,
    monthlyLoading,
    monthlyError,
    fetchMonthlyReport,
  } = useTrackerStore();

  const [monthOffset, setMonthOffset] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'app' | 'category'>('app');
  const [categoryData, setCategoryData] = useState<CategorySummary[]>([]);

  const now = new Date();
  const targetMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const monthStr: string = getMonthLabel(targetMonth);

  const currentMonthStr: string = getMonthLabel(now);
  const canGoNext: boolean = monthStr < currentMonthStr;

  const monthNames: string[] = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const monthLabel: string = `${
    monthNames[targetMonth.getMonth()]
  } ${targetMonth.getFullYear()}`;

  const fetch = useCallback(() => {
    fetchMonthlyReport(monthStr);
  }, [fetchMonthlyReport, monthStr]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  // Fetch category data when viewMode switches
  useEffect(() => {
    if (viewMode === 'category') {
      const year = targetMonth.getFullYear();
      const month = targetMonth.getMonth() + 1;
      const daysInMonth = new Date(year, month, 0).getDate();
      const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
      const endStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
      window.electronAPI.data.getCategorizedReport(startStr, endStr).then((res) => {
        if (res.success && res.data) {
          setCategoryData(res.data);
        }
      });
    }
  }, [viewMode, monthStr]);

  /* Aggregate from weekly totals */
  const totalSeconds: number =
    monthlyReport?.weekly_totals?.reduce((s, w) => s + w.total_seconds, 0) ?? 0;
  const daysInMonth: number = new Date(
    targetMonth.getFullYear(),
    targetMonth.getMonth() + 1,
    0
  ).getDate();
  const dailyAvg: number =
    daysInMonth > 0 ? Math.round(totalSeconds / daysInMonth) : 0;
  const activeWeeks: number =
    monthlyReport?.weekly_totals?.filter((w) => w.total_seconds > 0).length ?? 0;

  /* Weekly bar chart */
  const weeklyChartData =
    monthlyReport?.weekly_totals?.map((w, i) => ({
      label: `W${i + 1}`,
      value: w.total_seconds,
    })) ?? [];

  /* App distribution */
  const appDist = monthlyReport?.app_distribution ?? [];

  /* Trend vs previous month */
  const diffPercent: number =
    monthlyReport?.previous_month_comparison?.diff_percent ?? 0;

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

  if (monthlyLoading && !monthlyReport) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
          {t('monthly.title')}
        </Typography>
        <Skeleton variant="rounded" height={400} />
      </Box>
    );
  }

  if (monthlyError) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
          {t('monthly.title')}
        </Typography>
        <Alert severity="error">{monthlyError}</Alert>
      </Box>
    );
  }

  const isEmpty: boolean = totalSeconds === 0;

  return (
    <Box sx={{ p: 3, pb: 6 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
        {t('monthly.title')}
      </Typography>

      {/* Month selector */}
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
          onClick={() => setMonthOffset((o) => o - 1)}
        >
          <ChevronLeftIcon />
        </IconButton>
        <Typography variant="subtitle1" fontWeight={600}>
          {monthLabel}
        </Typography>
        <IconButton
          size="small"
          onClick={() => canGoNext && setMonthOffset((o) => o + 1)}
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
            {diffPercent > 0 ? '↑' : '↓'} {Math.abs(diffPercent)}% {t('monthly.vsLastMonth')}
          </Typography>
        )}
      </Box>

      {isEmpty ? (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <Typography variant="h6" gutterBottom>
            {t('monthly.noData')}
          </Typography>
          <Typography variant="body2">
            {t('monthly.noDataHint')}
          </Typography>
        </Box>
      ) : (
        <>
          {/* Summary cards */}
          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            <DurationCard
              title={t('monthly.monthTotal')}
              value={formatDuration(totalSeconds)}
              subtitle={monthLabel}
              color="#6366F1"
            />
            <DurationCard
              title={t('monthly.dailyAverage')}
              value={formatDuration(dailyAvg)}
              subtitle={`${daysInMonth} ${t('monthly.days')}`}
              color="#8B5CF6"
            />
            <DurationCard
              title={t('monthly.activeWeeks')}
              value={`${activeWeeks}/${
                monthlyReport?.weekly_totals?.length ?? 4
              }`}
              subtitle={t('monthly.weeksWithActivity')}
              color="#22C55E"
            />
          </Box>

          {/* Weekly bar chart */}
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
              data={weeklyChartData}
              type="bar"
              height={200}
              title={t('monthly.weeklyBreakdown')}
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
                {t('monthly.view')}
              </Typography>
              <ToggleButtonGroup
                size="small"
                value={viewMode}
                exclusive
                onChange={(_e, v) => v && setViewMode(v)}
              >
                <ToggleButton value="app">{t('monthly.byApp')}</ToggleButton>
                <ToggleButton value="category">{t('monthly.byCategory')}</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            {viewMode === 'app' ? (
              <AppUsageList
                apps={appDist}
                title={t('monthly.topAppsThisMonth')}
                emptyMessage={t('monthly.noAppData')}
              />
            ) : (
              <AppUsageList
                apps={categoryListItems}
                title={t('monthly.byCategory')}
                emptyMessage={t('monthly.byCategoryEmpty')}
              />
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
