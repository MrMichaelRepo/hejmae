'use client'

import { useEffect, useState } from 'react'
import { Drawer } from '@/components/ui/Modal'
import { Input, Textarea, Label } from '@/components/ui/Input'
import { api, ApiError } from '@/lib/api'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { toast } from '@/components/ui/Toast'
import type { AdminCatalogRow } from '@/lib/admin/catalog'

type EditableField =
  | 'name'
  | 'vendor'
  | 'brand'
  | 'item_type'
  | 'style_tag'
  | 'description'
  | 'image_url'
  | 'source_url'
  | 'retail_price_dollars'

export default function EditDrawer({
  open,
  row,
  onClose,
  onSaved,
}: {
  open: boolean
  row: AdminCatalogRow | null
  onClose: () => void
  onSaved: (row: AdminCatalogRow) => void
}) {
  const [form, setForm] = useState<Record<EditableField, string>>({
    name: '',
    vendor: '',
    brand: '',
    item_type: '',
    style_tag: '',
    description: '',
    image_url: '',
    source_url: '',
    retail_price_dollars: '',
  })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const confirm = useConfirm()

  useEffect(() => {
    if (open && row) {
      setForm({
        name: row.name ?? '',
        vendor: row.vendor ?? '',
        brand: row.brand ?? '',
        item_type: row.item_type ?? '',
        style_tag: row.style_tag ?? '',
        description: row.description ?? '',
        image_url: row.image_url ?? '',
        source_url: row.source_url ?? '',
        retail_price_dollars:
          row.retail_price_cents != null
            ? (row.retail_price_cents / 100).toFixed(2)
            : '',
      })
      setDirty(false)
    }
  }, [open, row])

  const set = (k: EditableField, v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    setDirty(true)
  }

  const tryClose = async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Discard unsaved changes?',
        confirmLabel: 'Discard',
        tone: 'danger',
      })
      if (!ok) return
    }
    onClose()
  }

  const onSave = async () => {
    if (!row) return
    setSaving(true)
    try {
      const patch: Record<string, unknown> = {
        name: form.name.trim(),
        vendor: form.vendor.trim() || null,
        brand: form.brand.trim() || null,
        item_type: form.item_type.trim() || null,
        style_tag: form.style_tag.trim() || null,
        description: form.description.trim() || null,
        image_url: form.image_url.trim() || null,
        source_url: form.source_url.trim() || null,
      }
      const priceRaw = form.retail_price_dollars.trim()
      if (priceRaw === '') {
        patch.retail_price_cents = null
      } else {
        const cents = Math.round(Number(priceRaw) * 100)
        if (!Number.isFinite(cents) || cents < 0) {
          toast.error('Invalid retail price')
          setSaving(false)
          return
        }
        patch.retail_price_cents = cents
      }

      const res = await api.patch<AdminCatalogRow>(
        `/api/admin/catalog/${row.id}`,
        patch,
      )
      if (res.data) {
        onSaved({
          ...row,
          ...(res.data as Partial<AdminCatalogRow>),
        } as AdminCatalogRow)
        setDirty(false)
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const onRegenerate = async () => {
    if (!row) return
    setRegenerating(true)
    try {
      await api.post(`/api/admin/catalog/${row.id}/regenerate-embedding`, {})
      toast.success('Embedding refresh queued')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed')
    } finally {
      setRegenerating(false)
    }
  }

  if (!row) return null

  return (
    <Drawer
      open={open}
      onClose={tryClose}
      title="Edit catalog product"
      width={560}
    >
      <div className="space-y-5">
        <FormField label="Name">
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Vendor">
            <Input
              value={form.vendor}
              onChange={(e) => set('vendor', e.target.value)}
            />
          </FormField>
          <FormField label="Retail price (USD)">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.retail_price_dollars}
              onChange={(e) => set('retail_price_dollars', e.target.value)}
            />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Brand">
            <Input
              value={form.brand}
              onChange={(e) => set('brand', e.target.value)}
            />
          </FormField>
          <FormField label="Item type">
            <Input
              value={form.item_type}
              onChange={(e) => set('item_type', e.target.value)}
            />
          </FormField>
        </div>
        <FormField label="Description">
          <Textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={4}
          />
        </FormField>
        <FormField label="Style tag">
          <Input
            value={form.style_tag}
            onChange={(e) => set('style_tag', e.target.value)}
            placeholder="Mid-century modern"
          />
        </FormField>
        <FormField label="Image URL or storage path">
          <Input
            value={form.image_url}
            onChange={(e) => set('image_url', e.target.value)}
          />
        </FormField>
        <FormField label="Source URL">
          <Input
            value={form.source_url}
            onChange={(e) => set('source_url', e.target.value)}
          />
        </FormField>

        <div className="pt-4 border-t border-line space-y-2">
          <Meta label="ID" value={row.id} />
          <Meta
            label="Created"
            value={new Date(row.created_at).toLocaleString()}
          />
          <Meta label="Clipped count" value={String(row.clipped_count)} />
          <Meta
            label="Embedding"
            value={
              row.has_embedding && row.embedding_updated_at
                ? `Updated ${new Date(row.embedding_updated_at).toLocaleString()}`
                : 'Not generated'
            }
          />
          {row.merged_into_id ? (
            <Meta
              label="Merged into"
              value={row.merged_into_name ?? row.merged_into_id}
            />
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-4">
          <button
            onClick={onSave}
            disabled={saving || !dirty}
            className="font-sans text-[10px] uppercase tracking-[0.22em] bg-ink text-bg hover:bg-ink/90 px-4 py-2 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted hover:text-ink border border-line hover:border-line-strong px-4 py-2"
          >
            {regenerating ? 'Queuing…' : 'Regenerate embedding'}
          </button>
          {row.source_url ? (
            <a
              href={row.source_url}
              target="_blank"
              rel="noreferrer"
              className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted hover:text-ink ml-auto"
            >
              View source ↗
            </a>
          ) : null}
        </div>
      </div>
    </Drawer>
  )
}

function FormField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 font-sans text-[10px] uppercase tracking-[0.2em]">
      <span className="text-ink-muted">{label}</span>
      <span className="text-ink truncate max-w-[60%]">{value}</span>
    </div>
  )
}
