import axios from 'axios'
import { BASE_URL } from '@/stores/globalStore'

const endpoint = `${BASE_URL}/flattrade/risk/rules`
const ruleUrl = (tsym) => `${endpoint}/${encodeURIComponent(tsym)}`

export const fetchRiskRules = async () => (await axios.get(endpoint)).data
export const createRiskRule = async (tsym, rule) => (await axios.put(ruleUrl(tsym), rule)).data
export const createDefaultRiskRule = async (tsym, settings) => (await axios.post(`${ruleUrl(tsym)}/default`, settings)).data
export const createManualRiskRule = async (tsym, settings) => (await axios.post(`${ruleUrl(tsym)}/manual`, settings)).data
export const patchRiskRule = async (tsym, patch) => (await axios.patch(ruleUrl(tsym), patch)).data
export const deleteRiskRule = async (tsym) => (await axios.delete(ruleUrl(tsym))).data
