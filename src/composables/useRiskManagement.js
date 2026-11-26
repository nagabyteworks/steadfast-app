import { watch } from 'vue'
import { usesServerManagedAccount } from '@/config/profile'
import {
  stoplossValue,
  targetValue,
  targetTrailValue,
  enableTarget,
  enableStoploss,
  enableTrailingStoploss,
  enableTargetTrail,
  stoplosses,
  targets,
  trailingStoplosses,
  riskRules,
  reconciliationRequired,
  riskSyncAvailable,
  useUiTriggers,
  flatTradePositionBook,
  shoonyaPositionBook,
  toastMessage,
  showToast
} from '@/stores/globalStore'
import { fetchRiskRules, createDefaultRiskRule, createManualRiskRule, patchRiskRule, deleteRiskRule } from '@/api/riskRules'
import { logRequestError } from '@/api/requestError'

// Stop-loss, target and trailing rules live on the server (API + WebSocket service), which
// watches prices and places the exit. This module only edits rules and mirrors them for display.

const pendingDefaultProtection = new Set()
const armingDefaultProtection = new Set()
const announcedOutcomes = new Set()
const OUTCOME_WINDOW_MS = 5 * 60 * 1000
let saveQueue = Promise.resolve()
let pendingSaves = 0

const notify = (message) => {
  toastMessage.value = message
  showToast.value = true
}

const allPositions = () => [...flatTradePositionBook.value, ...shoonyaPositionBook.value]
const armedRule = (tsym) => {
  const rule = riskRules.value[tsym]
  return rule?.status === 'armed' && !reconciliationRequired.value[tsym] ? rule : null
}
export const currentMonitor = () => (useUiTriggers.value ? 'ui' : 'server')
const round = (value) => Number(value.toFixed(2))

export const getArmedRule = armedRule

export const syncRiskMirrors = () => {
  const stop = {}
  const trailing = {}
  const target = {}
  for (const position of allPositions()) {
    stop[position.tsym] = null
    trailing[position.tsym] = null
    target[position.tsym] = null
  }
  for (const [tsym, rule] of Object.entries(riskRules.value)) {
    if (rule.status !== 'armed' || reconciliationRequired.value[tsym]) continue
    stop[tsym] = rule.mode !== 'trailing_sl' ? rule.slPrice : null
    trailing[tsym] = rule.mode === 'trailing_sl' ? rule.slPrice : null
    target[tsym] = rule.targetPrice
  }
  stoplosses.value = stop
  trailingStoplosses.value = trailing
  targets.value = target
}

const announceOutcome = (rule) => {
  const key = `${rule.tsym}:${rule.updatedAt}`
  if (rule.status === 'armed' || !rule.message || announcedOutcomes.has(key)) return
  announcedOutcomes.add(key)
  if (Date.now() - rule.updatedAt < OUTCOME_WINDOW_MS) notify(`${rule.tsym}: ${rule.message}`)
}

export const syncRiskRules = async () => {
  if (!usesServerManagedAccount) return
  try {
    const data = await fetchRiskRules()
    if (pendingSaves > 0) return
    const next = {}
    for (const rule of data.rules) {
      next[rule.tsym] = rule
      announceOutcome(rule)
    }
    riskRules.value = next
    reconciliationRequired.value = Object.fromEntries((data.reconciliation ?? []).map((item) => [item.tsym, item]))
    riskSyncAvailable.value = true
    syncRiskMirrors()
  } catch (error) {
    riskSyncAvailable.value = false
    logRequestError('Unable to load stop-loss and target rules', error)
  }
}

const enqueue = (request) => {
  pendingSaves++
  saveQueue = saveQueue
    .then(request)
    .then(() => false, (error) => {
      logRequestError('Unable to save the stop-loss/target rule', error)
      notify(error.response?.data?.message || 'Unable to save the stop-loss/target rule on the server.')
      return true
    })
    .then(async (failed) => {
      pendingSaves--
      if (failed) await syncRiskRules()
      return !failed
    })
  return saveQueue
}

export const keepSaved = (rule) => {
  riskRules.value = { ...riskRules.value, [rule.tsym]: rule }
  syncRiskMirrors()
}

