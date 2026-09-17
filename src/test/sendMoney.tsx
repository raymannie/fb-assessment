import { screen, waitFor, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { expect } from 'vitest'

import { resolveRecipientName } from '@/mocks/handlers/recipients'

export const RECIPIENT = {
  accountNumber: '0123454821',
  bankCode: '058',
  bankName: 'Guaranty Trust Bank',
}
export const RECIPIENT_NAME = resolveRecipientName(RECIPIENT.accountNumber, RECIPIENT.bankCode)!

export const dialog = () => screen.getByRole('dialog')

export async function openSendMoney(user: UserEvent) {
  await user.click(screen.getAllByRole('button', { name: /send money/i })[0]!)
  await screen.findByRole('dialog', { name: /who are you sending to/i })
}

export async function fillRecipient(user: UserEvent, overrides: Partial<typeof RECIPIENT> = {}) {
  const { accountNumber, bankCode } = { ...RECIPIENT, ...overrides }
  await user.type(within(dialog()).getByLabelText(/account number/i), accountNumber)
  await user.selectOptions(within(dialog()).getByLabelText(/^bank$/i), bankCode)
  await waitFor(() =>
    expect(within(dialog()).getByRole('button', { name: /^next$/i })).toBeEnabled(),
  )
  await user.click(within(dialog()).getByRole('button', { name: /^next$/i }))
  await screen.findByRole('dialog', { name: /how much/i })
}

export async function fillAmount(user: UserEvent, amount: string, narration?: string) {
  const amountField = within(dialog()).getByLabelText(/amount/i)
  await user.clear(amountField)
  await user.type(amountField, amount)
  if (narration !== undefined) {
    const narrationField = within(dialog()).getByLabelText(/narration/i)
    await user.clear(narrationField)
    if (narration) await user.type(narrationField, narration)
  }
  await user.click(within(dialog()).getByRole('button', { name: /^next$/i }))
  await screen.findByRole('dialog', { name: /review transfer/i })
}

export async function continueToConfirm(user: UserEvent) {
  await user.click(within(dialog()).getByRole('button', { name: /continue/i }))
  await screen.findByRole('dialog', { name: /confirm transfer/i })
}

/** Recipient → amount → review → confirm, stopping before the final button. */
export async function reachConfirm(user: UserEvent, amount = '2,500', narration = 'Stock') {
  await openSendMoney(user)
  await fillRecipient(user)
  await fillAmount(user, amount, narration)
  await continueToConfirm(user)
}

export const confirmButton = () =>
  within(dialog()).getByRole('button', { name: /confirm and send/i })
