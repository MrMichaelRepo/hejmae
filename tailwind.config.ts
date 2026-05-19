import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Canvas + surfaces — the cream world
        bg:              '#eae8e0',
        'bg-elevated':   '#f3f1ea',
        surface:         '#fbfaf6',

        // Ink ramp
        ink:             '#1e2128',
        'ink-muted':     '#4a5068',
        'ink-subtle':    '#8a8e9c',

        // Hairlines
        line:            '#d8d4c6',
        'line-strong':   '#c5c0ae',

        // Single accent — terracotta / oxblood
        accent:          '#8b3a2e',
        'accent-hover':  '#732f25',
        'accent-soft':   '#e8d5c8',

        // Earthy status — never bright Tailwind defaults
        success:         '#5b6e4a',
        'success-soft':  '#dfe3d4',
        warn:            '#b8843e',
        'warn-soft':     '#f0e1c8',
        danger:          '#8a2e2e',
        'danger-soft':   '#ecd4d0',

        // Back-compat aliases — keep existing class names working
        'hm-text':       '#1e2128',
        'hm-nav':        '#4a5068',
      },
      fontFamily: {
        // Editorial display — DM Serif Text, only at 32px+
        serif:    ['var(--font-dm-serif-text)', 'Georgia', 'serif'],
        // Long-form / proposals only — never UI chrome
        garamond: ['var(--font-eb-garamond)', 'Georgia', 'Times New Roman', 'serif'],
        // UI chrome — Inter
        sans:     ['var(--font-inter)', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '12px',
      },
      boxShadow: {
        elev1: '0 1px 2px rgba(30,33,40,.04), 0 8px 24px -8px rgba(30,33,40,.08)',
        elev2: '0 2px 4px rgba(30,33,40,.06), 0 20px 40px -12px rgba(30,33,40,.12)',
        focus: '0 0 0 2px #eae8e0, 0 0 0 4px #8b3a2e',
      },
      transitionTimingFunction: {
        'out-soft': 'cubic-bezier(.2,.8,.2,1)',
      },
      transitionDuration: {
        150: '150ms',
        220: '220ms',
      },
      keyframes: {
        'sheet-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'drawer-in': {
          from: { transform: 'translateX(100%)' },
          to:   { transform: 'translateX(0)' },
        },
        'backdrop-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
      },
      animation: {
        'sheet-in':    'sheet-in 220ms cubic-bezier(.2,.8,.2,1)',
        'drawer-in':   'drawer-in 220ms cubic-bezier(.2,.8,.2,1)',
        'backdrop-in': 'backdrop-in 150ms ease-out',
      },
    },
  },
  plugins: [],
};
export default config;
