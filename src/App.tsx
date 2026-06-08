import { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createTheme,
  ThemeProvider,
  CssBaseline,
  Box,
  Typography,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Today as TodayIcon,
  DateRange as WeekIcon,
  CalendarMonth as MonthIcon,
  CalendarViewWeek as CustomIcon,
  Settings as SettingsIcon,
  ChevronLeft as CollapseIcon,
  ChevronRight as ExpandIcon,
  Keyboard as KbIcon,
} from '@mui/icons-material';
import { HashRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import TodayPage from './pages/TodayPage';
import WeeklyPage from './pages/WeeklyPage';
import MonthlyPage from './pages/MonthlyPage';
import CustomRangePage from './pages/CustomRangePage';
import SettingsPage from './pages/SettingsPage';
import StatusBar from './components/StatusBar';
import ErrorBoundary from './components/ErrorBoundary';
import AboutDialog from './components/AboutDialog';
import OnboardingWizard from './components/OnboardingWizard';
import { useTrackerStore } from './store/trackerStore';
import { useSettingsStore } from './store/settingsStore';
import { ThemeContextProvider, useThemeMode, type ResolvedMode } from './contexts/ThemeContext';
import { useReminder } from './hooks/useReminder';

const DRAWER_EXPANDED = 240;
const DRAWER_COLLAPSED = 56;

function createAppTheme(mode: ResolvedMode) {
  const isDark: boolean = mode === 'dark';
  return createTheme({
    palette: {
      mode,
      primary: { main: '#6366F1', light: '#818CF8', dark: '#4F46E5' },
      secondary: { main: '#EC4899' },
      background: isDark
        ? { default: '#0F172A', paper: '#1E293B' }
        : { default: '#FAFAFA', paper: '#FFFFFF' },
    },
    typography: {
      fontFamily: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'].join(','),
      h4: { fontWeight: 700 }, h5: { fontWeight: 600 }, h6: { fontWeight: 600 },
    },
    shape: { borderRadius: 12 },
    components: {
      MuiCssBaseline: {
        styleOverrides: isDark
          ? {
              '::-webkit-scrollbar': {
                width: 8,
                height: 8,
              },
              '::-webkit-scrollbar-track': {
                background: 'transparent',
              },
              '::-webkit-scrollbar-thumb': {
                background: '#334155',
                borderRadius: 4,
                '&:hover': {
                  background: '#475569',
                },
              },
            }
          : {},
      },
      MuiDrawer: {
        styleOverrides: {
          paper: isDark
            ? {
                borderRight: '1px solid #1E293B',
              }
            : {},
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            boxShadow: isDark
              ? '0 1px 3px 0 rgb(0 0 0 / 0.4)'
              : '0 1px 3px 0 rgb(0 0 0 / 0.1)',
            borderRadius: 12,
          },
        },
      },
      MuiButton: {
        styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } },
      },
    },
  });
}

