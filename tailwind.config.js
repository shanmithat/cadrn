/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        automotive: {
          red: '#b91c1c',
          dark: '#0f172a',
          slate: '#1e293b',
          border: '#334155',
          accent: '#38bdf8',
        }
      }
    },
  },
  plugins: [],
}
