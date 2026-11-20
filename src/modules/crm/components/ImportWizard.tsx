import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from 'lucide-react'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Label, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import {
  checkDuplicates,
  completeImport,
  confirmNewDuplicates,
  fetchImportOptions,
  processBatch,
  startImport,
} from '../data-exchange/api'
import { downloadCsv, errorReportRows } from '../data-exchange/csv'
import { autoMapColumns, availableFields, buildMappedRows } from '../data-exchange/mapping'
import { downloadSampleTemplate, parseWorkbook } from '../data-exchange/parse'
import type {
  BatchResult,
  DuplicateMatch,
  DuplicateMode,
  ImportKind,
  ImportResultRow,
  ImportSummary,
  ParsedWorkbook,
  ValidatedRow,
} from '../data-exchange/types'
import { BATCH_SIZE, validateFile, validateImportRow } from '../data-exchange/validation'

const STEPS = ['Upload', 'Map columns', 'Duplicates', 'Preview', 'Progress', 'Summary'] as const

const DUPLICATE_MODES: Array<{ value: DuplicateMode; label: string; help: string }> = [
  { value: 'skip', label: 'Skip duplicates', help: 'Records matching an existing email or phone are not imported.' },
  { value: 'update', label: 'Update existing', help: 'Matching records are updated with the values in this file.' },
  { value: 'new', label: 'Import as new', help: 'Creates extra records even when a match exists. Requires confirmation.' },
]

