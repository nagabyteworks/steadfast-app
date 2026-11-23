import { afterEach, expect, it, vi } from 'vitest'
import axios from 'axios'
import { cancelOrder, closeAllPositions } from './useOrderManagement'
import {
  selectedBroker, selectedMasterSymbol, selectedExchange, flatTradePositionBook, toastMessage
} from '@/stores/globalStore'

vi.hoisted(() => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage)
})
afterEach(() => vi.restoreAllMocks())

it('does not report positions closed when the trading gate rejects the close order', async () => {
  selectedBroker.value = { brokerName: 'Flattrade', clientId: 'test-user' }
  selectedMasterSymbol.value = 'NIFTY'
  selectedExchange.value = 'NFO'
  flatTradePositionBook.value = [{ tsym: 'NIFTYCE', netqty: '75', prd: 'M' }]
  vi.spyOn(axios, 'post').mockRejectedValue(new Error('Trading is disabled'))
  vi.spyOn(console, 'error').mockImplementation(() => {})

  await closeAllPositions()

  expect(toastMessage.value).toBe('Failed to close all positions')
})

it('treats a broker cancellation rejection as a failure even with HTTP 200', async () => {
  selectedBroker.value = { brokerName: 'Flattrade', clientId: 'test-user' }
  vi.spyOn(axios, 'post').mockResolvedValue({ data: { stat: 'Not_Ok' } })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})

  await expect(cancelOrder({ norenordno: 'test-order', status: 'OPEN' })).rejects.toThrow(
    'Broker did not acknowledge the cancellation'
  )
  expect(toastMessage.value).toBe('Failed to cancel order')
})
