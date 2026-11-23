import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  if (mode === 'production') {
    const baseUrl = loadEnv(mode, process.cwd(), 'VITE_').VITE_BASE_URL
    let url
    try {
      url = new URL(baseUrl)
    } catch {
      throw new Error('VITE_BASE_URL must be an absolute HTTPS origin in production')
    }
    if (url.protocol !== 'https:' || url.href !== `${url.origin}/`) {
      throw new Error('VITE_BASE_URL must be an absolute HTTPS origin in production')
    }
  }

  return {
    base: '/',
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      proxy: {
        '/flattradeSymbols': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/flattradeSymbols/, '/flattrade/')
        },
        '/shoonyaSymbols': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/shoonyaSymbols/, '/shoonya/')
        },
        '/flattradeApi': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/flattradeApi/, '/flattrade/flattradeApi')
        },
        '/shoonyaApi': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/shoonyaApi/, '/shoonya/shoonyaApi')
        },
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    },
    optimizeDeps: {
      include: ['@google/generative-ai']
    }
  }
})
