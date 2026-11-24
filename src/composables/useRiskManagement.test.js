import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  enableStoploss,
  enableTarget,
  flatTradePositionBook,
  positionLTPs,
  showToast,
  stoplosses,
  targets,
  toastMessage,
  trailingStoplosses
} from '@/stores/globalStore'
import { checkStoplossesAndTargets, resetRiskExitLocks } from './useRiskManagement'

vi.hoisted(() => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage)
})
vi.mock('./useOrderManagement', () => ({ placeOrderForPosition: vi.fn() }))
import { placeOrderForPosition } from './useOrderManagement'

beforeEach(() => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage)
  localStorage.clear()
  enableStoploss.value = true
  enableTarget.value = true
  flatTradePositionBook.value = [{ tsym: 'NIFTYCE', netqty: '50' }]
  positionLTPs.value = { NIFTYCE: 100 }
  stoplosses.value = { NIFTYCE: 105 }
  targets.value = { NIFTYCE: 95 }
  trailingStoplosses.value = {}
  showToast.value = false
  vi.stubGlobal('navigator', {
    locks: {
      request: vi.fn((name, options, callback) => Promise.resolve(callback({ name })))
    }
  })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

it('submits only one exit when stop and target trigger together', async () => {
  let finish
  placeOrderForPosition.mockReturnValue(new Promise((resolve) => { finish = resolve }))

  checkStoplossesAndTargets()
  checkStoplossesAndTargets()
  expect(placeOrderForPosition).toHaveBeenCalledTimes(1)
  expect(stoplosses.value.NIFTYCE).toBe(105)
  expect(targets.value.NIFTYCE).toBe(95)

  finish(true)
  await vi.waitFor(() => expect(stoplosses.value.NIFTYCE).toBeNull())
  expect(targets.value.NIFTYCE).toBeNull()
  expect(toastMessage.value).toMatch(/Verify fills/)
})

it('retains failed triggers and blocks retries until the user resets the lock', async () => {
  placeOrderForPosition.mockResolvedValue(false)
  checkStoplossesAndTargets()
  await vi.waitFor(() => expect(toastMessage.value).toMatch(/failed or is uncertain/))

  checkStoplossesAndTargets()
  expect(placeOrderForPosition).toHaveBeenCalledTimes(1)
  expect(stoplosses.value.NIFTYCE).toBe(105)
  expect(targets.value.NIFTYCE).toBe(95)

  resetRiskExitLocks()
  checkStoplossesAndTargets()
  expect(placeOrderForPosition).toHaveBeenCalledTimes(2)
})

it('does not submit an automatic exit without browser locking', () => {
  vi.stubGlobal('navigator', {})
  checkStoplossesAndTargets()
  expect(placeOrderForPosition).not.toHaveBeenCalled()
  expect(toastMessage.value).toMatch(/browser locking is not supported/)
})
