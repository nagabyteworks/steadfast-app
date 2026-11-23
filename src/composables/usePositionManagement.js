import { selectedBroker } from '@/stores/globalStore'
import axios from 'axios'
import { logRequestError } from '@/api/requestError'

import {
  BASE_URL,
  flatTradePositionBook,
  flattradePositionsStale,
  shoonyaPositionBook,
  positionSecurityIds,
  socket,
  defaultCallSecurityId,
  defaultPutSecurityId,
  currentSubscriptions,
  toastMessage,
  showToast,
  flatOrderBook,
  flatTradeBook,
  shoonyaOrderBook,
  shoonyaTradeBook,
  fundLimits,
  callStrikes,
  putStrikes
} from '@/stores/globalStore'

// Trade Configuration Composables
import { getExchangeSegment } from '@/composables/useTradeConfiguration'

// Real Time LTP Data Composables
import { subscribeToLTP } from '@/composables/useMarketData'

// WebSocket Composables
import { subscribeToOptions, subscribeToPositionLTPs } from '@/composables/useWebSocket'

export const updateFundLimits = async () => {
  await fetchFundLimit()
  // console.log('Updated Fund Limits:', fundLimits.value);
}
export const fetchFundLimit = async () => {
  try {
    if (!selectedBroker.value) {
      throw new Error('No broker selected')
    }

    let response
    if (selectedBroker.value?.brokerName === 'Flattrade') {
      const FLATTRADE_API_TOKEN = import.meta.env.PROD ? null : localStorage.getItem('FLATTRADE_API_TOKEN')
      if (!import.meta.env.PROD && !FLATTRADE_API_TOKEN) {
        throw new Error('Flattrade API Token is missing')
      }
      response = await axios.post(`${BASE_URL}/flattrade/fundLimit`, null, {
        params: import.meta.env.PROD ? {} : {
          FLATTRADE_API_TOKEN,
          FLATTRADE_CLIENT_ID: selectedBroker.value.clientId
        }
      })
      fundLimits.value = {
        cash: response.data.cash,
        payin: response.data.payin,
        marginused: response.data.marginused
      }
    } else if (selectedBroker.value?.brokerName === 'Shoonya') {
      const SHOONYA_API_TOKEN = localStorage.getItem('SHOONYA_API_TOKEN')
      if (!SHOONYA_API_TOKEN) {
        throw new Error('Shoonya API Token is missing')
      }
      response = await axios.post(`${BASE_URL}/shoonya/fundLimit`, null, {
        params: {
          SHOONYA_API_TOKEN,
          SHOONYA_CLIENT_ID: selectedBroker.value.clientId
        }
      })
      // Make sure the response data has the correct structure
      fundLimits.value = {
        cash: response.data.cash,
        payin: response.data.payin,
        marginused: response.data.marginused
        // Add any other relevant fields from the Shoonya response
      }
    } else {
      throw new Error('Unsupported broker')
    }
    // fundLimits.value = response.data;
  } catch (error) {
    logRequestError('Failed to fetch fund limits', error)
  }
}

