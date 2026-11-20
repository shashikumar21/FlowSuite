import type { ImportResultRow } from './types'

const FORMULA_START = /^[=+\-@\t\r]/
const PLAIN_NUMBER = /^-?\d+(?:\.\d+)?$/

/**
 * RFC 4180 escaping plus spreadsheet formula-injection protection.
 * A leading = + - @ (or control character) is prefixed with an apostrophe so
 * Excel treats it as text. Plain negative numbers stay numeric.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const raw = String(value)
    // eslint-disable-next-line no-control-regex -- deliberate: strip control chars from untrusted cells
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .trim()
  const safe = FORMULA_START.test(raw) && !PLAIN_NUMBER.test(raw) ? `'${raw}` : raw
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(rows: Array<Array<unknown>>): string {
  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}\r\n`
}

export function downloadTextFile(fileName: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function downloadCsv(fileName: string, rows: Array<Array<unknown>>): void {
  downloadTextFile(fileName, toCsv(rows), 'text/csv;charset=utf-8')
}

export function errorReportRows(results: ImportResultRow[]): Array<Array<unknown>> {
  return [
    ['Row', 'Name', 'Status', 'Reason'],
    ...results.map((result) => [result.rowNumber, result.name, result.status, result.message ?? '']),
  ]
}

export function buildErrorReportCsv(results: ImportResultRow[]): string {
  return toCsv(errorReportRows(results))
}
