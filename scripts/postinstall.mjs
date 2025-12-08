import { execSync } from 'child_process'
import process from 'process'

console.log('Running postinstall script...')

if (process.env.VERCEL) {
  console.log('Detected Vercel environment. Skipping electron-builder install-app-deps.')
} else {
  console.log('Running electron-builder install-app-deps...')
  try {
    execSync('electron-builder install-app-deps', { stdio: 'inherit' })
  } catch (error) {
    console.error('Failed to run electron-builder:', error)
    process.exit(1)
  }
}
