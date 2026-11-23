import { beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { initializeProductionAccount } from './productionAccount'
import { productionAccount, productionAccountError } from '@/stores/globalStore'

vi.hoisted(() => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage)
})
vi.mock('axios', () => ({ default: { get: vi.fn() } }))

describe('server-managed broker migration', () => {
  beforeEach(() => {
    localStorage.clear()
    productionAccount.value = null
    productionAccountError.value = ''
    vi.resetAllMocks()
  })

  it('removes legacy browser credentials and retains only account metadata', async () => {
    localStorage.setItem('FLATTRADE_API_TOKEN', 'old-token')
    localStorage.setItem('SHOONYA_API_TOKEN', 'old-shoonya-token')
    localStorage.setItem('flattradeReqCode', 'old-code')
    localStorage.setItem('broker_Flattrade_old', JSON.stringify({
      brokerName: 'Flattrade', clientId: 'old', apiKey: 'key', apiSecret: 'secret'
    }))
    localStorage.setItem('selectedBroker', JSON.stringify({
      brokerName: 'Flattrade', clientId: 'old', apiSecret: 'secret'
    }))
    axios.get.mockResolvedValue({ data: { configured: true, clientId: 'server-user', hasSession: false } })

    await initializeProductionAccount()

    expect(localStorage.getItem('FLATTRADE_API_TOKEN')).toBeNull()
    expect(localStorage.getItem('SHOONYA_API_TOKEN')).toBeNull()
    expect(localStorage.getItem('flattradeReqCode')).toBeNull()
    expect(JSON.parse(localStorage.getItem('broker_Flattrade_old'))).toEqual({ brokerName: 'Flattrade', clientId: 'old' })
    expect(JSON.parse(localStorage.getItem('selectedBroker'))).toEqual({ brokerName: 'Flattrade', clientId: 'old' })
    expect(JSON.parse(localStorage.getItem('broker_Flattrade_server-user'))).toEqual({ brokerName: 'Flattrade', clientId: 'server-user' })
    expect(productionAccount.value.clientId).toBe('server-user')
  })

  it('reports server failure without restoring saved credentials', async () => {
    localStorage.setItem('FLATTRADE_API_TOKEN', 'old-token')
    axios.get.mockRejectedValue(new Error('unavailable'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await initializeProductionAccount()
    expect(localStorage.getItem('FLATTRADE_API_TOKEN')).toBeNull()
    expect(productionAccount.value).toBeNull()
    expect(productionAccountError.value).toMatch(/Unable to load/)
    log.mockRestore()
  })
})
