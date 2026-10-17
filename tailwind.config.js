/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}"
  ],
  theme: {
    extend: {
      colors: {
        fogo: {
          bg: '#101517',
          panel: '#1a2124',
          border: '#2a3439',
          sand: '#e9e4d8',
          muted: '#a39e93',
          ember: '#ff7a3d',
          green: '#4ca975',
          red: '#d9534f',
          amber: '#d99b38',
          purple: '#8c6bb1',
          unverified: '#6c767a'
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        sans: ['"Plus Jakarta Sans"', '"Inter"', 'system-ui', '-apple-system', 'sans-serif']
      }
    }
  },
  plugins: []
};
