import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import { makeStore } from '@/app/store'
import { server } from '@/mocks/server'
import { buildBalance } from '@/mocks/handlers/balance'

import { balanceApi } from './balance'
import { transfersApi } from './transfers'

function failTimes(path: string, times: number, respond: () => Response) {
  let count = 0
  server.use(
    http.get(path, () => {
      count += 1
      return count <= times ? HttpResponse.error() : respond()
    }),
  )
  return () => count
}

describe('GET retry with backoff', () => {
  it('retries a GET up to twice on network errors, then succeeds', async () => {
    const calls = failTimes('/api/balance', 2, () => HttpResponse.json(buildBalance()))
    const store = makeStore()
    const result = await store.dispatch(balanceApi.endpoints.getBalance.initiate())
    expect(result.data?.currency).toBe('NGN')
    expect(calls()).toBe(3)
  })

  it('gives up after the retry budget and surfaces the network error', async () => {
    const calls = failTimes('/api/balance', 10, () => HttpResponse.json(buildBalance()))
    const store = makeStore()
    const result = await store.dispatch(balanceApi.endpoints.getBalance.initiate())
    expect(result.error).toMatchObject({ status: 'FETCH_ERROR' })
    expect(calls()).toBe(3)
  })

  it('does not retry HTTP error responses (the server answered)', async () => {
    let count = 0
    server.use(
      http.get('/api/balance', () => {
        count += 1
        return HttpResponse.json(
          { error: { code: 'INTERNAL', message: 'x', requestId: 'r' } },
          { status: 500 },
        )
      }),
    )
    const store = makeStore()
    const result = await store.dispatch(balanceApi.endpoints.getBalance.initiate())
    expect(result.error).toMatchObject({ status: 500 })
    expect(count).toBe(1)
  })

  it('never retries POST /transfers', async () => {
    let count = 0
    server.use(
      http.post('/api/transfers', () => {
        count += 1
        return HttpResponse.error()
      }),
    )
    const store = makeStore()
    const result = await store.dispatch(
      transfersApi.endpoints.createTransfer.initiate({
        key: '00000000-0000-4000-8000-000000000001',
        body: {
          recipient: { accountNumber: '0123454821', bankCode: '058', accountName: 'X' },
          amount: 100,
        },
      }),
    )
    expect('error' in result).toBe(true)
    expect(count).toBe(1)
  })

  it('does not stack on the transfer status poll (maxRetries: 0)', async () => {
    let count = 0
    server.use(
      http.get('/api/transfers/:key', () => {
        count += 1
        return HttpResponse.error()
      }),
    )
    const store = makeStore()
    await store.dispatch(transfersApi.endpoints.getTransferStatus.initiate('abc'))
    expect(count).toBe(1)
  })
})
