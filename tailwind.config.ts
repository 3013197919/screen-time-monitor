import type { Config } from 'tailwindcss';

/**
 * Tailwind CSS v4 configuration.
 *
 * Note: With Tailwind CSS v4 and the @tailwindcss/vite plugin,
 * most configuration is done via CSS `@theme` directives in index.css.
 * This file is kept for IDE integration and tooling compatibility.
 */
const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#6366F1',
          50: '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
        },
        accent: {
          DEFAULT: '#EC4899',
          500: '#EC4899',
          600: '#DB2777',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          dark: '#1E1E2E',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
