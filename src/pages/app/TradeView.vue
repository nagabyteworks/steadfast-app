<template>
  <AppNavigationComponent />
  <!-- Brokers, Broker Status, Total Funds, Utilized Margin & Today's Date -->
  <BrokerComponent v-model:selectedBrokerName="selectedBrokerName" :availableBrokers="availableBrokers"
    :brokerStatus="brokerStatus" :availableBalance="availableBalance" :usedAmount="usedAmount"
    :todayExpirySymbol="todayExpirySymbol" />

  <!-- Place Order Form -->
  <section class="row mt-2">
    <form @submit.prevent>
      <div v-if="selectedBroker?.brokerName === 'Flattrade' && positionsStale && !staleDismissed"
        class="alert alert-danger alert-dismissible">
        <button type="button" class="btn-close" aria-label="Close" @click="staleDismissed = true"></button>
        Position data is stale or unavailable. Last successful refresh:
        {{ flattradePositionsLastUpdatedAt ? new Date(flattradePositionsLastUpdatedAt).toLocaleTimeString() : 'never' }}.
        Verify current positions directly with your broker.
      </div>
      <fieldset>
        <div class="row">
          <!-- Master Symbol Selection -->
          <div class="col-6 col-md-4 col-lg-2">
            <label for="MasterSymbol" class="form-label mb-0 small">Master Symbol</label>
            <select id="MasterSymbol" class="form-select form-select-sm" aria-label="Master Symbol"
              v-model="selectedMasterSymbol">
              <option v-for="symbol in masterSymbolOptions" :key="symbol" :value="symbol">
                {{ symbol }}
              </option>
            </select>
          </div>

          <!-- Expiry Date Selection -->
          <div class="col-6 col-md-4 col-lg-2">
            <label for="Expiry" class="form-label mb-0 small">Expiry Date</label>
            <select id="Expiry" class="form-select form-select-sm" aria-label="Expiry" v-model="selectedExpiry"
             >
              <option v-for="date in expiryDates" :key="date" :value="date">
                {{ formatDate(date) }}
              </option>
            </select>
          </div>

          <!-- Product Type Selection -->
          <div class="col-6 col-md-4 col-lg-2">
            <label for="ProductType" class="form-label mb-0 small">Product Type</label>
            <select id="ProductType" class="form-select form-select-sm" v-model="selectedProductType"
              aria-label="ProductType">
              <option v-for="productType in productTypes" :key="productType" :value="getProductTypeValue(productType)">
                {{ productType }}
              </option>
            </select>
          </div>

          <!-- Quantity Selection -->
          <div class="col-6 col-md-4 col-lg-2">
            <label for="Quantity" class="form-label mb-0 small">
              {{ selectedLots }} Lot{{ selectedLots !== 1 ? 's' : '' }} / Quantity
            </label>
            <div class="input-group input-group-sm">
              <input type="number" id="Quantity" class="form-control form-control-sm" v-model.number="selectedLots"
                :min="1" :max="maxLots" @input="updateSelectedQuantity"
                @wheel.prevent="(e) => handleFormInputMouseScroll(e, { type: 'quantity' })"
                />
              <span class="input-group-text">{{ selectedQuantity }}</span>
            </div>
          </div>

          <!-- Order Type -->
          <div class="col-6 col-md-4 col-lg-2 mt-md-1 mt-lg-2">
            <label for="OrderType" class="form-label mb-0 small">Order Type</label>
            <div class="input-group input-group-sm">
              <select id="OrderType" class="form-select form-select-sm w-75" aria-label="OrderType"
                v-model="selectedOrderType"
                @change="handleOrderTypeChange">
                <option v-for="(displayType, index) in displayOrderTypes" :key="orderTypes[index]"
                  :value="orderTypes[index]">
                  {{ displayType }}
                </option>
              </select>
            </div>
          </div>

          <!-- Predefined Stoploss -->
          <div class="col-6 col-md-4 col-lg-2 mt-md-1 mt-lg-2">
            <label for="enableStoploss" class="form-label mb-0 small">Predefined Stoploss</label>
            <div class="input-group input-group-sm mb-3">
              <div class="input-group-text">
                <input class="form-check-input mt-0" type="checkbox" id="enableStoploss"
                  aria-label="Enable Predefined Stoploss" v-model="enableStoploss"
                  :class="{ 'border-danger bg-danger': enableStoploss }" />
              </div>
              <input type="number" class="form-control form-control-sm" style="min-width: 0; max-width: 70px;" id="stoplossValue"
                aria-label="Predefined Stoploss (points)" v-model="stoplossValue"
                @wheel.prevent="(e) => handleFormInputMouseScroll(e, { type: 'stoploss' })"
                />
              <span class="input-group-text">Points</span>
            </div>
            <div class="form-check form-switch d-flex align-items-center gap-2 ps-0 mb-2">
              <input class="form-check-input ms-0 mt-0" type="checkbox" id="enableTrailingStoploss" v-model="enableTrailingStoploss" />
              <label class="form-check-label small mb-0" for="enableTrailingStoploss">Trailing stoploss</label>
            </div>
          </div>

          <!-- Predefined Target -->
          <div class="col-6 col-md-4 col-lg-2 mt-md-1 mt-lg-2">
            <label for="enableTarget" class="form-label mb-0 small">Predefined Target</label>
            <div class="input-group input-group-sm mb-3">
              <div class="input-group-text">
                <input class="form-check-input mt-0" type="checkbox" id="enableTarget"
                  aria-label="Enable Predefined Target" v-model="enableTarget"
                  :class="{ 'border-success bg-success': enableTarget }" />
              </div>
              <input type="number" class="form-control form-control-sm" style="min-width: 0; max-width: 70px;" id="targetValue"
                aria-label="Predefined Target (points)" v-model="targetValue"
                @wheel.prevent="(e) => handleFormInputMouseScroll(e, { type: 'target' })"
                />
              <span class="input-group-text">Points</span>
            </div>
          </div>

          <!-- Target Trailing: each time the target is reached the stoploss moves to it and the target advances -->
          <div class="col-6 col-md-4 col-lg-2 mt-md-1 mt-lg-2">
            <label for="enableTargetTrail" class="form-label mb-0 small">Target Trailing</label>
            <div class="input-group input-group-sm mb-3">
              <div class="input-group-text">
                <input class="form-check-input mt-0" type="checkbox" id="enableTargetTrail"
                  aria-label="Enable Target Trailing" v-model="enableTargetTrail" :disabled="!enableTarget"
                  title="Enable Predefined Target first"
                  :class="{ 'border-success bg-success': enableTargetTrail }" />
              </div>
              <input type="number" min="0" class="form-control form-control-sm" style="min-width: 0; max-width: 70px;" id="targetTrailValue"
                aria-label="Target trail (points)" v-model="targetTrailValue" :disabled="!enableTarget"
                />
              <span class="input-group-text">Points</span>
            </div>
          </div>

          <!-- 1 Click Keys -->
          <div class="d-none d-md-block col-6 col-md-4 col-lg-2 mt-md-1 mt-lg-2">
            <label for="enableHotKeys" class="form-label mb-0 small">1 Click Keys</label>
            <div class="form-check form-switch">
              <input class="form-check-input" type="checkbox" id="enableHotKeys" v-model="enableHotKeys"
                />
              <label class="form-check-label" for="enableHotKeys">
                {{ enableHotKeys ? 'Enabled' : 'Disabled' }}
              </label>
            </div>
          </div>
        </div>

        <!-- Trading Symbols & Strikes -->
        <div class="row align-items-center justify-content-between">
          <!-- Call Strike Selection -->
          <div class="col-6 col-md-4 col-lg-4">
            <!-- Call Strike Details -->
            <div class="row mt-2">
              <div class="col-12 d-flex align-items-center justify-content-between">
                <span class="text-wrap">
                  {{ formatTradingSymbol(selectedCallStrike.tradingSymbol, true) }}
                </span>
                <select id="CallStrike" class="form-select form-select-sm d-inline-block w-auto ms-2"
                  aria-label="Call Strike" v-model="selectedCallStrike"
                  @change="updateTradingSymbol(selectedCallStrike)"
                  @wheel.prevent="(e) => handleFormInputMouseScroll(e, { type: 'strike', strikeType: 'CALL' })">
                  <option v-for="strike in callStrikes" :key="strike.securityId" :value="strike">
                    {{ strike.strikePrice }}
                  </option>
                </select>
                <div class="text-muted" v-if="showStrikeDetails">Security ID: {{ selectedCallStrike.securityId }}</div>
              </div>
              <div class="col-12 mt-2 d-flex flex-column flex-md-row align-items-start align-items-md-center justify-content-between">
                <span>
                  <span>LTP: </span>
                  <span class="ms-md-2 fw-bold" :class="{
                    'text-success': parseFloat(latestCallLTP) > parseFloat(callOpenPrice),
                    'text-danger': parseFloat(latestCallLTP) < parseFloat(callOpenPrice)
                  }">{{ formatPrice(latestCallLTP) }}
                  </span>
                  <small v-if="callPercentChange !== null" class="d-block d-md-inline ms-md-1" :class="callPercentChange >= 0 ? 'text-success' : 'text-danger'">({{ formatPercent(callPercentChange) }})</small>
                </span>

                <span class="ms-md-2 fw-bold text-secondary">
                  ₹{{ formatPrice(parseFloat(latestCallLTP) * selectedQuantity) }}
                </span>
              </div>
            </div>



            <!-- Call OHLC Values -->
            <div class="d-flex w-100 justify-content-around flex-wrap" v-if="showOHLCValues">
              <span class="text-primary">O: {{ formatPrice(callOpenPrice) }}</span>
              <span class="text-success">H: {{ formatPrice(callHighPrice) }}</span>
              <span class="text-danger">L: {{ formatPrice(callLowPrice) }}</span>
              <span class="text-warning">C: {{ formatPrice(callClosePrice) }}</span>
            </div>
            <!-- LTP Range Bar for Call Strike -->
            <LtpRangeBarComponent v-if="showLTPRangeBar" :ltpRangeWidth="callLtpRangeWidth"
              :openMarkerPosition="callOpenMarkerPosition" :lowPrice="callLowPrice" :highPrice="callHighPrice" />
          </div>

          <!-- Live Underlying Price -->
          <div class="order-3 order-md-0 col-12 col-md-4 col-lg-4 text-center mt-3 mt-md-0">
            <p class="mb-0" v-if="selectedMasterSymbol === 'NIFTY'">
              Nifty 50:
              <b :class="{
                'text-success': parseFloat(niftyPrice) > parseFloat(masterOpenPrice),
                'text-danger': parseFloat(niftyPrice) < parseFloat(masterOpenPrice)
              }">{{ formatPrice(niftyPrice) }}</b>
              <small v-if="masterPercentChange !== null" class="ms-1" :class="masterPercentChange >= 0 ? 'text-success' : 'text-danger'">({{ formatPercent(masterPercentChange) }})</small>
            </p>
            <p class="mb-0" v-if="selectedMasterSymbol === 'BANKNIFTY'">
              Bank Nifty:
              <b :class="{
                'text-success': parseFloat(bankNiftyPrice) > parseFloat(masterOpenPrice),
                'text-danger': parseFloat(bankNiftyPrice) < parseFloat(masterOpenPrice)
              }">{{ formatPrice(bankNiftyPrice) }}</b>
              <small v-if="masterPercentChange !== null" class="ms-1" :class="masterPercentChange >= 0 ? 'text-success' : 'text-danger'">({{ formatPercent(masterPercentChange) }})</small>
            </p>
            <p class="mb-0" v-if="selectedMasterSymbol === 'FINNIFTY'">
              Fin Nifty:
              <b :class="{
                'text-success': parseFloat(finniftyPrice) > parseFloat(masterOpenPrice),
                'text-danger': parseFloat(finniftyPrice) < parseFloat(masterOpenPrice)
              }">{{ formatPrice(finniftyPrice) }}</b>
              <small v-if="masterPercentChange !== null" class="ms-1" :class="masterPercentChange >= 0 ? 'text-success' : 'text-danger'">({{ formatPercent(masterPercentChange) }})</small>
            </p>
            <p class="mb-0" v-if="selectedMasterSymbol === 'MIDCPNIFTY'">
              Nifty Mid Select:
              <b :class="{
                'text-success': parseFloat(midcpniftyPrice) > parseFloat(masterOpenPrice),
                'text-danger': parseFloat(midcpniftyPrice) < parseFloat(masterOpenPrice)
              }">{{ formatPrice(midcpniftyPrice) }}</b>
              <small v-if="masterPercentChange !== null" class="ms-1" :class="masterPercentChange >= 0 ? 'text-success' : 'text-danger'">({{ formatPercent(masterPercentChange) }})</small>
            </p>
            <p class="mb-0" v-if="selectedMasterSymbol === 'SENSEX'">
              Sensex:
              <b :class="{
                'text-success': parseFloat(sensexPrice) > parseFloat(masterOpenPrice),
                'text-danger': parseFloat(sensexPrice) < parseFloat(masterOpenPrice)
              }">{{ formatPrice(sensexPrice) }}</b>
              <small v-if="masterPercentChange !== null" class="ms-1" :class="masterPercentChange >= 0 ? 'text-success' : 'text-danger'">({{ formatPercent(masterPercentChange) }})</small>
            </p>
            <p class="mb-0" v-if="selectedMasterSymbol === 'BANKEX'">
              Bankex:
              <b :class="{
                'text-success': parseFloat(bankexPrice) > parseFloat(masterOpenPrice),
                'text-danger': parseFloat(bankexPrice) < parseFloat(masterOpenPrice)
              }">{{ formatPrice(bankexPrice) }}</b>
              <small v-if="masterPercentChange !== null" class="ms-1" :class="masterPercentChange >= 0 ? 'text-success' : 'text-danger'">({{ formatPercent(masterPercentChange) }})</small>
            </p>
            <!-- Master OHLC Values -->
            <div class="d-flex w-100 justify-content-around flex-wrap" v-if="showOHLCValues">
              <span class="text-primary">O: {{ formatPrice(masterOpenPrice) }}</span>
              <span class="text-success">H: {{ formatPrice(masterHighPrice) }}</span>
              <span class="text-danger">L: {{ formatPrice(masterLowPrice) }}</span>
              <span class="text-warning">C: {{ formatPrice(masterClosePrice) }}</span>
            </div>
            <!-- LTP Range Bar for Live Underlying Price -->
            <LtpRangeBarComponent v-if="showLTPRangeBar" :ltpRangeWidth="ltpRangeWidth"
              :openMarkerPosition="openMarkerPosition" :lowPrice="masterLowPrice" :highPrice="masterHighPrice" />
          </div>

          <!-- Put Strike Selection -->
          <div class="col-6 col-md-4 col-lg-4">
            <!-- Put Strike Details -->
            <div class="row mt-2">
              <div class="col-12 d-flex align-items-center justify-content-between">
                <select id="PutStrike" class="form-select form-select-sm d-inline-block w-auto me-2"
                  aria-label="Put Strike" v-model="selectedPutStrike"
                  @change="updateTradingSymbol(selectedPutStrike)"
                  @wheel.prevent="(e) => handleFormInputMouseScroll(e, { type: 'strike', strikeType: 'PUT' })">
                  <option v-for="strike in putStrikes" :key="strike.securityId" :value="strike">
                    {{ strike.strikePrice }}
                  </option>
                </select>
                <span class="text-wrap">
                  {{ formatTradingSymbol(selectedPutStrike.tradingSymbol, true) }}
                </span>
                <div class="text-muted" v-if="showStrikeDetails">Security ID: {{ selectedPutStrike.securityId }}</div>
              </div>
              <div class="col-12 mt-2 d-flex flex-column-reverse flex-md-row align-items-start align-items-md-center justify-content-between">
                <span class="ms-md-2 fw-bold text-secondary">
                  ₹{{ formatPrice(parseFloat(latestPutLTP) * selectedQuantity) }}
                </span>
                <span>
                  <span>LTP: </span>
                  <span class="ms-md-2 fw-bold" :class="{
                    'text-success': parseFloat(latestPutLTP) > parseFloat(putOpenPrice),
                    'text-danger': parseFloat(latestPutLTP) < parseFloat(putOpenPrice)
                  }">{{ formatPrice(latestPutLTP) }}
                  </span>
                  <small v-if="putPercentChange !== null" class="d-block d-md-inline ms-md-1" :class="putPercentChange >= 0 ? 'text-success' : 'text-danger'">({{ formatPercent(putPercentChange) }})</small>
                </span>
              </div>
            </div>

            <!-- Put OHLC Values -->
            <div class="d-flex w-100 justify-content-around flex-wrap" v-if="showOHLCValues">
              <span class="text-primary">O: {{ formatPrice(putOpenPrice) }}</span>
              <span class="text-success">H: {{ formatPrice(putHighPrice) }}</span>
              <span class="text-danger">L: {{ formatPrice(putLowPrice) }}</span>
              <span class="text-warning">C: {{ formatPrice(putClosePrice) }}</span>
            </div>
            <!-- LTP Range Bar for Put Strike -->
            <LtpRangeBarComponent v-if="showLTPRangeBar" :ltpRangeWidth="putLtpRangeWidth"
              :openMarkerPosition="putOpenMarkerPosition" :lowPrice="putLowPrice" :highPrice="putHighPrice" />
          </div>
        </div>

        <div class="row align-items-center justify-content-between mt-3">
          <!-- Call Strike Buy/Sell Buttons -->
          <div class="order-1 order-md-1 order-lg-1 col-6 col-md-4 col-lg-4">
            <div class="btn-group col-12 col-md-10 col-lg-10">
              <button type="button" class="btn btn-sm btn-success fs-6 my-2 w-75"
                @click="handleOrderClick('BUY', 'CALL')"
                :data-bs-toggle="selectedOrderType === orderTypes[1] ? 'modal' : null"
                :data-bs-target="selectedOrderType === orderTypes[1] ? '#PlaceLimitOrderWindow' : null">
                <kbd v-if="enableHotKeys">
                  <font-awesome-icon icon="arrow-up" />
                </kbd>
                Buy CE
              </button>
              <button type="button"
                class="btn btn-sm btn-outline-success fs-6 my-2 dropdown-toggle dropdown-toggle-split w-25"
                data-bs-toggle="dropdown" aria-expanded="false" data-bs-reference="parent" data-bs-offset="0,-7">
                <span class="visually-hidden">Toggle Dropdown</span>
              </button>
              <ul class="dropdown-menu">
                <li>
                  <a class="dropdown-item" @click="setOrderDetails('BUY', 'CALL')" data-bs-toggle="modal"
                    data-bs-target="#PlaceLimitOrderWithResetOrderTypeWindow">Place Limit Order</a>
                </li>
              </ul>
            </div>
            <div class="btn-group col-12 col-md-10 col-lg-10">
              <button type="button" class="btn btn-sm btn-danger fs-6 w-75" @click="handleOrderClick('SELL', 'CALL')"
                :data-bs-toggle="selectedOrderType === orderTypes[1] ? 'modal' : null"
                :data-bs-target="selectedOrderType === orderTypes[1] ? '#PlaceLimitOrderWindow' : null">
                <kbd v-if="enableHotKeys">
                  <font-awesome-icon icon="arrow-left" />
                </kbd>
                Sell CE
              </button>
              <button type="button"
                class="btn btn-sm btn-outline-danger fs-6 dropdown-toggle dropdown-toggle-split w-25"
                data-bs-toggle="dropdown" aria-expanded="false" data-bs-reference="parent">
                <span class="visually-hidden">Toggle Dropdown</span>
              </button>
              <ul class="dropdown-menu">
                <li>
                  <a class="dropdown-item" @click="setOrderDetails('SELL', 'CALL')" data-bs-toggle="modal"
                    data-bs-target="#PlaceLimitOrderWithResetOrderTypeWindow">Place Limit Order</a>
                </li>
              </ul>
            </div>
          </div>

          <!-- Close & Cancel Buttons -->
          <div class="order-3 order-md-2 order-lg-2 col-12 col-md-4 col-lg-4 text-center">
            <div class="d-flex justify-content-center gap-2 mt-2">
              <button v-if="selectedShoonyaPositionsSet.size === 0 && selectedFlattradePositionsSet.size === 0"
                class="btn btn-sm btn-outline text-nowrap" @click="closeAllPositions">
                <kbd v-if="enableHotKeys">F6</kbd>
                Close All
              </button>
              <button v-else class="btn btn-sm btn-outline text-nowrap" @click="closeSelectedPositions">
                <kbd v-if="enableHotKeys">F6</kbd>
                Close Selected
              </button>
              <button class="btn btn-sm btn-outline text-nowrap" @click="cancelPendingOrders">
                <kbd v-if="enableHotKeys">F7</kbd>
                Cancel Orders
              </button>
            </div>
            <div class="small mt-2 broker-message" v-if="brokerMessage">{{ brokerMessage }}</div>
          </div>
          <!-- Put Strike Buy/Sell Buttons -->
          <div class="order-2 order-md-3 order-lg-3 col-6 col-md-4 col-lg-4 text-end">
            <div class="btn-group col-12 col-md-10 col-lg-10">
              <button type="button" class="btn btn-sm btn-success fs-6 my-2 w-75"
                @click="handleOrderClick('BUY', 'PUT')"
                :data-bs-toggle="selectedOrderType === orderTypes[1] ? 'modal' : null"
                :data-bs-target="selectedOrderType === orderTypes[1] ? '#PlaceLimitOrderWindow' : null">
                <kbd v-if="enableHotKeys">
                  <font-awesome-icon icon="arrow-down" />
                </kbd>
                Buy PE
              </button>
              <button type="button"
                class="btn btn-sm btn-outline-success fs-6 my-2 dropdown-toggle dropdown-toggle-split w-25"
                data-bs-toggle="dropdown" aria-expanded="false" data-bs-reference="parent" data-bs-offset="0,-7">
                <span class="visually-hidden">Toggle Dropdown</span>
              </button>
              <ul class="dropdown-menu">
                <li>
                  <a class="dropdown-item" @click="setOrderDetails('BUY', 'PUT')" data-bs-toggle="modal"
                    data-bs-target="#PlaceLimitOrderWithResetOrderTypeWindow">Place Limit Order</a>
                </li>
              </ul>
            </div>
            <div class="btn-group col-12 col-md-10 col-lg-10">
              <button type="button" class="btn btn-sm btn-danger fs-6 w-75" @click="handleOrderClick('SELL', 'PUT')"
                :data-bs-toggle="selectedOrderType === orderTypes[1] ? 'modal' : null"
                :data-bs-target="selectedOrderType === orderTypes[1] ? '#PlaceLimitOrderWindow' : null">
                <kbd v-if="enableHotKeys">
                  <font-awesome-icon icon="arrow-right" />
                </kbd>
                Sell PE
              </button>
              <button type="button"
                class="btn btn-sm btn-outline-danger fs-6 dropdown-toggle dropdown-toggle-split w-25"
                data-bs-toggle="dropdown" aria-expanded="false" data-bs-reference="parent">
                <span class="visually-hidden">Toggle Dropdown</span>
              </button>
              <ul class="dropdown-menu">
                <li>
                  <a class="dropdown-item" @click="setOrderDetails('SELL', 'PUT')" data-bs-toggle="modal"
                    data-bs-target="#PlaceLimitOrderWithResetOrderTypeWindow">Place Limit Order</a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </fieldset>
    </form>
  </section>

  <!-- Total Profit & Net PNL -->
  <PnlComponent :stickyMTM="stickyMTM" :totalCapitalPercentage="totalCapitalPercentage" :totalProfit="totalProfit"
    :totalNetQty="totalNetQty" :netPnl="netPnl" :riskReached="riskReached" :targetReached="targetReached" />

  <!-- Positions & Trades -->
  <section class="row pb-3">
    <div class="col-12">
      <div class="row my-2">
        <nav class="col-12 col-md-6 order-2 order-md-1">
          <ul class="navbar-nav d-flex flex-row">
            <li class="nav-item">
              <a href="#" class="nav-link" :class="{ 'active-route': activeTab === 'positions' }"
                @click.prevent="setActiveTab('positions')">
                <font-awesome-icon icon="hard-drive" class="nav-icon text-success" />
                <span class="ms-2">Positions</span>
              </a>
            </li>
            <li class="nav-item">
              <a href="#" class="nav-link" :class="{ 'active-route': activeTab === 'trades' }"
                @click.prevent="setActiveTab('trades')">
                <font-awesome-icon icon="up-down" class="nav-icon text-primary" />
                <span class="ms-2">Trades</span>
              </a>
            </li>
          </ul>
        </nav>
        <div class="d-flex justify-content-between align-items-center col-12 col-md-6 order-1 order-md-2 my-3 my-md-0">
          <b>
            <span>
              Total Buy Value: <span class="text-success">₹ {{ totalBuyValue.toFixed(2) }}</span>
            </span>
            <span class="ms-md-4 d-none d-md-inline">
              Total Sell Value: <span class="text-danger">₹ {{ totalSellValue.toFixed(2) }}</span>
            </span>
            <span class="d-md-none">
              <br>
              Total Sell Value: <span class="text-danger">₹ {{ totalSellValue.toFixed(2) }}</span>
            </span>
          </b>
        </div>
      </div>

      <div class="tab-content" id="myTabContent">
        <div class="tab-pane fade show active" id="positions-tab-pane" role="tabpanel" aria-labelledby="positions-tab"
          tabindex="0">

          <div class="TabContent bg-color">
            <!-- Positions Content -->
            <div v-show="activeTab === 'positions'">
              <!-- Flattrade Positions -->
              <PositionsTableComponent v-if="activeFetchFunction === 'fetchFlattradePositions'"
                :positions="flatTradePositionBook" :selected-broker="selectedBroker"
                :selected-positions-set="selectedFlattradePositionsSet"
                @update:selected-positions-set="selectedFlattradePositionsSet = $event"
                @set-stoploss="(position, type) => setStoploss(position, type)" @remove-stoploss="removeStoploss"
                @increase-stoploss="increaseStoploss" @decrease-stoploss="decreaseStoploss" @set-target="setTarget"
                @remove-target="removeTarget" @increase-target="increaseTarget" @decrease-target="decreaseTarget"
                @edit-stoploss="setStoplossPrice" @edit-target="setTargetPrice" @toggle-target-trail="toggleTargetTrail" />

              <!-- Shoonya Positions -->
              <PositionsTableComponent v-if="activeFetchFunction === 'fetchShoonyaPositions'"
                :positions="shoonyaPositionBook" :selected-broker="selectedBroker"
                :selected-positions-set="selectedShoonyaPositionsSet"
                @update:selected-positions-set="selectedShoonyaPositionsSet = $event"
                @set-stoploss="(position, type) => setStoploss(position, type)" @remove-stoploss="removeStoploss"
                @increase-stoploss="increaseStoploss" @decrease-stoploss="decreaseStoploss" @set-target="setTarget"
                @remove-target="removeTarget" @increase-target="increaseTarget" @decrease-target="decreaseTarget"
                @edit-stoploss="setStoplossPrice" @edit-target="setTargetPrice" @toggle-target-trail="toggleTargetTrail" />

              <p class="text-secondary my-2">
                Stop-losses, trailing stop-losses, targets and target trails are stored and monitored by the server
                (not by the exchange). They keep working if you close this window, but not if the server or its
                market-data feed is down.
              </p>
            </div>

            <!-- Trades Content -->
            <div v-show="activeTab === 'trades'">
              <OrdersNTradesComponent
                v-if="activeFetchFunction === 'fetchFlattradeOrdersTradesBook' || activeFetchFunction === 'fetchShoonyaOrdersTradesBook'"
                :combinedOrdersAndTrades="combinedOrdersAndTrades" :selectedBroker="selectedBroker" />

              <p class="text-secondary my-2">
                This trades tab fetches orders and trades from selected broker and combines them. Only
                failed orders are shown. If the order is successfully placed, you'll only see the
                respective trade.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Limit Price Input Modal (conditionally rendered) -->
  <div class="modal fade" id="PlaceLimitOrderWindow" tabindex="-1" aria-labelledby="PlaceLimitOrderWindowLabel"
    aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h1 class="modal-title fs-6" id="PlaceLimitOrderWindowLabel">
            {{ modalTransactionType }} {{ modalOptionType }}: {{ selectedMasterSymbol }} {{
              selectedStrike.strikePrice }} {{ selectedStrike.expiryDate }}
          </h1>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <form @submit.prevent>
          <div class="modal-body">
            <div class="col-12">
              <label for="LimitPrice" class="form-label mb-0">Limit Price</label>
              <input type="number" id="LimitPrice" class="form-control" v-model="limitPrice"
                placeholder="Enter limit price" :class="{ 'is-invalid': !isValidLimitPrice }" min="1" step="1" />
              <div class="invalid-feedback" v-if="!isValidLimitPrice">
                {{ limitPriceErrorMessage }}
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-sm fs-6 btn-secondary" data-bs-dismiss="modal">
              Cancel
            </button>
            <button type="button" class="btn btn-sm fs-6 btn-primary" :disabled="!isValidLimitPrice"
              data-bs-dismiss="modal" @click="validateAndPlaceOrder">
              Place Order
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <!-- Limit Price Input Modal with Reset Order Type (conditionally rendered) -->
  <div class="modal fade" id="PlaceLimitOrderWithResetOrderTypeWindow" tabindex="-1"
    aria-labelledby="PlaceLimitOrderWithResetOrderTypeWindowLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h1 class="modal-title fs-6" id="PlaceLimitOrderWithResetOrderTypeWindowLabel">
            {{ modalTransactionType }} {{ modalOptionType }}: {{ selectedMasterSymbol }} {{
              selectedStrike.strikePrice }} {{ selectedStrike.expiryDate }}
          </h1>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"
            @click="resetOrderTypeIfNeeded"></button>
        </div>
        <form @submit.prevent>
          <div class="modal-body">
            <div class="col-12">
              <label for="LimitPrice" class="form-label mb-0">Limit Price</label>
              <input type="number" id="LimitPrice" class="form-control" v-model="limitPrice"
                placeholder="Enter limit price" :class="{ 'is-invalid': !isValidLimitPrice }" min="1" step="1" />
              <div class="invalid-feedback" v-if="!isValidLimitPrice">
                {{ limitPriceErrorMessage }}
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-sm fs-6 btn-secondary" data-bs-dismiss="modal"
              @click="resetOrderTypeIfNeeded">
              Cancel
            </button>
            <button type="button" class="btn btn-sm fs-6 btn-primary" :disabled="!isValidLimitPrice"
              data-bs-dismiss="modal" @click="validateAndPlaceOrder">
              Place Order
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>

