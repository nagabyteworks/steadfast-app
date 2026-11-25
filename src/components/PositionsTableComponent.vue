<template>
    <!-- Desktop view -->
    <div class="table-responsive d-none d-md-block">
        <table class="table table-hover">
            <thead>
                <tr>
                    <th scope="col">Select</th>
                    <th scope="col">Symbol</th>
                    <th scope="col">Qty</th>
                    <th scope="col">Side</th>
                    <th scope="col" style="width: 1%;">TSL / SL</th>
                    <th scope="col">LTP</th>
                    <th scope="col" style="width: 1%;">Target</th>
                    <th scope="col">Type</th>
                    <th scope="col">B.Avg</th>
                    <th scope="col">S.Avg</th>
                    <th scope="col">Realized</th>
                    <th scope="col">Unrealized</th>
                </tr>
            </thead>
            <tbody>
                <template v-if="sortedPositions.length > 0">
                    <tr v-for="position in sortedPositions" :key="position.tsym">
                        <td class="position-relative">
                            <label
                                class="position-absolute top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center">
                                <input type="checkbox" :id="'position-' + position.tsym" :value="position.tsym"
                                    :checked="safeSelectedPositionsSet.has(position.tsym)"
                                    :disabled="position.netqty == 0"
                                    @change="$emit('update:selectedPositionsSet', handleCheckboxChange($event, position.tsym))" />
                            </label>
                        </td>
                        <td>{{ formatTradingSymbol(position.tsym) }}</td>
                        <td :class="[
                            position.netqty > 0 ? 'text-success' :
                                position.netqty < 0 ? 'text-danger' :
                                    'text-secondary'
                        ]">
                            {{ position.netqty }}
                        </td>
                        <td :class="{ 'text-success': position.netqty > 0, 'text-danger': position.netqty < 0 }">
                            {{ position.netqty > 0 ? 'BUY' : position.netqty < 0 ? 'SELL' : '-' }} </td>
                        <td v-if="position.netqty != 0">
                            <!-- SL & TSL -->
                            <div class="row" style="height: 24px;">
                                <div class="col-12" v-if="trailingStoplosses[position.tsym] !== null">
                                    <div class="d-flex align-items-center">
                                        <span class="me-1 small">TSL:</span>
                                        <EditableRiskValue :value="trailingStoplosses[position.tsym]"
                                            bgClass="bg-danger text-white rounded"
                                            @commit="(price) => $emit('edit-stoploss', position, price)" />
                                    </div>
                                </div>
                                <div class="col-12" v-else-if="stoplosses[position.tsym] !== null">
                                    <div class="btn-group" role="group">
                                        <button class="btn btn-outline-danger btn-xs"
                                            @click="$emit('decrease-stoploss', position)">
                                            -
                                        </button>
                                        <EditableRiskValue :value="stoplosses[position.tsym]"
                                            @commit="(price) => $emit('edit-stoploss', position, price)" />
                                        <button class="btn btn-outline-success btn-xs"
                                            @click="$emit('increase-stoploss', position)">
                                            +
                                        </button>
                                    </div>
                                </div>
                                <div v-else>-</div>
                            </div>
                            <div class="btn-group mt-1" role="group">
                                <button class="btn btn-outline btn-xs"
                                    v-if="trailingStoplosses[position.tsym] === null && stoplosses[position.tsym] === null"
                                    @click="$emit('set-stoploss', position, 'static')">
                                    ➕
                                </button>
                                <button class="btn btn-outline btn-xs"
                                    v-if="trailingStoplosses[position.tsym] !== null || stoplosses[position.tsym] !== null"
                                    :class="{ active: trailingStoplosses[position.tsym] !== null }"
                                    @click="$emit('set-stoploss', position, trailingStoplosses[position.tsym] !== null ? 'convert_to_sl' : 'convert_to_tsl')">
                                    {{ trailingStoplosses[position.tsym] !== null ? 'S' : 'T' }}
                                </button>
                                <button
                                    v-if="trailingStoplosses[position.tsym] !== null || stoplosses[position.tsym] !== null"
                                    class="btn btn-outline btn-xs" @click="$emit('remove-stoploss', position)">
                                    ❌
                                </button>
                            </div>
                        </td>
                        <td v-else>-</td>
                        <td style="width: 80px;"
                            :class="{ 'text-success': parseFloat(positionLTPs[position.tsym]) > parseFloat(position.totbuyavgprc), 'text-danger': parseFloat(positionLTPs[position.tsym]) < parseFloat(position.totbuyavgprc) }">
                            {{ formatPrice(positionLTPs[position.tsym]) }}
                            <div v-if="positionPercentChanges[position.tsym] !== undefined" class="small"
                                :class="positionPercentChanges[position.tsym] >= 0 ? 'text-success' : 'text-danger'">
                                {{ formatPercent(positionPercentChanges[position.tsym]) }}
                            </div>
                        </td>
                        <td v-if="position.netqty != 0">
                            <!-- TG -->
                            <div class="row" style="height: 24px;">
                                <div class="col-12" v-if="targets[position.tsym] !== null">
                                    <div class="btn-group" role="group">
                                        <button class="btn btn-outline-danger btn-xs"
                                            @click="$emit('decrease-target', position)">
                                            -
                                        </button>
                                        <EditableRiskValue :value="targets[position.tsym]" bgClass="bg-success text-white"
                                            @commit="(price) => $emit('edit-target', position, price)" />
                                        <button class="btn btn-outline-success btn-xs"
                                            @click="$emit('increase-target', position)">
                                            +
                                        </button>
                                    </div>
                                </div>
                                <div v-else>-</div>
                            </div>
                            <div class="btn-group mt-1" role="group">
                                <button class="btn btn-outline btn-xs" v-if="targets[position.tsym] === null"
                                    @click="$emit('set-target', position)">
                                    ➕
                                </button>
                                <button class="btn btn-outline btn-xs" v-if="targets[position.tsym] !== null"
                                    :class="{ active: targetTrailing[position.tsym] }" title="Trailing target"
                                    @click="$emit('toggle-target-trail', position)">
                                    T
                                </button>
                                <button class="btn btn-outline btn-xs" v-if="targets[position.tsym] !== null"
                                    @click="$emit('remove-target', position)">
                                    ❌
                                </button>
                            </div>
                        </td>
                        <td v-else>-</td>
                        <td>{{ formatProductType(position.prd) }}</td>
                        <td>{{ formatPrice(position.totbuyavgprc) }}</td>
                        <td>{{ formatPrice(position.totsellavgprc) }}</td>
                        <td :class="position.rpnl > 0 ? 'text-success' : position.rpnl < 0 ? 'text-danger' : null">
                            {{ formatPrice(position.rpnl) }}
                        </td>
                        <td
                            :class="position.calculatedUrmtom > 0 ? 'text-success' : position.calculatedUrmtom < 0 ? 'text-danger' : null">
                            {{ position.calculatedUrmtom != null ? formatPrice(position.calculatedUrmtom) : '-' }}
                        </td>
                    </tr>
                </template>
                <tr v-else>
                    <td colspan="13" class="text-center">
                        No positions on selected broker {{ selectedBroker.brokerName }}
                    </td>
                </tr>
            </tbody>
        </table>
    </div>

    <!-- Mobile view -->
    <div class="d-md-none mt-3">
        <div v-if="sortedPositions.length > 0" class="list-group">
            <div v-for="position in sortedPositions" :key="position.tsym" class="list-group-item bg-color">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div>
                        <strong>{{ formatTradingSymbol(position.tsym) }}</strong>
                        <span :class="[
                            'badge ms-2',
                            position.netqty > 0 ? 'bg-success' : position.netqty < 0 ? 'bg-danger' : 'bg-secondary'
                        ]">
                            {{ position.netqty > 0 ? 'BUY' : position.netqty < 0 ? 'SELL' : 'CLOSED' }} </span>
                    </div>
                    <div>
                        <span :class="[
                            'badge',
                            position.calculatedUrmtom > 0 ? 'bg-success' : 'bg-danger'
                        ]">
                            {{ position.calculatedUrmtom != null ? formatPrice(position.calculatedUrmtom) : '-' }}
                        </span>
                    </div>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div>
                        <small>Qty: {{ position.netqty }}</small>
                    </div>
                    <div>
                        <small>LTP: {{ formatPrice(positionLTPs[position.tsym]) }}
                            <span v-if="positionPercentChanges[position.tsym] !== undefined"
                                :class="positionPercentChanges[position.tsym] >= 0 ? 'text-success' : 'text-danger'">({{ formatPercent(positionPercentChanges[position.tsym]) }})</span></small>
                    </div>
                </div>

                <!-- SL, TSL & Target -->
                <div v-if="position.netqty != 0" class="d-flex flex-wrap align-items-center gap-2 mb-2">
                    <div v-if="trailingStoplosses[position.tsym] !== null" class="d-flex align-items-center">
                        <span class="me-1 small">TSL</span>
                        <div class="btn-group btn-group-sm">
                            <EditableRiskValue :value="trailingStoplosses[position.tsym]"
                                bgClass="bg-danger text-white rounded"
                                @commit="(price) => $emit('edit-stoploss', position, price)" />
                        </div>
                    </div>
                    <div v-else-if="stoplosses[position.tsym] !== null" class="btn-group btn-group-sm" role="group">
                        <button class="btn btn-outline-danger btn-xs" @click="$emit('decrease-stoploss', position)">-</button>
                        <EditableRiskValue :value="stoplosses[position.tsym]"
                            @commit="(price) => $emit('edit-stoploss', position, price)" />
                        <button class="btn btn-outline-danger btn-xs" @click="$emit('increase-stoploss', position)">+</button>
                    </div>
                    <button v-else class="btn btn-outline-danger btn-sm" @click="$emit('set-stoploss', position, 'static')">
                        Set SL
                    </button>

                    <div v-if="targets[position.tsym] !== null" class="btn-group btn-group-sm" role="group">
                        <button class="btn btn-outline-success btn-xs" @click="$emit('decrease-target', position)">-</button>
                        <EditableRiskValue :value="targets[position.tsym]" bgClass="bg-success text-white"
                            @commit="(price) => $emit('edit-target', position, price)" />
                        <button class="btn btn-outline-success btn-xs" @click="$emit('increase-target', position)">+</button>
                    </div>
                    <button v-else class="btn btn-outline-success btn-sm" @click="$emit('set-target', position)">
                        Set Target
                    </button>
                </div>

                <div v-if="position.netqty != 0" class="d-flex flex-wrap gap-1">
                    <button class="btn btn-outline-secondary btn-sm"
                        v-if="trailingStoplosses[position.tsym] !== null || stoplosses[position.tsym] !== null"
                        :class="{ active: trailingStoplosses[position.tsym] !== null }" title="Trailing stop-loss"
                        @click="$emit('set-stoploss', position, trailingStoplosses[position.tsym] !== null ? 'convert_to_sl' : 'convert_to_tsl')">
                        TSL
                    </button>
                    <button class="btn btn-outline-secondary btn-sm" v-if="targets[position.tsym] !== null"
                        :class="{ active: targetTrailing[position.tsym] }" title="Trailing target"
                        @click="$emit('toggle-target-trail', position)">
                        T-Target
                    </button>
                    <button class="btn btn-outline-secondary btn-sm"
                        v-if="trailingStoplosses[position.tsym] !== null || stoplosses[position.tsym] !== null"
                        @click="$emit('remove-stoploss', position)">
                        Remove SL
                    </button>
                    <button class="btn btn-outline-secondary btn-sm" v-if="targets[position.tsym] !== null"
                        @click="$emit('remove-target', position)">
                        Remove Target
                    </button>
                </div>
            </div>
        </div>
        <div v-else class="text-center p-3">
            No positions on selected broker {{ selectedBroker.brokerName }}
        </div>
    </div>
