<template>
    <div v-if="accountRefreshHandler" class="d-flex align-items-center text-nowrap flex-shrink-0">
        <button type="button" class="btn btn-sm btn-outline-secondary text-nowrap" :disabled="accountRefreshing"
            title="Refresh from Flattrade (auto every 5 seconds)" @click="accountRefreshHandler">
            <span v-if="accountRefreshing" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
            <span v-else>&#x21bb;</span>
            Refresh
        </button>
        <small v-if="accountRefreshedAt" class="text-muted ms-2 d-none d-xl-inline">{{
            new Date(accountRefreshedAt).toLocaleTimeString() }}</small>
    </div>
</template>

<script setup>
import { accountRefreshHandler, accountRefreshing, accountRefreshedAt } from '@/stores/globalStore'
</script>
