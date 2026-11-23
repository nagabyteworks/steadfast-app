// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import viteConfig from '../vite.config'

const production = { command: 'build', mode: 'production' }

afterEach(() => vi.unstubAllEnvs())

describe('production configuration', () => {
  it('requires an HTTPS API origin without a path', () => {
    for (const baseUrl of ['', 'http://example.com', 'https://example.com/api']) {
      vi.stubEnv('VITE_BASE_URL', baseUrl)
      expect(() => viteConfig(production)).toThrow('VITE_BASE_URL')
    }
    vi.stubEnv('VITE_BASE_URL', 'https://trade.example.com')
    expect(() => viteConfig(production)).not.toThrow()
  })

  it('routes broker proxy traffic through the local API', () => {
    const config = viteConfig({ command: 'serve', mode: 'development' })
    for (const broker of ['flattrade', 'shoonya']) {
      const path = `/${broker}Api`
      const proxy = config.server.proxy[path]
      expect(proxy.target).toBe('http://127.0.0.1:3000')
      expect(proxy.rewrite(`${path}/PlaceOrder`)).toBe(`/${broker}${path}/PlaceOrder`)
    }
  })
})