</template>

<script setup>
import { usesServerManagedAccount } from '@/config/profile';
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue';
import AppNavigationComponent from '@/components/AppNavigationComponent.vue';
import BrokerComponent from '@/components/BrokerComponent.vue';
import { checkAllTokens } from '@/composables/useBrokerTokenValidator';
import { updateSelectedBrokerOnServer } from '@/api/broker';
import { fetchFlattradePositions, fetchFundLimit, updateOrdersAndPositions } from '@/composables/usePositionManagement';
import PositionsTableComponent from '@/components/PositionsTableComponent.vue';
import OrdersNTradesComponent from '@/components/OrdersNTradesComponent.vue';
import LtpRangeBarComponent from '@/components/LtpRangeBarComponent.vue';
import PnlComponent from '@/components/PnlComponent.vue';

// Global State
import {
  selectedCallStrike, selectedPutStrike, selectedMasterSymbol, shoonyaPositionBook, flatTradePositionBook, selectedBroker, selectedBrokerName, selectedExchange, selectedProductType,
  accountRefreshing, accountRefreshedAt, accountRefreshHandler, selectedQuantity, enableStoploss, enableTarget, stoplossValue, targetValue, enableTrailingStoploss, enableTargetTrail, targetTrailValue, riskDryRun, selectedOrderType, limitPrice, selectedFlattradePositionsSet, selectedShoonyaPositionsSet, enableHotKeys, exchangeSymbols, selectedExpiry, selectedStrike, callStrikes, putStrikes, allSymbolsData,
  currentTime,
  showLTPRangeBar,
  showOHLCValues,
  showStrikeDetails,
  stickyMTM,
  activeTab,
  expiryDates,
  niftyPrice,
  bankNiftyPrice,
  finniftyPrice,
  midcpniftyPrice,
  sensexPrice,
  bankexPrice,
  modalTransactionType,
  modalOptionType,
  latestCallLTP,
  latestPutLTP,
  callPercentChange,
  putPercentChange,
  activeFetchFunction,
  masterOpenPrice,
  masterHighPrice,
  masterLowPrice,
  masterClosePrice,
  callOpenPrice,
  callHighPrice,
  callLowPrice,
  callClosePrice,
  putOpenPrice,
  putHighPrice,
  putLowPrice,
  putClosePrice,
  wsConnectionState, productionAccountError, flattradePositionsStale,
  flattradePositionsLastUpdatedAt, lastMarketDataAt, brokerStreamHealth,
  masterPercentChange, brokerMessage, systemNotices,
} from '@/stores/globalStore'


