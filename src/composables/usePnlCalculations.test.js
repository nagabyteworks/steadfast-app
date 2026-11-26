import { expect, it, vi } from 'vitest'

const mockStore = vi.hoisted(() => ({
  selectedBroker: { value: null },
  fundLimits: { value: {} },
  flatTradePositionBook: { value: [] },
  shoonyaPositionBook: { value: [] },
  positionLTPs: { value: {} },
  flatTradeBook: { value: [] },
  shoonyaTradeBook: { value: [] }
}))
vi.mock('@/stores/globalStore', () => mockStore)

import { estimateTradingCharges, netPnl, totalProfit } from './usePnlCalculations'

it('splits Flattrade BSE options taxes and exchange charges from brokerage', () => {
  const charges = estimateTradingCharges({
    brokerName: 'Flattrade',
    positions: [{ exch: 'BFO', daybuyamt: '100000', daysellamt: '120000' }]
  })

  expect(charges).toEqual({
    tax: 195.91,
    other: 72.82,
    brokerage: 0,
    total: 268.73
  })
})

it('counts Shoonya option brokerage once per order despite partial fills', () => {
  const charges = estimateTradingCharges({
    brokerName: 'Shoonya',
    positions: [{ exch: 'BFO', daybuyamt: '100000', daysellamt: '120000' }],
    trades: [
      { exch: 'BFO', norenordno: 'buy-1', flqty: '50', flprc: '100' },
      { exch: 'BFO', norenordno: 'buy-1', flqty: '50', flprc: '100' },
      { exch: 'BFO', norenordno: 'sell-1', flqty: '100', flprc: '120' }
    ]
  })

  expect(charges).toEqual({
    tax: 197.71,
    other: 71.72,
    brokerage: 10,
    total: 279.43
  })
})

it('computes net P&L as gross P&L minus total estimated charges', () => {
  mockStore.selectedBroker.value = { brokerName: 'Flattrade' }
  mockStore.flatTradePositionBook.value = [{
    exch: 'BFO',
    tsym: 'SENSEX26NOV2683000CE',
    netqty: '0',
    netavgprc: '100',
    lp: '100',
    rpnl: '1050',
    daybuyamt: '100000',
    daysellamt: '120000'
  }]

  expect(totalProfit.value).toBe(1050)
  expect(netPnl.value).toBe(781.27)
})
