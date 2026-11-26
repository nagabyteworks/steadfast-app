import { watch } from 'vue'
import { positionLTPs, riskRules, reconciliationRequired, flatTradePositionBook, shoonyaPositionBook, toastMessage, showToast } from '@/stores/globalStore'
import { getArmedRule, updateRule, dropRule, syncRiskRules } from '@/composables/useRiskManagement'
import { triggerUiRiskRule } from '@/api/riskRules'

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
    if (!Number.isFinite(rule.trailPoints) || rule.trailPoints <= 0) {
      throw new RangeError('Invalid target trailing points')
    }
    while (targetPrice != null && sign * (ltp - targetPrice) >= 0) {
      const nextTarget = round(targetPrice + sign * rule.trailPoints)
      if (!Number.isFinite(nextTarget) || nextTarget <= 0 || sign * (nextTarget - targetPrice) <= 0) {
        throw new RangeError('Invalid next target price')
      }
      slPrice = targetPrice
      targetPrice = nextTarget
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

const exitPosition = async (rule, reason, ltp) => {
  const tsym = rule.tsym
  exiting.add(tsym)
  console.log(`[ui-risk] ${reason} hit for ${tsym} at ${ltp}; sending exit`, { sl: rule.slPrice, target: rule.targetPrice })
  try {
    const result = await triggerUiRiskRule(tsym, reason, ltp, rule.rev)
    if (result.handled && result.status === 'done') {
      notify(`${tsym}: ${reason} hit at ${ltp}, exit order sent; verify execution with Flattrade`)
    } else {
      notify(`${tsym}: automatic exit was not confirmed; verify the position and protection with Flattrade`)
    }
  } catch (error) {
    console.error(`[ui-risk] exit for ${tsym} threw`, error)
    notify(`${tsym}: exit failed or is uncertain; verify with Flattrade`)
  } finally {
    await syncRiskRules()
    exiting.delete(tsym)
  }
}

// Called every second. Moves trailing levels and exits positions whose stop-loss or target was hit.
export const checkUiTriggers = () => {
  const positions = [...flatTradePositionBook.value, ...shoonyaPositionBook.value]
  for (const rule of Object.values(riskRules.value)) {
    if (rule.monitor !== 'ui' || rule.status !== 'armed' || reconciliationRequired.value[rule.tsym] || exiting.has(rule.tsym)) continue
    const position = positions.find((item) => item.tsym === rule.tsym)
    if (!position) continue
    if (!Number(position.netqty)) {
      console.log(`[ui-risk] ${rule.tsym} is flat; removing its rule`)
      dropRule(rule.tsym)
      continue
    }
    const ltp = parseFloat(positionLTPs.value[rule.tsym])
    if (!Number.isFinite(ltp) || ltp <= 0) continue

    let result
    try {
      result = evaluateRule(rule, ltp)
    } catch (error) {
      if (!(error instanceof RangeError)) throw error
      console.error(`[ui-risk] ${rule.tsym}: ${error.message}`)
      notify(`${rule.tsym}: ${error.message}; verify the target trailing configuration`)
      continue
    }
    if (result.reason) {
      exitPosition(rule, result.reason, ltp)
    } else if (result.changed) {
      console.log(`[ui-risk] trailing ${rule.tsym} at ${ltp}: sl ${rule.slPrice} -> ${result.slPrice}, target ${rule.targetPrice} -> ${result.targetPrice}`)
      if (getArmedRule(rule.tsym)) {
        updateRule(position, { slPrice: result.slPrice, targetPrice: result.targetPrice })
      }
    }
  }
}

// Recheck immediately after a rule is edited or synchronized, rather than waiting for the
// next periodic check. This catches levels that are already breached by the current LTP.
watch(riskRules, checkUiTriggers, { flush: 'post' })
