/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
        body: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        ticket: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // Paleta del rediseño del panel — mismo mundo visual que el portal
        // (Fraunces/Inter/IBM Plex Mono) en vez de gris de sistema plano.
        paper:   '#FBF6F3',
        'paper-2': '#F6EDEA',
        ink:     '#241318',
        'ink-soft':  '#6E5560',
        'ink-faint': '#A6919B',
        gold:    { DEFAULT: '#C9A227', soft: '#FBF3DC', ink: '#8A6D14' },
        line:    '#EBDFDC',
      },
    },
  },
  plugins: [],
};