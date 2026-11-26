import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'

vi.hoisted(() => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage)
})
vi.mock('@/config/profile', () => ({ usesServerManagedAccount: true }))
vi.mock('@/api/riskRules', () => ({
  fetchRiskRules: vi.fn(), createRiskRule: vi.fn(), patchRiskRule: vi.fn(), deleteRiskRule: vi.fn(),
  triggerUiRiskRule: vi.fn()
}))
import { checkUiTriggers, evaluateRule } from '@/composables/useUiRiskTriggers'
import { triggerUiRiskRule, fetchRiskRules } from '@/api/riskRules'
import {
  enableStoploss,
  enableTarget,
  enableTargetTrail,
  flatTradePositionBook,
  positionLTPs,
  reconciliationRequired,
  riskRules,
  shoonyaPositionBook,
  toastMessage
} from '@/stores/globalStore'

const rule = (overrides = {}) => ({
  side: 'long', mode: 'static', rev: 1, slPrice: 90, slPoints: 10, targetPrice: 120, trailPoints: 5, ...overrides
})

beforeEach(() => {
  fetchRiskRules.mockResolvedValue({ rules: [], reconciliation: [] })
  triggerUiRiskRule.mockResolvedValue({ handled: true, status: 'done' })
})
afterEach(() => {
  flatTradePositionBook.value = []
  shoonyaPositionBook.value = []
  positionLTPs.value = {}
  riskRules.value = {}
  reconciliationRequired.value = {}
  triggerUiRiskRule.mockReset()
  fetchRiskRules.mockReset()
})

