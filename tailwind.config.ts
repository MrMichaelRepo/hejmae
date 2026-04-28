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
        bg: '#eae8e0',
        'hm-text': '#1e2128',
        'hm-nav': '#4a5068',
      },
      fontFamily: {
        serif: ['var(--font-dm-serif-text)', 'Georgia', 'serif'],
        garamond: ['Times New Roman', 'Times', 'serif'],
        sans: ['TeX Gyre Adventor', 'Century Gothic', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
