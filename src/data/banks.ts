/** Static NIP bank list. A real app would fetch this; static saves a request on 3G. */
export interface Bank {
  code: string
  name: string
}

export const BANKS: readonly Bank[] = [
  { code: '011', name: 'First Bank of Nigeria' },
  { code: '044', name: 'Access Bank' },
  { code: '058', name: 'Guaranty Trust Bank' },
  { code: '057', name: 'Zenith Bank' },
  { code: '033', name: 'United Bank for Africa' },
  { code: '032', name: 'Union Bank' },
  { code: '035', name: 'Wema Bank' },
  { code: '070', name: 'Fidelity Bank' },
  { code: '050', name: 'Ecobank' },
  { code: '214', name: 'FCMB' },
  { code: '221', name: 'Stanbic IBTC' },
  { code: '232', name: 'Sterling Bank' },
  { code: '076', name: 'Polaris Bank' },
  { code: '100', name: 'NovaPay Wallet' },
  { code: '999', name: 'Kuda Microfinance Bank' },
  { code: '090', name: 'OPay' },
  { code: '091', name: 'PalmPay' },
] as const

export function findBank(code: string): Bank | undefined {
  return BANKS.find((b) => b.code === code)
}