export const fetchFlattradeOrdersTradesBook = async () => {
  const jKey = import.meta.env.PROD ? null : localStorage.getItem('FLATTRADE_API_TOKEN')

  if (!selectedBroker.value || selectedBroker.value?.brokerName !== 'Flattrade') {
    toastMessage.value = 'Flattrade broker is not selected.'
    showToast.value = true
    return
  }

  const clientId = selectedBroker.value.clientId

  if ((!import.meta.env.PROD && !jKey) || !clientId) {
    toastMessage.value = 'Token or Client ID is missing. Please generate a token first.'
    showToast.value = true
    return
  }

  try {
    const response = await axios.get(`${BASE_URL}/flattrade/getOrdersAndTrades`, {
      params: import.meta.env.PROD ? {} : {
        FLATTRADE_API_TOKEN: jKey,
        FLATTRADE_CLIENT_ID: clientId
      }
    })

    flatOrderBook.value = response.data.orderBook
    flatTradeBook.value = response.data.tradeBook
    // console.log('Flattrade Order Book:', response.data.orderBook);
    // console.log('Flattrade Trade Book:', response.data.tradeBook);
  } catch (error) {
    toastMessage.value = 'Error fetching trades: ' + error.message
    showToast.value = true
    logRequestError('Error fetching trades', error)
  }
}
export const fetchShoonyaOrdersTradesBook = async () => {
  let jKey = localStorage.getItem('SHOONYA_API_TOKEN') || token.value

  if (!selectedBroker.value || selectedBroker.value?.brokerName !== 'Shoonya') {
    toastMessage.value = 'Shoonya broker is not selected.'
    showToast.value = true
    return
  }

  const clientId = selectedBroker.value.clientId

  if (!jKey || !clientId) {
    toastMessage.value = 'Token or Client ID is missing. Please generate a token first.'
    showToast.value = true
    return
  }

  try {
    const response = await axios.get(`${BASE_URL}/shoonya/getOrdersAndTrades`, {
      params: {
        SHOONYA_API_TOKEN: jKey,
        SHOONYA_CLIENT_ID: clientId
      }
    })

    shoonyaOrderBook.value = response.data.orderBook
    shoonyaTradeBook.value = response.data.tradeBook
    // console.log('Shoonya Order Book:', response.data.orderBook);
    // console.log('Shoonya Trade Book:', response.data.tradeBook);
  } catch (error) {
    toastMessage.value = 'Error fetching trades: ' + error.message
    showToast.value = true
    logRequestError('Error fetching trades', error)
  }
}
export const updatePositionSecurityIds = () => {
  flatTradePositionBook.value.forEach((position) => {
    if (position.tsym && !positionSecurityIds.value[position.tsym]) {
      positionSecurityIds.value[position.tsym] = position.token
    }
  })
  // Add this block for Shoonya positions
  shoonyaPositionBook.value.forEach((position) => {
    if (position.tsym && !positionSecurityIds.value[position.tsym]) {
      positionSecurityIds.value[position.tsym] = position.token
    }
  })
}
export const fetchFlattradePositions = async () => {
  const jKey = import.meta.env.PROD ? null : localStorage.getItem('FLATTRADE_API_TOKEN')

  if (!import.meta.env.PROD && !jKey) {
    toastMessage.value = 'Token is missing. Please generate a token first.'
    showToast.value = true
    return
  }

  if (!selectedBroker.value || selectedBroker.value?.brokerName !== 'Flattrade') {
    toastMessage.value = 'Flattrade broker is not selected.'
    showToast.value = true
    return
  }

  const clientId = selectedBroker.value.clientId

  const positionBookPayload = `jKey=${jKey}&jData=${JSON.stringify({ uid: clientId, actid: clientId })}`

  try {
    const positionBookRes = import.meta.env.PROD
      ? await axios.get(`${BASE_URL}/flattrade/positions`)
      : await axios.post('https://piconnect.flattrade.in/PiConnectAPI/PositionBook', positionBookPayload, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })

    if (
      Array.isArray(positionBookRes.data) &&
      positionBookRes.data.every((item) => item.stat === 'Ok')
    ) {
      flatTradePositionBook.value = positionBookRes.data
      flattradePositionsStale.value = false
      // console.log('Flattrade Position Book:', positionBookRes.data);
      updatePositionSecurityIds()
      subscribeToPositionLTPs()
      subscribeToOptions()
    } else if (
      positionBookRes.data?.emsg?.trim().toLowerCase() === 'no data'
    ) {
      flatTradePositionBook.value = []
      flattradePositionsStale.value = false
      // console.log('No positions in Flattrade Position Book');
    } else {
      console.error('Flattrade rejected the position book request')
      flattradePositionsStale.value = true
    }
  } catch (error) {
    logRequestError('Error fetching position book', error)
    flattradePositionsStale.value = true
  }
}
export const fetchShoonyaPositions = async () => {
  let jKey = localStorage.getItem('SHOONYA_API_TOKEN') || token.value

  if (!jKey) {
    toastMessage.value = 'Token is missing. Please generate a token first.'
    showToast.value = true
    return
  }

  if (!selectedBroker.value || selectedBroker.value?.brokerName !== 'Shoonya') {
    toastMessage.value = 'Shoonya broker is not selected.'
    showToast.value = true
    return
  }

  const clientId = selectedBroker.value.clientId

  const positionBookPayload = `jKey=${jKey}&jData=${JSON.stringify({ uid: clientId, actid: clientId })}`

  try {
    const positionBookRes = await axios.post(
      'https://api.shoonya.com/NorenWClientTP/PositionBook',
      positionBookPayload,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )

    if (
      Array.isArray(positionBookRes.data) &&
      positionBookRes.data.every((item) => item.stat === 'Ok')
    ) {
      shoonyaPositionBook.value = positionBookRes.data
      // console.log('Shoonya Position Book:', positionBookRes.data);
      updatePositionSecurityIds()
      subscribeToPositionLTPs()
      subscribeToOptions()
    } else if (
      positionBookRes.data.emsg === 'no data' ||
      positionBookRes.data.emsg.includes('no data')
    ) {
      shoonyaPositionBook.value = []
      // console.log('No positions in Shoonya Position Book');
    } else {
      const errorMsg = positionBookRes.data.emsg || 'Unknown error'
      console.error('Error fetching position book:', errorMsg)
      shoonyaPositionBook.value = []
    }
  } catch (error) {
    logRequestError('Error fetching position book', error)
    shoonyaPositionBook.value = []
  }
}

export const updateOrdersAndPositions = async () => {
  if (selectedBroker.value?.brokerName === 'Flattrade') {
    await Promise.all([fetchFlattradeOrdersTradesBook(), fetchFlattradePositions()])
  } else if (selectedBroker.value?.brokerName === 'Shoonya') {
    await Promise.all([fetchShoonyaOrdersTradesBook(), fetchShoonyaPositions()])
  }
}

export const findNewPosition = (tradingSymbol) => {
  if (selectedBroker.value?.brokerName === 'Flattrade') {
    return flatTradePositionBook.value.find((p) => p.tsym === tradingSymbol)
  } else if (selectedBroker.value?.brokerName === 'Shoonya') {
    return shoonyaPositionBook.value.find((p) => p.tsym === tradingSymbol)
  }
  return null
}

export const getSymbol = (position) => {
  return position.tsym || position.tradingSymbol || ''
}
