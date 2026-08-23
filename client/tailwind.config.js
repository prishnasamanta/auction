/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['Syne', 'system-ui', 'sans-serif'],
      },
      colors: {
        pitch: {
          950: '#050a08',
          900: '#0a1210',
          800: '#0f1a16',
          700: '#152822',
        },
        turf: {
          DEFAULT: '#34d399',
          dim: '#10b981',
          glow: '#6ee7b7',
        },
        gold: {
          DEFAULT: '#fbbf24',
          dim: '#d97706',
        },
      },
      boxShadow: {
        glow: '0 0 60px rgba(52, 211, 153, 0.15)',
        card: '0 24px 80px rgba(0, 0, 0, 0.45)',
      },
      animation: {
        'float-slow': 'float-slow 8s ease-in-out infinite',
        shimmer: 'shimmer 3s linear infinite',
      },
      keyframes: {
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% center' },
          '100%': { backgroundPosition: '-200% center' },
        },
      },
    },
  },
  plugins: [],
};
