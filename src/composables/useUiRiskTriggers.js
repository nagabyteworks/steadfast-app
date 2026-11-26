import {
  flatTradePositionBook,
  positionLTPs,
  positionLTPUpdatedAt,
  riskRules,
  shoonyaPositionBook,
  toastMessage,
  showToast,
  useUiTriggers
} from '@/stores/globalStore'
import { patchRiskRule, triggerUiRiskRule } from '@/api/riskRules'
import { logRequestError } from '@/api/requestError'
import { syncRiskMirrors, syncRiskRules } from './useRiskManagement'

const inFlight = new Set()
const round = (price) => Number(price.toFixed(2))

export const evaluateUiRiskRule = (rule, ltp) => {
  if (!Number.isFinite(ltp) || ltp <= 0) return {}

  const sign = rule.side === 'long' ? 1 : -1
  const stop = rule.slPrice
  if (stop !== null && stop !== undefined && sign * (ltp - stop) <= 0) {
    return { reason: 'Stop-loss' }
  }

  const patch = {}
  let target = rule.targetPrice
  if (rule.mode === 'trailing_sl' && stop !== null && stop !== undefined) {
    const candidate = round(ltp - sign * rule.slPoints)
    if (sign * (candidate - stop) > 0) patch.slPrice = candidate
  } else if (rule.mode === 'target_trail') {
    let nextStop = stop
    let changed = false
    while (target !== null && target !== undefined && sign * (ltp - target) >= 0) {
      const nextTarget = round(target + sign * rule.trailPoints)
      if (!Number.isFinite(nextTarget) || nextTarget <= 0 || sign * (nextTarget - target) <= 0) {
        console.error(`Target trailing cannot advance for ${rule.tsym}`)
        break
      }
      nextStop = target
      target = nextTarget
      changed = true
    }
    if (changed) {
      patch.slPrice = nextStop
      patch.targetPrice = target
    }
  }

  if (rule.mode !== 'target_trail' && target !== null && target !== undefined &&
      sign * (ltp - target) >= 0) {
    return { ...(Object.keys(patch).length ? { patch } : {}), reason: 'Target' }
  }
  return Object.keys(patch).length ? { patch } : {}
}

const notify = (message) => {
  toastMessage.value = message
  showToast.value = true
}

export const checkUiRiskTriggers = async () => {
  if (!useUiTriggers.value) return

  const positions = [...flatTradePositionBook.value, ...shoonyaPositionBook.value]
  for (const [tsym, rule] of Object.entries(riskRules.value)) {
    if (rule.monitor !== 'ui' || rule.status !== 'armed' || inFlight.has(tsym)) continue
    const position = positions.find((item) => item.tsym === tsym)
    const quantity = Number(position?.netqty ?? position?.netQty)
    const ltp = Number(positionLTPs.value[tsym])
    const quoteAt = Number(positionLTPUpdatedAt.value[tsym])
    if (!position || !Number.isFinite(quantity) || quantity === 0 ||
        !Number.isFinite(ltp) || !Number.isFinite(quoteAt) || Date.now() - quoteAt > 30_000) {
      continue
    }

    const evaluation = evaluateUiRiskRule(rule, ltp)
    if (evaluation.reason) {
      inFlight.add(tsym)
      try {
        const result = await triggerUiRiskRule({
          tsym, reason: evaluation.reason, ltp, rev: rule.rev
        })
        if (result.handled && result.status) {
          await syncRiskRules()
        }
      } catch (error) {
        logRequestError(`Unable to process UI-monitored protection for ${tsym}`, error)
        notify(`${tsym}: OPEN – RECOVERING`)
      } finally {
        inFlight.delete(tsym)
      }
      continue
    }

    if (evaluation.patch) {
      inFlight.add(tsym)
      try {
        const saved = await patchRiskRule(tsym, { ...evaluation.patch, rev: rule.rev })
        riskRules.value = { ...riskRules.value, [tsym]: saved }
        syncRiskMirrors()
      } catch (error) {
        if (error.response?.status === 409) {
          await syncRiskRules()
          continue
        }
        logRequestError(`Unable to advance UI-monitored protection for ${tsym}`, error)
        notify(`${tsym}: OPEN – RECOVERING`)
      } finally {
        inFlight.delete(tsym)
      }
    }
  }
}
