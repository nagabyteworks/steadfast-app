import { positionLTPs, riskRules, flatTradePositionBook, shoonyaPositionBook, toastMessage, showToast } from '@/stores/globalStore'
import { getArmedRule, updateRule, dropRule } from '@/composables/useRiskManagement'
import { closePosition } from '@/composables/useOrderManagement'

// UI-side stop-loss/target watcher. It only handles rules whose monitor is "ui" (the "Trigger from
// app" toggle); rules with monitor "server" are watched by the WebSocket service. The price logic
// mirrors steadfast-websocket/risk_monitor.py `evaluate` so both sources behave identically.

const round = (value) => Number(value.toFixed(2))
const exiting = new Set()

// Applies one price to a rule. Returns { changed, reason, slPrice, targetPrice } without mutating it.
export const evaluateRule = (rule, ltp) => {
  const sign = rule.side === 'long' ? 1 : -1
  let slPrice = rule.slPrice
  let targetPrice = rule.targetPrice ?? null
  if (slPrice != null && sign * (ltp - slPrice) <= 0) {
    return { changed: false, reason: 'Stop-loss', slPrice, targetPrice }
  }

  let changed = false
  if (rule.mode === 'trailing_sl' && slPrice != null) {
    const candidate = round(ltp - sign * rule.slPoints)
    if (sign * (candidate - slPrice) > 0) {
      slPrice = candidate
      changed = true
    }
  } else if (rule.mode === 'target_trail') {
    while (targetPrice != null && sign * (ltp - targetPrice) >= 0) {
      slPrice = targetPrice
      targetPrice = round(targetPrice + sign * rule.trailPoints)
      changed = true
    }
    return { changed, reason: null, slPrice, targetPrice }
  }

  if (targetPrice != null && sign * (ltp - targetPrice) >= 0) {
    return { changed, reason: 'Target', slPrice, targetPrice }
  }
  return { changed, reason: null, slPrice, targetPrice }
}

const notify = (message) => {
  toastMessage.value = message
  showToast.value = true
}

const exitPosition = async (position, rule, reason, ltp) => {
  const tsym = rule.tsym
  exiting.add(tsym)
  console.log(`[ui-risk] ${reason} hit for ${tsym} at ${ltp}; sending exit`, { sl: rule.slPrice, target: rule.targetPrice })
  let acknowledged = false
  try {
    acknowledged = await closePosition(position)
  } catch (error) {
    console.error(`[ui-risk] exit for ${tsym} threw`, error)
  }
  // The rule is consumed either way; an unacknowledged exit is never retried automatically.
  dropRule(tsym)
  if (acknowledged) {
    console.log(`[ui-risk] exit order accepted for ${tsym}`)
    notify(`${tsym}: ${reason} hit at ${ltp}, exit order sent`)
  } else {
    console.error(`[ui-risk] exit order for ${tsym} was not acknowledged`)
    notify(`${tsym}: ${reason} hit at ${ltp} but the exit failed or is uncertain; verify with Flattrade`)
  }
}

// Called every second. Moves trailing levels and exits positions whose stop-loss or target was hit.
export const checkUiTriggers = () => {
  const positions = [...flatTradePositionBook.value, ...shoonyaPositionBook.value]
  for (const rule of Object.values(riskRules.value)) {
    if (rule.monitor !== 'ui' || rule.status !== 'armed' || exiting.has(rule.tsym)) continue
    const position = positions.find((item) => item.tsym === rule.tsym)
    if (!position) continue
    if (!Number(position.netqty)) {
      console.log(`[ui-risk] ${rule.tsym} is flat; removing its rule`)
      dropRule(rule.tsym)
      continue
    }
    const ltp = parseFloat(positionLTPs.value[rule.tsym])
    if (!Number.isFinite(ltp) || ltp <= 0) continue

    const result = evaluateRule(rule, ltp)
    if (result.reason) {
      exitPosition(position, rule, result.reason, ltp)
    } else if (result.changed) {
      console.log(`[ui-risk] trailing ${rule.tsym} at ${ltp}: sl ${rule.slPrice} -> ${result.slPrice}, target ${rule.targetPrice} -> ${result.targetPrice}`)
      if (getArmedRule(rule.tsym)) {
        updateRule(position, { slPrice: result.slPrice, targetPrice: result.targetPrice })
      }
    }
  }
}
