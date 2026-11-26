import { computed, watch } from 'vue'
import {
  selectedBroker,
  fundLimits,
  flatTradePositionBook,
  shoonyaPositionBook,
  positionLTPs,
  flatTradeBook,
  shoonyaTradeBook
} from '@/stores/globalStore'

export const availableBalance = computed(() => {
  // console.log('Fund Limits:', fundLimits.value);
  // console.log('Selected Broker:', selectedBroker.value?.brokerName);

  if (
    selectedBroker.value?.brokerName === 'Flattrade' ||
    selectedBroker.value?.brokerName === 'Shoonya'
  ) {
    const cash = Number(fundLimits.value.cash) || 0
    const payin = Number(fundLimits.value.payin) || 0
    const marginUsed = Number(fundLimits.value.marginused) || 0

    // Use payin if cash is zero, otherwise use cash
    const availableFunds = cash + payin

    const balance = availableFunds - marginUsed
    // console.log(`${selectedBroker.value?.brokerName} Available Balance:`, balance);
    return balance
  }
  return null
})
export const usedAmount = computed(() => {
  if (selectedBroker.value?.brokerName === 'Flattrade') {
    const marginUsed = Number(fundLimits.value.marginused) || 0
    return marginUsed
  } else if (selectedBroker.value?.brokerName === 'Shoonya') {
    const marginUsed = Number(fundLimits.value.marginused) || 0
    return marginUsed
  }
  return 0
})
export const totalNetQty = computed(() => {
  const calculateTotalQty = (positions) => {
    return positions.reduce((total, position) => {
      const qty = Math.abs(parseInt(position.netQty || position.netqty, 10))
      return total + qty
    }, 0)
  }

  if (selectedBroker.value?.brokerName === 'Flattrade') {
    return calculateTotalQty(flatTradePositionBook.value)
  } else if (selectedBroker.value?.brokerName === 'Shoonya') {
    return calculateTotalQty(shoonyaPositionBook.value)
  }
  return 0
})
export const totalProfit = computed(() => {
  if (
    selectedBroker.value?.brokerName === 'Flattrade' ||
    selectedBroker.value?.brokerName === 'Shoonya'
  ) {
    return positionsWithCalculatedProfit.value.reduce((acc, position) => {
      const unrealizedProfit = position.calculatedUrmtom
      const realizedProfit = parseFloat(position.rpnl) || 0
      return acc + unrealizedProfit + realizedProfit
    }, 0)
  }
  return 0
})

export const calculateUnrealizedProfit = (position) => {
  const ltp =
    positionLTPs.value[position.tsym || position.tradingSymbol] || position.lp || position.lastPrice
  const netQty = parseFloat(position.netqty || position.netQty)
  const netAvgPrice = parseFloat(position.netavgprc || position.averagePrice)
  const priceFactor = parseFloat(position.prcftr || position.multiplier || 1)

  if (ltp && !isNaN(netQty) && !isNaN(netAvgPrice)) {
    return netQty * (ltp - netAvgPrice) * priceFactor
  }
  return 0
}

export const positionsWithCalculatedProfit = computed(() => {
  if (selectedBroker.value?.brokerName === 'Flattrade') {
    return flatTradePositionBook.value.map((position) => ({
      ...position,
      calculatedUrmtom: calculateUnrealizedProfit(position)
    }))
  } else if (selectedBroker.value?.brokerName === 'Shoonya') {
    return shoonyaPositionBook.value.map((position) => ({
      ...position,
      calculatedUrmtom: calculateUnrealizedProfit(position)
    }))
  }
  return []
})
export const totalCapitalPercentage = computed(() => {
  const totalMoney = Number(availableBalance.value) + Number(usedAmount.value)
  return totalMoney ? (Number(netPnl.value) / totalMoney) * 100 : 0
})

const roundToPaise = (amount) => Math.round((amount + Number.EPSILON) * 100) / 100
const numericValue = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const estimateTradingCharges = ({ brokerName, positions = [], trades = [] }) => {
  if (!['Flattrade', 'Shoonya'].includes(brokerName)) {
    return { tax: 0, other: 0, brokerage: 0, total: 0 }
  }

  let stt = 0
  let stampDuty = 0
  let transaction = 0
  let sebi = 0
  let ipft = 0

  for (const position of positions) {
    const exchange = position.exch
    const buyValue = numericValue(position.daybuyamt)
    const sellValue = numericValue(position.daysellamt)
    const turnover = buyValue + sellValue

    if (exchange === 'NFO' || exchange === 'BFO') {
      const transactionRate = exchange === 'NFO' ? 0.0003553 : 0.000325
      transaction += turnover * transactionRate
      sebi += turnover * 0.000001
      ipft += turnover * (brokerName === 'Flattrade' ? 0.000005 : 0.000000001)
      stt += sellValue * 0.0015
      stampDuty += buyValue * 0.00003
      continue
    }

    if (exchange === 'NSE' || exchange === 'BSE') {
      const product = position.prd === 'I' ? 'intraday' : 'delivery'
      const transactionRate = exchange === 'NSE' ? 0.0000307 : 0.0000375
      transaction += turnover * transactionRate
      sebi += turnover * 0.000001
      ipft += turnover * (brokerName === 'Flattrade' ? 0.000001 : 0.000000001)
      stt += product === 'intraday'
        ? sellValue * 0.00025
        : turnover * 0.001
      stampDuty += buyValue * (product === 'intraday' ? 0.00003 : 0.00015)
    }
  }

  let brokerage = 0
  if (brokerName === 'Shoonya') {
    const orders = new Map()
    for (const trade of trades) {
      if (!trade.norenordno) continue
      const tradeValue = numericValue(trade.flqty ?? trade.qty) *
        numericValue(trade.flprc ?? trade.prc)
      const order = orders.get(trade.norenordno) || {
        exchange: trade.exch,
        product: trade.prd,
        turnover: 0
      }
      order.turnover += tradeValue
      orders.set(
        trade.norenordno,
        order
      )
    }
    brokerage = [...orders.values()].reduce((total, order) => {
      if (order.exchange === 'NFO' || order.exchange === 'BFO') return total + 5
      if ((order.exchange === 'NSE' || order.exchange === 'BSE') && order.product === 'I') {
        return total + Math.min(5, order.turnover * 0.0003)
      }
      return total
    }, 0)
  }

  const other = roundToPaise(transaction + sebi + ipft)
  const gstBase = transaction + sebi + brokerage +
    (brokerName === 'Shoonya' ? ipft : 0)
  const tax = roundToPaise(stt + stampDuty + gstBase * 0.18)
  brokerage = roundToPaise(brokerage)
  return {
    tax,
    other,
    brokerage,
    total: roundToPaise(tax + other + brokerage)
  }
}

