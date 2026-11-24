import {
  stoplossValue,
  targetValue,
  enableTarget,
  enableStoploss,
  positionLTPs,
  stoplosses,
  targets,
  trailingStoplosses,
  tslHitPositions,
  flatTradePositionBook,
  shoonyaPositionBook,
  toastMessage,
  showToast
} from '@/stores/globalStore'

// Order Management Composables
import { placeOrderForPosition } from '@/composables/useOrderManagement'

const pendingDefaultProtection = new Set()
const riskExitLockPrefix = 'steadfast:risk-exit:'

export const resetRiskExitLocks = () => {
  for (let index = localStorage.length - 1; index >= 0; index--) {
    const key = localStorage.key(index)
    if (key?.startsWith(riskExitLockPrefix)) localStorage.removeItem(key)
  }
}

const submitRiskExit = (position, reason) => {
  const quantity = Number(position.netqty ?? position.netQty)
  if (!Number.isSafeInteger(quantity) || quantity === 0) return

  if (!navigator.locks) {
    toastMessage.value = 'Automatic exit unavailable: browser locking is not supported. Manage this position with Flattrade.'
    showToast.value = true
    return
  }

  const key = `${riskExitLockPrefix}${encodeURIComponent(position.tsym)}`
  navigator.locks.request(key, { ifAvailable: true }, async (lock) => {
    if (!lock || localStorage.getItem(key)) return

    // Persist before submission: a timeout or reload must never retry an uncertain order.
    localStorage.setItem(key, 'verification-required')
    const accepted = await placeOrderForPosition(
      quantity > 0 ? 'S' : 'B',
      position.tsym.includes('C') ? 'CALL' : 'PUT',
      position
    )
    if (accepted) {
      removeStoploss(position)
      removeTarget(position)
    }
    toastMessage.value = accepted
      ? `${reason} exit submitted for ${position.tsym}. Verify fills with Flattrade before resetting the safety lock.`
      : `${reason} exit failed or is uncertain for ${position.tsym}. Verify with Flattrade before resetting the safety lock.`
    showToast.value = true
  }).catch((error) => {
    console.error('Unable to safely submit automated exit:', error)
    toastMessage.value = 'Automatic exit unavailable. Verify orders and positions directly with Flattrade.'
    showToast.value = true
  })
}

export const scheduleDefaultProtection = (tradingSymbol) => {
  if (enableStoploss.value || enableTarget.value) {
    pendingDefaultProtection.add(tradingSymbol)
  }
}