// Broker Selection Composables
import { availableBrokers, brokerStatus } from '@/composables/useBrokerFunctions'

// Trade Configuration Composables
import { productTypes, getProductTypeValue, updateAvailableQuantities, orderTypes, displayOrderTypes, selectedLots, loadLots, updateSelectedQuantity, updateStrikesForExpiry } from '@/composables/useTradeConfiguration'

// Order Management Composables
import { closeAllPositions, cancelPendingOrders, closeSelectedPositions } from '@/composables/useOrderManagement'

// Risk Management Composables
import { checkStoplossesAndTargets, setStoploss, removeStoploss, increaseStoploss, decreaseStoploss, setTarget, removeTarget, increaseTarget, decreaseTarget, setStoplossPrice, setTargetPrice, toggleTargetTrail, syncRiskRules } from '@/composables/useRiskManagement'

// Keyboard Shortcuts Composables
import { handleHotKeys } from '@/composables/useKeyboardShortcuts'

// Market Data Composables
import { fetchTradingData, updateSymbolData } from '@/composables/useMarketData'

// Formatters
import {
  formatTradingSymbol,
  formatDate,
  formatPrice
} from '@/composables/useFormatters'

// WebSocket Composables
import { connectWebSocket, disconnectWebSocket } from '@/composables/useWebSocket'

