import { afterEach, expect, it, vi } from 'vitest'
import axios from 'axios'
import { fetchFlattradePositions } from './usePositionManagement'
import { selectedBroker, flatTradePositionBook, flattradePositionsStale } from '@/stores/globalStore'

vi.hoisted(() => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage)
})
afterEach(() => vi.restoreAllMocks())

it('marks positions stale instead of clearing them on a failed refresh', async () => {
  selectedBroker.value = { brokerName: 'Flattrade', clientId: 'test-user' }
  localStorage.setItem('FLATTRADE_API_TOKEN', 'test-token')
  flatTradePositionBook.value = [{ tsym: 'NIFTYCE', netqty: '75' }]
  flattradePositionsStale.value = false
  vi.spyOn(axios, 'post').mockRejectedValue(new Error('unavailable'))
  vi.spyOn(console, 'error').mockImplementation(() => {})

  await fetchFlattradePositions()

  expect(flatTradePositionBook.value).toEqual([{ tsym: 'NIFTYCE', netqty: '75' }])
  expect(flattradePositionsStale.value).toBe(true)
})

it('clears stale positions only when the broker explicitly reports no data', async () => {
  selectedBroker.value = { brokerName: 'Flattrade', clientId: 'test-user' }
  localStorage.setItem('FLATTRADE_API_TOKEN', 'test-token')
  flatTradePositionBook.value = [{ tsym: 'NIFTYCE', netqty: '75' }]
  flattradePositionsStale.value = true
  vi.spyOn(axios, 'post').mockResolvedValue({ data: { stat: 'Not_Ok', emsg: 'No Data' } })

  await fetchFlattradePositions()

  expect(flatTradePositionBook.value).toEqual([])
  expect(flattradePositionsStale.value).toBe(false)
})
