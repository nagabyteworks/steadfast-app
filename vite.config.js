import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
  const rootEnv = loadEnv(mode, repositoryRoot, '')
  const profile = (
    process.env.PROFILE ||
    process.env.profile ||
    rootEnv.PROFILE ||
    rootEnv.profile ||
    'prod'
  ).toLowerCase()
  const flattradeCredentialNames = [
    'FLATTRADE_CLIENT_ID',
    'FLATTRADE_API_KEY',
    'FLATTRADE_API_SECRET'
  ]
  const configuredFlattradeCredentials = flattradeCredentialNames.map((name) =>
    process.env[name] || rootEnv[name]
  )
  const hasSomeFlattradeCredentials = configuredFlattradeCredentials.some(Boolean)
  const hasFlattradeCredentials = configuredFlattradeCredentials.every(Boolean)
  const tradingEnabled = process.env.TRADING_ENABLED || rootEnv.TRADING_ENABLED

  if (!['dev', 'prod'].includes(profile)) {
    throw new Error('profile must be dev or prod')
  }
  if (mode !== 'test' && profile === 'dev' && hasSomeFlattradeCredentials && !hasFlattradeCredentials) {
    throw new Error('Configure FLATTRADE_CLIENT_ID, FLATTRADE_API_KEY, and FLATTRADE_API_SECRET together')
  }
  if (mode !== 'test' && profile === 'dev' && tradingEnabled === 'true' && !hasFlattradeCredentials) {
    throw new Error('TRADING_ENABLED=true requires complete server-managed Flattrade credentials')
  }

  if (profile === 'prod' && mode === 'production') {
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
    define: {
      'import.meta.env.VITE_PROFILE': JSON.stringify(profile),
      'import.meta.env.VITE_SERVER_MANAGED_ACCOUNT': JSON.stringify(
        String(profile === 'prod' || hasFlattradeCredentials)
      )
    },
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
