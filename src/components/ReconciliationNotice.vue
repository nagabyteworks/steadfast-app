<template>
  <details class="small text-warning">
    <summary>RECONCILIATION_REQUIRED: {{ message }}</summary>
    <p>Automatic virtual protection is disabled. The last reported position is {{ isOpen ? 'open' : 'flat' }}; verify its current status and any protection directly with Flattrade. Manual intervention may be required.</p>
    <p v-if="updatedAt">Last reconciliation status update: {{ new Date(updatedAt).toLocaleString() }}. The message above records the latest reason.</p>
    <p>Complete, independently verifiable evidence is needed for the opening fill, all later entries and exits, the remaining quantity, and the instrument, expiry, strike and direction.</p>
    <p>Trade books, order history, official contract notes or statements, and broker-confirmed position details may be relevant. A user confirmation or uploaded document alone is not proof.</p>
    <p>Evidence submission and verified manual reconciliation are not yet available in this app; the flag cannot currently be resolved here.</p>
  </details>
</template>

<script setup>
defineProps({
  message: { type: String, required: true },
  updatedAt: { type: Number, default: null },
  isOpen: { type: Boolean, default: false }
})
</script>
