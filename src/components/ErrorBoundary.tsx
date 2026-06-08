import { Component, type ReactNode } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { ErrorOutline as ErrorIcon } from '@mui/icons-material';
import type { i18n } from 'i18next';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary with i18n support via dependency injection.
 * Since this is a class component, it can't use hooks directly.
 * It reads from the global i18n instance via a static property.
 */
export default class ErrorBoundary extends Component<Props, State> {
  static i18nInstance: i18n | null = null;

  static setI18n(instance: i18n): void {
    ErrorBoundary.i18nInstance = instance;
  }

  private t(key: string): string {
    if (ErrorBoundary.i18nInstance) {
      return ErrorBoundary.i18nInstance.t(key);
    }
    // Fallback English text
    const fallbacks: Record<string, string> = {
      'error.title': 'Something went wrong',
      'error.defaultMessage': 'An unexpected error occurred while rendering this page.',
      'error.retry': 'Retry',
      'error.reload': 'Reload App',
    };
    return fallbacks[key] || key;
  }
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: 300,
            p: 4,
            textAlign: 'center',
            gap: 2,
          }}
        >
          <ErrorIcon sx={{ fontSize: 48, color: 'error.main', opacity: 0.7 }} />
          <Typography variant="h6" fontWeight={600}>
            {this.t('error.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400 }}>
            {this.state.error?.message ?? this.t('error.defaultMessage')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
            <Button variant="outlined" size="small" onClick={this.handleRetry}>
              {this.t('error.retry')}
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={() => window.location.reload()}
            >
              {this.t('error.reload')}
            </Button>
          </Box>
        </Box>
      );
    }

    return this.props.children;
  }
}
