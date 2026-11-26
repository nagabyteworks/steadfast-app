import { expect, it, vi } from 'vitest'
import { createPairOrderFlow } from './usePairOrderFlow'

it('opens and submits paired limit legs one at a time', async () => {
  const prepared = []
  const openDialog = vi.fn()
  const setBusy = vi.fn()
  let resolveFirstOrder
  const firstOrder = new Promise((resolve) => {
    resolveFirstOrder = resolve
  })
  const flow = createPairOrderFlow({
    legs: ['CALL', 'PUT'],
    prepareLeg: (transactionType, optionType) => prepared.push([transactionType, optionType]),
    openDialog,
    setBusy
  })

  flow.start('BUY')
  expect(prepared).toEqual([['BUY', 'CALL']])
  expect(openDialog).toHaveBeenCalledTimes(1)

  const submitting = flow.submit(() => firstOrder)
  const hiding = flow.dialogHidden()
  resolveFirstOrder()
  await Promise.all([submitting, hiding])

  expect(prepared).toEqual([['BUY', 'CALL'], ['BUY', 'PUT']])
  expect(openDialog).toHaveBeenCalledTimes(2)
  expect(setBusy).toHaveBeenLastCalledWith(true)

  await flow.submit(async () => {})
  await flow.dialogHidden()
  expect(setBusy).toHaveBeenLastCalledWith(false)
})

it('stops the pair sequence when a limit dialog is canceled', async () => {
  const prepared = []
  const onCanceled = vi.fn()
  const setBusy = vi.fn()
  const flow = createPairOrderFlow({
    legs: ['CALL', 'PUT'],
    prepareLeg: (transactionType, optionType) => prepared.push([transactionType, optionType]),
    openDialog: vi.fn(),
    setBusy,
    onCanceled
  })

  flow.start('SELL')
  await flow.dialogHidden()

  expect(prepared).toEqual([['SELL', 'CALL']])
  expect(onCanceled).toHaveBeenCalledWith(0)
  expect(setBusy).toHaveBeenLastCalledWith(false)
})
