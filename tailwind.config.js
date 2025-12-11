/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        void: { DEFAULT: '#05050A', light: '#0F0F1A', deep: '#020205' },
        nebula: {
          blue: '#4F8CFF', // Standard
          purple: '#9D4FFF', // AI/Processing
          teal: '#2AF5E6', // Success
          alert: '#FF2A6D' // Deletion
        },
        glass: { border: 'rgba(255, 255, 255, 0.1)' }
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 4s cubic-bezier(0.4, 0, 0.6, 1) infinite'
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' }
        },
        pulseGlow: {
          '0%, 100%': {
            opacity: 1,
            boxShadow: '0 0 15px rgba(79, 140, 255, 0.3)'
          },
          '50%': { opacity: 0.7 }
        }
      }
    }
  },
  plugins: []
}
