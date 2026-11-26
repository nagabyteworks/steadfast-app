// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import ReconciliationNotice from './ReconciliationNotice.vue'

it('explains missing verification without offering an unverified override', () => {
  const notice = mount(ReconciliationNotice, { props: { message: 'opening fill unavailable' } })
  expect(notice.text()).toContain('RECONCILIATION_REQUIRED: opening fill unavailable')
  expect(notice.text()).toContain('A user confirmation or uploaded document alone is not proof')
  expect(notice.text()).toContain('not yet available')
  expect(notice.find('button').exists()).toBe(false)
  expect(notice.find('input').exists()).toBe(false)
})
