/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Exo 2', 'system-ui', 'sans-serif'],
        display: ['Exo 2', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: '#6366f1',
        gold: '#fbbf24',
      },
    },
  },
  plugins: [],
};
