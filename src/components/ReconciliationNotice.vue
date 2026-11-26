<template>
  <p class="small text-warning">{{ status }}</p>
</template>

<script setup>
defineProps({
  status: { type: String, required: true }
})
</script>
