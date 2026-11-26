import { nextTick } from 'vue'
import { beforeEach, expect, it, vi } from 'vitest'
import {
  enableStoploss,
  enableTarget,
  enableTargetTrail,
  enableTrailingStoploss,
  flatTradePositionBook,
  positionLTPs,
  reconciliationRequired,
  riskRules,
  showToast,
  stoplosses,
  stoplossValue,
  targets,
  targetTrailValue,
  targetValue,
  trailingStoplosses,
  toastMessage,
  useUiTriggers
} from '@/stores/globalStore'

vi.hoisted(() => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage)
})
vi.mock('@/config/profile', () => ({ usesServerManagedAccount: true }))
vi.mock('@/api/riskRules', () => ({
  fetchRiskRules: vi.fn(),
  createRiskRule: vi.fn(async (tsym, body) => ({ ...body, tsym, status: 'armed', rev: 1 })),
  createManualRiskRule: vi.fn(),
  patchRiskRule: vi.fn(),
  deleteRiskRule: vi.fn()
}))
import { createManualRiskRule, deleteRiskRule, fetchRiskRules, patchRiskRule } from '@/api/riskRules'
import {
  decreaseStoploss, decreaseTarget, dropRule, increaseStoploss, increaseTarget,
  removeStoploss, removeTarget, setStoploss, setStoplossPrice, setTarget, setTargetPrice,
  currentMonitor, syncRiskMirrors, syncRiskRules, toggleTargetTrail, updateRule
} from './useRiskManagement'

const position = { tsym: 'NIFTYCE', exch: 'NFO', token: '123', netqty: '50', netavgprc: '100' }

beforeEach(() => {
  vi.clearAllMocks()
  enableStoploss.value = true
  enableTarget.value = true
  enableTrailingStoploss.value = false
  enableTargetTrail.value = false
  useUiTriggers.value = false
  stoplossValue.value = 10
  targetValue.value = 20
  targetTrailValue.value = 5
  flatTradePositionBook.value = [position]
  positionLTPs.value = { NIFTYCE: 100 }
  riskRules.value = {}
  reconciliationRequired.value = {}
  showToast.value = false
  patchRiskRule.mockResolvedValue({})
  deleteRiskRule.mockResolvedValue({})
  createManualRiskRule.mockImplementation(async (tsym, settings) => {
    const activePosition = flatTradePositionBook.value.find((item) => item.tsym === tsym)
    const side = Number(activePosition.netqty) > 0 ? 'long' : 'short'
    const sign = side === 'long' ? 1 : -1
    const existing = riskRules.value[tsym] || armed({ side, targetPrice: null, slPrice: null, slPoints: null })
    return settings.kind === 'stop'
      ? { ...existing, slPrice: 100 - sign * settings.stopPoints, slPoints: settings.stopPoints,
          mode: settings.trailingStop ? 'trailing_sl' : 'static' }
      : { ...existing, targetPrice: 100 + sign * settings.targetPoints,
          mode: settings.targetTrailing ? 'target_trail' : existing.mode, trailPoints: settings.trailPoints }
  })

})

const armed = (overrides = {}) => ({
  tsym: 'NIFTYCE', status: 'armed', instrument: 'NFO|123', side: 'long', entry: 100,
  monitor: 'server', mode: 'static', slPrice: 90, slPoints: 10, targetPrice: 120,
  trailPoints: null, ...overrides
})

it('switches armed rules between server and UI monitoring with the monitor toggle', async () => {
  riskRules.value = { NIFTYCE: armed() }
  useUiTriggers.value = true
  await vi.waitFor(() => {
    expect(currentMonitor()).toBe('ui')
    expect(riskRules.value.NIFTYCE.monitor).toBe('ui')
  })
  expect(patchRiskRule).toHaveBeenCalledWith('NIFTYCE', { monitor: 'ui' })

  useUiTriggers.value = false
  await vi.waitFor(() => expect(riskRules.value.NIFTYCE.monitor).toBe('server'))
})

it('creates one server rule with stop-loss and target trailing from a new position', async () => {
  enableTargetTrail.value = true
  expect(await setStoploss(position, 'static')).toBe(true)
  expect(await setTarget(position)).toBe(true)

  expect(stoplosses.value.NIFTYCE).toBe(90)
  expect(targets.value.NIFTYCE).toBe(120)
  expect(riskRules.value.NIFTYCE.mode).toBe('target_trail')
  expect(createManualRiskRule).toHaveBeenCalledTimes(2)
  expect(createManualRiskRule.mock.calls[0][1]).toMatchObject({
    kind: 'stop', stopPoints: 10, targetPoints: null
  })
})

