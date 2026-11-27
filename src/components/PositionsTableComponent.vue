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
                    <th scope="col">Exit</th>
                </tr>
            </thead>
            <tbody>
                <template v-if="sortedPositions.length > 0">
                    <template v-for="position in sortedPositions" :key="position.tsym">
                    <tr>
                        <td>
                            <button v-if="lotPositionsFor(position).length"
                                type="button"
                                class="btn btn-link btn-xs text-white p-0 me-1 lot-expand-toggle"
                                style="position: relative; z-index: 3;"
                                :aria-expanded="expandedPositionSymbols.has(position.tsym)"
                                :aria-label="expandedPositionSymbols.has(position.tsym) ? 'Collapse lots' : 'Expand lots'"
                                @click="toggleExpandedPosition(position.tsym)">
                                {{ expandedPositionSymbols.has(position.tsym) ? '▼' : '▶' }}
                            </button>
                            <label class="d-inline-flex justify-content-center align-items-center">
                                <input type="checkbox" :id="'position-' + position.tsym" :value="position.tsym"
                                    :checked="safeSelectedPositionsSet.has(position.tsym)"
                                    :disabled="position.netqty == 0"
                                    @change="$emit('update:selectedPositionsSet', handleCheckboxChange($event, position.tsym))" />
                            </label>
                        </td>
                        <td>
                            {{ formatTradingSymbol(position.tsym) }}
                        </td>
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
                                    :disabled="targetTrailing[position.tsym]"
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
                            {{ formatPrice(positionLTPs[position.tsym] ?? position.lp) }}
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
                                    :disabled="trailingStoplosses[position.tsym] !== null"
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
                        <td>
                            <button v-if="position.netqty != 0" class="btn btn-outline-danger btn-xs" title="Exit position"
                                @click="$emit('exit-position', position)">
                                Exit ✖
                            </button>
                        </td>
                    </tr>
                    <tr v-for="lot in (expandedPositionSymbols.has(position.tsym) ? lotPositionsFor(position) : [])"
                        :key="lot.lotId"
                        class="lot-position-row">
                        <td></td>
                        <td class="ps-4">
                            {{ lot.legacy ? 'Legacy aggregated lot' : 'Lot ' + lotNumber(lot, position) }}
                            <small v-if="lot.entryOrderId" class="d-block text-secondary">{{ lot.entryOrderId }}</small>
                        </td>
                        <td :class="lot.remainingQuantity > 0 ? 'text-success' : 'text-secondary'">{{ lot.remainingQuantity }}</td>
                        <td :class="{ 'text-success': lot.side === 'BUY', 'text-danger': lot.side === 'SELL' }">{{ lot.side }}</td>
                        <td>
                            <button v-if="lotRiskRules[lot.lotId]?.stopLoss == null"
                                class="btn btn-outline btn-xs" @click="$emit('set-lot-stoploss', lot)">Set SL</button>
                            <EditableRiskValue v-else :value="lotRiskRules[lot.lotId].stopLoss"
                                @commit="(price) => $emit('edit-lot-stoploss', lot, price)" />
                            <button v-if="lotRiskRules[lot.lotId]?.trailingStopLoss != null"
                                class="btn btn-outline btn-xs ms-1"
                                @click="$emit('edit-lot-stoploss', lot, lotRiskRules[lot.lotId].trailingStopLoss)">TSL</button>
                        </td>
                        <td>{{ formatPrice(positionLTPs[position.tsym] ?? position.lp) }}</td>
                        <td>
                            <button v-if="lotRiskRules[lot.lotId]?.target == null"
                                class="btn btn-outline btn-xs" @click="$emit('set-lot-target', lot)">Set Target</button>
                            <EditableRiskValue v-else :value="lotRiskRules[lot.lotId].target"
                                @commit="(price) => $emit('edit-lot-target', lot, price)" />
                        </td>
                        <td>{{ formatProductType(position.prd) }}</td>
                        <td>{{ formatPrice(lot.entryAveragePrice) }}</td>
                        <td>{{ formatPrice(lot.exitAveragePrice) }}</td>
                        <td :class="lot.realizedPnl > 0 ? 'text-success' : lot.realizedPnl < 0 ? 'text-danger' : null">{{ formatPrice(lot.realizedPnl) }}</td>
                        <td :class="lot.unrealizedPnl > 0 ? 'text-success' : lot.unrealizedPnl < 0 ? 'text-danger' : null">{{ formatPrice(lot.unrealizedPnl) }}</td>
                        <td>
                            <button v-if="lot.remainingQuantity > 0"
                                class="btn btn-outline-danger btn-xs"
                                @click="$emit('exit-lot', lot)">
                                Exit Lot
                            </button>
                        </td>
                    </tr>
                    </template>
                </template>
                <tr v-else>
                    <td colspan="14" class="text-center">
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
                        <button v-if="lotPositionsFor(position).length"
                            type="button"
                            class="btn btn-link btn-xs text-white p-0 me-1"
                            :aria-expanded="expandedPositionSymbols.has(position.tsym)"
                            :aria-label="expandedPositionSymbols.has(position.tsym) ? 'Collapse lots mobile' : 'Expand lots mobile'"
                            @click="toggleExpandedPosition(position.tsym)">
                            {{ expandedPositionSymbols.has(position.tsym) ? '▼' : '▶' }}
                        </button>
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
                        <small>LTP: {{ formatPrice(positionLTPs[position.tsym] ?? position.lp) }}
                            <span v-if="positionPercentChanges[position.tsym] !== undefined"
                                :class="positionPercentChanges[position.tsym] >= 0 ? 'text-success' : 'text-danger'">({{ formatPercent(positionPercentChanges[position.tsym]) }})</span></small>
                    </div>
                </div>

                <div class="d-flex flex-wrap justify-content-between small text-muted mb-2 gap-2">
                    <span>{{ formatProductType(position.prd) }}</span>
                    <span>B.Avg: {{ formatPrice(position.totbuyavgprc) }}</span>
                    <span>S.Avg: {{ formatPrice(position.totsellavgprc) }}</span>
                    <span :class="position.rpnl > 0 ? 'text-success' : position.rpnl < 0 ? 'text-danger' : null">
                        Realized: {{ formatPrice(position.rpnl) }}
                    </span>
                </div>

                <div v-if="expandedPositionSymbols.has(position.tsym)"
                    class="lot-mobile-list mb-2">
                    <div v-for="lot in lotPositionsFor(position)" :key="lot.lotId"
                        class="lot-mobile-row rounded px-2 py-2 mb-1">
                        <div class="d-flex justify-content-between">
                            <strong>{{ lot.legacy ? 'Legacy aggregated lot' : 'Lot ' + lotNumber(lot, position) }}</strong>
                            <span :class="lot.remainingQuantity > 0 ? 'text-success' : 'text-secondary'">
                                Qty {{ lot.remainingQuantity }}
                            </span>
                        </div>
                        <div class="d-flex flex-wrap gap-2 small text-muted mt-1">
                            <span>Side: {{ lot.side }}</span>
                            <span>B.Avg: {{ formatPrice(lot.entryAveragePrice) }}</span>
                            <span>S.Avg: {{ formatPrice(lot.exitAveragePrice) }}</span>
                            <span>R.P&amp;L: {{ formatPrice(lot.realizedPnl) }}</span>
                            <span>U.P&amp;L: {{ formatPrice(lot.unrealizedPnl) }}</span>
                        </div>
                        <div v-if="lot.remainingQuantity > 0" class="d-flex gap-1 mt-2">
                            <button class="btn btn-outline btn-xs"
                                v-if="lotRiskRules[lot.lotId]?.stopLoss == null"
                                @click="$emit('set-lot-stoploss', lot)">Set SL</button>
                            <EditableRiskValue v-else :value="lotRiskRules[lot.lotId].stopLoss"
                                @commit="(price) => $emit('edit-lot-stoploss', lot, price)" />
                            <button class="btn btn-outline btn-xs"
                                v-if="lotRiskRules[lot.lotId]?.target == null"
                                @click="$emit('set-lot-target', lot)">Set Target</button>
                            <EditableRiskValue v-else :value="lotRiskRules[lot.lotId].target"
                                @commit="(price) => $emit('edit-lot-target', lot, price)" />
                            <button class="btn btn-outline-danger btn-xs ms-auto"
                                @click="$emit('exit-lot', lot)">Exit Lot</button>
                        </div>
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
                        :disabled="targetTrailing[position.tsym]"
                        @click="$emit('set-stoploss', position, trailingStoplosses[position.tsym] !== null ? 'convert_to_sl' : 'convert_to_tsl')">
                        TSL
                    </button>
                    <button class="btn btn-outline-secondary btn-sm" v-if="targets[position.tsym] !== null"
                        :class="{ active: targetTrailing[position.tsym] }" title="Trailing target"
                        :disabled="trailingStoplosses[position.tsym] !== null"
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
                    <button class="btn btn-danger btn-sm ms-auto" @click="$emit('exit-position', position)">
                        Exit ✖
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
import { computed } from 'vue';

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

