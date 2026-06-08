import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, IconButton, List, ListItem, ListItemText, Select, MenuItem,
  FormControl, InputLabel, Chip, Divider,
} from '@mui/material';
import { Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import type { AppCategoryRow } from '../../types/models';

const CATEGORY_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'work', label: 'Work', color: '#6366F1' },
  { value: 'study', label: 'Study', color: '#22C55E' },
  { value: 'entertainment', label: 'Entertainment', color: '#F59E0B' },
  { value: 'other', label: 'Other', color: '#9CA3AF' },
];

interface Props {
  title?: string;
}

export default function CategoriesSection({ title }: Props) {
  const { t } = useTranslation();
  const sectionTitle = title || t('settings.appCategories');
  const [categories, setCategories] = useState<AppCategoryRow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [appName, setAppName] = useState('');
  const [category, setCategory] = useState('work');

  useEffect(() => { loadCategories(); }, []);

  const loadCategories = async () => {
    try {
      const res = await window.electronAPI.categories.getAll();
      if (res.success && res.data) setCategories(res.data);
    } catch { /* ignore */ }
  };

  const handleAdd = async () => {
    if (!appName.trim()) return;
    await window.electronAPI.categories.set(appName.trim(), category);
    setAppName('');
    setCategory('work');
    setDialogOpen(false);
    await loadCategories();
  };

  const handleDelete = async (id: number) => {
    await window.electronAPI.categories.delete(id);
    setCategories((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>{sectionTitle}</Typography>
      <Divider sx={{ mb: 2 }} />

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('settings.categoriesHelper')}
      </Typography>

      {categories.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('settings.noCategories')}
        </Typography>
      ) : (
        <List disablePadding>
          {categories.map((cat) => {
            const opt = CATEGORY_OPTIONS.find((o) => o.value === cat.category);
            return (
              <ListItem key={cat.id} sx={{ borderRadius: 1, bgcolor: 'action.hover', mb: 1 }}>
                <ListItemText primary={cat.app_name} />
                <Chip label={opt?.label ?? cat.category} size="small"
                  sx={{ bgcolor: (opt?.color ?? '#9CA3AF') + '20', color: opt?.color ?? '#9CA3AF', fontWeight: 600, mr: 1 }} />
                <IconButton size="small" onClick={() => handleDelete(cat.id)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </ListItem>
            );
          })}
        </List>
      )}

      <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)} sx={{ mt: 1 }}>
        {t('settings.addCategory')}
      </Button>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('settings.addCategoryTitle')}</DialogTitle>
        <DialogContent>
          <TextField autoFocus label={t('settings.appName')} fullWidth value={appName}
            onChange={(e) => setAppName(e.target.value)} sx={{ mt: 1, mb: 2 }} placeholder={t('settings.appNamePlaceholder')} />
          <FormControl fullWidth size="small">
            <InputLabel>{t('settings.category')}</InputLabel>
            <Select value={category} label={t('settings.category')} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORY_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t('settings.cancel')}</Button>
          <Button variant="contained" onClick={handleAdd} disabled={!appName.trim()}>{t('settings.save')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
