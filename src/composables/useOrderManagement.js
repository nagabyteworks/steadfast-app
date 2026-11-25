import { isProductionProfile } from '@/config/profile'
import { ref } from 'vue'
import axios from 'axios'
import qs from 'qs'
import { logRequestError } from '@/api/requestError'

// Global State
import {
  BASE_URL,
  selectedCallStrike,
  selectedPutStrike,
  quantities,
  selectedMasterSymbol,
  selectedOrderType,
  selectedQuantity,
  selectedBroker,
  selectedProductType,
  toastMessage,
  showToast,
  flatTradePositionBook,
  shoonyaPositionBook,
  flatOrderBook,
  shoonyaOrderBook,
  selectedExchange,
  enableStoploss,
  enableTarget,
  stoplossValue,
  targetValue,
  limitPrice,
  selectedFlattradePositionsSet,
  selectedShoonyaPositionsSet,
  latestCallLTP,
  latestPutLTP
} from '@/stores/globalStore'

// Trade Configuration Composables
import { getExchangeSegment, getProductTypeValue } from '@/composables/useTradeConfiguration'

// Order Management Composables
import { selectedLots, getTransactionType } from '@/composables/useTradeConfiguration'

// Portfolio Management Composables
import {
  updateOrdersAndPositions,
  updateFundLimits,
  findNewPosition,
  getSymbol,
  fetchFlattradeOrdersTradesBook,
  fetchShoonyaOrdersTradesBook
} from '@/composables/usePositionManagement'

// Risk Management Composables
import {
  scheduleDefaultProtection,
  setStoploss,
  setTarget
} from '@/composables/useRiskManagement'