defineEmits([
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
    'exit-position',
    'set-lot-stoploss',
    'set-lot-target',
    'edit-lot-stoploss',
    'edit-lot-target',
    'exit-lot',
]);


// Formatters
import { formatTradingSymbol, formatPrice } from '@/composables/useFormatters';

// Global State
import { positionLTPs, positionPercentChanges, stoplosses, targets, trailingStoplosses, riskRules, lotRiskRules } from '@/stores/globalStore'
import EditableRiskValue from './EditableRiskValue.vue'
import { lotPositionsBySymbol, expandedPositionSymbols, toggleExpandedPosition } from '@/composables/useLotPositions'
const targetTrailing = computed(() =>
    Object.fromEntries(Object.entries(riskRules.value).map(([tsym, rule]) => [tsym, rule.status === 'armed' && rule.mode === 'target_trail'])))


const sortedPositions = computed(() => {
    return [...positionsWithCalculatedProfit.value].map((position) => {
        const lots = lotPositionsFor(position)
        if (!lots.length) return position
        const remainingQty = lots.reduce((sum, lot) => sum + Number(lot.remainingQuantity || 0), 0)
        const buyValue = lots.reduce((sum, lot) => sum +
            Number(lot.entryAveragePrice || 0) * Number(lot.remainingQuantity || 0), 0)
        const sellLots = lots.filter((lot) => Number(lot.exitAveragePrice) > 0)
        const sellQty = sellLots.reduce((sum, lot) => sum +
            (Number(lot.quantity || 0) - Number(lot.remainingQuantity || 0)), 0)
        const sellValue = sellLots.reduce((sum, lot) => sum +
            Number(lot.exitAveragePrice || 0) *
            (Number(lot.quantity || 0) - Number(lot.remainingQuantity || 0)), 0)
        return {
            ...position,
            netqty: remainingQty * (lots[0]?.side === 'SELL' ? -1 : 1),
            totbuyavgprc: remainingQty ? (buyValue / remainingQty).toFixed(2) : position.totbuyavgprc,
            totsellavgprc: sellQty ? (sellValue / sellQty).toFixed(2) : position.totsellavgprc,
            rpnl: lots.reduce((sum, lot) => sum + Number(lot.realizedPnl || 0), 0),
            calculatedUrmtom: lots.reduce((sum, lot) => sum + Number(lot.unrealizedPnl || 0), 0)
        }
    }).sort((a, b) => {
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

const lotPositionsFor = (position) => lotPositionsBySymbol.value[position.tsym] || []
const lotNumber = (lot, position) => {
    const lots = lotPositionsFor(position)
    return Math.max(1, lots.findIndex((item) => item.lotId === lot.lotId) + 1)
}
</script>

<style scoped>
.btn-xs {
    padding: 0 0.35rem;
    font-size: 0.7rem;
    line-height: 1.3;
}

.lot-position-row {
    --bs-table-bg: rgba(255, 255, 255, 0.035);
}

.lot-position-row td {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.lot-expand-toggle {
    min-width: 1.25rem;
}

.lot-mobile-row {
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid rgba(255, 255, 255, 0.08);
}
</style>
