import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'

vi.hoisted(() => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage)
})
vi.mock('@/config/profile', () => ({ usesServerManagedAccount: true }))
vi.mock('@/api/riskRules', () => ({
  fetchRiskRules: vi.fn(),
  createRiskRule: vi.fn(async (tsym, body) => ({ ...body, tsym, status: 'armed', rev: 1 })),
  createDefaultRiskRule: vi.fn(async (tsym, settings) => {
    const { flatTradeBook, flatTradePositionBook, riskRules } = await import('@/stores/globalStore')
    const { reconstructOpeningFill } = await import('../../../steadfast-api/positionLifecycle.js')
    const position = flatTradePositionBook.value.find((item) => item.tsym === tsym)
    const relevant = flatTradeBook.value.filter((item) => item.tsym === tsym && item.prd === position.prd && item.exch === position.exch)
    const total = (side) => relevant.filter((item) => item.trantype === side).reduce((sum, item) => sum + Number(item.flqty), 0)
    const opening = reconstructOpeningFill({
      ...position, daybuyqty: String(total('B')), daysellqty: String(total('S')), cfbuyqty: '0', cfsellqty: '0'
    }, flatTradeBook.value, '2026-11-26')
    const existing = riskRules.value[tsym]
    if (existing?.status === 'armed' && existing.entry === opening.openingPrice) return existing
    const sign = opening.side === 'long' ? 1 : -1
    return {
      tsym, status: 'armed', rev: 1, instrument: `${position.exch}|${position.token}`, side: opening.side,
      entry: opening.openingPrice, monitor: settings.monitor,
      mode: settings.targetTrailing ? 'target_trail' : settings.trailingStop ? 'trailing_sl' : 'static',
      slPrice: settings.stopPoints === null ? null : opening.openingPrice - sign * settings.stopPoints,
      slPoints: settings.stopPoints,
      targetPrice: settings.targetPoints === null ? null : opening.openingPrice + sign * settings.targetPoints,
      trailPoints: settings.trailPoints
    }
  }),
  patchRiskRule: vi.fn(async () => ({})),
  deleteRiskRule: vi.fn(async () => ({}))
}))
vi.mock('@/composables/usePositionManagement', async () => {
  const { flatTradePositionBook } = await import('@/stores/globalStore')
  return {
    updateOrdersAndPositions: vi.fn(async () => {}),
    updateFundLimits: vi.fn(async () => {}),
    findNewPosition: vi.fn((tsym) => flatTradePositionBook.value.find((position) => position.tsym === tsym)),
    getSymbol: vi.fn((position) => position.tsym),
    fetchFlattradeOrdersTradesBook: vi.fn(),
    fetchShoonyaOrdersTradesBook: vi.fn()
  }
})

import { placeOrder } from './useOrderManagement'
import { createDefaultRiskRule, fetchRiskRules } from '@/api/riskRules'
import { updateOrdersAndPositions } from '@/composables/usePositionManagement'
import {
  enableStoploss, enableTarget, enableTargetTrail, enableTrailingStoploss,
  flatTradeBook, flatTradePositionBook, flattradePositionsStale, latestCallLTP, lotsPerSymbol, positionLTPs,
  reconciliationRequired, riskRules, selectedBroker, selectedCallStrike, selectedExchange, selectedMasterSymbol,
  selectedOrderType, selectedProductType, showToast, stoplossValue, targetTrailValue, targetValue, toastMessage
} from '@/stores/globalStore'

const symbol = 'NIFTYCE'
const position = (qty, average) => ({
  tsym: symbol, exch: 'NFO', token: '123', prd: 'M', netqty: String(qty), netavgprc: String(average)
})
const fill = (id, side, price, time) => ({
  norenordno: id, flid: id, tsym: symbol, exch: 'NFO', prd: 'M',
  trantype: side, flqty: '75', flprc: String(price), fltm: `26-11-2026 ${time}`
})
const modes = [
  { name: 'fixed stop-loss', stop: true, target: false, trailing: false, targetTrail: false, expected: { mode: 'static', slPrice: 140, targetPrice: null } },
  { name: 'fixed target', stop: false, target: true, trailing: false, targetTrail: false, expected: { mode: 'static', slPrice: null, targetPrice: 170 } },
  { name: 'trailing stop-loss', stop: true, target: false, trailing: true, targetTrail: false, expected: { mode: 'trailing_sl', slPrice: 140, targetPrice: null, slPoints: 10 } },
  { name: 'target trailing', stop: true, target: true, trailing: false, targetTrail: true, expected: { mode: 'target_trail', slPrice: 140, targetPrice: 170, trailPoints: 5 } }
]