it('uses a trailing stop-loss when the toggle is on and mirrors it as a TSL', async () => {
  enableTrailingStoploss.value = true
  await setStoploss(position, 'static')
  expect(riskRules.value.NIFTYCE).toMatchObject({ mode: 'trailing_sl', slPrice: 90, slPoints: 10 })
  expect(trailingStoplosses.value.NIFTYCE).toBe(90)
  expect(stoplosses.value.NIFTYCE).toBeNull()
})

it('keeps trailing stop-loss and target trailing mutually exclusive', async () => {
  enableTrailingStoploss.value = true
  await nextTick()
  enableTargetTrail.value = true
  await vi.waitFor(() => {
    expect(enableTrailingStoploss.value).toBe(false)
    expect(enableTargetTrail.value).toBe(true)
  })
})

it('only allows target trailing while the predefined target is enabled', async () => {
  enableTarget.value = false
  enableTargetTrail.value = true
  await vi.waitFor(() => expect(enableTargetTrail.value).toBe(false))

  enableTarget.value = true
  await nextTick()
  enableTargetTrail.value = true
  await nextTick()
  expect(enableTargetTrail.value).toBe(true)

  enableTarget.value = false
  await vi.waitFor(() => expect(enableTargetTrail.value).toBe(false))
})

it('does not apply a trailing stop-loss to a target-trailing rule', () => {
  riskRules.value = {
    NIFTYCE: { tsym: 'NIFTYCE', status: 'armed', mode: 'target_trail', slPrice: 90, targetPrice: 120, trailPoints: 5 }
  }
  expect(setStoploss(position, 'convert_to_tsl')).toBe(false)
  expect(riskRules.value.NIFTYCE.mode).toBe('target_trail')
})

it('computes short stop-loss and target on the opposite sides of the price', async () => {
  const short = { ...position, netqty: '-50' }
  flatTradePositionBook.value = [short]
  await setStoploss(short, 'static')
  await setTarget(short)
  expect(riskRules.value.NIFTYCE).toMatchObject({ side: 'short', slPrice: 110, targetPrice: 80 })
})

it('rejects disabled protection, flat positions and invalid points', () => {
  enableStoploss.value = false
  enableTarget.value = false
  expect(setStoploss(position, 'static')).toBe(false)
  expect(setTarget(position)).toBe(false)
  enableStoploss.value = true
  enableTarget.value = true
  expect(setStoploss({ ...position, netqty: '0' }, 'static')).toBe(false)
  expect(setTarget({ ...position, netqty: '0' })).toBe(false)
  stoplossValue.value = 0
  targetValue.value = 0
  expect(setStoploss(position, 'static')).toBe(false)
  expect(setTarget(position)).toBe(false)
  targetValue.value = 20
  enableTargetTrail.value = true
  targetTrailValue.value = 0
  expect(setTarget(position)).toBe(false)
})

it('uses the confirmed first fill rather than LTP or average for manual protection', async () => {
  positionLTPs.value = { NIFTYCE: 200 }
  const response = armed({ entry: 150, slPrice: 140, targetPrice: null })
  createManualRiskRule.mockResolvedValueOnce(response)
  expect(await setStoploss({ ...position, netavgprc: '125' }, 'static')).toBe(true)
  expect(riskRules.value.NIFTYCE).toMatchObject({ entry: 150, slPrice: 140 })
  expect(createManualRiskRule).toHaveBeenCalledWith('NIFTYCE', expect.objectContaining({ kind: 'stop', stopPoints: 10 }))
})

it('does not create manual protection when the first fill is unavailable', async () => {
  createManualRiskRule.mockRejectedValueOnce({
    response: { data: { message: 'Position needs reconciliation: opening fill unavailable' } }
  })
  expect(await setStoploss(position, 'static')).toBe(false)
  expect(riskRules.value.NIFTYCE).toBeUndefined()
  expect(toastMessage.value).toMatch(/needs reconciliation/i)
})

it('converts an existing stop to trailing and back without changing its level', () => {
  riskRules.value = { NIFTYCE: armed() }
  expect(setStoploss(position, 'convert_to_tsl')).toBe(true)
  expect(riskRules.value.NIFTYCE).toMatchObject({ mode: 'trailing_sl', slPrice: 90, slPoints: 10 })
  expect(setStoploss(position, 'convert_to_sl')).toBe(true)
  expect(riskRules.value.NIFTYCE).toMatchObject({ mode: 'static', slPrice: 90 })
})