export const setStoploss = (position, type) => {
  if (!enableStoploss.value) {
    console.log('Stoploss is disabled.')
    return false
  }
  const quantity = Math.abs(Number(position.netQty || position.netqty))

  if (quantity === 0) {
    console.log(`Quantity is zero for ${position.tsym}, no stoploss will be set.`)
    return false
  }

  const ltp = parseFloat(positionLTPs.value[position.tsym] ?? position.netavgprc ?? position.netAvgPrice)
  if (isNaN(ltp)) {
    console.error(`Invalid LTP for ${position.tsym}: ${positionLTPs.value[position.tsym]}`)
    return false
  }

  const stoplossValueNum = parseFloat(stoplossValue.value)
  if (isNaN(stoplossValueNum)) {
    console.error(`Invalid stoploss value: ${stoplossValue.value}`)
    return false
  }

  const isLongPosition = Number(position.netqty ?? position.netQty) > 0
  let stoplossPrice

  switch (type) {
    case 'trailing':
      stoplossPrice = isLongPosition ? ltp - stoplossValueNum : ltp + stoplossValueNum
      trailingStoplosses.value[position.tsym] = parseFloat(stoplossPrice.toFixed(2))
      stoplosses.value[position.tsym] = null
      console.log(`TSL set for ${position.tsym}: ${stoplossPrice.toFixed(2)}`)
      break
    case 'static':
      stoplossPrice = isLongPosition ? ltp - stoplossValueNum : ltp + stoplossValueNum
      stoplosses.value[position.tsym] = parseFloat(stoplossPrice.toFixed(2))
      trailingStoplosses.value[position.tsym] = null
      console.log(`SL set for ${position.tsym}: ${stoplossPrice.toFixed(2)}`)
      break
    case 'convert_to_tsl': {
      const existingSL = stoplosses.value[position.tsym]
      if (existingSL === null || existingSL === undefined) {
        console.error(`No existing SL to convert for ${position.tsym}`)
        return false
      }
      trailingStoplosses.value[position.tsym] = existingSL
      stoplosses.value[position.tsym] = null
      console.log(`Converted SL to TSL for ${position.tsym}: ${existingSL.toFixed(2)}`)
      break
    }
    case 'convert_to_sl': {
      const existingTSL = trailingStoplosses.value[position.tsym]
      if (existingTSL === null || existingTSL === undefined) {
        console.error(`No existing TSL to convert for ${position.tsym}`)
        return false
      }
      stoplosses.value[position.tsym] = existingTSL
      trailingStoplosses.value[position.tsym] = null
      console.log(`Converted TSL to SL for ${position.tsym}: ${existingTSL.toFixed(2)}`)
      break
    }
    default:
      console.error(`Unknown stoploss type: ${type}`)
      return false
  }
  tslHitPositions.delete(position.tsym)
  return true
}
export const removeStoploss = (position) => {
  stoplosses.value[position.tsym] = null
  trailingStoplosses.value[position.tsym] = null
  tslHitPositions.delete(position.tsym)
}
export const increaseStoploss = (position) => {
  if (stoplosses.value[position.tsym] !== null) {
    stoplosses.value[position.tsym] = Number((stoplosses.value[position.tsym] + 0.5).toFixed(2))
  }
}

export const decreaseStoploss = (position) => {
  if (stoplosses.value[position.tsym] !== null) {
    stoplosses.value[position.tsym] = Number((stoplosses.value[position.tsym] - 0.5).toFixed(2))
  }
}
export const setTarget = (position) => {
  if (!enableTarget.value) {
    console.log('Target is disabled.')
    return false
  }
  const quantity = Math.abs(Number(position.netQty || position.netqty))

  if (quantity === 0) {
    console.log(`Quantity is zero for ${position.tsym}, no target will be set.`)
    return false
  }

  if (enableTarget.value && targetValue.value > 0) {
    const ltp = positionLTPs.value[position.tsym] ?? position.netavgprc ?? position.netAvgPrice
    const ltpNum = parseFloat(ltp)
    if (!Number.isFinite(ltpNum)) {
      console.error(`Invalid LTP for ${position.tsym}: ${ltp}`)
      return false
    }

    const isLongPosition = Number(position.netqty ?? position.netQty) > 0
    targets.value[position.tsym] = Number(
      (ltpNum + (isLongPosition ? 1 : -1) * parseFloat(targetValue.value)).toFixed(2)
    )

    // console.log(`Target set for ${position.tsym}: LTP = ${ltp}, TargetValue = ${targetValue.value}, Target = ${targets.value[position.tsym]}`);
    return true
  }
  return false
}
export const removeTarget = (position) => {
  targets.value[position.tsym] = null
}
export const increaseTarget = (position) => {
  if (targets.value[position.tsym] !== null) {
    targets.value[position.tsym] += 0.5 // Adjust increment value as needed
  }
}
export const decreaseTarget = (position) => {
  if (targets.value[position.tsym] !== null) {
    targets.value[position.tsym] -= 0.5 // Adjust decrement value as needed
  }
}