// App Settings Composables
import { setDefaultExpiry, riskReached, targetReached } from '@/composables/useAppSettings'

import {
  // Methods
  setActiveTab,
  updateExchangeSymbols,
  setDefaultExchangeAndMasterSymbol,
  setActiveFetchFunctionAndFetch,
  validateAndPlaceOrder,
  handleOrderTypeChange,
  handleOrderClick,
  setOrderDetails,
  updateTradingSymbol,
  resetOrderTypeIfNeeded,

  // Computed properties
  exchangeOptions,
  masterSymbolOptions,
  todayExpirySymbol,
  maxLots,
  combinedOrdersAndTrades,
  isValidLimitPrice,
  limitPriceErrorMessage,
  ltpRangeWidth,
  callLtpRangeWidth,
  callOpenMarkerPosition,
  openMarkerPosition,
  putLtpRangeWidth,
  putOpenMarkerPosition,
  handleFormInputMouseScroll
} from '@/composables/useTradeView'

// PnL Calculations Composables
import {
  netPnl, availableBalance, totalProfit, usedAmount,
  totalNetQty,
  totalBuyValue,
  totalSellValue,
  totalCapitalPercentage,
} from '@/composables/usePnlCalculations'

const isServerManaged = usesServerManagedAccount;
const staleDismissed = ref(false);
const lotsText = '1 to 10 contract lots';
const serverManagedNotice = computed(() =>
  `Server-managed orders place live NSE/BSE index derivatives trades (${lotsText} each). `
  + 'Stop-loss, target and trailing rules are monitored by the server, so they keep working when this page is closed. '
  + 'If protection toggles are off, entries have no automatic stop-loss or target. No daily loss limit is configured. '
  + (riskDryRun.value
    ? 'DRY RUN: triggered exits are only logged on the server and no exit order is sent.'
    : 'Triggered exits place live limit orders. Verify fills with Flattrade.'))
