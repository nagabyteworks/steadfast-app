import axios from 'axios'

const baseURL = import.meta.env.VITE_BASE_URL

export const isFlattradeAuthMessage = (event) =>
  event.origin === window.location.origin &&
  event.data?.type === 'flattradeReqCode' &&
  typeof event.data.code === 'string' &&
  event.data.code.length > 0

export const getFlattradeRequestCode = (query) => {
  const { code, request_code: requestCode } = query
  if (code && requestCode && code !== requestCode) return null
  const value = code || requestCode
  return typeof value === 'string' && value.length > 0 ? value : null
}

export const updateSelectedBrokerOnServer = async (broker) => {
  try {
    const response = await axios.post(`${baseURL}/set-broker`, { broker })
    console.log('Broker set successfully:', response.data.message)

    // Increase delay to 2 seconds to ensure Python server is ready
    await new Promise((resolve) => setTimeout(resolve, 2000))

    return response.data
  } catch (error) {
    console.error('Error setting broker:', error)
    throw new Error('Failed to set broker. Please try again.')
  }
}
