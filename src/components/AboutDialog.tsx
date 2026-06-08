import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box, Chip, Divider,
} from '@mui/material';
import {
  MonitorHeart as AppIcon,
  Code as CodeIcon,
  Palette as DesignIcon,
  Storage as DataIcon,
} from '@mui/icons-material';

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

const TECH_STACK = [
  { label: 'Electron', icon: <CodeIcon fontSize="small" />, color: '#47848F' },
  { label: 'React 19', icon: <CodeIcon fontSize="small" />, color: '#61DAFB' },
  { label: 'TypeScript', icon: <CodeIcon fontSize="small" />, color: '#3178C6' },
  { label: 'MUI 6', icon: <DesignIcon fontSize="small" />, color: '#007FFF' },
  { label: 'Tailwind CSS', icon: <DesignIcon fontSize="small" />, color: '#06B6D4' },
  { label: 'SQLite', icon: <DataIcon fontSize="small" />, color: '#003B57' },
  { label: 'Recharts', icon: <DataIcon fontSize="small" />, color: '#FF6384' },
];

export default function AboutDialog({ open, onClose }: AboutDialogProps) {
  const [version, setVersion] = useState('1.0.0');
  const { t } = useTranslation();

  useEffect(() => {
    if (open && window.electronAPI?.app?.getVersion) {
      window.electronAPI.app.getVersion().then(setVersion).catch(() => {});
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ textAlign: 'center', pt: 4 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <AppIcon sx={{ fontSize: 48, color: 'primary.main' }} />
          <Typography variant="h6" fontWeight={700}>
            {t('about.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('about.version', { version })}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 2 }}>
          {t('about.description')}
        </Typography>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          {t('about.builtWith')}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8 }}>
          {TECH_STACK.map((tech) => (
            <Chip
              key={tech.label}
              icon={tech.icon}
              label={tech.label}
              size="small"
              variant="outlined"
              sx={{
                borderColor: tech.color,
                color: tech.color,
                '& .MuiChip-icon': { color: tech.color },
              }}
            />
          ))}
        </Box>

        <Divider sx={{ my: 2 }} />

        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', textAlign: 'center' }}>
          Copyright &copy; {new Date().getFullYear()} Screen Time Monitor Team
        </Typography>
      </DialogContent>

      <DialogActions sx={{ justifyContent: 'center', pb: 3 }}>
        <Button onClick={onClose} variant="contained" sx={{ minWidth: 120 }}>
          {t('about.ok')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
