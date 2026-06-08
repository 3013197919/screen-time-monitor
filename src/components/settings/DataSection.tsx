import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Divider, Alert,
} from '@mui/material';
import { Download as DownloadIcon, DeleteForever as ClearIcon } from '@mui/icons-material';

interface Props {
  title?: string;
}

export default function DataSection({ title }: Props) {
  const { t } = useTranslation();
  const sectionTitle = title || t('settings.dataManagement');
  const [dataRetention, setDataRetention] = useState(30);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const handleExportCSV = async () => {
    const now = new Date();
    const end = now.toISOString().slice(0, 10);
    const start = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    try {
      const res = await window.electronAPI.export.csv(start, end);
      if (res.success && res.data) setExportMsg(`CSV saved to ${res.data}`);
      else if (res.success) setExportMsg('Export cancelled.');
      else setExportMsg(`Export failed: ${res.error}`);
    } catch (err) {
      setExportMsg(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
    setTimeout(() => setExportMsg(null), 5000);
  };

  const handleExportPDF = async () => {
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF();
      const today = new Date().toISOString().slice(0, 10);
      const res = await window.electronAPI.data.getWeeklyReport();
      if (!res.success || !res.data) {
        setExportMsg('Failed to fetch report data.');
        setTimeout(() => setExportMsg(null), 4000);
        return;
      }
      const report = res.data;
      const totalSec = report.daily_totals?.reduce((s: number, d: { total_seconds: number }) => s + d.total_seconds, 0) ?? 0;
      const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60);
      doc.setFontSize(18); doc.text('Screen Time Report', 20, 25);
      doc.setFontSize(11); doc.setTextColor(100); doc.text(`Generated: ${today}`, 20, 35); doc.text(`Week total: ${h}h ${m}m`, 20, 42);
      doc.setFontSize(13); doc.setTextColor(0); doc.text('Top Applications', 20, 55); doc.setFontSize(10);
      (report.app_distribution || []).slice(0, 10).forEach((app: any, i: number) => {
        doc.text(`${i + 1}. ${app.app_name}`, 25, 65 + i * 8);
        doc.text(`${app.formattedDuration}`, 120, 65 + i * 8);
      });
      const array = Array.from(doc.output('arraybuffer') as Uint8Array);
      const sRes = await window.electronAPI.export.saveFile(array, `screen-time-report-${today}.pdf`, [{ name: 'PDF', extensions: ['pdf'] }]);
      if (sRes.success && sRes.data) setExportMsg(`PDF saved to ${sRes.data}`);
      else if (sRes.success) setExportMsg('Export cancelled.');
      else setExportMsg(`PDF export failed: ${sRes.error}`);
    } catch (err) {
      setExportMsg(`PDF error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
    setTimeout(() => setExportMsg(null), 5000);
  };

  const confirmClear = async () => {
    try {
      const res = await window.electronAPI.cleanup.run(dataRetention);
      setExportMsg(res.success ? `Cleared ${res.data?.deleted ?? 0} records older than ${dataRetention} days.` : `Cleanup failed: ${res.error}`);
    } catch (err) {
      setExportMsg(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
    setClearDialogOpen(false);
    setTimeout(() => setExportMsg(null), 5000);
  };

  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>{sectionTitle}</Typography>
      <Divider sx={{ mb: 2 }} />

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExportCSV}>{t('settings.exportCSV')}</Button>
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExportPDF}>{t('settings.exportPDF')}</Button>
        <Button variant="outlined" color="error" startIcon={<ClearIcon />} onClick={() => setClearDialogOpen(true)}>
          {t('settings.clearHistory', { days: dataRetention })}
        </Button>
      </Box>

      <Box sx={{ mt: 2, maxWidth: 160 }}>
        <TextField label={t('settings.dataRetention')} type="number" size="small" value={dataRetention}
          onChange={(e) => {
            const v = Math.max(7, Math.min(365, parseInt(e.target.value) || 30));
            setDataRetention(v);
            window.electronAPI.settings.set('data_retention', String(v));
          }}
          inputProps={{ min: 7, max: 365 }} helperText={t('settings.retentionHelper', { days: dataRetention })} />
      </Box>

      {exportMsg && <Alert severity="info" sx={{ mt: 2 }}>{exportMsg}</Alert>}

      <Dialog open={clearDialogOpen} onClose={() => setClearDialogOpen(false)}>
        <DialogTitle>{t('settings.clearHistory', { days: dataRetention })}</DialogTitle>
        <DialogContent><Typography variant="body2">{t('settings.retentionHelper', { days: dataRetention })}</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDialogOpen(false)}>{t('settings.cancel')}</Button>
          <Button variant="contained" color="error" onClick={confirmClear}>{t('settings.clearHistory', { days: dataRetention })}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
