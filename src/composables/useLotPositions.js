import { computed, ref } from 'vue'
import {
  flatTradePositionBook,
  shoonyaPositionBook,
  flatTradeBook,
  shoonyaTradeBook,
  positionLTPs,
  selectedBroker,
  quantities
} from '@/stores/globalStore'

export const expandedPositionSymbols = ref(
  new Set(JSON.parse(localStorage.getItem('expandedPositionSymbols') || '[]'))
)

export const toggleExpandedPosition = (symbol) => {
  const next = new Set(expandedPositionSymbols.value)
  if (next.has(symbol)) next.delete(symbol)
  else next.add(symbol)
  expandedPositionSymbols.value = next
  localStorage.setItem('expandedPositionSymbols', JSON.stringify([...next]))
}

export const deriveLotPositions = (position, trades = [], ltp = null, lotSize = null) => {
  if (!position?.tsym) return []
  const netQty = Number(position.netqty ?? position.netQty ?? 0)
  if (!Number.isSafeInteger(netQty) || netQty === 0) return []

  const relevant = trades.filter((trade) =>
    trade?.tsym === position.tsym &&
    trade?.exch === position.exch &&
    trade?.prd === position.prd
  )
  const entrySide = netQty > 0 ? 'B' : 'S'
  const fills = relevant.filter((trade) => trade.trantype === entrySide)
  if (!fills.length) return []

  const inferredSize = Number(lotSize)
  const aggregateByOrder = new Map()
  for (const fill of fills) {
    const key = fill.norenordno || fill.orderId || fill.flid || 'unknown'
    const current = aggregateByOrder.get(key) || {
      orderId: key,
      qty: 0,
      value: 0,
      timestamp: null,
    }
    const qty = Number(fill.flqty ?? fill.qty)
    const price = Number(fill.flprc ?? fill.prc)
    if (!Number.isSafeInteger(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) continue
    current.qty += qty
    current.value += qty * price
    if (!current.timestamp) current.timestamp = fill.fltm || null
    aggregateByOrder.set(key, current)
  }

  const lots = []
  for (const [orderId, entry] of aggregateByOrder) {
    const chunks = Number.isSafeInteger(inferredSize) && inferredSize > 0
      ? Math.ceil(entry.qty / inferredSize)
      : 1
    let remainingEntryQty = entry.qty
    for (let index = 0; index < chunks && remainingEntryQty > 0; index++) {
      const quantity = chunks === 1
        ? remainingEntryQty
        : Math.min(inferredSize, remainingEntryQty)
      remainingEntryQty -= quantity
      const lotId = `${position.tsym}:${orderId}:${index + 1}`
      lots.push({
        lotId,
        positionId: `${position.exch}:${position.prd}:${position.tsym}`,
        symbol: position.tsym,
        exchange: position.exch,
        productType: position.prd,
        side: netQty > 0 ? 'BUY' : 'SELL',
        quantity,
        remainingQuantity: quantity,
        entryOrderId: orderId,
        entryAveragePrice: entry.value / entry.qty,
        exitOrderIds: [],
        exitAveragePrice: null,
        stopLoss: null,
        target: null,
        trailingStopLoss: null,
        realizedPnl: 0,
        unrealizedPnl: 0,
        status: 'open',
        legacy: false,
        entryTimestamp: entry.timestamp,
      })
    }
  }

  // Allocate broker sells FIFO to entries, so partial and complete exits reconcile.
  const exitFills = relevant
    .filter((trade) => trade.trantype !== entrySide)
    .sort((a, b) => String(a.fltm || '').localeCompare(String(b.fltm || '')))
  for (const exitFill of exitFills) {
    let remainingExitQty = Number(exitFill.flqty ?? exitFill.qty)
    const exitPrice = Number(exitFill.flprc ?? exitFill.prc)
    for (const lot of lots) {
      if (remainingExitQty <= 0) break
      if (lot.remainingQuantity <= 0) continue
      const exited = Math.min(lot.remainingQuantity, remainingExitQty)
      remainingExitQty -= exited
      lot.remainingQuantity -= exited
      lot.exitOrderIds = [...lot.exitOrderIds, exitFill.norenordno || exitFill.orderId].filter(Boolean)
      lot.exitAveragePrice = Number.isFinite(exitPrice)
        ? (lot.exitAveragePrice == null
          ? exitPrice
          : (lot.exitAveragePrice * (lot.quantity - lot.remainingQuantity - exited) +
            exitPrice * exited) / (lot.quantity - lot.remainingQuantity))
        : lot.exitAveragePrice
      const sign = netQty > 0 ? 1 : -1
      lot.realizedPnl = lot.exitAveragePrice == null
        ? 0
        : (lot.exitAveragePrice - lot.entryAveragePrice) * (lot.quantity - lot.remainingQuantity) * sign
      lot.status = lot.remainingQuantity === 0 ? 'closed' : 'partially_filled'
    }
  }

  // If there is no entry history, preserve the position as one explicit legacy allocation.
  if (!lots.length && relevant.length === 0) return [{
    lotId: `${position.tsym}:legacy`,
    positionId: `${position.exch}:${position.prd}:${position.tsym}`,
    symbol: position.tsym,
    exchange: position.exch,
    productType: position.prd,
    side: netQty > 0 ? 'BUY' : 'SELL',
    quantity: Math.abs(netQty),
    remainingQuantity: Math.abs(netQty),
    entryOrderId: null,
    entryAveragePrice: Number(position.totbuyavgprc ?? position.netavgprc) || null,
    exitOrderIds: [],
    exitAveragePrice: null,
    stopLoss: null,
    target: null,
    trailingStopLoss: null,
    realizedPnl: Number(position.rpnl) || 0,
    unrealizedPnl: 0,
    status: 'open',
    legacy: true,
  }]

  const livePrice = Number(ltp ?? position.lp)
  for (const lot of lots) {
    lot.unrealizedPnl = Number.isFinite(livePrice) &&
      lot.entryAveragePrice != null
      ? (livePrice - lot.entryAveragePrice) * lot.remainingQuantity * (netQty > 0 ? 1 : -1)
      : 0
  }
  if (lots.length > 0) {
    const openLots = lots.reduce((sum, lot) => sum + lot.remainingQuantity, 0)
    const targetOpenQty = Math.abs(netQty)
    if (openLots > targetOpenQty) {
      let excess = openLots - targetOpenQty
      for (let index = lots.length - 1; index >= 0 && excess > 0; index--) {
        const trim = Math.min(lots[index].remainingQuantity, excess)
        lots[index].remainingQuantity -= trim
        lots[index].quantity -= trim
        excess -= trim
      }
    }
  }
  return lots
}

export const lotPositionsBySymbol = computed(() => {
  const positions = selectedBroker.value?.brokerName === 'Flattrade'
    ? flatTradePositionBook.value
    : shoonyaPositionBook.value
  const trades = selectedBroker.value?.brokerName === 'Flattrade'
    ? flatTradeBook.value
    : shoonyaTradeBook.value
  return Object.fromEntries(positions.map((position) => {
    const symbol = position.tsym
    const master = Object.keys(quantities.value).find((key) =>
      symbol?.startsWith(key))
    const lotSize = quantities.value[master]?.lotSize
    return [symbol, deriveLotPositions(
      position,
      trades,
      positionLTPs.value[symbol] ?? position.lp,
      lotSize
    )]
  }))
})
