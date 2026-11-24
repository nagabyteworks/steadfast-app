import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  currentSubscriptions,
  defaultCallSecurityId,
  defaultPutSecurityId,
  exchangeSymbols,
  selectedBroker,
  selectedMasterSymbol,
  socket,
  wsConnectionState,
  reconnectAttempts,
  reconnectTimeout
} from '@/stores/globalStore'
import { brokerStatus } from '@/composables/useBrokerFunctions'
import { connectWebSocket, disconnectWebSocket } from './useWebSocket'

vi.hoisted(() => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage)
})

vi.mock('@/composables/useBrokerFunctions', () => ({
  brokerStatus: { value: 'Connected' }
}))

vi.mock('@/composables/useTradeConfiguration', () => ({
  getExchangeSegment: () => 'NSE'
}))

const webSockets = []

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  constructor(url) {
    this.url = url
    this.readyState = MockWebSocket.CONNECTING
    this.sent = []
    webSockets.push(this)
  }

  send(message) {
    this.sent.push(JSON.parse(message))
  }

  open() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }

  fail() {
    this.onerror?.()
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ wasClean: false })
  }
}

describe('broker WebSocket lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', MockWebSocket)
    webSockets.length = 0
    selectedBroker.value = { brokerName: 'Flattrade' }
    brokerStatus.value = 'Connected'
    selectedMasterSymbol.value = 'NIFTY'
    exchangeSymbols.value = {
      symbolData: {
        NIFTY: { exchangeCode: 'NSE', exchangeSecurityId: '26000' }
      }
    }
    defaultCallSecurityId.value = '12345'
    defaultPutSecurityId.value = '12346'
    currentSubscriptions.value = {
      masterSymbol: null,
      masterSymbolExchangeCode: null,
      masterSymbolSecurityId: null,
      callOption: null,
      putOption: null,
      positionSymbols: []
    }
    reconnectAttempts.value = 0
    reconnectTimeout.value = null
    socket.value = null
  })

  afterEach(() => {
    disconnectWebSocket()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not open duplicate sockets for the same broker', () => {
    connectWebSocket()
    connectWebSocket()

    expect(webSockets).toHaveLength(1)
  })

  it('clears a pending reconnect when the current socket opens', () => {
    connectWebSocket()
    webSockets[0].fail()
    expect(reconnectTimeout.value).not.toBeNull()

    webSockets[0].open()
    vi.advanceTimersByTime(5000)

    expect(webSockets).toHaveLength(1)
    expect(reconnectTimeout.value).toBeNull()
  })

  it('reconnects with bounded exponential delay and restores subscriptions', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    connectWebSocket()
    webSockets[0].open()
    expect(webSockets[0].sent[0]).toMatchObject({ action: 'initialize' })
    expect(currentSubscriptions.value.masterSymbolSecurityId).toBe('26000')

    webSockets[0].close()
    expect(currentSubscriptions.value.masterSymbolSecurityId).toBeNull()
    vi.advanceTimersByTime(999)
    expect(webSockets).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(webSockets).toHaveLength(2)

    webSockets[1].open()
    expect(webSockets[1].sent.some((message) =>
      message.action === 'subscribe' && message.symbols.includes('NSE|26000')
    )).toBe(true)
    expect(reconnectAttempts.value).toBe(0)
  })

  it('stops reconnecting after the configured attempt limit', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    connectWebSocket()
    const delays = [1000, 2000, 4000, 8000, 16000]
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      webSockets[attempt].fail()
      vi.advanceTimersByTime(delays[attempt])
    }
    webSockets[5].fail()

    expect(reconnectAttempts.value).toBe(5)
    expect(wsConnectionState.value).toBe('error')
    expect(reconnectTimeout.value).toBeNull()
  })
})
