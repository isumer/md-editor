export type TextEncoding = 'utf-8' | 'utf-16le' | 'windows-1254'

export type DecodeResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: 'invalid' }

function stripBom(bytes: Uint8Array, encoding: TextEncoding): Uint8Array {
  if (encoding === 'utf-8' && bytes.length >= 3) {
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return bytes.slice(3)
    }
  }
  if (encoding === 'utf-16le' && bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return bytes.slice(2)
    }
  }
  return bytes
}

export function decodeText(bytes: Uint8Array, encoding: TextEncoding): DecodeResult {
  const withoutBom = stripBom(bytes, encoding)
  try {
    const decoder = new TextDecoder(encoding, { fatal: true })
    const text = decoder.decode(withoutBom)
    return { ok: true, text }
  } catch {
    return { ok: false, reason: 'invalid' }
  }
}