const tradingCharges = computed(() => estimateTradingCharges({
  brokerName: selectedBroker.value?.brokerName,
  positions: selectedBroker.value?.brokerName === 'Flattrade'
    ? flatTradePositionBook.value
    : shoonyaPositionBook.value,
  trades: selectedBroker.value?.brokerName === 'Flattrade'
    ? flatTradeBook.value
    : shoonyaTradeBook.value
}))
export const totalTax = computed(() => tradingCharges.value.tax)
export const otherTradingCharges = computed(() => tradingCharges.value.other)
export const totalBrokerage = computed(() => tradingCharges.value.brokerage)
export const totalTradingCharges = computed(() => tradingCharges.value.total)
export const netPnl = computed(() => roundToPaise(totalProfit.value - totalTradingCharges.value))
export const totalBuyValue = computed(() => {
  if (selectedBroker.value?.brokerName === 'Flattrade') {
    return flatTradePositionBook.value.reduce(
      (total, position) => total + parseFloat(position.daybuyamt || 0),
      0
    )
  }
  if (selectedBroker.value?.brokerName === 'Shoonya') {
    return shoonyaPositionBook.value.reduce(
      (total, position) => total + parseFloat(position.daybuyamt || 0),
      0
    )
  }
  return 0
})
export const totalSellValue = computed(() => {
  if (selectedBroker.value?.brokerName === 'Flattrade') {
    return flatTradePositionBook.value.reduce(
      (total, position) => total + parseFloat(position.daysellamt || 0),
      0
    )
  }
  if (selectedBroker.value?.brokerName === 'Shoonya') {
    return shoonyaPositionBook.value.reduce(
      (total, position) => total + parseFloat(position.daysellamt || 0),
      0
    )
  }
  return 0
})
export const totalEquityBuyValue = computed(() => {
  if (selectedBroker.value?.brokerName === 'Flattrade') {
    return flatTradePositionBook.value
      .filter((position) => position.exch === 'BSE' || position.exch === 'NSE')
      .reduce((total, position) => total + parseFloat(position.daybuyamt || 0), 0)
  } else if (selectedBroker.value?.brokerName === 'Shoonya') {
    return shoonyaPositionBook.value
      .filter((position) => position.exch === 'BSE' || position.exch === 'NSE')
      .reduce((total, position) => total + parseFloat(position.daybuyamt || 0), 0)
  }
  return 0
})
export const totalEquitySellValue = computed(() => {
  if (selectedBroker.value?.brokerName === 'Flattrade') {
    return flatTradePositionBook.value
      .filter((position) => position.exch === 'BSE' || position.exch === 'NSE')
      .reduce((total, position) => total + parseFloat(position.daysellamt || 0), 0)
  } else if (selectedBroker.value?.brokerName === 'Shoonya') {
    return shoonyaPositionBook.value
      .filter((position) => position.exch === 'BSE' || position.exch === 'NSE')
      .reduce((total, position) => total + parseFloat(position.daysellamt || 0), 0)
  }
  return 0
})
export const totalDerivativeBuyValue = computed(() => {
  if (selectedBroker.value?.brokerName === 'Flattrade') {
    return flatTradePositionBook.value
      .filter((position) => position.exch === 'BFO' || position.exch === 'NFO')
      .reduce((total, position) => total + parseFloat(position.daybuyamt || 0), 0)
  } else if (selectedBroker.value?.brokerName === 'Shoonya') {
    return shoonyaPositionBook.value
      .filter((position) => position.exch === 'BFO' || position.exch === 'NFO')
      .reduce((total, position) => total + parseFloat(position.daybuyamt || 0), 0)
  }
  return 0
})
export const totalDerivativeSellValue = computed(() => {
  if (selectedBroker.value?.brokerName === 'Flattrade') {
    return flatTradePositionBook.value
      .filter((position) => position.exch === 'BFO' || position.exch === 'NFO')
      .reduce((total, position) => total + parseFloat(position.daysellamt || 0), 0)
  } else if (selectedBroker.value?.brokerName === 'Shoonya') {
    return shoonyaPositionBook.value
      .filter((position) => position.exch === 'BFO' || position.exch === 'NFO')
      .reduce((total, position) => total + parseFloat(position.daysellamt || 0), 0)
  }
  return 0
})
