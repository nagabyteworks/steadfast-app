// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { getFlattradeRequestCode, isFlattradeAuthMessage } from './broker'

describe('Flattrade callback messages', () => {
  it('accepts a nonempty code only from the same origin', () => {
    const data = { type: 'flattradeReqCode', code: 'test-code' }
    expect(isFlattradeAuthMessage({ origin: window.location.origin, data })).toBe(true)
    expect(isFlattradeAuthMessage({ origin: 'https://other.example', data })).toBe(false)
    expect(isFlattradeAuthMessage({ origin: window.location.origin, data: null })).toBe(false)
    expect(isFlattradeAuthMessage({ origin: window.location.origin, data: { ...data, code: '' } })).toBe(false)
  })

  it('accepts either documented callback code parameter and rejects conflicts', () => {
    expect(getFlattradeRequestCode({ code: 'a' })).toBe('a')
    expect(getFlattradeRequestCode({ request_code: 'b' })).toBe('b')
    expect(getFlattradeRequestCode({ code: 'a', request_code: 'b' })).toBeNull()
    expect(getFlattradeRequestCode({ code: ['a', 'b'] })).toBeNull()
  })
})
