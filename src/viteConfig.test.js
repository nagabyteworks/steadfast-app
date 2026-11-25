// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import viteConfig from '../vite.config'

const production = { command: 'build', mode: 'production' }

afterEach(() => vi.unstubAllEnvs())

describe('production configuration', () => {
  it('requires an HTTPS API origin without a path', () => {
    vi.stubEnv('profile', 'prod')
    for (const baseUrl of ['', 'http://example.com', 'https://example.com/api']) {
      vi.stubEnv('VITE_BASE_URL', baseUrl)
      expect(() => viteConfig(production)).toThrow('VITE_BASE_URL')
    }
    vi.stubEnv('VITE_BASE_URL', 'https://trade.example.com')
    expect(() => viteConfig(production)).not.toThrow()
  })

  it('uses the development profile even for a production build', () => {
    vi.stubEnv('profile', 'dev')
    vi.stubEnv('TRADING_ENABLED', 'false')
    const config = viteConfig(production)
    expect(config.define['import.meta.env.VITE_PROFILE']).toBe('"dev"')
  })

  it('enables server-managed local accounts without embedding their credentials', () => {
    vi.stubEnv('profile', 'dev')
    vi.stubEnv('FLATTRADE_CLIENT_ID', 'dev-user')
    vi.stubEnv('FLATTRADE_API_KEY', 'dev-key')
    vi.stubEnv('FLATTRADE_API_SECRET', 'dev-secret')

    const config = viteConfig(production)
    expect(config.define['import.meta.env.VITE_SERVER_MANAGED_ACCOUNT']).toBe(JSON.stringify('true'))
    expect(JSON.stringify(config.define)).not.toContain('dev-secret')
  })

  it('rejects incomplete local Flattrade credentials', () => {
    vi.stubEnv('profile', 'dev')
    vi.stubEnv('TRADING_ENABLED', 'false')
    vi.stubEnv('FLATTRADE_CLIENT_ID', 'dev-user')
    vi.stubEnv('FLATTRADE_API_KEY', 'dev-key')
    vi.stubEnv('FLATTRADE_API_SECRET', '')

    expect(() => viteConfig(production)).toThrow('Configure FLATTRADE_CLIENT_ID')
  })

  it('requires local Flattrade credentials before enabling live orders', () => {
    vi.stubEnv('profile', 'dev')
    vi.stubEnv('TRADING_ENABLED', 'true')

    expect(() => viteConfig(production)).toThrow('TRADING_ENABLED=true requires complete')
  })

  it('routes broker proxy traffic through the local API', () => {
    vi.stubEnv('profile', 'dev')
    vi.stubEnv('TRADING_ENABLED', 'false')
    const config = viteConfig({ command: 'serve', mode: 'development' })
    for (const broker of ['flattrade', 'shoonya']) {
      const path = `/${broker}Api`
      const proxy = config.server.proxy[path]
      expect(proxy.target).toBe('http://127.0.0.1:3000')
      expect(proxy.rewrite(`${path}/PlaceOrder`)).toBe(`/${broker}${path}/PlaceOrder`)
    }
  })
})