const streamNotice = computed(() =>
  selectedBroker.value?.brokerName === 'Flattrade'
  && (!brokerStreamHealth.value.authenticated || wsConnectionState.value !== 'connected' || marketDataStale.value)
    ? `Broker stream ${brokerStreamHealth.value.connectionState}; browser connection ${wsConnectionState.value}; `
      + `market data is ${marketDataStale.value ? 'stale or unavailable' : 'current'}.`
    : null)
watch([serverManagedNotice, streamNotice], () => {
  systemNotices.value = [isServerManaged ? serverManagedNotice.value : null, streamNotice.value].filter(Boolean)
}, { immediate: true })
const formatPercent = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
const marketDataStale = computed(
  () => !lastMarketDataAt.value || currentTime.value - lastMarketDataAt.value > 30_000
)
const positionsStale = computed(
  () => flattradePositionsStale.value ||
    !flattradePositionsLastUpdatedAt.value ||
    currentTime.value - flattradePositionsLastUpdatedAt.value > 120_000
)
let timer;
let positionCheckInterval;
let positionRefreshInterval;
let positionRefreshInFlight = false;
let brokerSelectionReady = false;

watch([selectedBroker, brokerStatus], () => {
  if (!brokerSelectionReady) return;
  if (selectedBroker.value?.brokerName && brokerStatus.value === 'Connected') {
    connectWebSocket();
  } else {
    disconnectWebSocket();
  }
});

