/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}"
  ],
  theme: {
    extend: {
      // Escala um degrau acima do padrão do Tailwind (~+1px), mantendo a proporção entre tamanhos.
      fontSize: {
        xs: ['0.8125rem', '1.15rem'],
        sm: ['0.9375rem', '1.35rem'],
        base: ['1.0625rem', '1.6rem'],
        lg: ['1.1875rem', '1.75rem'],
        xl: ['1.375rem', '1.9rem'],
        '2xl': ['1.625rem', '2.1rem'],
      },
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
          blue: '#4a90c2',
          unverified: '#6c767a'
        }
      },
      fontFamily: {
        mono: ['"Oxygen Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        sans: ['"Tomorrow"', 'system-ui', '-apple-system', 'sans-serif']
      }
    }
  },
  plugins: []
};
