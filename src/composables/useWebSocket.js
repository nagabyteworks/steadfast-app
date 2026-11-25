import { markRaw } from 'vue'
import { isProductionProfile } from '@/config/profile'

import {
  socket,
  selectedBroker,
  wsConnectionState,
  reconnectAttempts,
  reconnectTimeout,
  MAX_RECONNECT_ATTEMPTS,
  INITIAL_RECONNECT_DELAY,
  lastMarketDataAt,
  brokerStreamHealth,
  selectedMasterSymbol,
  defaultCallSecurityId,
  defaultPutSecurityId,
  currentSubscriptions,
  exchangeSymbols,
  niftyPrice,
  bankNiftyPrice,
  finniftyPrice,
  midcpniftyPrice,
  sensexPrice,
  bankexPrice,
  latestCallLTP,
  latestPutLTP,
  callPercentChange,
  masterPercentChange,
  putPercentChange,
  positionPercentChanges,
  positionSecurityIds,
  positionLTPs,
  masterOpenPrice,
  masterHighPrice,
  masterLowPrice,
  masterClosePrice,
  callOpenPrice,
  callHighPrice,
  callLowPrice,
  callClosePrice,
  putOpenPrice,
  putHighPrice,
  putLowPrice,
  putClosePrice,
  flatTradePositionBook,
  shoonyaPositionBook
} from '@/stores/globalStore'

import { brokerStatus } from '@/composables/useBrokerFunctions'

// Trade Configuration Composables
import { getExchangeSegment } from '@/composables/useTradeConfiguration'

let connectionGeneration = 0
let connectionUrl = null

export const isWebSocketReady = () => {
  return socket.value && socket.value.readyState === WebSocket.OPEN
}
export const safeWebSocketSend = (data) => {
  if (!isWebSocketReady()) {
    return false
  }

  try {
    socket.value.send(JSON.stringify(data))
    return true
  } catch (error) {
    console.error('Error sending WebSocket message:', error)
    return false
  }
}

const resetSubscriptions = () => {
  currentSubscriptions.value = {
    masterSymbol: null,
    masterSymbolExchangeCode: null,
    masterSymbolSecurityId: null,
    callOption: null,
    putOption: null,
    positionSymbols: []
  }
}

const clearReconnectTimer = () => {
  if (reconnectTimeout.value !== null) {
    clearTimeout(reconnectTimeout.value)
    reconnectTimeout.value = null
  }
}

export const disconnectWebSocket = () => {
  connectionGeneration += 1
  clearReconnectTimer()
  const activeSocket = socket.value
  socket.value = null
  connectionUrl = null
  resetSubscriptions()
  wsConnectionState.value = 'disconnected'
  if (activeSocket && activeSocket.readyState < WebSocket.CLOSING) {
    activeSocket.close(1000, 'Client disconnected')
  }
}

