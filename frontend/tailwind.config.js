/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        lr: {
          green: '#006e39',
          dark: '#003a21',
          light: '#e8f5ee',
        },
      },
    },
  },
  plugins: [],
};
