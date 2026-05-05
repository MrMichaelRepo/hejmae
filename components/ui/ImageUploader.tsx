'use client'

// Combined image input — file upload OR pasted URL.
// onChange fires with the final URL once it's resolved (uploaded or typed).
import { useRef, useState } from 'react'
import Button from './Button'
import { toast } from './Toast'

interface Props {
  value: string | null
  onChange: (url: string | null) => void
  projectId: string
  // Sub-folder for storage path (e.g. itemId or 'new').
  ownerId?: string
  kind?: 'item-image' | 'doc'
  label?: string
  hint?: string
}

export default function ImageUploader({
  value,
  onChange,
  projectId,
  ownerId,
  kind = 'item-image',
  label = 'Image',
  hint,
}: Props) {
  const [showUrl, setShowUrl] = useState(false)
  const [urlDraft, setUrlDraft] = useState(value ?? '')
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

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
      const url = body?.data?.publicUrl as string | undefined
      if (!url) throw new Error('Upload succeeded but no URL returned')
      onChange(url)
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
        <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-2">
          {label}
        </div>
      ) : null}

      {value ? (
        <div className="border border-hm-text/10 p-3 mb-3 flex gap-3 items-start">
          <div className="w-20 h-20 bg-hm-text/[0.05] shrink-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-garamond text-[0.85rem] text-hm-nav truncate">
              {value}
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => inputRef.current?.click()}
                className="font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav hover:text-hm-text"
                type="button"
              >
                Replace
              </button>
              <button
                onClick={() => onChange(null)}
                className="font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav hover:text-red-700"
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
              ? 'border-hm-text bg-hm-text/[0.04]'
              : 'border-hm-text/15 hover:border-hm-text/40',
          ].join(' ')}
        >
          <div className="font-garamond text-[0.95rem]">
            {uploading ? 'Uploading…' : 'Drop an image or click to browse'}
          </div>
          <div className="font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav mt-1">
            JPG · PNG · WebP · max 25 MB
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml"
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
            className="font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav hover:text-hm-text"
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
            className="flex-1 bg-transparent border border-hm-text/15 rounded-sm px-3.5 py-2.5 font-garamond text-[1rem] text-hm-text placeholder:text-hm-nav/50 focus:outline-none focus:border-hm-text/60 transition-colors"
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
        <div className="mt-1.5 font-garamond text-[0.85rem] text-hm-nav/70">{hint}</div>
      ) : null}
    </div>
  )
}
