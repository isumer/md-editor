import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import { decodeText } from '../../src/shared/text/encoding.js'

function readFixture(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(`test/fixtures/encodings/${name}`))
}

describe('AC-R12-05: decodeText', () => {
  it('AC-R12-05: decodes the Windows-1254 fixture', () => {
    const bytes = readFixture('windows-1254.txt')
    const result = decodeText(bytes, 'windows-1254')
    expect(result.ok).toBe(true)
    if (result.ok) {
      const expected = String.fromCharCode(0x11f, 0xfc, 0x15f, 0x131, 0xf6, 0xe7) + '\r\nturkish\r\n'
      expect(result.text).toBe(expected)
    }
  })

  it('AC-R12-05: decodes a UTF-8 fixture without a BOM', () => {
    const bytes = readFixture('crlf.txt')
    const result = decodeText(bytes, 'utf-8')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.text).toBe('alpha\r\nbeta\r\ngamma\r\n')
    }
  })

  it('AC-R12-05: removes a UTF-8 byte order mark', () => {
    const bytes = readFixture('utf8-bom.txt')
    const result = decodeText(bytes, 'utf-8')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.text).toBe('hello\n')
    }
  })

  it('AC-R12-05: removes a UTF-16LE byte order mark', () => {
    const bytes = readFixture('utf16le.txt')
    const result = decodeText(bytes, 'utf-16le')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.text).toBe('hello\n')
    }
  })

  it('AC-R12-05: removes only one leading byte order mark', () => {
    const result = decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf, 0x41]), 'utf-8')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.text).toBe('\ufeffA')
    }
  })

  it('AC-R12-05: keeps a UTF-8 byte order mark under Windows-1254', () => {
    const result = decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]), 'windows-1254')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.text).toBe(String.fromCharCode(0xef, 0xbb, 0xbf, 0x41))
    }
  })

  it('AC-R12-05: refuses a UTF-16LE byte order mark as UTF-8', () => {
    const result = decodeText(new Uint8Array([0xff, 0xfe, 0x41, 0x00]), 'utf-8')
    expect(result.ok).toBe(false)
  })

  it('AC-R12-05: refuses bytes that are invalid for the encoding', () => {
    const utf8Result = decodeText(new Uint8Array([0xff]), 'utf-8')
    expect(utf8Result.ok).toBe(false)
    if (!utf8Result.ok) {
      expect(utf8Result.reason).toBe('invalid')
    }

    const utf16Result = decodeText(new Uint8Array([0x41]), 'utf-16le')
    expect(utf16Result.ok).toBe(false)
    if (!utf16Result.ok) {
      expect(utf16Result.reason).toBe('invalid')
    }
  })

  it('AC-R12-05: does not mutate the input', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x65, 0x6c, 0x6c, 0x6f])
    const frozen = Object.freeze([...bytes])
    decodeText(bytes, 'utf-8')
    expect([...bytes]).toEqual(frozen)
  })
})
