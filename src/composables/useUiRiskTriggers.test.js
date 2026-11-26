/* global jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage)
})
vi.mock('@/api/riskRules', () => ({
  patchRiskRule: vi.fn(),
  triggerUiRiskRule: vi.fn()
}))
vi.mock('./useRiskManagement', () => ({
  syncRiskMirrors: vi.fn(),
  syncRiskRules: vi.fn()
}))

import { patchRiskRule, triggerUiRiskRule } from '@/api/riskRules'
import {
  flatTradePositionBook,
  positionLTPs,
  positionLTPUpdatedAt,
  riskRules,
  shoonyaPositionBook,
  useUiTriggers
} from '@/stores/globalStore'
import { evaluateUiRiskRule, checkUiRiskTriggers } from './useUiRiskTriggers'
import { syncRiskMirrors, syncRiskRules } from './useRiskManagement'

const armedRule = (overrides = {}) => ({
  tsym: 'NIFTYCE',
  status: 'armed',
  monitor: 'ui',
  rev: 1,
  side: 'long',
  mode: 'static',
  slPrice: 90,
  slPoints: 10,
  targetPrice: 120,
  trailPoints: null,
  ...overrides
})

beforeEach(() => {
  vi.clearAllMocks()
  useUiTriggers.value = true
  flatTradePositionBook.value = [{ tsym: 'NIFTYCE', netqty: '50' }]
  shoonyaPositionBook.value = []
  positionLTPs.value = { NIFTYCE: 110 }
  positionLTPUpdatedAt.value = { NIFTYCE: Date.now() }
  riskRules.value = { NIFTYCE: armedRule() }
  patchRiskRule.mockResolvedValue(armedRule())
  triggerUiRiskRule.mockResolvedValue({ handled: true, status: 'exit_pending' })
})

describe('evaluateUiRiskRule', () => {
  it('detects fixed stop and target crossings by position direction', () => {
    expect(evaluateUiRiskRule(armedRule(), 90)).toEqual({ reason: 'Stop-loss' })
    expect(evaluateUiRiskRule(armedRule(), 120)).toEqual({ reason: 'Target' })
    expect(evaluateUiRiskRule(armedRule({ side: 'short', slPrice: 110, targetPrice: 80 }), 80))
      .toEqual({ reason: 'Target' })
  })

  it('advances trailing stops and targets without loosening protection', () => {
    expect(evaluateUiRiskRule(armedRule({ mode: 'trailing_sl', slPoints: 10 }), 115))
      .toEqual({ patch: { slPrice: 105 } })
    expect(evaluateUiRiskRule(armedRule({
      mode: 'target_trail', slPrice: 100, targetPrice: 120, trailPoints: 5
    }), 131)).toEqual({ patch: { slPrice: 130, targetPrice: 135 } })
  })

  it('ignores invalid prices', () => {
    expect(evaluateUiRiskRule(armedRule(), 0)).toEqual({})
    expect(evaluateUiRiskRule(armedRule(), Number.NaN)).toEqual({})
  })
})

it('submits a crossed UI rule through the API and refreshes its status', async () => {
  positionLTPs.value.NIFTYCE = 120

  await checkUiRiskTriggers()

  expect(triggerUiRiskRule).toHaveBeenCalledWith({
    tsym: 'NIFTYCE', reason: 'Target', ltp: 120, rev: 1
  })
  expect(syncRiskRules).toHaveBeenCalledOnce()
})

it('does not trigger server rules or stale UI quotes', async () => {
  riskRules.value = { NIFTYCE: armedRule({ monitor: 'server' }) }
  positionLTPs.value.NIFTYCE = 120
  await checkUiRiskTriggers()

  riskRules.value = { NIFTYCE: armedRule() }
  positionLTPUpdatedAt.value.NIFTYCE = Date.now() - 31_000
  await checkUiRiskTriggers()

  expect(triggerUiRiskRule).not.toHaveBeenCalled()
})

it('persists UI trailing progress through the risk API', async () => {
  const updated = armedRule({ mode: 'trailing_sl', slPrice: 105 })
  riskRules.value = { NIFTYCE: armedRule({ mode: 'trailing_sl' }) }
  positionLTPs.value.NIFTYCE = 115
  patchRiskRule.mockResolvedValueOnce(updated)

  await checkUiRiskTriggers()

  expect(patchRiskRule).toHaveBeenCalledWith('NIFTYCE', { slPrice: 105, rev: 1 })
  expect(riskRules.value.NIFTYCE).toEqual(updated)
  expect(syncRiskMirrors).toHaveBeenCalledOnce()
})
