import { Card, CardContent, Typography, Box } from '@mui/material';

interface DurationCardProps {
  title: string;
  value: string;
  subtitle?: string;
  color?: string;
}

export default function DurationCard({
  title,
  value,
  subtitle,
  color = '#6366F1',
}: DurationCardProps) {
  return (
    <Card sx={{ flex: 1, minWidth: 0 }}>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Typography
          variant="caption"
          color="text.secondary"
          fontWeight={500}
          textTransform="uppercase"
          letterSpacing={0.5}
        >
          {title}
        </Typography>
        <Box sx={{ mt: 1 }}>
          <Typography variant="h4" fontWeight={700} color={color}>
            {value}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