export const connectWebSocket = () => {
  const isDev = !isProductionProfile
  const wsBaseUrl = isDev
    ? 'ws://localhost'
    : import.meta.env.VITE_BASE_URL.replace('http', 'ws').replace('https', 'wss')

  const getWebSocketUrl = (broker) => {
    if (isDev) {
      return broker === 'Flattrade' ? `${wsBaseUrl}:8765/ws` : `${wsBaseUrl}:8766/ws`
    } else {
      return `${wsBaseUrl}/ws/${broker.toLowerCase()}`
    }
  }

  if (
    !['Flattrade', 'Shoonya'].includes(selectedBroker.value?.brokerName) ||
    brokerStatus.value !== 'Connected'
  ) {
    disconnectWebSocket()
    console.error('Invalid broker or broker not connected')
    return
  }

  const websocketUrl = getWebSocketUrl(selectedBroker.value.brokerName)
  if (
    socket.value &&
    connectionUrl === websocketUrl &&
    socket.value.readyState < WebSocket.CLOSING
  ) {
    return
  }

  disconnectWebSocket()
  const generation = connectionGeneration
  connectionUrl = websocketUrl
  reconnectAttempts.value = 0
  console.log(`Attempting to connect to WebSocket at ${websocketUrl}`)

  const isCurrentConnection = () => generation === connectionGeneration
  const brokerIsConnected = () =>
    ['Flattrade', 'Shoonya'].includes(selectedBroker.value?.brokerName) &&
    brokerStatus.value === 'Connected'

  const scheduleReconnect = () => {
    if (!isCurrentConnection() || reconnectTimeout.value !== null) return
    if (!brokerIsConnected()) {
      wsConnectionState.value = 'disconnected'
      return
    }
    if (reconnectAttempts.value >= MAX_RECONNECT_ATTEMPTS) {
      wsConnectionState.value = 'error'
      const failedSocket = socket.value
      socket.value = null
      resetSubscriptions()
      if (failedSocket && failedSocket.readyState < WebSocket.CLOSING) {
        failedSocket.close()
      }
      return
    }
    reconnectAttempts.value += 1
    const delay = Math.min(
      30_000,
      INITIAL_RECONNECT_DELAY * 2 ** (reconnectAttempts.value - 1)
    )
    const jitteredDelay = Math.round(delay * (0.75 + Math.random() * 0.5))
    reconnectTimeout.value = setTimeout(() => {
      reconnectTimeout.value = null
      if (!isCurrentConnection() || !brokerIsConnected()) return
      const failedSocket = socket.value
      socket.value = null
      resetSubscriptions()
      if (failedSocket && failedSocket.readyState < WebSocket.CLOSING) {
        failedSocket.close()
      }
      connect()
    }, jitteredDelay)
  }

  const connect = () => {
    if (!isCurrentConnection() || !brokerIsConnected()) return
    wsConnectionState.value = 'connecting'
    let activeSocket
    try {
      activeSocket = new WebSocket(websocketUrl)
      socket.value = markRaw(activeSocket)

      const connectionTimeout = setTimeout(() => {
        if (
          isCurrentConnection() &&
          socket.value === activeSocket &&
          activeSocket.readyState !== WebSocket.OPEN
        ) {
          activeSocket.close()
          scheduleReconnect()
        }
      }, 5000)

      activeSocket.onopen = () => {
        if (!isCurrentConnection() || socket.value !== activeSocket) {
          activeSocket.close(1000, 'Superseded connection')
          return
        }
        clearTimeout(connectionTimeout)
        clearReconnectTimer()
        wsConnectionState.value = 'connected'
        reconnectAttempts.value = 0

        const initialData = {
          action: 'initialize',
          broker: selectedBroker.value.brokerName,
          masterSymbol: selectedMasterSymbol.value,
          callSecurityId: defaultCallSecurityId.value,
          putSecurityId: defaultPutSecurityId.value
        }
        activeSocket.send(JSON.stringify(initialData))

        subscribeToMasterSymbol()
        subscribeToOptions()
      }

      activeSocket.onmessage = (event) => {
        if (isCurrentConnection() && socket.value === activeSocket) {
          handleWebSocketMessage(event)
        }
      }

      activeSocket.onerror = () => {
        if (!isCurrentConnection() || socket.value !== activeSocket) return
        wsConnectionState.value = 'error'
        scheduleReconnect()
      }

      activeSocket.onclose = () => {
        clearTimeout(connectionTimeout)
        if (!isCurrentConnection() || socket.value !== activeSocket) return
        socket.value = null
        wsConnectionState.value = 'disconnected'
        resetSubscriptions()
        scheduleReconnect()
      }
    } catch (error) {
      console.error('Error creating WebSocket connection:', error.message)
      scheduleReconnect()
    }
  }

  connect()
}

export const handleWebSocketMessage = (event) => {
  try {
    const data = JSON.parse(event.data)
    if (data.type === 'stream_health' && data.status && typeof data.status === 'object') {
      brokerStreamHealth.value = data.status
      const lastTickAt = Date.parse(data.status.lastTickAt)
      if (Number.isFinite(lastTickAt)) lastMarketDataAt.value = lastTickAt
      return
    }

    const lastPrice = Number(data.lp)
    if (data.tk && data.lp !== undefined && Number.isFinite(lastPrice)) {
      lastMarketDataAt.value = Date.now()
      updateMasterSymbolPrice(data)
      updateOptionPrices(data)
      updatePositionLTPs(data)
    }
  } catch (error) {
    console.error('Error processing WebSocket message:', error.message)
  }
}