</template>

<script setup>
const formatPercent = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
import { positionsWithCalculatedProfit } from '@/composables/usePnlCalculations';
import { computed, watch } from 'vue';

const props = defineProps({
    selectedBroker: {
        type: Object,
        required: true,
    },
    selectedPositionsSet: {
        type: Set,
        default: () => new Set(),
    },
    positions: {
        type: Array,
        required: true,
    },
});

const emit = defineEmits([
    'update:selectedPositionsSet',
    'set-stoploss',
    'remove-stoploss',
    'increase-stoploss',
    'decrease-stoploss',
    'set-target',
    'remove-target',
    'increase-target',
    'decrease-target',
    'edit-stoploss',
    'edit-target',
    'toggle-target-trail',
]);


// Formatters
import { formatTradingSymbol, formatPrice } from '@/composables/useFormatters';

// Global State
import { positionLTPs, positionPercentChanges, stoplosses, targets, trailingStoplosses, riskRules } from '@/stores/globalStore'
import EditableRiskValue from './EditableRiskValue.vue'

const targetTrailing = computed(() =>
    Object.fromEntries(Object.entries(riskRules.value).map(([tsym, rule]) => [tsym, rule.status === 'armed' && rule.mode === 'target_trail'])))


const sortedPositions = computed(() => {
    return [...positionsWithCalculatedProfit.value].sort((a, b) => {
        // First, sort by open/closed status
        if (Number(a.netqty) !== 0 && Number(b.netqty) === 0) return -1
        if (Number(a.netqty) === 0 && Number(b.netqty) !== 0) return 1

        // Then, for open positions, sort by absolute quantity in descending order
        if (Number(a.netqty) !== 0 && Number(b.netqty) !== 0) {
            return Math.abs(Number(b.netqty)) - Math.abs(Number(a.netqty))
        }

        // For closed positions, maintain their original order
        return 0
    })
})

// New function to format product type
const formatProductType = (prd) => {
    switch (prd) {
        case 'M':
            return 'Overnight';
        case 'I':
            return 'Intraday';
        default:
            return prd;
    }
}

// Compute a safe version of selectedPositionsSet
const safeSelectedPositionsSet = computed(() => props.selectedPositionsSet || new Set());

function handleCheckboxChange(event, tsym) {
    const updatedSet = new Set(safeSelectedPositionsSet.value);
    if (event.target.checked) {
        updatedSet.add(tsym);
    } else {
        updatedSet.delete(tsym);
    }
    return updatedSet;
}
</script>

<style scoped>
.btn-xs {
    padding: 0 0.35rem;
    font-size: 0.7rem;
    line-height: 1.3;
}
</style>
