import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import axios from 'axios'
import { cancelOrder, closeAllPositions, placeOrder, prepareOrderPayload } from './useOrderManagement'
import {
  selectedBroker, selectedMasterSymbol, selectedExchange, flatTradePositionBook, toastMessage,
  selectedProductType, selectedOrderType, selectedQuantity, selectedCallStrike, lotsPerSymbol,
  latestCallLTP, latestPutLTP
} from '@/stores/globalStore'

vi.hoisted(() => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage)
})
beforeEach(() => {
  selectedBroker.value = { brokerName: 'Flattrade', clientId: 'test-user' }
  selectedMasterSymbol.value = 'NIFTY'
  selectedExchange.value = 'NFO'
  selectedCallStrike.value = { tradingSymbol: 'NIFTYCE', securityId: '123', lotSize: 75 }
  selectedOrderType.value = 'MKT'
  selectedProductType.value = 'M'
  lotsPerSymbol.value = { NIFTY: 1 }
})
afterEach(() => vi.restoreAllMocks())

it('preserves buy/sell and intraday/margin when using encoded modal values', () => {
  selectedBroker.value = { brokerName: 'Flattrade', clientId: 'test-user' }
  selectedOrderType.value = 'MKT'
  selectedQuantity.value = 50
  const strike = { tradingSymbol: 'NIFTYCE' }

  selectedProductType.value = 'I'
  expect(prepareOrderPayload('B', 'CALL', strike, 'NFO')).toMatchObject({
    trantype: 'B', prd: 'I'
  })

  selectedProductType.value = 'M'
  expect(prepareOrderPayload('S', 'CALL', strike, 'NFO')).toMatchObject({
    trantype: 'S', prd: 'M'
  })
})

it('uses the selected option price for limit-at-LTP and rejects unavailable prices', () => {
  selectedOrderType.value = 'LMT_LTP'
  latestCallLTP.value = '123.45'
  latestPutLTP.value = '87.65'
  const strike = { tradingSymbol: 'NIFTYCE' }
  expect(prepareOrderPayload('BUY', 'CALL', strike, 'NFO').prc).toBe('123.45')
  expect(prepareOrderPayload('BUY', 'PUT', strike, 'NFO').prc).toBe('87.65')
  latestCallLTP.value = 'N/A'
  expect(() => prepareOrderPayload('BUY', 'CALL', strike, 'NFO')).toThrow('Current option price is unavailable')
})

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

it('shows the full rejection from the API and does not retry', async () => {
  const post = vi.spyOn(axios, 'post').mockRejectedValue({
    response: { data: { message: 'Flattrade rejected the order: insufficient funds' } }
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})

  await placeOrder('BUY', 'CALL')

  expect(post).toHaveBeenCalledTimes(1)
  expect(toastMessage.value).toBe('Flattrade rejected the order: insufficient funds')
})

it('reports broker rejections returned with HTTP 200', async () => {
  vi.spyOn(axios, 'post').mockResolvedValue({ data: { stat: 'Not_Ok', emsg: 'Market is closed' } })
  vi.spyOn(console, 'error').mockImplementation(() => {})

  await placeOrder('BUY', 'CALL')

  expect(toastMessage.value).toBe('Broker rejected the order: Market is closed')
})

it('warns that a network failure leaves the order status uncertain', async () => {
  const post = vi.spyOn(axios, 'post').mockRejectedValue(new Error('Network Error'))
  vi.spyOn(console, 'error').mockImplementation(() => {})

  await placeOrder('BUY', 'CALL')

  expect(post).toHaveBeenCalledTimes(1)
  expect(toastMessage.value).toMatch(/uncertain.*before retrying/i)
})
