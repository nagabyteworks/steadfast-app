// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import ReconciliationNotice from './ReconciliationNotice.vue'

it('shows only the simple recovery status', () => {
  const notice = mount(ReconciliationNotice, { props: { status: 'ACTION REQUIRED' } })
  expect(notice.text()).toBe('ACTION REQUIRED')
  expect(notice.find('button').exists()).toBe(false)
  expect(notice.find('input').exists()).toBe(false)
})
