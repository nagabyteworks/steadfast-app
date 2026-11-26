import { ref, shallowRef, reactive, watch } from 'vue'
import { useLocalStorage } from '@vueuse/core'

export const BASE_URL = import.meta.env.VITE_BASE_URL
export const productionAccount = ref(null)
export const productionAccountError = ref('')
export const showLTPRangeBar = ref(false)
export const showToast = ref(false)
export const toastMessage = ref('')
export const activeTab = ref('positions')
export const currentTime = ref(Date.now())
export const enableHotKeys = ref(localStorage.getItem('EnableHotKeys') !== 'false')

// Broker Status
export const tokenStatus = reactive({
  Flattrade: 'unknown',
  Shoonya: 'unknown'
})

export const selectedBroker = ref(null)
export const selectedBrokerName = ref('')
export const selectedExchange = ref({})
export const selectedMasterSymbol = ref('')
export const selectedQuantity = ref(0)
export const selectedExpiry = ref(null)
export const selectedCallStrike = ref({})
export const selectedPutStrike = ref({})
export const callStrikeOffset = ref(localStorage.getItem('callStrikeOffset') || '0')
export const putStrikeOffset = ref(localStorage.getItem('putStrikeOffset') || '0')
export const expiryOffset = ref(localStorage.getItem('expiryOffset') || '0')
export const exchangeSymbols = ref({})
export const callStrikes = ref([])
export const putStrikes = ref([])
export const expiryDates = ref([])
export const synchronizeOnLoad = ref(true)
export const niftyPrice = ref('N/A')
export const bankNiftyPrice = ref('N/A')
export const finniftyPrice = ref('N/A')
export const midcpniftyPrice = ref('N/A')
export const sensexPrice = ref('N/A')
export const bankexPrice = ref('N/A')
export const dataFetched = ref(false)
export const lotsPerSymbol = ref({})
export const flatOrderBook = ref([])
export const flatTradeBook = ref([])
export const token = ref('')
export const shoonyaOrderBook = ref([])
export const shoonyaTradeBook = ref([])
export const flatTradePositionBook = ref([])
export const flattradePositionsStale = ref(true)
export const flattradePositionsLastUpdatedAt = ref(null)
export const shoonyaPositionBook = ref([])
export const fundLimits = ref({})
export const quantities = ref({
  NIFTY: { lotSize: 75, maxLots: 10, freezeLimit: 72 },
  BANKNIFTY: { lotSize: 15, maxLots: 10, freezeLimit: 60 },
  FINNIFTY: { lotSize: 25, maxLots: 10, freezeLimit: 72 },
  MIDCPNIFTY: { lotSize: 50, maxLots: 10, freezeLimit: 56 },
  SENSEX: { lotSize: 10, maxLots: 10, freezeLimit: 100 },
  BANKEX: { lotSize: 15, maxLots: 10, freezeLimit: 60 }
})
export const availableQuantities = ref([])
export const selectedStrike = ref({})
export const selectedProductType = ref(localStorage.getItem('selectedProductType') || '')
export const limitPrice = ref(null)
export const modalTransactionType = ref('')
export const modalOptionType = ref('')
export const selectedShoonyaPositionsSet = ref(new Set())
export const selectedFlattradePositionsSet = ref(new Set())
export const positionsInExecution = ref({})
export const socket = ref(null)
export const lastMarketDataAt = ref(null)
export const brokerStreamHealth = ref({
  authenticated: false,
  connectionState: 'unknown',
  localListener: false,
  lastTickAt: null,
  lastError: null,
  retryAttempt: 0,
  updatedAt: null
})
export const latestCallLTP = ref('N/A')
export const latestPutLTP = ref('N/A')
export const defaultCallSecurityId = ref(null)
export const defaultPutSecurityId = ref(null)
export const positionLTPs = ref({})
// Percentage change versus the previous close, as reported by the broker feed
export const masterPercentChange = ref(null)
export const callPercentChange = ref(null)
export const putPercentChange = ref(null)
export const positionPercentChanges = ref({})
export const positionSecurityIds = ref({})
export const totalRiskType = ref(null)
export const totalRiskTypeToggle = ref(false)
export const activeFetchFunction = ref(null)
export const masterOpenPrice = ref(localStorage.getItem('masterOpenPrice') || null)
export const masterHighPrice = ref(localStorage.getItem('masterHighPrice') || null)
export const masterLowPrice = ref(localStorage.getItem('masterLowPrice') || null)
export const masterClosePrice = ref(localStorage.getItem('masterClosePrice') || null)
export const callOpenPrice = ref(localStorage.getItem('callOpenPrice') || null)
export const callHighPrice = ref(localStorage.getItem('callHighPrice') || null)
export const callLowPrice = ref(localStorage.getItem('callLowPrice') || null)
export const callClosePrice = ref(localStorage.getItem('callClosePrice') || null)
export const putOpenPrice = ref(localStorage.getItem('putOpenPrice') || null)
export const putHighPrice = ref(localStorage.getItem('putHighPrice') || null)
export const putLowPrice = ref(localStorage.getItem('putLowPrice') || null)
export const putClosePrice = ref(localStorage.getItem('putClosePrice') || null)
export const showOHLCValues = ref(false)
export const showStrikeDetails = ref(false)
export const ltpCallbacks = ref({})
export const customStrikePrice = ref('')
export const notificationSound = ref(localStorage.getItem('notificationSound') !== 'false')
export const riskClosingCountdown = ref(30)
export const totalRiskTargetToggle = ref(
  JSON.parse(localStorage.getItem('totalRiskTargetToggle') || 'false')
)
export const totalRiskTargetType = ref(localStorage.getItem('totalRiskTargetType') || 'percentage')
export const totalRiskAmount = ref(Number(localStorage.getItem('totalRiskAmount')) || 1500)
export const totalRiskPercentage = ref(Number(localStorage.getItem('totalRiskPercentage')) || 1.5)
export const totalTargetAmount = ref(Number(localStorage.getItem('totalTargetAmount')) || 3000)
export const totalTargetPercentage = ref(Number(localStorage.getItem('totalTargetPercentage')) || 3)
export const closePositionsRisk = ref(
  JSON.parse(localStorage.getItem('closePositionsRisk') || 'false')
)
export const closePositionsTarget = ref(
  JSON.parse(localStorage.getItem('closePositionsTarget') || 'false')
)

