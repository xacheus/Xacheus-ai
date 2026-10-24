import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070B14',
          900: '#0B1220',
          800: '#131C2E',
          700: '#1D2942',
          600: '#2A3A57',
          500: '#405274',
        },
        brand: {
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
        surface: '#FFFFFF',
        canvas: '#F6F7FB',
        line: '#E4E7EF',
        muted: '#5B6478',
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'Noto Sans',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11, 18, 32, 0.04), 0 8px 24px -16px rgba(11, 18, 32, 0.18)',
        lift: '0 2px 4px rgba(11, 18, 32, 0.05), 0 18px 40px -24px rgba(11, 18, 32, 0.35)',
        focus: '0 0 0 3px rgba(99, 102, 241, 0.28)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseRing: {
          '0%': { transform: 'scale(0.92)', opacity: '0.7' },
          '70%': { transform: 'scale(1.35)', opacity: '0' },
          '100%': { transform: 'scale(1.35)', opacity: '0' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s linear infinite',
        pulseRing: 'pulseRing 1.6s ease-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
