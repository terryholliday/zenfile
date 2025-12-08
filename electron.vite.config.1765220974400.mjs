// electron.vite.config.ts
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
var __electron_vite_injected_dirname = 'C:\\Users\\TERRYHOLLIDAY\\Desktop\\ZenFile'
var electron_vite_config_default = defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, 'src/main/index.ts'),
          worker: resolve(__electron_vite_injected_dirname, 'src/main/worker.ts')
        }
      }
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
export { electron_vite_config_default as default }