export const stoplosses = useLocalStorage('stoplosses', {})
export const targets = useLocalStorage('targets', {})
export const trailingStoplosses = useLocalStorage('trailingStoplosses', {})

export const enableStoploss = useLocalStorage('enableStoploss', true)
export const stoplossValue = useLocalStorage('stoplossValue', 20)
export const enableTarget = useLocalStorage('enableTarget', true)
export const targetValue = useLocalStorage('targetValue', 20)
export const enableTrailingStoploss = useLocalStorage('enableTrailingStoploss', false)
export const enableTargetTrail = useLocalStorage('enableTargetTrail', true)
export const targetTrailValue = useLocalStorage('targetTrailValue', 10)
// true: this app watches the price and sends the exit (works only while the page is open);
// false: the server (WebSocket service) watches and exits, even when the page is closed.
export const useUiTriggers = useLocalStorage('useUiTriggers', false)
// Server-side stop-loss/target rules keyed by trading symbol.
export const riskRules = ref({})
export const reconciliationRequired = ref({})
export const riskSyncAvailable = ref(false)

// Trailing stop-loss and target trailing are alternatives. Target trailing needs both the
// predefined stop-loss and target, so enabling it switches them on and disabling either
// of them switches target trailing off.
watch(enableTrailingStoploss, (enabled) => {
  if (enabled) {
    enableTargetTrail.value = false
    enableStoploss.value = true
  }
})
watch(enableTargetTrail, (enabled) => {
  if (!enabled) return
  enableStoploss.value = true
  enableTarget.value = true
  enableTrailingStoploss.value = false
})
watch(enableTarget, (enabled) => {
  if (!enabled) enableTargetTrail.value = false
})
watch(enableStoploss, (enabled) => {
  if (!enabled) enableTargetTrail.value = false
})