const refreshFlattradePositions = async () => {
  if (
    positionRefreshInFlight ||
    activeTab.value !== 'positions' ||
    selectedBroker.value?.brokerName !== 'Flattrade'
  ) {
    return;
  }
  positionRefreshInFlight = true;
  try {
    await fetchFlattradePositions();
  } catch (error) {
    flattradePositionsStale.value = true;
    console.error('Unable to refresh Flattrade position data:', error.message);
  } finally {
    positionRefreshInFlight = false;
  }
};


let accountRefreshInterval;

// Re-validates the Flattrade session and reloads funds, orders and positions.
const refreshAccount = async () => {
  if (accountRefreshing.value) return;
  accountRefreshing.value = true;
  try {
    await checkAllTokens();
    if (selectedBroker.value?.brokerName) {
      await Promise.all([fetchFundLimit(), updateOrdersAndPositions(), syncRiskRules()]);
    }
    accountRefreshedAt.value = Date.now();
  } catch (error) {
    console.error('Unable to refresh the account:', error.message);
  } finally {
    accountRefreshing.value = false;
  }
};

// Lifecycle hooks
onMounted(async () => {

  await checkAllTokens();

  const storedBroker = localStorage.getItem('selectedBroker');
  if (storedBroker) {
    const brokerDetails = JSON.parse(storedBroker);
    const availableBroker = isServerManaged
      ? availableBrokers.value.find((broker) =>
        broker.brokerName === brokerDetails.brokerName && broker.clientId === brokerDetails.clientId)
      : brokerDetails;
    if (availableBroker) {
      selectedBroker.value = availableBroker;
      selectedBrokerName.value = availableBroker.brokerName;
      if (isServerManaged && brokerStatus.value === 'Connected') {
        try {
          await updateSelectedBrokerOnServer(availableBroker.brokerName.toLowerCase());
        } catch (error) {
          productionAccountError.value = 'Unable to start the broker stream. Check the service and reload.'
          console.error('Unable to start the broker stream:', error.message);
        }
      }
    } else {
      selectedBroker.value = null;
      selectedBrokerName.value = '';
      localStorage.removeItem('selectedBroker');
    }
  }
  brokerSelectionReady = true;

  // Load cached trading data
  const cachedData = JSON.parse(localStorage.getItem('cachedTradingData'));
  if (cachedData) {
    Object.keys(cachedData).forEach(key => {
      allSymbolsData[key] = cachedData[key];
    });
    updateExchangeSymbols();
    setDefaultExchangeAndMasterSymbol();
    updateSymbolData(selectedMasterSymbol.value);
    if (isServerManaged) {
      await fetchTradingData();
    }
  } else {
    updateExchangeSymbols();
    setDefaultExchangeAndMasterSymbol();
    await fetchTradingData();
  }

  updateAvailableQuantities();
  loadLots();
  updateSelectedQuantity();
  setDefaultExpiry();

  window.addEventListener('keydown', handleHotKeys);

  // Initialize with the default active tab
  await setActiveFetchFunctionAndFetch();

  timer = setInterval(() => {
    currentTime.value = Date.now();
  }, 1000);

  if (selectedBroker.value?.brokerName && brokerStatus.value === 'Connected') {
    connectWebSocket()
  }

  const ltpBarsavedPreference = localStorage.getItem('showLTPRangeBar');
  if (ltpBarsavedPreference !== null && JSON.parse(ltpBarsavedPreference) !== showLTPRangeBar.value) {
    toggleLTPRangeBar();
  }
  const ohlcValuesSavedPreference = localStorage.getItem('showOHLCValues');
  if (ohlcValuesSavedPreference !== null) {
    showOHLCValues.value = JSON.parse(ohlcValuesSavedPreference);
  }
  if (selectedExpiry.value) {
    updateStrikesForExpiry(selectedExpiry.value, true);
  }
  await syncRiskRules();
  positionCheckInterval = setInterval(checkStoplossesAndTargets, 1000);
  positionRefreshInterval = setInterval(refreshFlattradePositions, 60_000);
  accountRefreshInterval = setInterval(refreshAccount, 5000);
  accountRefreshHandler.value = refreshAccount;
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleHotKeys);

  disconnectWebSocket();

  clearInterval(timer);
  if (positionCheckInterval) {
    clearInterval(positionCheckInterval);
  }
  clearInterval(accountRefreshInterval);
  accountRefreshHandler.value = null;
  systemNotices.value = [];
  if (positionRefreshInterval) {
    clearInterval(positionRefreshInterval);
  }
});


</script>