describe('evaluateRule', () => {
  it.each([80, 130])('never sends a crossed trigger at %s for a flagged position', (ltp) => {
    flatTradePositionBook.value = [{ tsym: 'FLAGGED', netqty: '1' }]
    positionLTPs.value = { FLAGGED: ltp }
    reconciliationRequired.value = { FLAGGED: { status: 'RECONCILIATION_REQUIRED' } }
    riskRules.value = { FLAGGED: rule({ tsym: 'FLAGGED', status: 'armed', monitor: 'ui' }) }
    checkUiTriggers()
    expect(triggerUiRiskRule).not.toHaveBeenCalled()
  })

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

  it('checks both fixed thresholds around a 150 entry, including gaps', () => {
    const fixed = rule({ slPrice: 140, targetPrice: 170 })
    expect(evaluateRule(fixed, 140.01).reason).toBeNull()
    expect(evaluateRule(fixed, 139).reason).toBe('Stop-loss')
    expect(evaluateRule(fixed, 169.99).reason).toBeNull()
    expect(evaluateRule(fixed, 171).reason).toBe('Target')
  })

  it('moves a trailing stop from a 150 entry only upward and exits on a reversal', () => {
    let trailing = rule({ mode: 'trailing_sl', slPrice: 140, targetPrice: null })
    const rising = evaluateRule(trailing, 165)
    expect(rising).toMatchObject({ changed: true, reason: null, slPrice: 155 })
    trailing = { ...trailing, slPrice: rising.slPrice }
    expect(evaluateRule(trailing, 160)).toMatchObject({ changed: false, reason: null, slPrice: 155 })
    expect(evaluateRule(trailing, 155).reason).toBe('Stop-loss')
  })

  it('advances a trailing target across multiple milestones and exits at the moved stop', () => {
    const trailing = rule({ mode: 'target_trail', slPrice: 140, targetPrice: 170, trailPoints: 5 })
    expect(evaluateRule(trailing, 169.99)).toMatchObject({ changed: false, reason: null, slPrice: 140, targetPrice: 170 })
    const gap = evaluateRule(trailing, 181)
    expect(gap).toMatchObject({ changed: true, reason: null, slPrice: 180, targetPrice: 185 })
    expect(evaluateRule({ ...trailing, slPrice: gap.slPrice, targetPrice: gap.targetPrice }, 180).reason).toBe('Stop-loss')
  })

  it('rejects a short target progression that would produce a zero price', () => {
    const short = rule({ side: 'short', mode: 'target_trail', slPrice: 110, targetPrice: 50, trailPoints: 50 })
    expect(() => evaluateRule(short, 50)).toThrow('Invalid next target price')
    expect(short).toMatchObject({ slPrice: 110, targetPrice: 50 })
  })

  it('alerts when a trailing target cannot progress without changing the saved levels', () => {
    flatTradePositionBook.value = [{ tsym: 'SHORT', netqty: '-1' }]
    positionLTPs.value = { SHORT: 50 }
    riskRules.value = {
      SHORT: rule({ tsym: 'SHORT', status: 'armed', monitor: 'ui', side: 'short', mode: 'target_trail', slPrice: 110, targetPrice: 50, trailPoints: 50 })
    }
    checkUiTriggers()
    expect(riskRules.value.SHORT).toMatchObject({ slPrice: 110, targetPrice: 50 })
    expect(toastMessage.value).toMatch(/Invalid next target price/)
    expect(triggerUiRiskRule).not.toHaveBeenCalled()
  })

  it('immediately triggers an edited target already crossed by the current LTP', async () => {
    const position = { tsym: 'NIFTYCE', netqty: 1 }
    flatTradePositionBook.value = [position]
    positionLTPs.value = { NIFTYCE: 115 }
    riskRules.value = {
      NIFTYCE: rule({ tsym: 'NIFTYCE', status: 'armed', monitor: 'ui', targetPrice: 110 })
    }

    await nextTick()

    expect(triggerUiRiskRule).toHaveBeenCalledWith('NIFTYCE', 'Target', 115, 1)
  })

  it('immediately triggers an edited stop-loss already crossed by the current LTP', async () => {
    const position = { tsym: 'NIFTYCE2', netqty: 1 }
    flatTradePositionBook.value = [position]
    positionLTPs.value = { NIFTYCE2: 115 }
    riskRules.value = {
      NIFTYCE2: rule({ tsym: 'NIFTYCE2', status: 'armed', monitor: 'ui', slPrice: 120, targetPrice: null })
    }

    await nextTick()

    expect(triggerUiRiskRule).toHaveBeenCalledWith('NIFTYCE2', 'Stop-loss', 115, 1)
  })

  it('handles a reopened position for the same symbol after an earlier exit', async () => {
    const position = { tsym: 'REOPENED', netqty: 1 }
    let finishExit
    triggerUiRiskRule.mockImplementationOnce(() => new Promise((resolve) => { finishExit = resolve }))
    flatTradePositionBook.value = [position]
    positionLTPs.value = { REOPENED: 120 }
    const armed = rule({ tsym: 'REOPENED', status: 'armed', monitor: 'ui' })
    riskRules.value = { REOPENED: armed }
    await nextTick()
    checkUiTriggers()
    expect(triggerUiRiskRule).toHaveBeenCalledTimes(1)

    finishExit({ handled: true, status: 'done' })
    await vi.waitFor(() => expect(riskRules.value.REOPENED).toBeUndefined())
    riskRules.value = { REOPENED: { ...armed } }
    await vi.waitFor(() => expect(triggerUiRiskRule).toHaveBeenCalledTimes(2))
  })

  it('does not retry a failed exit and warns the user to verify it', async () => {
    const position = { tsym: 'FAIL', netqty: 1 }
    triggerUiRiskRule.mockResolvedValue({ handled: true, status: 'failed' })
    flatTradePositionBook.value = [position]
    positionLTPs.value = { FAIL: 90 }
    riskRules.value = { FAIL: rule({ tsym: 'FAIL', status: 'armed', monitor: 'ui' }) }
    await vi.waitFor(() => expect(riskRules.value.FAIL).toBeUndefined())
    checkUiTriggers()
    expect(triggerUiRiskRule).toHaveBeenCalledTimes(1)
    expect(toastMessage.value).toMatch(/not confirmed/)
  })

  it('removes a flat UI position rule without placing an exit', () => {
    flatTradePositionBook.value = [{ tsym: 'FLAT', netqty: '0' }]
    riskRules.value = { FLAT: rule({ tsym: 'FLAT', status: 'armed', monitor: 'ui' }) }
    checkUiTriggers()
    expect(riskRules.value.FLAT).toBeUndefined()
    expect(triggerUiRiskRule).not.toHaveBeenCalled()
  })

  it('persists a trailing stop and does not exit when the price is unavailable', () => {
    const position = { tsym: 'TRAIL', netqty: 1 }
    flatTradePositionBook.value = [position]
    riskRules.value = { TRAIL: rule({ tsym: 'TRAIL', status: 'armed', monitor: 'ui', mode: 'trailing_sl', targetPrice: null }) }
    positionLTPs.value = { TRAIL: 'invalid' }
    checkUiTriggers()
    expect(riskRules.value.TRAIL.slPrice).toBe(90)
    positionLTPs.value = { TRAIL: 115 }
    checkUiTriggers()
    expect(riskRules.value.TRAIL.slPrice).toBe(105)
    expect(triggerUiRiskRule).not.toHaveBeenCalled()
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