export const checkTargets = (newLTPs) => {
  if (!enableTarget.value) {
    // console.log('Target is disabled.');
    return
  }
  // console.log('Checking targets...');
  const validTargets = Object.entries(targets.value).filter(
    ([tsym, target]) => target !== null && target !== undefined
  )

  if (validTargets.length === 0) {
    // console.log('No valid targets set. Skipping check.');
    return
  }

  for (const [tsym, target] of validTargets) {
    const currentLTP = positionLTPs.value[tsym]
    const position = [...flatTradePositionBook.value, ...shoonyaPositionBook.value].find(
      (p) => p.tsym === tsym
    )

    // console.log(`Checking target for ${tsym}: Current LTP = ${currentLTP}, Target = ${target}`);
    if (position && currentLTP) {
      const isLongPosition = position.netqty > 0
      if ((isLongPosition && currentLTP >= target) || (!isLongPosition && currentLTP <= target)) {
        console.log(`Target reached for ${tsym}. Placing order to close position.`)
        submitRiskExit(position, 'Target')
      }
    }
  }
}
export const checkStoplosses = () => {
  if (!enableStoploss.value) {
    // console.log('Stoploss is disabled.');
    return
  }

  const stoplossValueNum = parseFloat(stoplossValue.value)
  if (isNaN(stoplossValueNum)) {
    console.error(`Invalid stoploss value: ${stoplossValue.value}`)
    return
  }

  // Check static stoplosses
  for (const [tsym, sl] of Object.entries(stoplosses.value)) {
    if (sl !== null && positionLTPs.value[tsym] !== undefined) {
      const position = [...flatTradePositionBook.value, ...shoonyaPositionBook.value].find(
        (p) => p.tsym === tsym
      )
      if (position) {
        const isLongPosition = position.netqty > 0
        const currentLTP = parseFloat(positionLTPs.value[tsym])
        if (isNaN(currentLTP)) {
          console.error(`Invalid LTP for ${tsym}: ${positionLTPs.value[tsym]}`)
          continue
        }
        if ((isLongPosition && currentLTP <= sl) || (!isLongPosition && currentLTP >= sl)) {
          console.log(`Static SL hit for ${tsym}: LTP ${currentLTP}, SL ${sl}`)
          submitRiskExit(position, 'Stop-loss')
        }
      }
    }
  }

  // Check trailing stoplosses
  for (const [tsym, tsl] of Object.entries(trailingStoplosses.value)) {
    if (tsl !== null && positionLTPs.value[tsym] !== undefined) {
      const position = [...flatTradePositionBook.value, ...shoonyaPositionBook.value].find(
        (p) => p.tsym === tsym
      )
      if (position) {
        const isLongPosition = position.netqty > 0
        const currentLTP = parseFloat(positionLTPs.value[tsym])
        if (isNaN(currentLTP)) {
          console.error(`Invalid LTP for ${tsym}: ${positionLTPs.value[tsym]}`)
          continue
        }

        if (isLongPosition) {
          if (currentLTP > tsl + stoplossValueNum) {
            // Update TSL for long positions
            trailingStoplosses.value[tsym] = parseFloat((currentLTP - stoplossValueNum).toFixed(2))
          } else if (currentLTP <= tsl && !tslHitPositions.has(tsym)) {
            // Hit TSL for long positions
            console.log(`TSL hit for ${tsym}: LTP ${currentLTP}, TSL ${tsl}`)
            submitRiskExit(position, 'Trailing stop-loss')
          }
        } else {
          if (currentLTP < tsl - stoplossValueNum) {
            // Update TSL for short positions
            trailingStoplosses.value[tsym] = parseFloat((currentLTP + stoplossValueNum).toFixed(2))
          } else if (currentLTP >= tsl && !tslHitPositions.has(tsym)) {
            // Hit TSL for short positions
            console.log(`TSL hit for ${tsym}: LTP ${currentLTP}, TSL ${tsl}`)
            submitRiskExit(position, 'Trailing stop-loss')
          }
        }
      }
    }
  }
}
export const checkStoplossesAndTargets = () => {
  for (const tsym of pendingDefaultProtection) {
    const position = [...flatTradePositionBook.value, ...shoonyaPositionBook.value].find(
      (item) => item.tsym === tsym
    )
    if (!position) continue

    let armed = true
    if (enableStoploss.value && stoplossValue.value > 0 && stoplosses.value[tsym] == null) {
      armed = setStoploss(position, 'static') && armed
    }
    if (enableTarget.value && targetValue.value > 0 && targets.value[tsym] == null) {
      armed = setTarget(position) && armed
    }
    if (armed) pendingDefaultProtection.delete(tsym)
  }

  checkStoplosses()
  checkTargets()
}
