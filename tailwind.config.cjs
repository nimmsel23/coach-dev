const { sharedPlanRoot } = require('./scripts/shared-plan-root.cjs')
const path = require("path")
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./coach.html",
    path.join(sharedPlanRoot(), "src", "**", "*.{js,jsx}"),
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  safelist: [
    'lg:flex',
    'lg:hidden',
    'lg:ml-[280px]',
    'justify-around',
    'flex-col',
  ],
  theme: {
    extend: {
      colors: {
        fit: {
          bg:    'var(--bg)',
          bg2:   'var(--bg2)',
          card:  'var(--card)',
          cardh: 'var(--card-hover)',
          line:  'var(--line)',
          ink:   'var(--ink)',
          muted: 'var(--muted)',
          dim:   'var(--dim)',
          accent:'var(--accent)',
          green: 'var(--green)',
          red:   'var(--red)',
          orange:'var(--orange)',
          scrim: 'var(--scrim)',
          selected: 'var(--surface-selected)',
          accentSubtle: 'var(--accent-subtle)',
          accentSubtleHover: 'var(--accent-subtle-hover)',
          accentBorder: 'var(--accent-border)',
        },
        forge: {
          bg:     'var(--card)',
          panel:  'var(--bg2)',
          border: 'var(--line)',
          ink:    'var(--ink)',
          muted:  'var(--muted)',
          accent: 'var(--accent)',
          red:    'var(--red)',
          green:  'var(--green)',
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}
