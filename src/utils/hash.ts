import { sha256 } from 'js-sha256'

// Stable JSON stringify + SHA-256 hashing utility
export async function generateSHA256(data: any): Promise<string> {
  const stableString = stableStringify(data)
  const enc = new TextEncoder()
  const buf = enc.encode(stableString)
  const hashBuffer = await (window.crypto.subtle.digest('SHA-256', buf))
  return bufferToHex(hashBuffer)
}

export function generateSHA256Sync(data: any): string {
  const stableString = stableStringify(data)
  return sha256(stableString)
}

function bufferToHex(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function stableStringify(value: any): string {
  return JSON.stringify(sortKeys(value), replacer)
}

function replacer(_key: string, val: any) {
  // Convert Dates to ISO strings for deterministic output
  if (val instanceof Date) return val.toISOString()
  return val
}

function sortKeys(obj: any): any {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(sortKeys)
  if (typeof obj === 'object') {
    const sorted: any = {}
    Object.keys(obj).toSorted().forEach((key) => {
      const v = (obj as any)[key]
      sorted[key] = sortKeys(v)
    })
    return sorted
  }
  return obj
}
