import { HttpResponse, http } from 'msw'

import { balanceHandlers } from './balance'
import { recipientHandlers } from './recipients'
import { transactionHandlers } from './transactions'
import { transferHandlers } from './transfers'

export const handlers = [
  // Lets the shell and e2e smoke test prove the worker is intercepting.
  http.get('/api/health', () => HttpResponse.json({ ok: true, mock: true })),
  ...balanceHandlers,
  ...transactionHandlers,
  ...transferHandlers,
  ...recipientHandlers,
]