it('does not convert a missing stop or create a rule without a token', () => {
  expect(setStoploss(position, 'convert_to_tsl')).toBe(false)
  expect(setStoploss(position, 'convert_to_sl')).toBe(false)
  expect(updateRule({ ...position, token: null }, { slPrice: 90 })).toBe(false)
  expect(riskRules.value).toEqual({})
})

it('adjusts and edits only existing stop and target levels', () => {
  riskRules.value = { NIFTYCE: armed() }
  increaseStoploss(position)
  decreaseTarget(position)
  expect(riskRules.value.NIFTYCE).toMatchObject({ slPrice: 91, targetPrice: 119 })
  decreaseStoploss(position)
  increaseTarget(position)
  expect(riskRules.value.NIFTYCE).toMatchObject({ slPrice: 90, targetPrice: 120 })
  setStoplossPrice(position, 95.127)
  setTargetPrice(position, 125.126)
  expect(riskRules.value.NIFTYCE).toMatchObject({ slPrice: 95.13, targetPrice: 125.13 })
})

it('removes each level without losing the other, then drops the empty rule', () => {
  riskRules.value = { NIFTYCE: armed({ mode: 'target_trail', trailPoints: 5 }) }
  setStoplossPrice(position, null)
  expect(riskRules.value.NIFTYCE).toMatchObject({ slPrice: null, targetPrice: 120, mode: 'target_trail' })
  setTargetPrice(position, null)
  expect(riskRules.value.NIFTYCE).toBeUndefined()
})

it('removes a target-trailing target while retaining the stop', () => {
  riskRules.value = { NIFTYCE: armed({ mode: 'target_trail', trailPoints: 5 }) }
  removeTarget(position)
  expect(riskRules.value.NIFTYCE).toMatchObject({ slPrice: 90, targetPrice: null, mode: 'static', trailPoints: null })
  removeStoploss(position)
  expect(riskRules.value.NIFTYCE).toBeUndefined()
})

it('switches target trailing on and off and refuses conflict with a trailing stop', () => {
  riskRules.value = { NIFTYCE: armed() }
  toggleTargetTrail(position)
  expect(riskRules.value.NIFTYCE).toMatchObject({ mode: 'target_trail', trailPoints: 5 })
  toggleTargetTrail(position)
  expect(riskRules.value.NIFTYCE).toMatchObject({ mode: 'static', trailPoints: null })
  riskRules.value = { NIFTYCE: armed({ mode: 'trailing_sl' }) }
  toggleTargetTrail(position)
  expect(riskRules.value.NIFTYCE.mode).toBe('trailing_sl')
  expect(toastMessage.value).toMatch(/trailing stop-loss/)
})

it('mirrors only armed rules and clears removed rules', () => {
  riskRules.value = { NIFTYCE: armed({ mode: 'trailing_sl' }), OTHER: armed({ tsym: 'OTHER', status: 'done' }) }
  syncRiskMirrors()
  expect(trailingStoplosses.value.NIFTYCE).toBe(90)
  expect(stoplosses.value.NIFTYCE).toBeNull()
  expect(targets.value.NIFTYCE).toBe(120)
  expect(targets.value.OTHER).toBeUndefined()
  dropRule('NIFTYCE')
  expect(targets.value.NIFTYCE).toBeNull()
})

it('loads server outcomes and announces a recent failure', async () => {
  fetchRiskRules.mockResolvedValue({ rules: [armed({ status: 'failed', message: 'exit failed', updatedAt: Date.now() })] })
  await vi.waitFor(async () => {
    await syncRiskRules()
    expect(riskRules.value.NIFTYCE?.status).toBe('failed')
  })

  expect(toastMessage.value).toContain('exit failed')
  expect(showToast.value).toBe(true)
})

it('retains and clears server reconciliation flags when risk rules are refreshed', async () => {
  fetchRiskRules.mockResolvedValue({
    rules: [],
    reconciliation: [{ tsym: 'NIFTYCE', status: 'RECONCILIATION_REQUIRED', message: 'opening fill unavailable' }]
  })
  await syncRiskRules()
  expect(reconciliationRequired.value.NIFTYCE?.status).toBe('RECONCILIATION_REQUIRED')
  fetchRiskRules.mockResolvedValue({ rules: [], reconciliation: [] })
  await syncRiskRules()
  expect(reconciliationRequired.value.NIFTYCE).toBeUndefined()
})