// Applies a change optimistically, then saves it on the server in order.
export const updateRule = (position, fields, deltas = {}) => {
  if (!usesServerManagedAccount) {
    notify('Server-side stop-loss and target need the server-managed Flattrade account.')
    return false
  }
  const tsym = position.tsym
  const existing = armedRule(tsym)
  if (!existing) {
    notify(`${tsym}: reconcile the opening fill before creating protection.`)
    return false
  }
  const next = { ...existing, ...fields }
  if (deltas.slDelta && next.slPrice != null) next.slPrice = round(next.slPrice + deltas.slDelta)
  if (deltas.targetDelta && next.targetPrice != null) next.targetPrice = round(next.targetPrice + deltas.targetDelta)

  console.log(`[risk] ${existing ? 'update' : 'create'} ${tsym}`, { fields, deltas, monitor: next.monitor })
  keepSaved(next)
  enqueue(async () => keepSaved({ ...next, ...(await patchRiskRule(tsym, { ...fields, ...deltas })) }))
  return true
}

export const dropRule = (tsym) => {
  console.log(`[risk] removing rule ${tsym}`)
  const { [tsym]: _removed, ...rest } = riskRules.value
  riskRules.value = rest
  syncRiskMirrors()
  enqueue(() => deleteRiskRule(tsym))
}

const positionQuantity = (position) => Math.abs(Number(position.netQty || position.netqty))

const setReconciledLevel = (position, settings) => {
  if (!usesServerManagedAccount) {
    notify('Server-side stop-loss and target need the server-managed Flattrade account.')
    return false
  }
  return enqueue(async () => {
    const saved = await createManualRiskRule(position.tsym, { ...settings, monitor: currentMonitor() })
    keepSaved(saved)
    const { [position.tsym]: _cleared, ...remaining } = reconciliationRequired.value
    reconciliationRequired.value = remaining
  })
}

export const scheduleDefaultProtection = (tradingSymbol) => {
  if (enableStoploss.value || enableTarget.value) {
    pendingDefaultProtection.add(tradingSymbol)
  }
}

export const setStoploss = (position, type) => {
  const existing = armedRule(position.tsym)
  if (type === 'convert_to_tsl') {
    if (!existing || existing.slPrice == null) {
      console.error(`No existing SL to convert for ${position.tsym}`)
      return false
    }
    if (existing.mode === 'target_trail') {
      notify('Remove the trailing target before using a trailing stop-loss.')
      return false
    }
    const points = parseFloat(stoplossValue.value)
    const converted = points > 0 && updateRule(position, { mode: 'trailing_sl', slPoints: points })
    if (converted) enableTrailingStoploss.value = true
    return converted
  }
  if (type === 'convert_to_sl') {
    if (!existing || existing.slPrice == null) return false
    const converted = updateRule(position, { mode: 'static' })
    if (converted) enableTrailingStoploss.value = false
    return converted
  }

  if (!enableStoploss.value) {
    console.log('Stoploss is disabled.')
    return false
  }
  if (!Number.isFinite(positionQuantity(position)) || positionQuantity(position) === 0) {
    console.log(`Quantity is zero for ${position.tsym}, no stoploss will be set.`)
    return false
  }
  const points = parseFloat(stoplossValue.value)
  if (!Number.isFinite(points) || !(points > 0)) {
    console.error(`Invalid stoploss value for ${position.tsym}`)
    return false
  }

  const trailing = type === 'trailing' || (type === 'static' && enableTrailingStoploss.value)
  if (trailing && existing?.mode === 'target_trail') {
    notify('Remove the trailing target before using a trailing stop-loss.')
    return false
  }
  return setReconciledLevel(position, {
    kind: 'stop', stopPoints: points, targetPoints: null, trailingStop: trailing,
    targetTrailing: false, trailPoints: null
  })
}

export const removeStoploss = (position) => {
  const rule = armedRule(position.tsym)
  if (!rule) return
  if (rule.targetPrice == null) return dropRule(position.tsym)
  updateRule(position, { slPrice: null, slPoints: null, mode: rule.mode === 'target_trail' ? 'target_trail' : 'static' })
}
export const increaseStoploss = (position) => {
  if (armedRule(position.tsym)?.slPrice != null) updateRule(position, {}, { slDelta: 1 })
}
export const decreaseStoploss = (position) => {
  if (armedRule(position.tsym)?.slPrice != null) updateRule(position, {}, { slDelta: -1 })
}

export const setTarget = (position) => {
  if (!enableTarget.value) {
    console.log('Target is disabled.')
    return false
  }
  if (!Number.isFinite(positionQuantity(position)) || positionQuantity(position) === 0) {
    console.log(`Quantity is zero for ${position.tsym}, no target will be set.`)
    return false
  }
  const points = parseFloat(targetValue.value)
  if (!Number.isFinite(points) || !(points > 0)) {
    console.error(`Invalid target value for ${position.tsym}`)
    return false
  }
  const trailPoints = parseFloat(targetTrailValue.value)
  if (enableTargetTrail.value && (!Number.isFinite(trailPoints) || !(trailPoints > 0))) {
    console.error('Invalid target trail value')
    return false
  }

  return setReconciledLevel(position, {
    kind: 'target', stopPoints: null, targetPoints: points, trailingStop: false,
    targetTrailing: enableTargetTrail.value, trailPoints: enableTargetTrail.value ? trailPoints : null
  })
}

