import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Typography, Button, MobileStepper, Paper } from '@mui/material';
import { Clock, Shield, Play } from 'lucide-react';
import { useThemeMode } from '../contexts/ThemeContext';

interface OnboardingWizardProps {
  onComplete: () => void;
}

const STEPS = 3;

const stepConfig = [
  { icon: Clock, titleKey: 'onboarding.step1Title', bodyKey: 'onboarding.step1Body' },
  { icon: Shield, titleKey: 'onboarding.step2Title', bodyKey: 'onboarding.step2Body' },
  { icon: Play, titleKey: 'onboarding.step3Title', bodyKey: 'onboarding.step3Body' },
] as const;

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { t } = useTranslation();
  const { resolvedMode } = useThemeMode();
  const isDark = resolvedMode === 'dark';
  const [activeStep, setActiveStep] = useState(0);

  const current = stepConfig[activeStep];
  const Icon = current.icon;

  const handleNext = () => {
    if (activeStep === STEPS - 1) {
      onComplete();
    } else {
      setActiveStep((s) => s + 1);
    }
  };

  const handleBack = () => setActiveStep((s) => s - 1);

  const handleSkip = () => {
    // Skip: jump directly to the completion step (Step 3)
    setActiveStep(STEPS - 1);
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: isDark ? '#0F172A' : '#FAFAFA',
      }}
    >
      <Paper
        elevation={3}
        sx={{
          width: 480,
          maxWidth: '90vw',
          borderRadius: 4,
          p: 4,
          bgcolor: isDark ? '#1E293B' : '#FFFFFF',
        }}
      >
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Icon size={48} color={isDark ? '#818CF8' : '#6366F1'} />
        </Box>
        <Typography variant="h5" fontWeight={700} textAlign="center" gutterBottom>
          {t(current.titleKey)}
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          textAlign="center"
          sx={{ mb: 4, lineHeight: 1.8 }}
        >
          {t(current.bodyKey)}
        </Typography>

        <MobileStepper
          variant="dots"
          steps={STEPS}
          position="static"
          activeStep={activeStep}
          sx={{ bgcolor: 'transparent', px: 0 }}
          nextButton={
            <Button size="small" onClick={handleNext} variant="contained">
              {activeStep === STEPS - 1 ? t('onboarding.start') : t('onboarding.next')}
            </Button>
          }
          backButton={
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button size="small" onClick={handleBack} disabled={activeStep === 0}>
                {t('onboarding.back')}
              </Button>
              {activeStep < STEPS - 1 && (
                <Button size="small" onClick={handleSkip} color="inherit">
                  {t('onboarding.skip')}
                </Button>
              )}
            </Box>
          }
        />
      </Paper>
    </Box>
  );
}