const getCurrentLTP = (optionType) => {
  const price = Number(optionType === 'CALL' ? latestCallLTP.value : latestPutLTP.value)
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('Current option price is unavailable; order was not sent')
  }
  return price
}
export const prepareOrderPayload = (
  transactionType,
  drvOptionType,
  selectedStrike,
  exchangeSegment
) => {
  let price = '0'
  let priceType = 'MKT'

  switch (selectedOrderType.value) {
    case 'LMT':
      price = limitPrice.value.toString()
      priceType = 'LMT'
      break
    case 'LMT_LTP':
      price = getCurrentLTP(drvOptionType).toString()
      priceType = 'LMT'
      break
  }

  const commonPayload = {
    uid: selectedBroker.value.clientId,
    actid: selectedBroker.value.clientId,
    exch: exchangeSegment,
    tsym: selectedStrike.tradingSymbol,
    qty: selectedQuantity.value.toString(),
    prc: price,
    prd: getProductTypeValue(selectedProductType.value),
    trantype: getTransactionType(transactionType),
    prctyp: priceType,
    ret: 'DAY',
    ordersource: 'API'
  }

  switch (selectedBroker.value?.brokerName) {
    case 'Flattrade':
      return {
        ...commonPayload
        // Add any additional fields specific to Flattrade here
      }
    case 'Shoonya':
      return {
        ...commonPayload
        // Add any additional fields specific to Shoonya here
      }
    default:
      throw new Error('Unsupported broker')
  }
}
export const placeOrder = async (transactionType, drvOptionType) => {
  let acknowledgedLots = 0
  let requestInFlight = false
  try {
    let selectedStrike =
      drvOptionType === 'CALL' ? selectedCallStrike.value : selectedPutStrike.value

    if (!selectedStrike || !selectedStrike.tradingSymbol || !selectedStrike.securityId) {
      throw new Error(`Selected ${drvOptionType.toLowerCase()} strike is not properly defined`)
    }

    const exchangeSegment = getExchangeSegment()
    if (isProductionProfile && exchangeSegment !== 'NFO') {
      throw new Error('Production orders are limited to NSE derivatives')
    }

    if (enableStoploss.value && (!Number.isFinite(Number(stoplossValue.value)) || Number(stoplossValue.value) <= 0)) {
      throw new Error('Enabled stop-loss must be greater than zero points')
    }
    if (enableTarget.value && (!Number.isFinite(Number(targetValue.value)) || Number(targetValue.value) <= 0)) {
      throw new Error('Enabled target must be greater than zero points')
    }

    const instrument = quantities.value[selectedMasterSymbol.value]
    const liveLotSize = Number(selectedStrike.lotSize)
    if (isProductionProfile && (!Number.isSafeInteger(liveLotSize) || liveLotSize <= 0)) {
      throw new Error('NSE contract lot size is unavailable; order was not sent')
    }
    const freezeLimit = isProductionProfile ? 1 : instrument.freezeLimit
    const orderLots = isProductionProfile ? 1 : selectedLots.value
    const fullOrderQuantity = isProductionProfile ? liveLotSize : selectedQuantity.value
    if (isProductionProfile) {
      selectedQuantity.value = liveLotSize
    }

    let remainingLots = orderLots

    while (remainingLots > 0) {
      const lotsToPlace = Math.min(remainingLots, freezeLimit)
      const quantityToPlace = isProductionProfile
        ? liveLotSize
        : lotsToPlace * instrument.lotSize

      const orderData = prepareOrderPayload(
        transactionType,
        drvOptionType,
        selectedStrike,
        exchangeSegment
      )
      orderData.qty = quantityToPlace.toString()

      // Handle dynamic price updates for LMT_LTP
      if (['LMT_LTP'].includes(selectedOrderType.value)) {
        const currentLTP = getCurrentLTP(drvOptionType)
        orderData.prc = currentLTP.toString()
      }

      let response
      requestInFlight = true
      if (selectedBroker.value?.brokerName === 'Flattrade') {
        const FLATTRADE_API_TOKEN = isProductionProfile ? null : localStorage.getItem('FLATTRADE_API_TOKEN')
        const payload = qs.stringify(orderData)
        response = await axios.post(`${BASE_URL}/flattrade/placeOrder`, payload, {
          headers: {
            ...(!isProductionProfile && { Authorization: `Bearer ${FLATTRADE_API_TOKEN}` }),
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        })
      } else if (selectedBroker.value?.brokerName === 'Shoonya') {
        const SHOONYA_API_TOKEN = localStorage.getItem('SHOONYA_API_TOKEN')
        const payload = qs.stringify(orderData)
        response = await axios.post(`${BASE_URL}/shoonya/placeOrder`, payload, {
          headers: {
            Authorization: `Bearer ${SHOONYA_API_TOKEN}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        })
      } else {
        requestInFlight = false
        throw new Error('Unsupported broker')
      }

      if (response?.data?.stat !== 'Ok' || !response.data.norenordno) {
        requestInFlight = false
        const brokerMessage = response?.data?.stat === 'Not_Ok' && typeof response.data.emsg === 'string'
          ? response.data.emsg.trim()
          : ''
        throw new Error(brokerMessage
          ? `Broker rejected the order: ${brokerMessage}`
          : 'Broker did not acknowledge the order. Verify orders with your broker before retrying.')
      }
      requestInFlight = false
      console.log(`Placed order for ${lotsToPlace} lots (${quantityToPlace} quantity)`)
      remainingLots -= lotsToPlace
      acknowledgedLots += lotsToPlace

      // Add a small delay between orders for LMT_LTP to get updated LTP
      if (['LMT_LTP'].includes(selectedOrderType.value)) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    console.log(
      `All orders submitted. Total: ${acknowledgedLots} lots (${fullOrderQuantity} quantity)`
    )
    toastMessage.value = `Order(s) submitted for ${acknowledgedLots} lots. Verify fills with your broker.`
    showToast.value = true

    // Add a delay before fetching updated data
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Update both orders and positions
    await updateOrdersAndPositions()

    // Find the new position after updating positions
    const newPosition = findNewPosition(selectedStrike.tradingSymbol)
    scheduleDefaultProtection(selectedStrike.tradingSymbol)
    let protectionArmed = !((enableStoploss.value || enableTarget.value) && !newPosition)

    // If predefined stoploss is enabled, set stoploss for the new position
    if (enableStoploss.value && stoplossValue.value > 0 && newPosition) {
      protectionArmed = setStoploss(newPosition, 'static') && protectionArmed
    } else if (enableStoploss.value && newPosition) {
      protectionArmed = false
    }

    // If predefined target is enabled, set target for the new position
    if (enableTarget.value && targetValue.value > 0 && newPosition) {
      protectionArmed = setTarget(newPosition) && protectionArmed
    } else if (enableTarget.value && newPosition) {
      protectionArmed = false
    }

    if (!protectionArmed) {
      toastMessage.value = newPosition
        ? 'Order accepted, but browser stop-loss/target automation was not armed. Verify the position with Flattrade.'
        : 'Order accepted; waiting for the Flattrade position before browser stop-loss/target automation can arm.'
      showToast.value = true
    }

    // Update fund limits
    await updateFundLimits()
  } catch (error) {
    logRequestError('Error placing order', error)
    if (acknowledgedLots > 0) {
      toastMessage.value = 'An order was submitted, but a later step failed. Verify orders and positions with your broker before retrying.'
    } else if (typeof error.response?.data?.message === 'string') {
      toastMessage.value = error.response.data.message
    } else if (requestInFlight) {
      toastMessage.value = 'Order status is uncertain. Verify orders with your broker before retrying.'
    } else {
      toastMessage.value = error.message || 'Failed to place order.'
    }
    showToast.value = true
  }
}
export const placeOrderForPosition = async (transactionType, optionType, position) => {
  try {
    const quantity = Math.abs(Number(position.netQty || position.netqty))
    const instrument = quantities.value[selectedMasterSymbol.value]
    const freezeLimit = isProductionProfile
      ? Number(position.ls)
      : instrument.freezeLimit * instrument.lotSize
    if (!Number.isSafeInteger(freezeLimit) || freezeLimit <= 0) {
      throw new Error('Position lot size is unavailable; close order was not sent')
    }

    if (quantity === 0) {
      console.log('Quantity is zero, no order will be placed.')
      return
    }

    let remainingQuantity = quantity
    let placedQuantity = 0

    while (remainingQuantity > 0) {
      const quantityToPlace = Math.min(remainingQuantity, freezeLimit)

      let orderData
      if (
        selectedBroker.value?.brokerName === 'Flattrade' ||
        selectedBroker.value?.brokerName === 'Shoonya'
      ) {
        orderData = {
          uid: selectedBroker.value.clientId,
          actid: selectedBroker.value.clientId,
          exch: selectedExchange.value === 'NFO' ? 'NFO' : 'BFO',
          tsym: position.tsym,
          qty: quantityToPlace.toString(),
          prc: '0',
          prd: position.prd,
          trantype: transactionType,
          prctyp: 'MKT',
          ret: 'DAY'
        }
      }

      let response
      if (selectedBroker.value?.brokerName === 'Flattrade') {
        const FLATTRADE_API_TOKEN = isProductionProfile ? null : localStorage.getItem('FLATTRADE_API_TOKEN')
        const payload = qs.stringify(orderData)
        response = await axios.post(`${BASE_URL}/flattrade/placeOrder`, payload, {
          headers: {
            ...(!isProductionProfile && { Authorization: `Bearer ${FLATTRADE_API_TOKEN}` }),
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        })
      } else if (selectedBroker.value?.brokerName === 'Shoonya') {
        const SHOONYA_API_TOKEN = localStorage.getItem('SHOONYA_API_TOKEN')
        const payload = qs.stringify(orderData)
        response = await axios.post(`${BASE_URL}/shoonya/placeOrder`, payload, {
          headers: {
            Authorization: `Bearer ${SHOONYA_API_TOKEN}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        })
      }

      if (response?.data?.stat !== 'Ok' || !response.data.norenordno) {
        throw new Error('Broker did not acknowledge the close order')
      }
      console.log(`Placed order for ${quantityToPlace} quantity`)

      remainingQuantity -= quantityToPlace
      placedQuantity += quantityToPlace
    }

    console.log(`All orders placed successfully. Total: ${placedQuantity} quantity`)
    toastMessage.value = `Close order(s) submitted for ${getSymbol(position)}. Verify fills with your broker.`
    showToast.value = true

    // Add a delay before fetching updated data
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Update both orders and positions
    await updateOrdersAndPositions()

    // Update fund limits
    await updateFundLimits()
    return true
  } catch (error) {
    logRequestError('Failed to place order for position', error)
    toastMessage.value = 'Failed to place order for SL/Target'
    showToast.value = true
    return false
  }
}
export const closeAllPositions = async () => {
  try {
    let positionsClosed = false

    if (selectedBroker.value?.brokerName === 'Flattrade') {
      const sortedPositions = [...flatTradePositionBook.value].sort(
        (a, b) => Number(b.netqty) - Number(a.netqty)
      )
      for (const position of sortedPositions) {
        const netqty = Number(position.netqty)
        if (netqty !== 0) {
          const transactionType = netqty > 0 ? 'S' : 'B'
          const optionType = position.tsym.includes('C') ? 'CALL' : 'PUT'
          if (!await placeOrderForPosition(transactionType, optionType, position)) {
            throw new Error('Close order was not acknowledged')
          }
          positionsClosed = true
        }
      }
    } else if (selectedBroker.value?.brokerName === 'Shoonya') {
      const sortedPositions = [...shoonyaPositionBook.value].sort(
        (a, b) => Number(b.netqty) - Number(a.netqty)
      )
      for (const position of sortedPositions) {
        const netqty = Number(position.netqty)
        if (netqty !== 0) {
          const transactionType = netqty > 0 ? 'S' : 'B'
          const optionType = position.tsym.includes('C') ? 'CALL' : 'PUT'
          if (!await placeOrderForPosition(transactionType, optionType, position)) {
            throw new Error('Close order was not acknowledged')
          }
          positionsClosed = true
        }
      }
    }

    // Add a delay before fetching updated data
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Update both orders and positions
    await updateOrdersAndPositions()

    // Update fund limits
    await updateFundLimits()

    if (positionsClosed) {
      toastMessage.value = 'Close orders submitted. Verify fills with your broker.'
    } else {
      toastMessage.value = `No positions to close for ${selectedBroker.value?.brokerName}`
    }
    showToast.value = true
  } catch (error) {
    logRequestError('Error closing positions', error)
    toastMessage.value = 'Failed to close all positions'
    showToast.value = true
  }
}
export const cancelOrder = async (order) => {
  const orderId = order.norenordno
  const orderStatus = order.status

  console.log(`Attempting to cancel order ${orderId} with status ${orderStatus}`)
  // console.log(`Broker: ${selectedBroker.value?.brokerName}`);

  if (orderStatus !== 'OPEN') {
    console.log(`Order ${orderId} is not in a cancellable state and cannot be canceled.`)
    return
  }

  try {
    let response
    if (selectedBroker.value?.brokerName === 'Flattrade') {
      const jKey = isProductionProfile ? null : localStorage.getItem('FLATTRADE_API_TOKEN')
      const clientId = selectedBroker.value.clientId
      console.log(`Sending request to cancel Flattrade order ${orderId}`)
      response = await axios.post(
        `${BASE_URL}/flattrade/cancelOrder`,
        {
          norenordno: orderId,
          uid: clientId
        },
        {
          params: isProductionProfile ? {} : {
            FLATTRADE_API_TOKEN: jKey
          }
        }
      )
    } else if (selectedBroker.value?.brokerName === 'Shoonya') {
      const jKey = localStorage.getItem('SHOONYA_API_TOKEN') || token.value
      const clientId = selectedBroker.value.clientId
      console.log(`Sending request to cancel Shoonya order ${orderId}`)
      response = await axios.post(
        `${BASE_URL}/shoonya/cancelOrder`,
        {
          norenordno: orderId,
          uid: clientId
        },
        {
          params: {
            SHOONYA_API_TOKEN: jKey
          }
        }
      )
    }
    if (response?.data?.stat !== 'Ok' || !response.data.result) {
      throw new Error('Broker did not acknowledge the cancellation')
    }
    console.log(`Cancellation request acknowledged for order ${orderId}.`)
    // Update fund limits
    await updateFundLimits()
  } catch (error) {
    logRequestError(`Failed to cancel order ${orderId}`, error)
    toastMessage.value = 'Failed to cancel order'
    showToast.value = true
    throw error // Rethrow to handle in cancelPendingOrders
  }
}
export const cancelPendingOrders = async () => {
  // Fetch orders based on the selected broker
  if (selectedBroker.value?.brokerName === 'Flattrade') {
    await fetchFlattradeOrdersTradesBook()
  } else if (selectedBroker.value?.brokerName === 'Shoonya') {
    await fetchShoonyaOrdersTradesBook()
  }

  let pendingOrders
  if (selectedBroker.value?.brokerName === 'Flattrade') {
    pendingOrders = flatOrderBook.value.filter((order) => order.status === 'OPEN')
  } else if (selectedBroker.value?.brokerName === 'Shoonya') {
    pendingOrders = shoonyaOrderBook.value.filter((order) => order.status === 'OPEN')
  } else {
    console.error('Unknown broker')
    return
  }

  const cancelPromises = pendingOrders.map((order) => cancelOrder(order))
  console.log(`Canceling pending orders for broker: ${selectedBroker.value?.brokerName}`) // placed here to prevent delay and debugging if required

  try {
    await Promise.all(cancelPromises)
    toastMessage.value = 'Cancellation requests submitted. Verify order status with your broker.'
    showToast.value = true

    // Refresh the orders list based on the selected broker
    if (selectedBroker.value?.brokerName === 'Flattrade') {
      await fetchFlattradeOrdersTradesBook()
    } else if (selectedBroker.value?.brokerName === 'Shoonya') {
      await fetchShoonyaOrdersTradesBook()
    }
  } catch (error) {
    logRequestError('Failed to cancel orders', error)
    toastMessage.value = 'Failed to cancel some orders'
    showToast.value = true
  }
}
export const closeSelectedPositions = async () => {
  try {
    let positionsClosed = false

    if (selectedBroker.value?.brokerName === 'Shoonya') {
      // Create a copy of the selected positions to iterate over
      const positionsToClose = [...selectedShoonyaPositionsSet.value]

      for (const tsym of positionsToClose) {
        const position = shoonyaPositionBook.value.find((p) => p.tsym === tsym)
        const netqty = Number(position.netqty)
        if (netqty !== 0) {
          const transactionType = netqty > 0 ? 'S' : 'B'
          const optionType = position.tsym.includes('C') ? 'CALL' : 'PUT'
          if (!await placeOrderForPosition(transactionType, optionType, position)) {
            throw new Error('Close order was not acknowledged')
          }
          positionsClosed = true

          // Remove the closed position from the selected positions
          selectedShoonyaPositionsSet.value.delete(tsym)
        }
      }
    } else if (selectedBroker.value?.brokerName === 'Flattrade') {
      // Create a copy of the selected positions to iterate over
      const positionsToClose = [...selectedFlattradePositionsSet.value]

      for (const tsym of positionsToClose) {
        const position = flatTradePositionBook.value.find((p) => p.tsym === tsym)
        const netqty = Number(position.netqty)
        if (netqty !== 0) {
          const transactionType = netqty > 0 ? 'S' : 'B'
          const optionType = position.tsym.includes('C') ? 'CALL' : 'PUT'
          if (!await placeOrderForPosition(transactionType, optionType, position)) {
            throw new Error('Close order was not acknowledged')
          }
          positionsClosed = true

          // Remove the closed position from the selected positions
          selectedFlattradePositionsSet.value.delete(tsym)
        }
      }
    }

    // Add a delay before fetching updated data
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Update both orders and positions
    await updateOrdersAndPositions()

    // Update fund limits
    await updateFundLimits()

    if (positionsClosed) {
      toastMessage.value = 'Close orders submitted. Verify fills with your broker.'
    } else {
      toastMessage.value = `No positions to close`
    }
    showToast.value = true
  } catch (error) {
    logRequestError('Error closing selected positions', error)
    toastMessage.value = 'Failed to close selected positions'
    showToast.value = true
  }
}
