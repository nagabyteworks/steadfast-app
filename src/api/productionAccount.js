import axios from 'axios'
import { BASE_URL, productionAccount, productionAccountError } from '@/stores/globalStore'

export async function initializeProductionAccount() {
  for (const key of Object.keys(localStorage)) {
    if (key === 'FLATTRADE_API_TOKEN' || key === 'SHOONYA_API_TOKEN' || key === 'flattradeReqCode') {
      localStorage.removeItem(key)
    } else if (key.startsWith('broker_') || key === 'selectedBroker') {
      const broker = JSON.parse(localStorage.getItem(key))
      if (broker && typeof broker === 'object') {
        localStorage.setItem(key, JSON.stringify({
          brokerName: broker.brokerName,
          clientId: broker.clientId
        }))
      }
    }
  }

  try {
    const { data } = await axios.get(`${BASE_URL}/flattrade/account`)
    if (data.configured && data.clientId) {
      const broker = { brokerName: 'Flattrade', clientId: data.clientId }
      localStorage.setItem(`broker_Flattrade_${data.clientId}`, JSON.stringify(broker))
    }
    productionAccount.value = data
    productionAccountError.value = data.configured ? '' : 'Flattrade is not configured on the server.'
  } catch (error) {
    productionAccount.value = null
    productionAccountError.value = 'Unable to load the server-managed Flattrade account.'
    console.error('Unable to load server-managed Flattrade account:', error.message)
  }
}
