import { resolve } from 'path'
import { realpathSync } from 'fs'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const appRoot = realpathSync(process.cwd())

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@shared': resolve(appRoot, 'src/shared')
      }
    }
  },
  preload: {
    resolve: {
      alias: {
        '@shared': resolve(appRoot, 'src/shared')
      }
    }
  },
  renderer: {
    root: resolve(appRoot, 'src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve(appRoot, 'src/renderer/src'),
        '@shared': resolve(appRoot, 'src/shared')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
