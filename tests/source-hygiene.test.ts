import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// Bidi overrides, zero-width characters and C0 controls hidden in source are a supply-chain
// vector ("Trojan Source", CVE-2021-42574) and also a sign an escape got decoded by a tool.
// Test fixtures must spell them as \uXXXX escapes. Ranges are built from code points so this
// file itself contains none of them.
const range = (from: number, to: number) =>
  `${String.fromCodePoint(from)}-${String.fromCodePoint(to)}`
const FORBIDDEN = new RegExp(
  `[${range(0x00, 0x08)}${range(0x0b, 0x0c)}${range(0x0e, 0x1f)}${range(0x200b, 0x200f)}${range(0x202a, 0x202e)}${range(0x2066, 0x2069)}${String.fromCodePoint(0xfeff)}]`,
  'u',
)

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* walk(full)
    else if (/\.(ts|tsx|css|html|json|md)$/.test(entry)) yield full
  }
}

describe('source hygiene', () => {
  it('contains no invisible control/bidi characters in src/ or e2e/', () => {
    const offenders: string[] = []
    const files = [...walk('src'), ...walk('e2e'), ...walk('tests'), 'README.md', 'AI_USAGE.md']
    {
      for (const file of files) {
        const match = FORBIDDEN.exec(readFileSync(file, 'utf8'))
        if (match?.[0] !== undefined) {
          offenders.push(`${file}: U+${match[0].codePointAt(0)!.toString(16).padStart(4, '0')}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
