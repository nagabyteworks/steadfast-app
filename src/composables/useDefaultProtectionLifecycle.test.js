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
import { updateOrdersAndPositions } from '@/composables/usePositionManagement'
import {
  enableStoploss, enableTarget, enableTargetTrail, enableTrailingStoploss,
  flatTradeBook, flatTradePositionBook, latestCallLTP, lotsPerSymbol, positionLTPs,
  riskRules, selectedBroker, selectedCallStrike, selectedExchange, selectedMasterSymbol,
  selectedOrderType, selectedProductType, stoplossValue, targetTrailValue, targetValue
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
  await nextTick()
  riskRules.value = {}
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