function Sidebar({
  collapsed,
  onToggle,
  onOpenAbout,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onOpenAbout: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const width = collapsed ? DRAWER_COLLAPSED : DRAWER_EXPANDED;
  const [appVersion, setAppVersion] = useState('1.0.0');

  const NAV_ITEMS = [
    { label: t('nav.today'), path: '/', icon: <TodayIcon /> },
    { label: t('nav.weekly'), path: '/weekly', icon: <WeekIcon /> },
    { label: t('nav.monthly'), path: '/monthly', icon: <MonthIcon /> },
    { label: t('nav.custom'), path: '/custom', icon: <CustomIcon /> },
    { label: t('nav.settings'), path: '/settings', icon: <SettingsIcon /> },
  ];

  useEffect(() => {
    if (window.electronAPI?.app?.getVersion) {
      window.electronAPI.app.getVersion().then((v) => setAppVersion(v)).catch(() => {});
    }
  }, []);

  return (
    <Drawer
      variant="permanent"
      sx={{
        width,
        flexShrink: 0,
        transition: 'width 0.2s ease',
        '& .MuiDrawer-paper': {
          width,
          boxSizing: 'border-box',
          borderRight: '1px solid',
          borderColor: 'divider',
          transition: 'width 0.2s ease',
          overflowX: 'hidden',
        },
      }}
    >
      <Box sx={{ px: collapsed ? 1 : 3, pt: 3, pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        {!collapsed && (
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" fontWeight={700} color="primary.main" fontSize="1rem">
              {t('app.title')}
            </Typography>
            <Typography variant="caption" color="text.secondary">{t('app.subtitle')}</Typography>
          </Box>
        )}
        <IconButton size="small" onClick={onToggle} sx={{ flexShrink: 0 }}>
          {collapsed ? <ExpandIcon fontSize="small" /> : <CollapseIcon fontSize="small" />}
        </IconButton>
      </Box>

      <List sx={{ px: collapsed ? 0.5 : 1.5, mt: 1 }}>
        {NAV_ITEMS.map((item) => (
          <ListItemButton
            key={item.path}
            selected={location.pathname === item.path}
            onClick={() => navigate(item.path)}
            sx={{
              borderRadius: 1.5,
              mb: 0.5,
              justifyContent: collapsed ? 'center' : 'flex-start',
              px: collapsed ? 1 : 2,
              '&.Mui-selected': {
                bgcolor: 'primary.main',
                color: '#fff',
                '&:hover': { bgcolor: 'primary.dark' },
                '& .MuiListItemIcon-root': { color: '#fff' },
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: collapsed ? 0 : 36 }}>{item.icon}</ListItemIcon>
            {!collapsed && (
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{ fontWeight: 500, fontSize: '0.875rem' }}
              />
            )}
          </ListItemButton>
        ))}
      </List>

      <Box sx={{ flex: 1 }} />
      <Box sx={{ px: collapsed ? 0.5 : 3, py: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {!collapsed && (
          <Tooltip title="Keyboard Shortcuts" placement="right">
            <Box sx={{ px: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <KbIcon fontSize="small" sx={{ color: 'text.disabled', fontSize: 14 }} />
              <Typography variant="caption" color="text.disabled">
                Ctrl+Shift+P {useTrackerStore.getState().status.is_paused ? t('today.resume') : t('today.pause')}
              </Typography>
            </Box>
          </Tooltip>
        )}
        <Box
          onClick={onOpenAbout}
          sx={{
            cursor: 'pointer',
            px: collapsed ? 0 : 2,
            py: 0.5,
            borderRadius: 1,
            textAlign: collapsed ? 'center' : 'left',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <Typography variant="caption" color="text.disabled">
            {collapsed ? '?' : `v${appVersion}`}
          </Typography>
        </Box>
      </Box>
    </Drawer>
  );
}

function AppContent() {
  const fetchTodaySummary = useTrackerStore((s) => s.fetchTodaySummary);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const drawerWidth = sidebarCollapsed ? DRAWER_COLLAPSED : DRAWER_EXPANDED;

  // v4 E-04: Mount reminder hook for pomodoro + sedentary notifications
  useReminder();

  useEffect(() => {
    fetchTodaySummary();
    loadSettings();
  }, [fetchTodaySummary, loadSettings]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'P') {
      e.preventDefault();
      const { pauseTracker, resumeTracker, status } = useTrackerStore.getState();
      if (status.is_paused) {
        resumeTracker();
      } else if (status.is_tracking) {
        pauseTracker();
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        onOpenAbout={() => setAboutOpen(true)}
      />
      <Box
        component="main"
        sx={{
          flex: 1,
          bgcolor: 'background.default',
          ml: `${drawerWidth}px`,
          pb: '40px',
          transition: 'margin-left 0.2s ease',
        }}
      >
        <AnimatedRoutes />
      </Box>
      <StatusBar sidebarCollapsed={sidebarCollapsed} />
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </Box>
  );
}

function ThemedApp() {
  const { resolvedMode } = useThemeMode();
  const theme = useMemo(() => createAppTheme(resolvedMode), [resolvedMode]);

  // v4 E-01: First-run onboarding check
  const [onboardingDone, setOnboardingDone] = useState(() => {
    return localStorage.getItem('onboarding_completed') === 'true';
  });

  const handleOnboardingComplete = useCallback(() => {
    localStorage.setItem('onboarding_completed', 'true');
    setOnboardingDone(true);
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <HashRouter>
          {!onboardingDone ? (
            <OnboardingWizard onComplete={handleOnboardingComplete} />
          ) : (
            <AppContent />
          )}
        </HashRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  const nodeRef = useRef<HTMLDivElement>(null);
  const [displayLocation, setDisplayLocation] = useState(location);
  const [transitionStage, setTransitionStage] = useState<'fadeIn' | 'fadeOut'>('fadeIn');

  useEffect(() => {
    if (location.pathname !== displayLocation.pathname) {
      setTransitionStage('fadeOut');
    }
  }, [location, displayLocation]);

  const handleAnimationEnd = useCallback(() => {
    if (transitionStage === 'fadeOut') {
      setTransitionStage('fadeIn');
      setDisplayLocation(location);
    }
  }, [transitionStage, location]);

  return (
    <Box
      ref={nodeRef}
      onAnimationEnd={handleAnimationEnd}
      sx={{
        animation: transitionStage === 'fadeIn'
          ? 'pageFadeIn 0.25s ease-out forwards'
          : 'pageFadeOut 0.15s ease-in forwards',
        '@keyframes pageFadeIn': {
          '0%': { opacity: 0, transform: 'translateY(8px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        '@keyframes pageFadeOut': {
          '0%': { opacity: 1, transform: 'translateY(0)' },
          '100%': { opacity: 0, transform: 'translateY(-8px)' },
        },
      }}
    >
      <div style={{ display: transitionStage === 'fadeIn' ? 'block' : 'none' }}>
        <Routes location={displayLocation}>
          <Route path="/" element={<ErrorBoundary><TodayPage /></ErrorBoundary>} />
          <Route path="/weekly" element={<ErrorBoundary><WeeklyPage /></ErrorBoundary>} />
          <Route path="/monthly" element={<ErrorBoundary><MonthlyPage /></ErrorBoundary>} />
          <Route path="/custom" element={<ErrorBoundary><CustomRangePage /></ErrorBoundary>} />
          <Route path="/settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
        </Routes>
      </div>
    </Box>
  );
}

export default function App() {
  return (
    <ThemeContextProvider>
      <ThemedApp />
    </ThemeContextProvider>
  );
}
