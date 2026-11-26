<template>
    <section class="row g-2 mt-3 mx-0 bg-color rounded justify-content-between align-items-center py-2" :class="{
        'MTM': stickyMTM,
        'border border-warning': riskReached,
        'border border-success': targetReached,
    }">
        <div class="col-6 col-md-4 col-xl d-flex align-items-center justify-content-center" style="min-height: 40px">
            <small class="text-muted">Total Capital</small>
            <span class="ms-1 fw-bold"
                :class="totalCapitalPercentage > 0 ? 'text-success' : totalCapitalPercentage < 0 ? 'text-danger' : null">
                {{ totalCapitalPercentage.toFixed(2) }}%
            </span>
        </div>
        <div class="col-6 col-md-4 col-xl d-flex align-items-center justify-content-center" style="min-height: 40px">
            <small class="text-muted">Net Qty</small>
            <span class="ms-1 fw-bold"
                :class="totalNetQty > 0 ? 'text-success' : totalNetQty < 0 ? 'text-danger' : null">
                {{ totalNetQty }}
            </span>
        </div>
        <div class="col-6 col-md-4 col-xl d-flex align-items-center justify-content-center" style="min-height: 40px">
            <small class="text-muted">Gross P&L</small>
            <span class="ms-1 fw-bold"
                :class="totalProfit > 0 ? 'text-success' : totalProfit < 0 ? 'text-danger' : null">
                ₹{{ formatPrice(totalProfit) }}
            </span>
        </div>
        <div class="col-6 col-md-4 col-xl d-flex align-items-center justify-content-center" style="min-height: 40px"
            title="STT, stamp duty and GST (estimated)">
            <small class="text-muted">Tax</small>
            <span class="ms-1 fw-bold">₹{{ formatPrice(totalTax) }}</span>
        </div>
        <div class="col-6 col-md-4 col-xl d-flex align-items-center justify-content-center" style="min-height: 40px"
            title="Exchange transaction, SEBI and IPFT charges (estimated)">
            <small class="text-muted">Other Fees</small>
            <span class="ms-1 fw-bold">₹{{ formatPrice(otherTradingCharges) }}</span>
        </div>
        <div class="col-6 col-md-4 col-xl d-flex align-items-center justify-content-center" style="min-height: 40px"
            title="Estimated per the selected broker's pricing">
            <small class="text-muted">Brokerage</small>
            <span class="ms-1 fw-bold">₹{{ formatPrice(totalBrokerage) }}</span>
        </div>
        <div class="col-6 col-md-4 col-xl d-flex align-items-center justify-content-center" style="min-height: 40px">
            <small class="text-muted">Total Charges</small>
            <span class="ms-1 fw-bold">₹{{ formatPrice(totalTradingCharges) }}</span>
        </div>
        <div class="col-6 col-md-4 col-xl d-flex align-items-center justify-content-center" style="min-height: 40px"
            title="Gross P&L minus estimated taxes, other fees and brokerage">
            <small class="text-muted">Net P&L</small>
            <span class="ms-1 fw-bold" :class="netPnl > 0 ? 'text-success' : netPnl < 0 ? 'text-danger' : null">
                ₹{{ formatPrice(netPnl) }}
            </span>
        </div>
    </section>
</template>

<script setup>
import { defineProps } from 'vue';
import { formatPrice } from '@/composables/useFormatters';

// Global State

const props = defineProps({
    stickyMTM: Boolean,
    totalCapitalPercentage: Number,
    totalProfit: Number,
    totalNetQty: Number,
    totalTax: Number,
    otherTradingCharges: Number,
    totalBrokerage: Number,
    totalTradingCharges: Number,
    netPnl: Number,
    riskReached: Boolean,
    targetReached: Boolean
});

</script>
