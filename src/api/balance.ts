import { type BalanceResponse, balanceResponseSchema } from '@/types/api'

import { baseApi } from './baseApi'

export const balanceApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getBalance: build.query<BalanceResponse, void>({
      query: () => '/balance',
      // Validate at the boundary: money fields are branded Kobo only after this parse.
      transformResponse: (raw: unknown) => balanceResponseSchema.parse(raw),
      providesTags: ['Balance'],
    }),
  }),
})

export const { useGetBalanceQuery } = balanceApi
