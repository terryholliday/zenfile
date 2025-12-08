/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#050510',
        'void-light': '#0b1020',
        'nebula-blue': '#4f8cff',
        'nebula-purple': '#9b6bff',
        'nebula-teal': '#2af5e6',
        'nebula-alert': '#ff6b6b'
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' }
        }
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.8s ease forwards',
        'fade-in': 'fade-in 0.8s ease forwards'
      }
    }
  },
  plugins: []
}
