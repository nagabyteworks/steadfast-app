import { nextTick } from 'vue'
import { describe, it, expect, vi } from 'vitest'

vi.hoisted(() => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage)
})
vi.mock('@/config/profile', () => ({ usesServerManagedAccount: true }))
vi.mock('@/api/riskRules', () => ({
  fetchRiskRules: vi.fn(), createRiskRule: vi.fn(), patchRiskRule: vi.fn(), deleteRiskRule: vi.fn()
}))
vi.mock('@/composables/useOrderManagement', () => ({ closePosition: vi.fn() }))
import { evaluateRule } from '@/composables/useUiRiskTriggers'
import { enableStoploss, enableTarget, enableTargetTrail } from '@/stores/globalStore'

const rule = (overrides = {}) => ({
  side: 'long', mode: 'static', slPrice: 90, slPoints: 10, targetPrice: 120, trailPoints: 5, ...overrides
})

describe('evaluateRule', () => {
  it('exits on stop-loss and target for longs', () => {
    expect(evaluateRule(rule(), 90).reason).toBe('Stop-loss')
    expect(evaluateRule(rule(), 120).reason).toBe('Target')
    expect(evaluateRule(rule(), 100).reason).toBeNull()
  })

  it('mirrors the levels for shorts', () => {
    const short = rule({ side: 'short', slPrice: 110, targetPrice: 80 })
    expect(evaluateRule(short, 110).reason).toBe('Stop-loss')
    expect(evaluateRule(short, 80).reason).toBe('Target')
  })

  it('trails the stop-loss behind the price and never loosens it', () => {
    const trailing = rule({ mode: 'trailing_sl', targetPrice: null })
    expect(evaluateRule(trailing, 105)).toMatchObject({ changed: true, slPrice: 95 })
    expect(evaluateRule({ ...trailing, slPrice: 95 }, 100).changed).toBe(false)
  })

  it('target trailing moves the stop to the target and advances the target without exiting', () => {
    const result = evaluateRule(rule({ mode: 'target_trail' }), 126)
    expect(result).toMatchObject({ changed: true, reason: null, slPrice: 125, targetPrice: 130 })
  })
})

describe('target trailing toggle', () => {
  it('switches the predefined stop-loss and target on, and turns off when either is disabled', async () => {
    enableTargetTrail.value = false
    enableStoploss.value = false
    enableTarget.value = false
    await nextTick()
    enableTargetTrail.value = true
    await nextTick()
    expect([enableStoploss.value, enableTarget.value]).toEqual([true, true])

    enableStoploss.value = false
    await nextTick()
    expect(enableTargetTrail.value).toBe(false)
  })
})
