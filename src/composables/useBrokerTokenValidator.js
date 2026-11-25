import { usesServerManagedAccount } from '@/config/profile'
import axios from 'axios'
import { logRequestError } from '@/api/requestError'
import { BASE_URL, tokenStatus, supportedBrokers, productionAccount } from '@/stores/globalStore'

const flattradeFundLimits = async () => {
  if (usesServerManagedAccount) {
    const res = await axios.post(`${BASE_URL}/flattrade/fundLimit`)
    if (res.data?.stat !== 'Ok') throw new Error('Flattrade did not validate the session')
    return res.data
  }
  const jKey = localStorage.getItem('FLATTRADE_API_TOKEN')

  // Find the Flattrade broker details
  let clientId = null
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key.startsWith('broker_Flattrade_')) {
      const brokerDetails = JSON.parse(localStorage.getItem(key))
      clientId = brokerDetails.clientId
      break
    }
  }

  if (!jKey || !clientId) {
    throw new Error('Token or client ID is missing for Flattrade.')
  }

  const jData = JSON.stringify({ uid: clientId, actid: clientId })
  const payload = `jKey=${jKey}&jData=${jData}`

  try {
    const res = await axios.post('https://piconnect.flattrade.in/PiConnectAPI/Limits', payload, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return res.data
  } catch (error) {
    throw new Error('Error fetching Flattrade fund limits: ' + error.message)
  }
}

const shoonyaFundLimits = async () => {
  const jKey = localStorage.getItem('SHOONYA_API_TOKEN')

  // Find the Shoonya broker details
  let clientId = null
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key.startsWith('broker_Shoonya_')) {
      const brokerDetails = JSON.parse(localStorage.getItem(key))
      clientId = brokerDetails.clientId
      break
    }
  }

  if (!jKey || !clientId) {
    throw new Error('Token or client ID is missing for Shoonya.')
  }

  const jData = JSON.stringify({ uid: clientId, actid: clientId })
  const payload = `jKey=${jKey}&jData=${jData}`

  try {
    const res = await axios.post('https://api.shoonya.com/NorenWClientTP/Limits', payload, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return res.data
  } catch (error) {
    throw new Error('Error fetching Shoonya fund limits: ' + error.message)
  }
}

const validateToken = async (brokerName) => {
  try {
    switch (brokerName) {
      case 'Flattrade':
        await flattradeFundLimits()
        tokenStatus.Flattrade = 'valid'
        break
      case 'Shoonya':
        await shoonyaFundLimits()
        tokenStatus.Shoonya = 'valid'
        break
      default:
        throw new Error('Invalid broker name')
    }
  } catch (error) {
    logRequestError(`Error validating token for ${brokerName}`, error)
    tokenStatus[brokerName] = 'invalid'
  }
}

const checkAllTokens = async () => {
  for (const broker of (usesServerManagedAccount ? ['Flattrade'] : supportedBrokers)) {
    await validateToken(broker)
  }
}

const getBrokerStatus = (brokerName) => {
  if (usesServerManagedAccount) {
    if (brokerName !== 'Flattrade' || !productionAccount.value?.configured) return 'Broker not found'
    return tokenStatus.Flattrade === 'unknown' ? 'Token missing' : tokenStatus.Flattrade
  }
  // Find the broker details
  let brokerDetails = null
  let brokerToken = null
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key.startsWith(`broker_${brokerName}_`)) {
      brokerDetails = JSON.parse(localStorage.getItem(key))
      brokerToken = localStorage.getItem(`${brokerName.toUpperCase()}_API_TOKEN`)
      break
    }
  }

  if (!brokerDetails) {
    return 'Broker not found'
  }

  if (!brokerToken) {
    return 'Token missing'
  } else {
    return tokenStatus[brokerName] || 'unknown'
  }
}

export { validateToken, checkAllTokens, getBrokerStatus, tokenStatus }
