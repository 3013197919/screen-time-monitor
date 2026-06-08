import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Chip,
  Skeleton,
  Alert,
  Button,
} from '@mui/material';
import {
  Search as SearchIcon,
} from '@mui/icons-material';
import DurationCard from '../components/DurationCard';
import AppUsageList from '../components/AppUsageList';
import TimeChart from '../components/TimeChart';
import { formatDuration, formatShortDate } from '../utils/format';
import type { CustomRangeReport, DailyTrendItem, AppUsageItem } from '../types/models';

/** Quick date range presets. */
const PRESETS: { label: string; getRange: () => { start: string; end: string } }[] = [
  {
    label: 'Today',
    getRange: () => {
      const d = new Date().toISOString().slice(0, 10);
      return { start: d, end: d };
    },
  },
  {
    label: 'This Week',
    getRange: () => {
      const now = new Date();
      const day = now.getDay();
      const mondayDiff = day === 0 ? -6 : 1 - day;
      const monday = new Date(now);
      monday.setUTCDate(monday.getUTCDate() + mondayDiff);
      return {
        start: monday.toISOString().slice(0, 10),
        end: now.toISOString().slice(0, 10),
      };
    },
  },
  {
    label: 'Last Week',
    getRange: () => {
      const now = new Date();
      const day = now.getDay();
      const mondayDiff = day === 0 ? -6 : 1 - day;
      const lastMonday = new Date(now);
      lastMonday.setUTCDate(lastMonday.getUTCDate() + mondayDiff - 7);
      const lastSunday = new Date(lastMonday);
      lastSunday.setUTCDate(lastSunday.getUTCDate() + 6);
      return {
        start: lastMonday.toISOString().slice(0, 10),
        end: lastSunday.toISOString().slice(0, 10),
      };
    },
  },
  {
    label: 'This Month',
    getRange: () => {
      const now = new Date();
      const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      return { start, end: now.toISOString().slice(0, 10) };
    },
  },
  {
    label: 'Last 7 Days',
    getRange: () => {
      const end = new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    },
  },
  {
    label: 'Last 30 Days',
    getRange: () => {
      const end = new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - 29);
      return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    },
  },
];

export default function CustomRangePage() {
  const { t } = useTranslation();
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [activePreset, setActivePreset] = useState('Last 7 Days');

  const [report, setReport] = useState<CustomRangeReport | null>(null);
  const [trend, setTrend] = useState<DailyTrendItem[]>([]);
  const [ranking, setRanking] = useState<AppUsageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasQueried, setHasQueried] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [reportRes, trendRes, rankingRes] = await Promise.all([
        window.electronAPI.data.getCustomRangeReport({ startDate, endDate }),
        window.electronAPI.data.getCustomRangeTrend({ startDate, endDate }),
        window.electronAPI.data.getCustomRangeRanking({ startDate, endDate, limit: 10 }),
      ]);

      if (reportRes.success && reportRes.data) setReport(reportRes.data);
      else if (!reportRes.success) setError(reportRes.error ?? 'Failed to fetch report');

      if (trendRes.success && trendRes.data) setTrend(trendRes.data);
      if (rankingRes.success && rankingRes.data) setRanking(rankingRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }

    setLoading(false);
    setHasQueried(true);
  }, [startDate, endDate]);

  // Fetch on date change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePreset = (label: string) => {
    const preset = PRESETS.find((p) => p.label === label);
    if (!preset) return;
    const range = preset.getRange();
    setStartDate(range.start);
    setEndDate(range.end);
    setActivePreset(label);
  };

  /* Trend chart data */
  const trendData: { label: string; value: number }[] = trend.map((t) => ({
    label: formatShortDate(t.date),
    value: t.total_seconds,
  }));

  const isEmpty: boolean = hasQueried && (report?.total_seconds ?? 0) === 0 && !loading;

  return (
    <Box sx={{ p: 3, pb: 6 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
        {t('custom.title')}
      </Typography>

      {/* Date range controls */}
      <Box sx={{ mb: 3 }}>
        {/* Quick presets */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          {PRESETS.map((preset) => (
            <Chip
              key={preset.label}
              label={preset.label}
              size="small"
              variant={activePreset === preset.label ? 'filled' : 'outlined'}
              color={activePreset === preset.label ? 'primary' : 'default'}
              onClick={() => handlePreset(preset.label)}
            />
          ))}
        </Box>

        {/* Date inputs */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t('custom.from')}
            </Typography>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setActivePreset('');
              }}
              style={{
                padding: '6px 8px',
                borderRadius: 6,
                border: '1px solid',
                borderColor: 'rgba(128,128,128,0.3)',
                fontSize: '0.875rem',
                fontFamily: 'inherit',
                background: 'transparent',
                color: 'inherit',
              }}
            />
          </Box>
          <Typography variant="body2" color="text.secondary">
            {t('custom.to')}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t('custom.to')}:
            </Typography>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setActivePreset('');
              }}
              max={new Date().toISOString().slice(0, 10)}
              style={{
                padding: '6px 8px',
                borderRadius: 6,
                border: '1px solid',
                borderColor: 'rgba(128,128,128,0.3)',
                fontSize: '0.875rem',
                fontFamily: 'inherit',
                background: 'transparent',
                color: 'inherit',
              }}
            />
          </Box>
          <Button
            variant="outlined"
            size="small"
            startIcon={<SearchIcon />}
            onClick={fetchData}
            disabled={loading}
          >
            {t('custom.query')}
          </Button>
        </Box>
      </Box>

      {/* Loading state */}
      {loading && !hasQueried && (
        <Box>
          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} variant="rounded" width="25%" height={100} />
            ))}
          </Box>
          <Skeleton variant="rounded" height={300} />
        </Box>
      )}

      {/* Error state */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      {/* Empty state */}
      {isEmpty && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <Typography variant="h6" gutterBottom>
            {t('custom.noData')}
          </Typography>
          <Typography variant="body2">
            {t('custom.noDataHint')}
          </Typography>
        </Box>
      )}

      {/* Data display */}
      {!isEmpty && hasQueried && (
        <>
          {/* Summary cards */}
          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            <DurationCard
              title={t('custom.totalTime')}
              value={report?.formatted_total ?? '0s'}
              subtitle={`${startDate} – ${endDate}`}
              color="#6366F1"
            />
            <DurationCard
              title={t('custom.dailyAverage')}
              value={report?.formatted_daily_average ?? '0s'}
              subtitle={`${report?.active_days ?? 0} ${t('custom.daysWithActivity')}`}
              color="#8B5CF6"
            />
            <DurationCard
              title={t('custom.activeDays')}
              value={String(report?.active_days ?? 0)}
              subtitle={t('custom.daysWithActivity')}
              color="#22C55E"
            />
            <DurationCard
              title={t('custom.topApp')}
              value={report?.top_app_name ?? '--'}
              subtitle={report?.top_app_duration ? formatDuration(report.top_app_duration) : ''}
              color="#F97316"
            />
          </Box>

          {/* Trend chart */}
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
              data={trendData}
              type="bar"
              height={200}
              title={t('custom.dailyTrend')}
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
            <AppUsageList
              apps={ranking}
              title={t('custom.topApps')}
              emptyMessage={t('custom.noAppData')}
            />
          </Box>
        </>
      )}
    </Box>
  );
}
