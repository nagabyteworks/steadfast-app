// @vitest-environment jsdom
/* global jsdom */
import { afterEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PositionsTableComponent from './PositionsTableComponent.vue'

vi.hoisted(() => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage)
})

import {
  flatTradePositionBook,
  flatTradeBook,
  positionLTPs,
  reconciliationRequired,
  riskRules,
  selectedBroker
} from '@/stores/globalStore'

const originalState = {
  positions: flatTradePositionBook.value,
  trades: flatTradeBook.value,
  prices: positionLTPs.value,
  reconciliation: reconciliationRequired.value,
  rules: riskRules.value,
  broker: selectedBroker.value
}

afterEach(() => {
  flatTradePositionBook.value = originalState.positions
  flatTradeBook.value = originalState.trades
  positionLTPs.value = originalState.prices
  reconciliationRequired.value = originalState.reconciliation
  riskRules.value = originalState.rules
  selectedBroker.value = originalState.broker
})

it('keeps reconciliation details out of the positions table', () => {
  selectedBroker.value = { brokerName: 'Flattrade' }
  flatTradePositionBook.value = [{
    tsym: 'NIFTYCE', netqty: '75', netavgprc: '100', lp: '105',
    exch: 'NFO', prd: 'M', rpnl: '0'
  }]
  reconciliationRequired.value = {
    NIFTYCE: { status: 'RECONCILIATION_REQUIRED', message: 'opening fill unavailable' }
  }
  riskRules.value = {}

  const wrapper = mount(PositionsTableComponent, {
    props: { positions: flatTradePositionBook.value, selectedBroker: selectedBroker.value }
  })

  expect(wrapper.text()).not.toContain('RECONCILIATION_REQUIRED')
  expect(wrapper.text()).not.toContain('opening fill unavailable')
})

it('expands an aggregated position into independent lot rows', async () => {
  selectedBroker.value = { brokerName: 'Flattrade' }
  flatTradePositionBook.value = [{
    tsym: 'NIFTYCE', netqty: '225', netavgprc: '100', lp: '105',
    exch: 'NFO', prd: 'M', rpnl: '0', ls: '75'
  }]
  flatTradeBook.value = [
    { tsym: 'NIFTYCE', exch: 'NFO', prd: 'M', trantype: 'B', norenordno: '1', flqty: '75', flprc: '100' },
    { tsym: 'NIFTYCE', exch: 'NFO', prd: 'M', trantype: 'B', norenordno: '2', flqty: '75', flprc: '102' },
    { tsym: 'NIFTYCE', exch: 'NFO', prd: 'M', trantype: 'B', norenordno: '3', flqty: '75', flprc: '104' }
  ]
  riskRules.value = {}

  const wrapper = mount(PositionsTableComponent, {
    props: { positions: flatTradePositionBook.value, selectedBroker: selectedBroker.value }
  })
  expect(wrapper.text()).not.toContain('Lot 1')

  await wrapper.find('[aria-label="Expand lots"]').trigger('click')

  expect(wrapper.text()).toContain('Lot 1')
  expect(wrapper.text()).toContain('Lot 2')
  expect(wrapper.text()).toContain('Lot 3')
  expect(wrapper.findAll('.lot-position-row')).toHaveLength(3)
})
