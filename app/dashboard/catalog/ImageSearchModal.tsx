'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'
import type {
  CatalogProductSearchHit,
} from '@/lib/supabase/types'

const MAX_BYTES = 5 * 1024 * 1024

type Tab = 'upload' | 'url'

export interface ImageSearchResult {
  results: CatalogProductSearchHit[]
  query_description: string
}

export default function ImageSearchModal({
  open,
  onClose,
  onResults,
}: {
  open: boolean
  onClose: () => void
  onResults: (r: ImageSearchResult) => void
}) {
  const [tab, setTab] = useState<Tab>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setTab('upload')
      setFile(null)
      setUrl('')
      setPreviewSrc(null)
      setSubmitting(false)
    }
  }, [open])

  useEffect(() => {
    if (!file) {
      if (tab === 'upload') setPreviewSrc(null)
      return
    }
    const obj = URL.createObjectURL(file)
    setPreviewSrc(obj)
    return () => URL.revokeObjectURL(obj)
  }, [file, tab])

  const onPickFile = (f: File | undefined) => {
    if (!f) return
    if (f.size > MAX_BYTES) {
      toast.error('Image must be 5 MB or smaller')
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
      toast.error('Use a JPEG, PNG, or WebP image')
      return
    }
    setFile(f)
  }

  const submit = async () => {
    setSubmitting(true)
    try {
      let res: Response
      if (tab === 'upload') {
        if (!file) {
          toast.error('Pick an image first')
          setSubmitting(false)
          return
        }
        const fd = new FormData()
        fd.append('image', file)
        res = await fetch('/api/catalog/search/image', {
          method: 'POST',
          body: fd,
        })
      } else {
        if (!url.trim()) {
          toast.error('Paste an image URL')
          setSubmitting(false)
          return
        }
        res = await fetch('/api/catalog/search/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_url: url.trim() }),
        })
      }
      const body = await res.json()
      if (!res.ok) {
        const msg =
          body?.error?.message ?? `Image search failed (HTTP ${res.status})`
        toast.error(msg)
        setSubmitting(false)
        return
      }
      onResults(body.data as ImageSearchResult)
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Search by image">
      <div className="flex gap-px bg-ink/10 rounded-sm overflow-hidden w-fit mb-5">
        {(
          [
            ['upload', 'Upload image'],
            ['url', 'Paste URL'],
          ] as Array<[Tab, string]>
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            disabled={submitting}
            className={[
              'font-sans text-[10px] uppercase tracking-[0.22em] px-5 py-2.5 transition-colors',
              tab === k
                ? 'bg-ink text-bg'
                : 'bg-bg text-ink-muted hover:text-ink',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {submitting ? (
        <AnalyzingProgress />
      ) : tab === 'upload' ? (
        <div className="mb-5">
          {previewSrc ? (
            <PreviewBlock
              src={previewSrc}
              onClear={() => {
                setFile(null)
                setPreviewSrc(null)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border border-dashed border-line-strong px-6 py-12 hover:border-ink/50 hover:bg-ink/[0.03] transition-colors text-center"
            >
              <div className="font-serif text-[1.05rem]">
                Pick an image
              </div>
              <div className="font-garamond text-[0.9rem] text-ink-muted mt-1">
                JPEG, PNG, or WebP — up to 5 MB
              </div>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => onPickFile(e.target.files?.[0])}
          />
        </div>
      ) : (
        <div className="mb-5 space-y-4">
          <Field label="Image URL">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/product.jpg"
              autoFocus
            />
          </Field>
          <div className="font-garamond text-[0.9rem] text-ink-muted">
            We fetch the image server-side, send it to the vision model,
            and search the catalog for visually similar products.
          </div>
        </div>
      )}

      {!submitting ? (
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={tab === 'upload' ? !file : !url.trim()}
          >
            Search
          </Button>
        </div>
      ) : null}
    </Modal>
  )
}

function PreviewBlock({ src, onClear }: { src: string; onClear: () => void }) {
  return (
    <div className="border border-line p-4 flex gap-4 items-start">
      <div className="w-32 h-32 bg-ink/[0.05] shrink-0 relative overflow-hidden">
        <Image src={src} alt="" fill sizes="128px" className="object-cover" unoptimized />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-garamond text-[0.95rem] text-ink">
          Ready to search.
        </div>
        <div className="font-garamond text-[0.85rem] text-ink-muted mt-1">
          We&apos;ll analyze this image and find visually similar products in
          the master catalog.
        </div>
        <button
          onClick={onClear}
          className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted hover:text-ink mt-3"
        >
          Choose a different image
        </button>
      </div>
    </div>
  )
}

// Animated progress bar instead of a spinner, per the spec — gives the
// designer some sense of forward motion during the ~2–4s vision call.
function AnalyzingProgress() {
  return (
    <div className="py-10">
      <div className="font-serif text-[1.1rem] text-center mb-1">
        Analyzing image…
      </div>
      <div className="font-garamond text-[0.9rem] text-ink-muted text-center mb-5">
        Describing the product and searching the catalog.
      </div>
      <div className="relative h-[3px] bg-ink/10 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 w-1/3 bg-ink/70"
          style={{ animation: 'hm-image-search-slide 1.6s ease-in-out infinite' }}
        />
      </div>
      <style>{`@keyframes hm-image-search-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }`}</style>
    </div>
  )
}
