/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          950: '#09090b',
          900: '#121214',
          850: '#18181b',
          800: '#27272a',
          700: '#3f3f46',
        },
        indigo: {
          accent: '#6366F1',
          hover: '#4F46E5',
        },
        teal: {
          accent: '#10B981',
          hover: '#059669',
        },
      },
      borderRadius: {
        'panel': '10px',
      },
      borderColor: {
        subtle: 'rgba(255, 255, 255, 0.08)',
      },
      fontFamily: {
        sans: ['Inter', 'Geist UI', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