beforeEach(async () => {
  vi.useFakeTimers()
  vi.spyOn(axios, 'post').mockResolvedValue({ data: { stat: 'Ok', norenordno: '3' } })
  selectedBroker.value = { brokerName: 'Flattrade', clientId: 'test-user' }
  selectedMasterSymbol.value = 'NIFTY'
  selectedExchange.value = 'NFO'
  selectedCallStrike.value = { tradingSymbol: symbol, securityId: '123', lotSize: 75 }
  selectedOrderType.value = 'MKT'
  selectedProductType.value = 'M'
  lotsPerSymbol.value = { NIFTY: 1 }
  stoplossValue.value = 10
  targetValue.value = 20
  targetTrailValue.value = 5
  enableTargetTrail.value = false
  enableTrailingStoploss.value = false
  flattradePositionsStale.value = false
  await nextTick()
  riskRules.value = {}
  reconciliationRequired.value = {}
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  flatTradeBook.value = []
  flatTradePositionBook.value = []
  positionLTPs.value = {}
  riskRules.value = {}
})

const configure = async (mode) => {
  enableStoploss.value = mode.stop
  enableTarget.value = mode.target
  enableTrailingStoploss.value = mode.trailing
  enableTargetTrail.value = mode.targetTrail
  await nextTick()
}

const submitBuy = async () => {
  const submitted = placeOrder('BUY', 'CALL')
  await vi.advanceTimersByTimeAsync(1000)
  await submitted
}

describe.each(modes)('default $name lifecycle', (mode) => {
  it.each([false, true])('uses the reopened fill with stale prior rule: %s', async (staleRule) => {
    await configure(mode)
    flatTradeBook.value = [
      fill('1', 'B', 100, '09:15:00'),
      fill('2', 'S', 120, '09:20:00')
    ]
    flatTradePositionBook.value = [position(0, 100)]
    vi.mocked(updateOrdersAndPositions).mockImplementationOnce(async () => {
      flatTradeBook.value = [...flatTradeBook.value, fill('3', 'B', 150, '09:25:00')]
      flatTradePositionBook.value = [position(75, 125)]
    })
    latestCallLTP.value = '155'
    positionLTPs.value = { [symbol]: 155 }
    if (staleRule) {
      riskRules.value = {
        [symbol]: {
          tsym: symbol, status: 'armed', instrument: 'NFO|123', side: 'long', entry: 100,
          monitor: 'server', slPoints: null, trailPoints: null, ...mode.expected,
          slPrice: mode.stop ? 90 : null, targetPrice: mode.target ? 120 : null
        }
      }
    }

    await submitBuy()

    expect(riskRules.value[symbol]).toMatchObject({ entry: 150, ...mode.expected })
  })

  it('keeps the first open fill and existing levels when another lot is bought', async () => {
    await configure(mode)
    flatTradeBook.value = [
      fill('1', 'B', 100, '09:15:00'),
      fill('2', 'S', 120, '09:20:00'),
      fill('3', 'B', 150, '09:25:00')
    ]
    flatTradePositionBook.value = [position(75, 125)]
    vi.mocked(axios.post).mockResolvedValue({ data: { stat: 'Ok', norenordno: '4' } })
    vi.mocked(updateOrdersAndPositions).mockImplementationOnce(async () => {
      flatTradeBook.value = [...flatTradeBook.value, fill('4', 'B', 200, '09:30:00')]
      flatTradePositionBook.value = [position(150, 150)]
    })
    latestCallLTP.value = '200'
    positionLTPs.value = { [symbol]: 200 }
    riskRules.value = {
      [symbol]: {
        tsym: symbol, status: 'armed', instrument: 'NFO|123', side: 'long', entry: 150,
        monitor: 'server', slPoints: null, trailPoints: null, ...mode.expected
      }
    }

    await submitBuy()

    expect(riskRules.value[symbol]).toMatchObject({ entry: 150, ...mode.expected })
  })
})

