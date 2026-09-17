import { BANKS } from '@/data/banks'
import { DAY_MS } from '@/lib/date'
import { type Kobo, toKobo } from '@/lib/money'
import type { Transaction, TransactionStatus, TransactionType } from '@/types/api'

import { createPrng, type Prng } from './prng'

export const SEED_TRANSACTION_COUNT = 1_600
export const SEED_DAYS = 90
/** The demo's ledger balance is fixed so the dashboard always opens on a sensible number. */
export const SEED_LEDGER_KOBO = toKobo(2_347_650_25)

const FIRST_NAMES = [
  'Adaeze',
  'Chukwuemeka',
  'Ngozi',
  'Tunde',
  'Yetunde',
  'Ibrahim',
  'Aisha',
  'Emeka',
  'Funke',
  'Olumide',
  'Halima',
  'Uche',
  'Bolanle',
  'Musa',
  'Chiamaka',
  'Segun',
  'Zainab',
  'Ifeanyi',
  'Kemi',
  'Abubakar',
  'Oluwaseun',
  'Amaka',
  'Bashir',
  'Titilayo',
  'Obinna',
  'Fatima',
] as const
const LAST_NAMES = [
  'Okafor',
  'Adeyemi',
  'Abubakar',
  'Eze',
  'Balogun',
  'Nwosu',
  'Bello',
  'Okonkwo',
  'Adebayo',
  'Mohammed',
  'Chukwu',
  'Ogunleye',
  'Ibrahim',
  'Okoro',
  'Lawal',
  'Onyeka',
  'Yusuf',
  'Afolabi',
] as const
const SUPPLIERS = [
  'Dangote Cement Depot',
  'Alaba Electronics Ltd',
  'Mama Nkechi Foods',
  'Ikeja Computer Village',
  'Shoprite Distribution',
  'Lagos Water Corp',
  'Ikeja Electric',
  'MTN Nigeria',
  'Airtel Nigeria',
  'Jumia Logistics',
  'GIG Logistics',
  'Balogun Market Traders',
] as const

type Describe = (p: Prng, name: string) => string

const CREDIT_DESCRIPTIONS: readonly Describe[] = [
  (p) => `POS payment – Terminal ${p.int(1000, 9999)}`,
  (p) => `NovaPay QR – order #${p.int(10_000, 99_999)}`,
  (_, name) => `Transfer from ${name}`,
  (p, name) => `NIP transfer from ${name} – ref ${p.int(100_000, 999_999)}`,
  (_, name) => `Payment for goods – ${name}`,
  (p) => `USSD *894# payment – ${p.int(1000, 9999)}`,
  (_, name) => `Diaspora remittance – ${name} (GBP→NGN)`,
]
const DEBIT_DESCRIPTIONS: readonly Describe[] = [
  (_, name) => `Transfer to ${name}`,
  (p) => `Supplier payment – ${p.pick(SUPPLIERS)}`,
  () => 'Airtime top-up',
  () => 'NovaLend repayment',
  () => 'Bank charges – NIP fee',
  () => 'NovaSave Safe Lock deposit',
  (p) => `Bill payment – ${p.pick(['Ikeja Electric', 'DSTV', 'LAWMA'] as const)}`,
]

/**
 * Hostile merchant/customer-entered text. React escapes HTML by default, so the interesting
 * cases are the ones that would survive escaping: bidi overrides, zero-width characters,
 * control characters, absurd length, and template/CSV injection payloads.
 */
export const HOSTILE_DESCRIPTIONS: readonly string[] = [
  '<img src=x onerror=alert(1)>',
  "<script>alert('xss')</script> Transfer from Adaeze",
  '"><svg onload=alert(1)>',
  'javascript:alert(document.cookie)',
  'Payment \u202Egnp.exe\u202C invoice', // RTL override reverses the display
  'Refund\u200B\u200B\u200B\u200B pending', // zero-width spaces
  'Transfer\u0000from\u0007Musa', // control characters
  '{{constructor.constructor("alert(1)")()}}',
  '${7*7} order',
  '=HYPERLINK("http://evil.example","Open")', // CSV/spreadsheet injection
  'Payment ' + 'A'.repeat(600),
  'Ọ̀ṣun market – Ìbàdàn 🍊', // legitimate diacritics/emoji must survive sanitization
  'Z\u0338\u0322a\u0337\u0321l\u0338\u0321g\u0337\u0321o\u0338\u0322 text', // combining-mark "zalgo"
  '<a href="https://evil.example">Click to claim ₦50,000</a>',
]