export function ImportWizard({
  open,
  onClose,
  tenantId,
  kind,
  onComplete,
}: {
  open: boolean
  onClose: () => void
  tenantId: string
  kind: ImportKind
  onComplete: () => void
}) {
  const { toast } = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null)
  const [sheetIndex, setSheetIndex] = useState(0)
  const [mapping, setMapping] = useState<Record<number, string>>({})
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([])
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>('skip')
  const [confirmedNew, setConfirmedNew] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [results, setResults] = useState<ImportResultRow[]>([])
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [processed, setProcessed] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const optionsQuery = useQuery({
    queryKey: ['crm', tenantId, 'import-options'],
    enabled: open && Boolean(tenantId),
    queryFn: () => fetchImportOptions(tenantId),
  })
  const options = optionsQuery.data
  const sheet = workbook?.sheets[sheetIndex] ?? null

  const validations: ValidatedRow[] = useMemo(() => {
    if (!sheet || !options) return []
    const rows = buildMappedRows(sheet, mapping, options)
    return rows.map((values) => ({
      rowNumber: values.rowNumber,
      values,
      errors: validateImportRow(values, options.customFields, kind),
      duplicate: null,
    }))
  }, [sheet, options, mapping, kind])

  const validRows = validations.filter((row) => row.errors.length === 0)
  const invalidRows = validations.filter((row) => row.errors.length > 0)
  const duplicateByRow = new Map(duplicates.map((item) => [item.rowNumber, item]))
  const duplicateCount = validRows.filter((row) => duplicateByRow.has(row.rowNumber)).length
  const step = STEPS[stepIndex]

  const reset = () => {
    setWorkbook(null)
    setSheetIndex(0)
    setMapping({})
    setDuplicates([])
    setDuplicateMode('skip')
    setConfirmedNew(false)
    setJobId(null)
    setResults([])
    setSummary(null)
    setProcessed(0)
    setBusy(false)
    setError(null)
    setStepIndex(0)
    if (fileInput.current) fileInput.current.value = ''
  }

  const close = () => {
    if (busy) return
    reset()
    onClose()
  }

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setError(null)
    const problem = validateFile(file)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    try {
      const parsed = await parseWorkbook(file)
      setWorkbook(parsed)
      setSheetIndex(0)
      const first = parsed.sheets[0]
      if (first && options) setMapping(autoMapColumns(first, options))
      toast({ title: 'File ready', description: `${parsed.sheets.length} worksheet(s) found.` })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read this file.')
    } finally {
      setBusy(false)
    }
  }

  const selectSheet = (index: number) => {
    const next = workbook?.sheets[index]
    setSheetIndex(index)
    if (next && options) setMapping(autoMapColumns(next, options))
  }

  const goToDuplicates = async () => {
    if (!tenantId || validRows.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const matches = await checkDuplicates(tenantId, validRows.map((row) => row.values))
      setDuplicates(matches)
      setStepIndex(2)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not check for duplicates.')
    } finally {
      setBusy(false)
    }
  }

  const runImport = async () => {
    if (!tenantId || !workbook || validRows.length === 0 || busy) return
    setBusy(true)
    setError(null)
    setStepIndex(4)
    setProcessed(0)
    setResults([])
    try {
      const id = await startImport(tenantId, {
        kind,
        fileName: workbook.fileName,
        fileSize: workbook.fileSize,
        fileHash: workbook.fileHash,
        duplicateMode: duplicateMode,
        totalRows: validRows.length,
      })
      setJobId(id)
      if (duplicateMode === 'new' && confirmedNew) await confirmNewDuplicates(id)

      const batches: ImportRowBatch[] = []
      for (let index = 0; index < validRows.length; index += BATCH_SIZE) {
        batches.push(validRows.slice(index, index + BATCH_SIZE).map((row) => row.values))
      }
      const all: ImportResultRow[] = []
      for (let index = 0; index < batches.length; index += 1) {
        const batch: BatchResult = await processBatch(id, index, batches[index] ?? [])
        all.push(...batch.results)
        setResults(all)
        setProcessed((current) => current + (batches[index]?.length ?? 0))
      }
      const final = await completeImport(id)
      setSummary(final)
      setStepIndex(5)
      onComplete()
      toast({
        title: 'Import complete',
        description: `${final.created} created, ${final.updated} updated, ${final.skipped} skipped.`,
      })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The import could not be completed.'
      setError(message)
      if (jobId) {
        try { await completeImport(jobId, true) } catch { /* best effort */ }
      }
      toast({ title: 'Import failed', description: message, variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const reportRows = results.filter(
    (row) => row.status === 'failed' || row.status === 'skipped',
  )

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Import ${kind === 'leads' ? 'leads' : 'contacts'}`}
      description="Upload, map, review and confirm. Tenant and permissions are always checked by the server."
      className="max-w-5xl"
    >
      <div className="max-h-[72vh] space-y-5 overflow-y-auto pr-1">
        <ol className="flex flex-wrap gap-2 text-xs">
          {STEPS.map((label, index) => (
            <li
              key={label}
              className={`rounded-full px-3 py-1 font-semibold ${
                index === stepIndex
                  ? 'bg-brand-600 text-white'
                  : index < stepIndex
                    ? 'bg-brand-50 text-brand-700'
                    : 'bg-ink-100 text-ink-500'
              }`}
            >
              {index + 1}. {label}
            </li>
          ))}
        </ol>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {step === 'Upload' ? (
          <div className="space-y-4">
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => { void handleFile(event) }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={busy || optionsQuery.isLoading}
              className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-ink-200 px-6 py-10 text-center transition hover:border-brand-400 hover:bg-brand-50/40 disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-8 animate-spin text-brand-500" /> : <Upload className="size-8 text-brand-500" />}
              <span className="text-sm font-semibold text-ink-900">Choose an .xlsx, .xls or .csv file</span>
              <span className="text-xs text-ink-500">Maximum 5 MB and 5,000 data rows. Formulas are never evaluated.</span>
            </button>
            {workbook ? (
              <div className="rounded-lg border border-ink-100 bg-ink-50 px-4 py-3 text-sm text-ink-700">
                <FileSpreadsheet className="mr-2 inline size-4 text-brand-600" />
                <strong>{workbook.fileName}</strong> · {workbook.sheets.length} worksheet(s)
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { void downloadSampleTemplate(options?.customFields ?? []) }}
              >
                <Download className="size-4" /> Download sample Excel template
              </Button>
              <Button type="button" disabled={!workbook || busy} onClick={() => setStepIndex(1)}>
                Next: map columns <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        ) : null}

        {step === 'Map columns' && sheet && options ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="import-sheet">Worksheet</Label>
                <Select
                  id="import-sheet"
                  value={String(sheetIndex)}
                  onChange={(event) => selectSheet(Number(event.target.value))}
                >
                  {workbook?.sheets.map((item, index) => (
                    <option key={item.name} value={index}>{item.name} ({item.rows.length} rows)</option>
                  ))}
                </Select>
              </div>
              <div className="flex items-end">
                <p className="text-xs text-ink-500">
                  Row {sheet.headerRowIndex + 1} is treated as the header. Source, owner and tag
                  names are resolved inside this business. Unknown custom fields are rejected.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-ink-100">
              <table className="w-full text-left text-sm">
                <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
                  <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Spreadsheet header</th><th className="px-3 py-2">Example</th><th className="px-3 py-2">Import as</th></tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {(sheet.rows[sheet.headerRowIndex] ?? []).map((header, index) => (
                    <tr key={index}>
                      <td className="px-3 py-2 text-xs text-ink-400">{index + 1}</td>
                      <td className="px-3 py-2 font-medium text-ink-800">{header || `Column ${index + 1}`}</td>
                      <td className="max-w-52 truncate px-3 py-2 text-xs text-ink-500">
                        {sheet.rows[sheet.headerRowIndex + 1]?.[index] ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          aria-label={`Map ${header || `column ${index + 1}`}`}
                          value={mapping[index] ?? ''}
                          onChange={(event) => {
                            const next = { ...mapping }
                            if (event.target.value) next[index] = event.target.value
                            else delete next[index]
                            setMapping(next)
                          }}
                        >
                          <option value="">Do not import</option>
                          {availableFields(options).map((field) => (
                            <option key={field.key} value={field.key}>{field.label}</option>
                          ))}
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-500">
              {validations.length} data row(s) detected · {invalidRows.length} invalid before server checks.
            </p>
            <div className="flex justify-between gap-2">
              <Button type="button" variant="ghost" onClick={() => setStepIndex(0)}>
                <ArrowLeft className="size-4" /> Back
              </Button>
              <Button
                type="button"
                disabled={busy || !Object.values(mapping).includes('first_name')}
                onClick={() => { void goToDuplicates() }}
              >
                Next: duplicates <ArrowRight className="size-4" />
              </Button>
            </div>
            {!Object.values(mapping).includes('first_name') ? (
              <p className="text-right text-xs text-amber-600">Map at least one First name column to continue.</p>
            ) : null}
          </div>
        ) : null}

        {step === 'Duplicates' ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-ink-50 px-4 py-3 text-sm text-ink-700">
              {duplicateCount} of {validRows.length} valid row(s) match an existing record in this business.
            </div>
            {duplicates.length > 0 ? (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-ink-100 px-4 py-2 text-sm">
                {duplicates.slice(0, 50).map((item) => (
                  <li key={`${item.rowNumber}-${item.contactId}`} className="flex justify-between gap-3 py-1">
                    <span className="text-ink-700">Row {item.rowNumber} → {item.name}</span>
                    <Badge variant="warning">match by {item.matchType}</Badge>
                  </li>
                ))}
              </ul>
            ) : null}
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-semibold text-ink-800">How should duplicates be handled?</legend>
              {DUPLICATE_MODES.map((mode) => (
                <label key={mode.value} className="flex cursor-pointer gap-3 rounded-lg border border-ink-100 px-3 py-2 has-checked:border-brand-400 has-checked:bg-brand-50/40">
                  <input
                    type="radio"
                    name="duplicate-mode"
                    className="mt-1 accent-brand-600"
                    checked={duplicateMode === mode.value}
                    onChange={() => setDuplicateMode(mode.value)}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-ink-800">{mode.label}</span>
                    <span className="block text-xs text-ink-500">{mode.help}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {duplicateMode === 'new' ? (
              <label className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <input
                  type="checkbox"
                  className="mt-1 accent-amber-600"
                  checked={confirmedNew}
                  onChange={(event) => setConfirmedNew(event.target.checked)}
                />
                I explicitly confirm that duplicates should be imported as new records.
              </label>
            ) : null}
            <div className="flex justify-between gap-2">
              <Button type="button" variant="ghost" onClick={() => setStepIndex(1)}>
                <ArrowLeft className="size-4" /> Back
              </Button>
              <Button type="button" onClick={() => setStepIndex(3)}>
                Next: preview <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        ) : null}

        {step === 'Preview' ? (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <strong className="block text-lg">{validRows.length - duplicateCount}</strong> new / updateable
              </div>
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <strong className="block text-lg">{duplicateCount}</strong> duplicates ({duplicateMode})
              </div>
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                <strong className="block text-lg">{invalidRows.length}</strong> invalid rows (excluded)
              </div>
            </div>
            <div className="max-h-72 overflow-auto rounded-lg border border-ink-100">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-ink-50 uppercase tracking-wide text-ink-500">
                  <tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Email / phone</th><th className="px-3 py-2">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {validations.slice(0, 100).map((row) => (
                    <tr key={row.rowNumber}>
                      <td className="px-3 py-2 text-ink-400">{row.rowNumber}</td>
                      <td className="px-3 py-2 font-medium text-ink-800">{row.values.first_name} {row.values.last_name}</td>
                      <td className="px-3 py-2 text-ink-600">{row.values.email || row.values.phone || '—'}</td>
                      <td className="px-3 py-2">
                        {row.errors.length > 0 ? (
                          <Badge variant="danger">{row.errors.join('; ')}</Badge>
                        ) : duplicateByRow.has(row.rowNumber) ? (
                          <Badge variant="warning">duplicate</Badge>
                        ) : (
                          <Badge variant="success">ready</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {validations.length > 100 ? (
                <p className="px-3 py-2 text-xs text-ink-500">Showing the first 100 rows; all rows are imported.</p>
              ) : null}
            </div>
            <div className="flex justify-between gap-2">
              <Button type="button" variant="ghost" onClick={() => setStepIndex(2)}>
                <ArrowLeft className="size-4" /> Back
              </Button>
              <Button
                type="button"
                disabled={busy || validRows.length === 0 || (duplicateMode === 'new' && !confirmedNew)}
                onClick={() => { void runImport() }}
              >
                Confirm import of {validRows.length} row(s) <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        ) : null}

        {step === 'Progress' ? (
          <div className="space-y-4 py-6 text-center">
            {error ? <AlertTriangle className="mx-auto size-8 text-red-500" /> : <Loader2 className="mx-auto size-8 animate-spin text-brand-600" />}
            <p className="text-sm font-semibold text-ink-800">
              {error ? 'The import stopped with an error.' : 'Importing records in safe batches…'}
            </p>
            <div className="mx-auto h-2 w-full max-w-md overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full rounded-full bg-brand-600 transition-all"
                style={{ width: `${validRows.length ? Math.min(100, (processed / validRows.length) * 100) : 0}%` }}
              />
            </div>
            <p className="text-xs text-ink-500">{processed} of {validRows.length} row(s) processed</p>
            {error ? (
              <Button type="button" variant="outline" onClick={() => setStepIndex(3)}>Review and retry</Button>
            ) : null}
          </div>
        ) : null}

        {step === 'Summary' && summary ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="size-6" />
              <h3 className="text-lg font-semibold">Import complete</h3>
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              {[
                ['Created', summary.created],
                ['Updated', summary.updated],
                ['Skipped', summary.skipped],
                ['Failed', summary.failed],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border border-ink-100 px-3 py-2">
                  <p className="text-xs text-ink-500">{label}</p>
                  <p className="text-lg font-bold text-ink-900">{String(value)}</p>
                </div>
              ))}
            </div>
            {reportRows.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadCsv(`flowsuite-import-errors-${jobId ?? 'report'}.csv`, errorReportRows(reportRows))}
              >
                <Download className="size-4" /> Download error report ({reportRows.length})
              </Button>
            ) : null}
            <div className="flex justify-end">
              <Button type="button" onClick={close}>Done</Button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

type ImportRowBatch = Parameters<typeof processBatch>[2]
