import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, ExternalLink, FileText, Trash2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { getErrorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import {
  allowedPatientDocumentMimeTypes,
  deletePatientDocument,
  extensionForMimeType,
  fetchPatientDocuments,
  uploadPatientDocument,
} from '../patientDocuments'

type PendingFile = {
  id: string
  blob: Blob
  label: string
  source: 'camera' | 'upload'
  previewUrl: string | null
}

type Props = {
  tenantId: string
  contactId: string
  onChanged: () => void
}

function formatBytes(size: number | null): string {
  if (size === null) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

/** Sensitive patient scans. All storage access goes through RLS-scoped APIs. */
export function PatientFilesPanel({ tenantId, contactId, onChanged }: Props) {
  const queryClient = useQueryClient()
  const queryKey = ['crm', tenantId, 'contact', contactId, 'patient-documents'] as const
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const pendingRef = useRef<PendingFile[]>([])
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingFile[]>([])

  const documentsQuery = useQuery({
    queryKey,
    queryFn: () => fetchPatientDocuments(tenantId, contactId),
    enabled: Boolean(tenantId && contactId),
  })

  useEffect(() => {
    pendingRef.current = pending
  }, [pending])

  useEffect(() => {
    const activeStream = streamRef.current
    const activeUrls = pendingRef.current.map((item) => item.previewUrl).filter(Boolean) as string[]
    return () => {
      activeStream?.getTracks().forEach((track) => track.stop())
      activeUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOn(false)
  }

  async function startCamera() {
    setCameraError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera capture is not available in this browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream
      setCameraOn(true)
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play().catch(() => undefined)
      }
    } catch (error) {
      setCameraError(getErrorMessage(error))
    }
  }

  function capturePage() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video?.videoWidth || !canvas) {
      setCameraError('The camera is not ready yet.')
      return
    }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) {
      setCameraError('Could not capture this frame.')
      return
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraError('Could not capture this frame.')
        return
      }
      const pageNumber = pending.filter((item) => item.source === 'camera').length + 1
      setPending((current) => [...current, {
        id: crypto.randomUUID(),
        blob,
        label: `Scan page ${pageNumber}`,
        source: 'camera',
        previewUrl: URL.createObjectURL(blob),
      }])
      setCameraError(null)
    }, 'image/jpeg', 0.85)
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return

    const allowed = allowedPatientDocumentMimeTypes()
    const valid = files.filter((file) => allowed.includes(file.type) && file.size > 0)
    if (valid.length !== files.length) {
      setFileError('Only PDF, JPG, PNG and WebP files are supported.')
    } else {
      setFileError(null)
    }
    setPending((current) => [
      ...current,
      ...valid.map((file) => ({
        id: crypto.randomUUID(),
        blob: file,
        label: file.name,
        source: 'upload' as const,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      })),
    ])
  }

  function removePending(id: string) {
    setPending((current) => {
      const item = current.find((entry) => entry.id === id)
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
      return current.filter((entry) => entry.id !== id)
    })
  }

  const uploadMutation = useMutation({
    mutationFn: async (items: PendingFile[]) => {
      for (const item of items) {
        const extension = extensionForMimeType(item.blob.type)
        await uploadPatientDocument(
          tenantId,
          contactId,
          item.blob,
          item.label,
          item.source,
          extension ?? undefined,
        )
      }
    },
    onSuccess: async () => {
      pendingRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
      })
      pendingRef.current = []
      setPending([])
      setFileError(null)
      await queryClient.invalidateQueries({ queryKey })
      onChanged()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (path: string) => deletePatientDocument(tenantId, contactId, path),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
      onChanged()
    },
  })

  const actionError = uploadMutation.error || deleteMutation.error

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <FileText className="mt-0.5 size-4 shrink-0" />
        <p>
          Patient scans and documents are sensitive. Only owners, admins and doctors can open them. Files are private,
          access is logged, and they are never sent to AI chat, marketing messages or public booking pages.
        </p>
      </div>

      <div className="rounded-lg border border-ink-200 p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold text-ink-900">
          <Camera className="size-4 text-brand-600" /> Scan or choose files
        </h3>
        <video
          ref={videoRef}
          className={`aspect-video w-full rounded-lg bg-ink-900 ${cameraOn ? '' : 'hidden'}`}
          playsInline
          muted
          autoPlay
        />
        <canvas ref={canvasRef} className="hidden" />
        {cameraError ? <p className="mt-2 text-sm text-red-600">{cameraError}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {cameraOn ? (
            <>
              <Button type="button" size="sm" onClick={capturePage}><Camera className="size-3.5" /> Capture page</Button>
              <Button type="button" size="sm" variant="outline" onClick={stopCamera}>Stop camera</Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => void startCamera()}>
              <Camera className="size-3.5" /> Start camera
            </Button>
          )}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-ink-300 px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
            <Upload className="size-3.5" /> Choose files
            <input
              type="file"
              className="hidden"
              multiple
              accept={allowedPatientDocumentMimeTypes().join(',')}
              onChange={onFileChange}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-ink-500">PDF, JPG, PNG or WebP · up to 10 MB each · camera needs HTTPS or localhost.</p>
        {fileError ? <p className="mt-2 text-sm text-red-600">{fileError}</p> : null}

        {pending.length ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium text-ink-700">Ready to save ({pending.length})</p>
            <ul className="space-y-2">
              {pending.map((item) => (
                <li key={item.id} className="flex items-center gap-3 rounded-lg bg-ink-50 p-2">
                  {item.previewUrl ? (
                    <img src={item.previewUrl} alt="" className="size-10 rounded object-cover" />
                  ) : (
                    <FileText className="size-5 text-ink-400" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-700">{item.label}</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => removePending(item.id)} aria-label={`Remove ${item.label}`}>
                    <X className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                loading={uploadMutation.isPending}
                disabled={uploadMutation.isPending}
                onClick={() => uploadMutation.mutate(pending)}
              >
                Save {pending.length} {pending.length === 1 ? 'file' : 'files'}
              </Button>
            </div>
          </div>
        ) : null}
        {actionError ? <p className="mt-3 text-sm text-red-600">{getErrorMessage(actionError)}</p> : null}
      </div>

      <div>
        <h3 className="mb-3 font-semibold text-ink-900">Saved patient files</h3>
        {documentsQuery.isLoading ? (
          <div className="space-y-2">{[0, 1].map((index) => <Skeleton key={index} className="h-14" />)}</div>
        ) : documentsQuery.isError ? (
          <ErrorState
            message={getErrorMessage(documentsQuery.error)}
            onRetry={() => void documentsQuery.refetch()}
          />
        ) : !documentsQuery.data?.length ? (
          <EmptyState
            icon={<FileText className="size-5" />}
            title="No patient files yet"
            description="Scan a page with the camera or choose an existing file to attach it to this patient."
          />
        ) : (
          <ul className="space-y-2">
            {documentsQuery.data.map((document) => (
              <li key={document.path} className="flex items-center gap-3 rounded-lg border border-ink-200 p-3">
                <FileText className="size-5 shrink-0 text-brand-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">
                    {document.originalName ?? document.name}
                  </p>
                  <p className="text-xs text-ink-500">
                    {document.createdAt ? formatDateTime(document.createdAt) : 'Date unknown'}
                    {document.size !== null ? ` · ${formatBytes(document.size)}` : ''}
                  </p>
                </div>
                <a
                  href={document.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-ink-300 px-2 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50"
                >
                  <ExternalLink className="size-3" /> Open
                </a>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(document.path)}
                  aria-label={`Delete ${document.originalName ?? document.name}`}
                >
                  <Trash2 className="size-3.5 text-red-600" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
