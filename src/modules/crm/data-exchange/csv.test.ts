import { describe, expect, it } from 'vitest'
import { buildErrorReportCsv, escapeCsvCell, errorReportRows, toCsv } from './csv'

describe('CSV formula injection protection', () => {
  it.each(['=SUM(1+1)', '+cmd', '@SUM(A1)', '-cmd|calc'])(
    'neutralizes a leading formula character in %s',
    (value) => {
      expect(escapeCsvCell(value)).toBe(`'${value}`)
    },
  )

  it('removes leading control whitespace before checking for formulas', () => {
    expect(escapeCsvCell('\tcmd')).toBe('cmd')
    expect(escapeCsvCell('\t=1250')).toBe("'=1250")
  })

  it('keeps plain numbers numeric', () => {
    expect(escapeCsvCell('-42')).toBe('-42')
    expect(escapeCsvCell('3.14')).toBe('3.14')
  })

  it('strips control characters before escaping', () => {
    expect(escapeCsvCell('\u0001=1250')).toBe("'=1250")
  })

  it('applies RFC 4180 quoting', () => {
    expect(escapeCsvCell('Smith, John')).toBe('"Smith, John"')
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"')
    expect(escapeCsvCell('He said "hi"')).toBe('"He said ""hi"""')
  })
})

describe('CSV output', () => {
  it('uses a UTF-8 BOM and CRLF line endings', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']])).toBe('\uFEFFa,b\r\nc,d\r\n')
  })

  it('builds a downloadable error report with safe values', () => {
    const results = [
      { rowNumber: 4, name: '=HYPERLINK("x")', status: 'failed' as const, message: 'Invalid email' },
    ]
    const rows = errorReportRows(results)
    expect(rows[0]).toEqual(['Row', 'Name', 'Status', 'Reason'])
    expect(buildErrorReportCsv(results)).toContain(`"'=HYPERLINK(""x"")"`)
  })
})
