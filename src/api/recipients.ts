import { type ResolveRecipientResponse, resolveRecipientResponseSchema } from '@/types/api'

import { baseApi } from './baseApi'

export const recipientsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Name enquiry. Cached per (account, bank) so Back/Next does not re-query. */
    resolveRecipient: build.query<
      ResolveRecipientResponse,
      { accountNumber: string; bankCode: string }
    >({
      query: ({ accountNumber, bankCode }) => ({
        url: '/recipients/resolve',
        params: { accountNumber, bankCode },
      }),
      transformResponse: (raw: unknown) => resolveRecipientResponseSchema.parse(raw),
    }),
  }),
})

export const { useLazyResolveRecipientQuery } = recipientsApi
