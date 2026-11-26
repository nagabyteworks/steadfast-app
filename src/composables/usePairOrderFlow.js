export const createPairOrderFlow = ({ legs, prepareLeg, openDialog, setBusy, onCanceled }) => {
  let sequence = null

  const openCurrentLeg = (current) => {
    prepareLeg(current.transactionType, legs[current.index])
    openDialog()
  }

  return {
    start(transactionType) {
      if (sequence) return false
      sequence = { transactionType, index: 0, pending: null }
      setBusy(true)
      try {
        openCurrentLeg(sequence)
        return true
      } catch (error) {
        sequence = null
        setBusy(false)
        throw error
      }
    },
    submit(submitOrder) {
      if (!sequence) return submitOrder()
      const current = sequence
      current.pending = Promise.resolve().then(submitOrder)
      return current.pending
    },
    async dialogHidden() {
      const current = sequence
      if (!current) return
      if (!current.pending) {
        onCanceled?.(current.index)
        sequence = null
        setBusy(false)
        return
      }
      try {
        await current.pending
      } catch (error) {
        if (sequence === current) {
          sequence = null
          setBusy(false)
        }
        throw error
      }
      if (sequence !== current) return
      current.pending = null
      current.index += 1
      if (current.index === legs.length) {
        sequence = null
        setBusy(false)
        return
      }
      try {
        openCurrentLeg(current)
      } catch (error) {
        sequence = null
        setBusy(false)
        throw error
      }
    }
  }
}