function personName(p: Prng): string {
  return `${p.pick(FIRST_NAMES)} ${p.pick(LAST_NAMES)}`
}

/** Amounts skew small with a long tail, which is what a merchant feed looks like. */
function amountKobo(p: Prng, type: TransactionType): Kobo {
  const roll = p.next()
  let naira: number
  if (type === 'credit') {
    if (roll < 0.7) naira = p.int(200, 15_000)
    else if (roll < 0.95) naira = p.int(15_000, 120_000)
    else naira = p.int(120_000, 900_000)
  } else if (roll < 0.6) naira = p.int(500, 20_000)
  else if (roll < 0.95) naira = p.int(20_000, 250_000)
  else naira = p.int(250_000, 1_500_000)
  // Mostly whole-naira amounts, some with kobo.
  return toKobo(naira * 100 + (p.chance(0.3) ? p.int(1, 99) : 0))
}

export interface SeedOptions {
  seed: number
  /** Epoch ms the data is generated relative to. */
  now: number
  count?: number
}

export function generateTransactions({
  seed,
  now,
  count = SEED_TRANSACTION_COUNT,
}: SeedOptions): Transaction[] {
  const p = createPrng(seed)
  const span = SEED_DAYS * DAY_MS
  const draft: Omit<Transaction, 'id'>[] = []

  for (let i = 0; i < count; i++) {
    const type: TransactionType = p.chance(0.7) ? 'credit' : 'debit'
    // Skew toward recent days: real feeds are busier this week than 12 weeks ago.
    const ageMs = Math.floor(p.next() ** 1.5 * span)
    const createdAtMs = now - ageMs

    let status: TransactionStatus
    if (ageMs < DAY_MS && p.chance(0.15)) status = 'pending'
    else status = p.chance(0.06) ? 'failed' : 'successful'

    const name = personName(p)
    const bank = p.pick(BANKS)
    const describe = type === 'credit' ? p.pick(CREDIT_DESCRIPTIONS) : p.pick(DEBIT_DESCRIPTIONS)
    const dateKey = new Date(createdAtMs).toISOString().slice(0, 10).replaceAll('-', '')

    draft.push({
      type,
      status,
      amount: amountKobo(p, type),
      currency: 'NGN',
      description: describe(p, name),
      counterparty: {
        name,
        accountNumberMasked: `******${p.int(0, 9999).toString().padStart(4, '0')}`,
        bankName: bank.name,
      },
      reference: `NIP${dateKey}${p.int(100_000_000, 999_999_999)}`,
      createdAt: new Date(createdAtMs).toISOString(),
    })
  }

  // Newest first; ids are assigned in chronological order so (createdAt, id) is a total order
  // and the id tiebreak in the cursor is meaningful.
  draft.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const transactions: Transaction[] = draft.map((t, i) => ({
    id: `txn_${String(i + 1).padStart(6, '0')}`,
    ...t,
  }))
  transactions.reverse()

  // Guarantee a few pending rows of each type in the last 24h regardless of the seed, so the
  // "pending" filter and the available-vs-ledger hold are always demonstrable.
  for (const type of ['credit', 'debit'] as const) {
    transactions
      .filter((t) => t.type === type && now - Date.parse(t.createdAt) < DAY_MS)
      .slice(0, 2)
      .forEach((t) => (t.status = 'pending'))
  }

  // Plant hostile descriptions at deterministic positions, including on the first page.
  HOSTILE_DESCRIPTIONS.forEach((text, i) => {
    const target = transactions[(i * 37) % transactions.length]
    if (target) target.description = text
  })

  return transactions
}