export const updateMasterSymbolPrice = (quoteData) => {
  const symbolInfo = exchangeSymbols.value.symbolData[selectedMasterSymbol.value]
  if (symbolInfo && quoteData.tk === symbolInfo.exchangeSecurityId) {
    const priceMap = {
      NIFTY: niftyPrice,
      BANKNIFTY: bankNiftyPrice,
      FINNIFTY: finniftyPrice,
      MIDCPNIFTY: midcpniftyPrice,
      SENSEX: sensexPrice,
      BANKEX: bankexPrice
    }

    if (priceMap[selectedMasterSymbol.value]) {
      const newPrice = parseFloat(quoteData.lp)
      if (!isNaN(newPrice)) {
        priceMap[selectedMasterSymbol.value].value = newPrice
        const percentChange = readPercentChange(quoteData)
        if (percentChange !== undefined) masterPercentChange.value = percentChange
        // console.log(`Updated ${selectedMasterSymbol.value} price to:`, newPrice)
        updateOHLCIfNotEmpty('master', quoteData)
      } else {
        console.warn('Invalid price received for master symbol:', quoteData.lp)
      }
    }
  }
}

// Ticks are partial updates; undefined means this tick carries no change figure
const readPercentChange = (quoteData) => {
  const value = quoteData.pc !== undefined ? Number(quoteData.pc) : NaN
  if (Number.isFinite(value)) return value
  const close = Number(quoteData.c)
  const last = Number(quoteData.lp)
  return close > 0 && Number.isFinite(last) ? ((last - close) / close) * 100 : undefined
}

export const updateOptionPrices = (quoteData) => {
  const percentChange = readPercentChange(quoteData)
  const newPrice = parseFloat(quoteData.lp)
  if (isNaN(newPrice)) {
    console.warn('Invalid option price received:', quoteData.lp)
    return
  }

  if (quoteData.tk === defaultCallSecurityId.value) {
    latestCallLTP.value = newPrice
    if (percentChange !== undefined) callPercentChange.value = percentChange
    // console.log('Updated Call LTP:', newPrice)
    updateOHLCIfNotEmpty('call', quoteData)
  } else if (quoteData.tk === defaultPutSecurityId.value) {
    latestPutLTP.value = newPrice
    if (percentChange !== undefined) putPercentChange.value = percentChange
    // console.log('Updated Put LTP:', newPrice)
    updateOHLCIfNotEmpty('put', quoteData)
  }
}

export const updatePositionLTPs = (quoteData) => {
  const positionTsym = Object.keys(positionSecurityIds.value).find(
    (tsym) => positionSecurityIds.value[tsym] === quoteData.tk
  )

  if (positionTsym) {
    const newPrice = parseFloat(quoteData.lp)
    if (!isNaN(newPrice)) {
      // Create a new object to ensure reactivity
      positionLTPs.value = {
        ...positionLTPs.value,
        [positionTsym]: newPrice
      }
      const percentChange = readPercentChange(quoteData)
      if (percentChange !== undefined) {
        positionPercentChanges.value = { ...positionPercentChanges.value, [positionTsym]: percentChange }
      }
      // console.log(`Updated LTP for position ${positionTsym}:`, newPrice)
    } else {
      console.warn(`Invalid price received for position ${positionTsym}:`, quoteData.lp)
    }
  }
}

// Helper function to update OHLC values if they are not empty
export const updateOHLCIfNotEmpty = (type, data) => {
  if (type === 'master') {
    if (data.o) masterOpenPrice.value = data.o
    if (data.h) masterHighPrice.value = data.h
    if (data.l) masterLowPrice.value = data.l
    if (data.c) masterClosePrice.value = data.c
  } else if (type === 'call') {
    if (data.o) callOpenPrice.value = data.o
    if (data.h) callHighPrice.value = data.h
    if (data.l) callLowPrice.value = data.l
    if (data.c) callClosePrice.value = data.c
  } else if (type === 'put') {
    if (data.o) putOpenPrice.value = data.o
    if (data.h) putHighPrice.value = data.h
    if (data.l) putLowPrice.value = data.l
    if (data.c) putClosePrice.value = data.c
  }
}

