'use client'

// Combined image input — file upload OR pasted URL.
//
// Storage model: the bucket is private, so we persist a storage *path* in
// the DB and resolve it to a signed URL at read time. This component:
//   * receives `value` = the stored value (path OR external https URL)
//   * receives `displayUrl` = a pre-resolved signed URL for paths (parent
//     gets this from the API/server component when loading existing data)
//   * fires `onChange(storageValue)` with what should be persisted —
//     after upload, that's the path; after paste-a-URL, that's the URL
//
// After a fresh upload we also have the just-minted signedUrl in hand, so
// we keep it in local state to render immediately without round-tripping.
import { useRef, useState } from 'react'
import Image from 'next/image'
import Button from './Button'
import { toast } from './Toast'

interface Props {
  // Storage value (path within hejmae bucket, OR external https URL).
  value: string | null
  // Pre-resolved signed URL for `value` when it's a path. Optional — if
  // unset and `value` is a path, the component renders a placeholder
  // (the parent should provide displayUrl from server-side resolution).
  displayUrl?: string | null
  onChange: (storageValue: string | null) => void
  projectId: string
  // Sub-folder for storage path (e.g. itemId or 'new').
  ownerId?: string
  kind?: 'item-image' | 'doc'
  label?: string
  hint?: string
}

export default function ImageUploader({
  value,
  displayUrl,
  onChange,
  projectId,
  ownerId,
  kind = 'item-image',
  label = 'Image',
  hint,
}: Props) {
  const [showUrl, setShowUrl] = useState(false)
  const [urlDraft, setUrlDraft] = useState(
    isExternalUrl(value) ? value! : '',
  )
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  // Locally cached signedUrl for the most recent upload, so the preview
  // renders without waiting for the parent to refresh `displayUrl`.
  const [localDisplay, setLocalDisplay] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Compute what to render: external URL goes as-is; path needs the
  // pre-resolved signedUrl (or our local cache after a fresh upload).
  const renderSrc = isExternalUrl(value)
    ? value
    : value
      ? localDisplay ?? displayUrl ?? null
      : null

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('kind', kind)
      if (ownerId) fd.set('owner_id', ownerId)
      const res = await fetch(`/api/projects/${projectId}/uploads`, {
        method: 'POST',
        body: fd,
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error?.message ?? `Upload failed (${res.status})`)
      const path = body?.data?.path as string | undefined
      const signed = body?.data?.signedUrl as string | undefined
      if (!path) throw new Error('Upload succeeded but no path returned')
      setLocalDisplay(signed ?? null)
      onChange(path)
      toast.success('Image uploaded')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mb-5">
      {label ? (
        <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-2">
          {label}
        </div>
      ) : null}

      {value ? (
        <div className="border border-line p-3 mb-3 flex gap-3 items-start">
          <div className="w-20 h-20 bg-ink/[0.05] shrink-0 overflow-hidden relative">
            {renderSrc ? (
              <Image
                src={renderSrc}
                alt=""
                fill
                sizes="80px"
                className="object-cover"
                unoptimized
              />
            ) : null}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-garamond text-[0.85rem] text-ink-muted truncate">
              {isExternalUrl(value) ? value : 'Uploaded asset'}
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => inputRef.current?.click()}
                className="font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:text-ink"
                type="button"
              >
                Replace
              </button>
              <button
                onClick={() => {
                  setLocalDisplay(null)
                  onChange(null)
                }}
                className="font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:text-danger"
                type="button"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const f = e.dataTransfer.files?.[0]
            if (f) upload(f)
          }}
          onClick={() => inputRef.current?.click()}
          className={[
            'border-2 border-dashed cursor-pointer p-5 text-center transition-colors mb-2',
            dragging
              ? 'border-ink bg-ink/[0.04]'
              : 'border-line hover:border-line-strong',
          ].join(' ')}
        >
          <div className="font-garamond text-[0.95rem]">
            {uploading ? 'Uploading…' : 'Drop an image or click to browse'}
          </div>
          <div className="font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted mt-1">
            JPG · PNG · WebP · max 25 MB
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) upload(f)
          e.target.value = ''
        }}
      />

      {!value ? (
        <div className="flex justify-end -mt-1 mb-1">
          <button
            type="button"
            onClick={() => setShowUrl((s) => !s)}
            className="font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:text-ink"
          >
            {showUrl ? 'Hide URL field' : 'Or paste a URL'}
          </button>
        </div>
      ) : null}

      {showUrl && !value ? (
        <div className="flex gap-2">
          <input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="https://…"
            className="flex-1 bg-transparent border border-line rounded-sm px-3.5 py-2.5 font-garamond text-[1rem] text-ink placeholder:text-ink-muted/50 focus:outline-none focus:border-ink/60 transition-colors"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              if (!urlDraft.trim()) return
              onChange(urlDraft.trim())
              setShowUrl(false)
            }}
          >
            Use URL
          </Button>
        </div>
      ) : null}

      {hint ? (
        <div className="mt-1.5 font-garamond text-[0.85rem] text-ink-subtle">{hint}</div>
      ) : null}
    </div>
  )
}

function isExternalUrl(v: string | null | undefined): boolean {
  return !!v && /^https?:\/\//i.test(v)
}
