/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // DealerSuite brand palette
        brand: {
          dark:    '#1a1a2e',   // deep navy — primary bg
          mid:     '#16213e',   // card bg
          accent:  '#0f3460',   // borders / secondary
          blue:    '#1a73e8',   // primary action
          green:   '#22c55e',   // success / confirm
          red:     '#ef4444',   // damage / alert
          yellow:  '#f59e0b',   // warning
          white:   '#f0f4ff',   // text on dark
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      // Touch-friendly tap target minimum
      minHeight: {
        touch: '56px',
      },
      fontSize: {
        'touch-label': ['1.125rem', { lineHeight: '1.5rem', fontWeight: '600' }],
      },
    },
  },
  plugins: [
    // pb-safe / pt-safe — respects iOS notch and home-bar insets
    function ({ addUtilities }) {
      addUtilities({
        '.pb-safe': { paddingBottom: 'env(safe-area-inset-bottom)' },
        '.pt-safe': { paddingTop:    'env(safe-area-inset-top)'    },
        '.pl-safe': { paddingLeft:   'env(safe-area-inset-left)'   },
        '.pr-safe': { paddingRight:  'env(safe-area-inset-right)'  },
      })
    },
  ],
}
