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
  positionLTPs,
  reconciliationRequired,
  riskRules,
  selectedBroker
} from '@/stores/globalStore'

const originalState = {
  positions: flatTradePositionBook.value,
  prices: positionLTPs.value,
  reconciliation: reconciliationRequired.value,
  rules: riskRules.value,
  broker: selectedBroker.value
}

afterEach(() => {
  flatTradePositionBook.value = originalState.positions
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
