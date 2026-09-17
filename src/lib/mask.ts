/** "0123454821" → "******4821". Never render or log a full account number. */
export function maskAccountNumber(accountNumber: string, visible = 4): string {
  const digits = accountNumber.replace(/\s+/g, '')
  if (digits.length <= visible) return '*'.repeat(digits.length)
  return '*'.repeat(digits.length - visible) + digits.slice(-visible)
}