export const removeTarget = (position) => {
  const rule = armedRule(position.tsym)
  if (!rule) return
  if (rule.slPrice == null) return dropRule(position.tsym)
  updateRule(position, {
    targetPrice: null,
    trailPoints: null,
    mode: rule.mode === 'target_trail' ? 'static' : rule.mode
  })
}
export const increaseTarget = (position) => {
  if (armedRule(position.tsym)?.targetPrice != null) updateRule(position, {}, { targetDelta: 1 })
}
export const decreaseTarget = (position) => {
  if (armedRule(position.tsym)?.targetPrice != null) updateRule(position, {}, { targetDelta: -1 })
}

// Manual price edits; clearing the field removes that level
export const setStoplossPrice = (position, price) => {
  if (price == null) return removeStoploss(position)
  if (armedRule(position.tsym)?.slPrice != null) updateRule(position, { slPrice: round(price) })
}
export const setTargetPrice = (position, price) => {
  if (price == null) return removeTarget(position)
  if (armedRule(position.tsym)?.targetPrice != null) updateRule(position, { targetPrice: round(price) })
}

// Switches the position's target between fixed and trailing, and mirrors it in the Target Trailing toggle
export const toggleTargetTrail = (position) => {
  const rule = armedRule(position.tsym)
  if (!rule || rule.targetPrice == null) return
  if (rule.mode === 'target_trail') {
    if (updateRule(position, { mode: 'static', trailPoints: null })) enableTargetTrail.value = false
    return
  }
  if (rule.mode === 'trailing_sl') {
    notify('Switch the trailing stop-loss to a fixed one before using a trailing target.')
    return
  }
  const trailPoints = parseFloat(targetTrailValue.value)
  if (!(trailPoints > 0)) {
    notify('Set the target trailing points first.')
    return
  }
  if (updateRule(position, { mode: 'target_trail', trailPoints }) && enableTarget.value) {
    enableTargetTrail.value = true
  }
}

// Arms default protection once a new position shows up in the position book.
export const checkStoplossesAndTargets = async () => {
  let success = true
  for (const tsym of pendingDefaultProtection) {
    const position = allPositions().find((item) => item.tsym === tsym)
    const quantity = Number(position?.netqty ?? position?.netQty)
    if (!position || !Number.isFinite(quantity) || quantity === 0 || armingDefaultProtection.has(tsym)) {
      success = false
      continue
    }
    armingDefaultProtection.add(tsym)
    try {
      await saveQueue
      const rule = await createDefaultRiskRule(tsym, {
        stopPoints: enableStoploss.value ? Number(stoplossValue.value) : null,
        targetPoints: enableTarget.value ? Number(targetValue.value) : null,
        trailingStop: enableTrailingStoploss.value,
        targetTrailing: enableTargetTrail.value,
        trailPoints: enableTargetTrail.value ? Number(targetTrailValue.value) : null,
        monitor: currentMonitor()
      })
      keepSaved(rule)
      const { [tsym]: _cleared, ...remaining } = reconciliationRequired.value
      reconciliationRequired.value = remaining
    } catch (error) {
      logRequestError('Unable to reconcile the opening fill', error)
      notify(error.response?.data?.message || `${tsym}: opening fill could not be verified; reconcile the position manually.`)
      await syncRiskRules()
      success = false
    } finally {
      armingDefaultProtection.delete(tsym)
      pendingDefaultProtection.delete(tsym)
    }
  }
  return success
}

// Hands every armed rule to whoever is now responsible for watching it.
watch(useUiTriggers, (ui) => {
  const monitor = ui ? 'ui' : 'server'
  console.log(`[risk] trigger source switched to ${ui ? 'UI (this page)' : 'server (WebSocket service)'}`)
  if (!usesServerManagedAccount) return
  for (const rule of Object.values(riskRules.value)) {
    if (rule.status !== 'armed' || rule.monitor === monitor) continue
    keepSaved({ ...rule, monitor })
    enqueue(async () => keepSaved({ ...rule, ...(await patchRiskRule(rule.tsym, { monitor })) }))
  }
})
