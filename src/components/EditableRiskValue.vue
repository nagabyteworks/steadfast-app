<template>
    <input v-if="editing" ref="input" v-model="draft" type="number" step="0.05" min="0"
        class="form-control form-control-sm py-0 px-1 risk-input" @keyup.enter="commit" @keyup.esc="editing = false"
        @blur="commit" />
    <span v-else class="d-flex align-items-center px-1 small risk-value" :class="bgClass" title="Click to edit"
        role="button" @click="startEdit">
        <slot>{{ value }}</slot>
    </span>
</template>

<script setup>
import { nextTick, ref } from 'vue'

const props = defineProps({
    value: { type: Number, default: null },
    bgClass: { type: String, default: 'bg-danger text-white' }
})
// Emits the new price, or null when the field is cleared (which removes the level)
const emit = defineEmits(['commit'])

const editing = ref(false)
const draft = ref('')
const input = ref(null)

const startEdit = async () => {
    draft.value = props.value ?? ''
    editing.value = true
    await nextTick()
    input.value?.focus()
    input.value?.select()
}

const commit = () => {
    if (!editing.value) return
    editing.value = false
    const text = String(draft.value).trim()
    if (text === '') return emit('commit', null)
    const price = Number(text)
    if (Number.isFinite(price) && price > 0 && price !== props.value) emit('commit', price)
}
</script>

<style scoped>
.risk-input { width: 70px; }
.risk-value { cursor: text; min-height: 1.3rem; }
</style>
