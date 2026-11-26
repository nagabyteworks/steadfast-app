// @vitest-environment jsdom
/* global jsdom */
import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import OrdersNTradesComponent from './OrdersNTradesComponent.vue'

vi.hoisted(() => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage)
})

it('colors BUY green and SELL red in desktop and mobile Side cells', () => {
  const wrapper = mount(OrdersNTradesComponent, {
    props: {
      selectedBroker: { brokerName: 'Flattrade' },
      combinedOrdersAndTrades: [{
        norenordno: '1',
        order: { status: 'OPEN', trantype: 'B', norenordno: '1', tsym: 'NIFTYCE' },
        trade: { stat: 'Ok', trantype: 'S', norenordno: '1', tsym: 'NIFTYCE' }
      }]
    }
  })

  expect(wrapper.find('.table-responsive tr td:nth-child(2)').classes()).toContain('text-success')
  expect(wrapper.findAll('.table-responsive tr td:nth-child(2)')[1].classes()).toContain('text-danger')
  const mobileSides = wrapper.findAll('.d-md-none strong').filter((side) =>
    ['BUY', 'SELL'].includes(side.text())
  )
  expect(mobileSides[0].classes()).toContain('text-success')
  expect(mobileSides[1].classes()).toContain('text-danger')
})
