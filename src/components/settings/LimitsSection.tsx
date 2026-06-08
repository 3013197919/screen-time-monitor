import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, IconButton, List, ListItem, ListItemText, ListItemSecondaryAction, Divider,
} from '@mui/material';
import { Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import { useSettingsStore } from '../../store/settingsStore';

interface Props {
  title?: string;
}

export default function LimitsSection({ title }: Props) {
  const { limits, setLimit, deleteLimit } = useSettingsStore();
  const { t } = useTranslation();
  const sectionTitle = title || t('settings.appLimits');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newAppName, setNewAppName] = useState('');
  const [newLimitH, setNewLimitH] = useState(1);
  const [newLimitM, setNewLimitM] = useState(0);

  const handleAdd = async () => {
    if (!newAppName.trim()) return;
    const totalMin = newLimitH * 60 + newLimitM;
    if (totalMin <= 0) return;
    await setLimit(newAppName.trim(), totalMin);
    setNewAppName('');
    setNewLimitH(1);
    setNewLimitM(0);
    setDialogOpen(false);
  };

  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>{sectionTitle}</Typography>
      <Divider sx={{ mb: 2 }} />

      {limits.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('settings.noLimits')}
        </Typography>
      ) : (
        <List disablePadding>
          {limits.map((limit) => (
            <ListItem key={limit.id} sx={{ borderRadius: 1, bgcolor: 'action.hover', mb: 1 }}>
              <ListItemText primary={limit.app_name} secondary={`${limit.limit_minutes} min/day`} />
              <ListItemSecondaryAction>
                <IconButton edge="end" size="small" onClick={() => deleteLimit(limit.id)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      )}

      <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)} sx={{ mt: 1 }}>
        {t('settings.addLimit')}
      </Button>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('settings.addLimitTitle')}</DialogTitle>
        <DialogContent>
          <TextField autoFocus label={t('settings.appName')} fullWidth value={newAppName}
            onChange={(e) => setNewAppName(e.target.value)} sx={{ mt: 1, mb: 2 }} placeholder={t('settings.appNamePlaceholder')} />
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <TextField label={t('settings.hours')} type="number" value={newLimitH}
              onChange={(e) => setNewLimitH(Math.max(0, parseInt(e.target.value) || 0))}
              inputProps={{ min: 0, max: 24 }} sx={{ width: 100 }} />
            <TextField label={t('settings.minutes')} type="number" value={newLimitM}
              onChange={(e) => setNewLimitM(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
              inputProps={{ min: 0, max: 59 }} sx={{ width: 100 }} />
            <Typography variant="body2" color="text.secondary">{t('settings.perDay')}</Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t('settings.cancel')}</Button>
          <Button variant="contained" onClick={handleAdd} disabled={!newAppName.trim()}>{t('settings.add')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
