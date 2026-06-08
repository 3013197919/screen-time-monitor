import { Box, Typography, useTheme } from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { CHART_COLORS } from '../utils/constants';

interface ChartDatum {
  label: string;
  value: number;
}

interface TimeChartProps {
  data: ChartDatum[];
  type?: 'bar' | 'pie';
  height?: number;
  title?: string;
}

/**
 * Recharts-based chart component for bar and pie visualizations.
 *
 * Props interface is preserved from the original SVG implementation.
 * Uses recharts BarChart for bar type and PieChart for pie type.
 */
export default function TimeChart({
  data,
  type = 'bar',
  height = 200,
  title,
}: TimeChartProps) {
  const muiTheme = useTheme();
  const { t } = useTranslation();

  if (!data || data.length === 0) {
    return (
      <Box
        sx={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'text.secondary',
        }}
      >
        <Typography variant="body2">{t('chart.noData')}</Typography>
      </Box>
    );
  }

  if (type === 'pie') {
    return <PieChartView data={data} height={height} title={title} />;
  }

  /* Bar chart */
  const maxValue: number = Math.max(...data.map((d) => d.value), 1);

  return (
    <Box>
      {title && (
        <Typography
          variant="subtitle2"
          fontWeight={600}
          color="text.secondary"
          textTransform="uppercase"
          letterSpacing={0.5}
          sx={{ mb: 1 }}
        >
          {title}
        </Typography>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
        >
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: muiTheme.palette.text.secondary }}
            tickLine={false}
            axisLine={{ stroke: muiTheme.palette.divider }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: muiTheme.palette.text.secondary }}
            tickLine={false}
            axisLine={false}
            domain={[0, maxValue]}
            tickFormatter={(v: number) => Math.round(v).toString()}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: muiTheme.palette.background.paper,
              border: `1px solid ${muiTheme.palette.divider}`,
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number) => [Math.round(value), t('chart.seconds')]}
          />
          <Bar
            dataKey="value"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
            isAnimationActive={false}
          >
            {data.map((_entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

/** Recharts PieChart (donut) view. */
function PieChartView({
  data,
  height,
  title,
}: {
  data: ChartDatum[];
  height: number;
  title?: string;
}) {
  const muiTheme = useTheme();

  return (
    <Box>
      {title && (
        <Typography
          variant="subtitle2"
          fontWeight={600}
          color="text.secondary"
          textTransform="uppercase"
          letterSpacing={0.5}
          sx={{ mb: 1 }}
        >
          {title}
        </Typography>
      )}
      <ResponsiveContainer width="100%" height={height + 40}>
        <RechartsPieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={Math.min(height * 0.22, 50)}
            outerRadius={Math.min(height * 0.38, 80)}
            paddingAngle={2}
            isAnimationActive={false}
          >
            {data.slice(0, 10).map((_entry, index) => (
              <Cell
                key={`pie-cell-${index}`}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: muiTheme.palette.background.paper,
              border: `1px solid ${muiTheme.palette.divider}`,
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number) => [Math.round(value), t('chart.seconds')]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            iconType="circle"
            iconSize={8}
          />
        </RechartsPieChart>
      </ResponsiveContainer>
    </Box>
  );
}
