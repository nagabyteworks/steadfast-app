import axios from 'axios'
import { BASE_URL } from '@/stores/globalStore'

const endpoint = `${BASE_URL}/flattrade/lots`

export const fetchLots = async (symbol = null) => (
  await axios.get(endpoint, { params: symbol ? { symbol } : undefined })
).data

export const syncLots = async () => (await axios.post(`${endpoint}/sync`)).data
export const updateLotProtection = async (lotId, patch) =>
  (await axios.patch(`${endpoint}/${encodeURIComponent(lotId)}/protection`, patch)).data
export const triggerLot = async (lotId, trigger) =>
  (await axios.post(`${endpoint}/${encodeURIComponent(lotId)}/trigger`, trigger)).data
export const exitLot = async (lotId, ltp) =>
  (await axios.post(`${endpoint}/${encodeURIComponent(lotId)}/exit`, ltp ? { ltp } : {})).data