export const symbolData = reactive({
  NIFTY: { exchangeCode: 'NSE', exchangeSecurityId: '26000', expiryDay: 4 }, // Thursday
  BANKNIFTY: { exchangeCode: 'NSE', exchangeSecurityId: '26009', expiryDay: 3 }, // Wednesday
  FINNIFTY: { exchangeCode: 'NSE', exchangeSecurityId: '26037', expiryDay: 2 }, // Tuesday
  MIDCPNIFTY: { exchangeCode: 'NSE', exchangeSecurityId: '26074', expiryDay: 1 }, // Monday
  SENSEX: { exchangeCode: 'BSE', exchangeSecurityId: '1', expiryDay: 5 }, // Friday
  BANKEX: { exchangeCode: 'BSE', exchangeSecurityId: '12', expiryDay: null } // No specific expiry day
})
export const allSymbolsData = reactive({
  NIFTY: { expiryDates: [], callStrikes: [], putStrikes: [] },
  BANKNIFTY: { expiryDates: [], callStrikes: [], putStrikes: [] },
  FINNIFTY: { expiryDates: [], callStrikes: [], putStrikes: [] },
  MIDCPNIFTY: { expiryDates: [], callStrikes: [], putStrikes: [] },
  SENSEX: { expiryDates: [], callStrikes: [], putStrikes: [] },
  BANKEX: { expiryDates: [], callStrikes: [], putStrikes: [] }
})

export const API_TOKEN = ref('') // Not used right now
export const FLATTRADE_API_KEY = ref('')
export const FLATTRADE_API_SECRET = ref('')
export const FLATTRADE_CLIENT_ID = ref('')
export const FLATTRADE_API_TOKEN = ref('')
export const SHOONYA_API_KEY = ref('')
export const SHOONYA_CLIENT_ID = ref('')
export const SHOONYA_API_TOKEN = ref('')
export const flattradeReqCode = ref('')
export const shoonyaBrokerUserId = ref('')
export const shoonyaBrokerPassword = ref('')
export const shoonyaOneTimePassword = ref('')
export const errorMessage = ref('')
export const statusMessage = ref('')
export const userTriggeredTokenGeneration = ref(false) // Flag to track user-triggered token generation
export const selectedBrokerToDelete = ref(null) // Store the broker to be deleted
export const savedStickyMTM = localStorage.getItem('stickyMTM')
export const stickyMTM = ref(savedStickyMTM ? JSON.parse(savedStickyMTM) : false)
export const userId = localStorage.getItem('userId')
export const selectedOrderType = ref('LMT_LTP')
export const currentSubscriptions = ref({
  masterSymbol: null,
  masterSymbolExchangeCode: null,
  masterSymbolSecurityId: null,
  callOption: null,
  putOption: null,
  positionSymbols: []
})
export const supportedBrokers = ['Flattrade', 'Shoonya']
export const MAX_RECONNECT_ATTEMPTS = 5
export const INITIAL_RECONNECT_DELAY = 1000
export const reconnectAttempts = ref(0)
export const reconnectTimeout = ref(null)
export const wsConnectionState = ref('disconnected')

// Account refresh state shared with the navigation bar; the Trade page registers the handler
export const accountRefreshing = ref(false)
export const accountRefreshedAt = ref(null)
export const accountRefreshHandler = shallowRef(null)

// Persistent notices shown in the navigation notification dropdown
export const systemNotices = ref([])

// Latest broker/order message, shown under the order buttons for 10 seconds
export const brokerMessage = ref('')
let brokerMessageTimer = null
watch(toastMessage, (message) => {
  if (!message) return
  brokerMessage.value = message
  clearTimeout(brokerMessageTimer)
  brokerMessageTimer = setTimeout(() => { brokerMessage.value = '' }, 10000)
})