export const subscribeToMasterSymbol = () => {
  if (!isWebSocketReady()) return

  const symbolInfo = exchangeSymbols.value.symbolData[selectedMasterSymbol.value]
  if (symbolInfo) {
    const symbolToSubscribe = `${symbolInfo.exchangeCode}|${symbolInfo.exchangeSecurityId}`
    const previousSymbol = currentSubscriptions.value.masterSymbolExchangeCode &&
      currentSubscriptions.value.masterSymbolSecurityId
      ? `${currentSubscriptions.value.masterSymbolExchangeCode}|${currentSubscriptions.value.masterSymbolSecurityId}`
      : null
    if (symbolToSubscribe !== previousSymbol) {
      if (previousSymbol && !safeWebSocketSend({ action: 'unsubscribe', symbols: [previousSymbol] })) {
        return
      }
      const data = {
        action: 'subscribe',
        symbols: [symbolToSubscribe]
      }

      if (safeWebSocketSend(data)) {
        currentSubscriptions.value.masterSymbol = selectedMasterSymbol.value
        currentSubscriptions.value.masterSymbolExchangeCode = symbolInfo.exchangeCode
        currentSubscriptions.value.masterSymbolSecurityId = symbolInfo.exchangeSecurityId
      }
    }
  }
}
export const subscribeToOptions = () => {
  if (socket.value && socket.value.readyState === WebSocket.OPEN) {
    const exchangeSegment = getExchangeSegment()
    const nextCallOption = defaultCallSecurityId.value && defaultCallSecurityId.value !== 'N/A'
      ? `${exchangeSegment}|${defaultCallSecurityId.value}`
      : null
    const nextPutOption = defaultPutSecurityId.value && defaultPutSecurityId.value !== 'N/A'
      ? `${exchangeSegment}|${defaultPutSecurityId.value}`
      : null
    const previousOptions = [
      currentSubscriptions.value.callOption,
      currentSubscriptions.value.putOption
    ].filter((symbol) => symbol && ![nextCallOption, nextPutOption].includes(symbol))
    const nextOptions = [nextCallOption, nextPutOption]
      .filter((symbol) => symbol && ![
        currentSubscriptions.value.callOption,
        currentSubscriptions.value.putOption
      ].includes(symbol))

    if (previousOptions.length > 0) {
      if (!safeWebSocketSend({ action: 'unsubscribe', symbols: previousOptions })) return
    }
    if (nextOptions.length > 0) {
      if (!safeWebSocketSend({ action: 'subscribe', symbols: nextOptions })) return
    }
    currentSubscriptions.value.callOption = nextCallOption
    currentSubscriptions.value.putOption = nextPutOption
  }

  subscribeToPositionLTPs()
}

export const unsubscribeFromSymbols = (symbols) => {
  if (socket.value && socket.value.readyState === WebSocket.OPEN && symbols.length > 0) {
    const data = {
      action: 'unsubscribe',
      symbols: symbols
    }
    safeWebSocketSend(data)
  }
}

export const subscribeToPositionLTPs = () => {
  if (socket.value && socket.value.readyState === WebSocket.OPEN) {
    const symbolsToSubscribe = [...new Set(Object.entries(positionSecurityIds.value)
      .map(([tsym, token]) => {
        const position = [...flatTradePositionBook.value, ...shoonyaPositionBook.value].find(
          (p) => p.tsym === tsym
        )

        if (!position) {
          // console.warn(`No position found for tsym: ${tsym}`);
          return null
        }

        const exchange = position.exch || position.exchangeSegment
        return `${exchange}|${token}`
      })
      .filter(Boolean))]

    const previousSymbols = currentSubscriptions.value.positionSymbols || []
    const symbolsToUnsubscribe = previousSymbols.filter((symbol) => !symbolsToSubscribe.includes(symbol))
    const newSymbols = symbolsToSubscribe.filter((symbol) => !previousSymbols.includes(symbol))

    if (symbolsToUnsubscribe.length > 0) {
      if (!safeWebSocketSend({ action: 'unsubscribe', symbols: symbolsToUnsubscribe })) return
    }
    if (newSymbols.length > 0) {
      if (!safeWebSocketSend({ action: 'subscribe', symbols: newSymbols })) return
    }
    currentSubscriptions.value.positionSymbols = symbolsToSubscribe
  }
}
