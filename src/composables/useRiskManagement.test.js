import { nextTick } from 'vue'
import { beforeEach, expect, it, vi } from 'vitest'
import {
  enableStoploss,
  enableTarget,
  enableTargetTrail,
  enableTrailingStoploss,
  flatTradePositionBook,
  positionLTPs,
  riskRules,
  stoplosses,
  stoplossValue,
  targets,
  targetTrailValue,
  targetValue,
  trailingStoplosses
} from '@/stores/globalStore'

vi.hoisted(() => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage)
})
vi.mock('@/config/profile', () => ({ usesServerManagedAccount: true }))
vi.mock('@/api/riskRules', () => ({
  fetchRiskRules: vi.fn(),
  createRiskRule: vi.fn(async (tsym, body) => ({ ...body, tsym, status: 'armed', rev: 1 })),
  patchRiskRule: vi.fn(),
  deleteRiskRule: vi.fn()
}))
import { createRiskRule } from '@/api/riskRules'
import { setStoploss, setTarget } from './useRiskManagement'

const position = { tsym: 'NIFTYCE', exch: 'NFO', token: '123', netqty: '50', netavgprc: '100' }

beforeEach(() => {
  vi.clearAllMocks()
  enableStoploss.value = true
  enableTarget.value = true
  enableTrailingStoploss.value = false
  enableTargetTrail.value = false
  stoplossValue.value = 10
  targetValue.value = 20
  targetTrailValue.value = 5
  flatTradePositionBook.value = [position]
  positionLTPs.value = { NIFTYCE: 100 }
  riskRules.value = {}
})

it('creates one server rule with stop-loss and target trailing from a new position', async () => {
  enableTargetTrail.value = true
  expect(setStoploss(position, 'static')).toBe(true)
  expect(setTarget(position)).toBe(true)

  expect(stoplosses.value.NIFTYCE).toBe(90)
  expect(targets.value.NIFTYCE).toBe(120)
  expect(riskRules.value.NIFTYCE.mode).toBe('target_trail')
  await vi.waitFor(() => expect(createRiskRule).toHaveBeenCalledTimes(1))
  expect(createRiskRule.mock.calls[0][1]).toMatchObject({
    instrument: 'NFO|123', side: 'long', entry: 100, slPrice: 90, slPoints: 10
  })
})

it('uses a trailing stop-loss when the toggle is on and mirrors it as a TSL', () => {
  enableTrailingStoploss.value = true
  setStoploss(position, 'static')
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