it('preserves manually adjusted trailing levels when another lot is bought', async () => {
  await configure(modes[3])
  flatTradeBook.value = [
    fill('3', 'B', 150, '09:25:00')
  ]
  flatTradePositionBook.value = [position(75, 150)]
  riskRules.value = {
    [symbol]: {
      tsym: symbol, status: 'armed', instrument: 'NFO|123', side: 'long', entry: 150,
      monitor: 'server', mode: 'target_trail', slPrice: 175, targetPrice: 180,
      slPoints: 10, trailPoints: 5
    }
  }
  vi.mocked(axios.post).mockResolvedValue({ data: { stat: 'Ok', norenordno: '4' } })
  vi.mocked(updateOrdersAndPositions).mockImplementationOnce(async () => {
    flatTradeBook.value = [...flatTradeBook.value, fill('4', 'B', 200, '09:30:00')]
    flatTradePositionBook.value = [position(150, 175)]
  })

  latestCallLTP.value = '200'
  positionLTPs.value = { [symbol]: 200 }

  await submitBuy()

  expect(riskRules.value[symbol]).toMatchObject({
    entry: 150, mode: 'target_trail', slPrice: 175, targetPrice: 180, trailPoints: 5
  })
})

it('does not overwrite an existing rule when the refreshed position book is stale', async () => {
  await configure(modes[3])
  flatTradePositionBook.value = [position(75, 150)]
  riskRules.value = {
    [symbol]: {
      tsym: symbol, status: 'armed', instrument: 'NFO|123', side: 'long', entry: 150,
      monitor: 'server', ...modes[3].expected
    }
  }
  vi.mocked(updateOrdersAndPositions).mockImplementationOnce(async () => {
    flattradePositionsStale.value = true
  })
  latestCallLTP.value = '200'
  positionLTPs.value = { [symbol]: 200 }

  await submitBuy()

  expect(riskRules.value[symbol]).toMatchObject({ entry: 150, ...modes[3].expected })
  expect(showToast.value).toBe(true)
  expect(toastMessage.value).toMatch(/position data is stale/i)
})

it('reports missing fill history without using the live or average price', async () => {
  await configure(modes[0])
  flatTradePositionBook.value = [position(0, 100)]
  vi.mocked(updateOrdersAndPositions).mockImplementationOnce(async () => {
    flatTradePositionBook.value = [position(75, 125)]
  })
  vi.mocked(createDefaultRiskRule).mockRejectedValueOnce({
    response: { data: { message: 'Position needs reconciliation: trade history is incomplete' } }
  })
  latestCallLTP.value = '155'
  positionLTPs.value = { [symbol]: 155 }

  await submitBuy()

  expect(riskRules.value[symbol]).toBeUndefined()
  expect(toastMessage.value).toMatch(/needs reconciliation/i)
})

it('refreshes suspended protection after default reconciliation fails', async () => {
  await configure(modes[0])
  flatTradePositionBook.value = [position(75, 150)]
  riskRules.value = { [symbol]: { tsym: symbol, status: 'armed', slPrice: 140 } }
  vi.mocked(createDefaultRiskRule).mockRejectedValueOnce({
    response: { data: { message: 'Previous protection is suspended; verify with Flattrade' } }
  })
  vi.mocked(fetchRiskRules).mockResolvedValueOnce({
    rules: [{ tsym: symbol, status: 'reconciliation_required', slPrice: 140 }],
    reconciliation: [{ tsym: symbol, status: 'RECONCILIATION_REQUIRED', message: 'opening fill unavailable' }]
  })
  await submitBuy()
  expect(riskRules.value[symbol].status).toBe('reconciliation_required')
  expect(reconciliationRequired.value[symbol].status).toBe('RECONCILIATION_REQUIRED')
  expect(toastMessage.value).toMatch(/protection is suspended/i)
})
