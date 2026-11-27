/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        'bg-app': '#edf5fb',
        'bg-card': '#ffffff',
        'bg-surface': '#f5f9fd',
        'bg-hover': '#f4f8fc',
        'bg-selected': '#e6f0fa',
        'bg-track': '#d8e7f3',
        primary: '#1d5b90',
        'primary-dark': '#123b61',
        'primary-mid': '#4a82b5',
        'primary-light': '#72a4cf',
        'primary-steel': '#aec3d3',
        'border-subtle': '#c9dceb',
        'border-header': '#cfe0ed',
        'text-primary': '#10263c',
        'text-body': '#23415e',
        'text-muted': '#56748d',
      },
      boxShadow: {
        card: '0 4px 20px rgba(18, 59, 97, 0.08)',
      },
    },
  },
  plugins: [],
};
