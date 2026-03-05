/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'lr-green': '#006e39',
        'lr-dark': '#003a21',
        'lr-light': '#e8f5ee',
      },
    },
  },
  plugins: [],
};
