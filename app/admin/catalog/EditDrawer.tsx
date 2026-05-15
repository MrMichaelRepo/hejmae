'use client'

import { useEffect, useState } from 'react'
import { Drawer } from '@/components/ui/Modal'
import { Input, Textarea, Label } from '@/components/ui/Input'
import { api, ApiError } from '@/lib/api'
import { toast } from '@/components/ui/Toast'
import type { AdminCatalogRow } from '@/lib/admin/catalog'

type EditableField =
  | 'name'
  | 'vendor'
  | 'category'
  | 'item_type'
  | 'description'
  | 'image_url'
  | 'source_url'
  | 'retail_price_dollars'
  | 'style_tags_csv'

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
    category: '',
    item_type: '',
    description: '',
    image_url: '',
    source_url: '',
    retail_price_dollars: '',
    style_tags_csv: '',
  })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  useEffect(() => {
    if (open && row) {
      setForm({
        name: row.name ?? '',
        vendor: row.vendor ?? '',
        category: row.category ?? '',
        item_type: row.item_type ?? '',
        description: row.description ?? '',
        image_url: row.image_url ?? '',
        source_url: row.source_url ?? '',
        retail_price_dollars:
          row.retail_price_cents != null
            ? (row.retail_price_cents / 100).toFixed(2)
            : '',
        style_tags_csv: (row.style_tags ?? []).join(', '),
      })
      setDirty(false)
    }
  }, [open, row])

  const set = (k: EditableField, v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    setDirty(true)
  }

  const tryClose = () => {
    if (dirty) {
      const ok = window.confirm('Discard unsaved changes?')
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
        category: form.category.trim() || null,
        item_type: form.item_type.trim() || null,
        description: form.description.trim() || null,
        image_url: form.image_url.trim() || null,
        source_url: form.source_url.trim() || null,
        style_tags: form.style_tags_csv
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
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
          <FormField label="Category">
            <Input
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
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
        <FormField label="Style tags (comma separated)">
          <Input
            value={form.style_tags_csv}
            onChange={(e) => set('style_tags_csv', e.target.value)}
            placeholder="modern, brass, ceiling-mount"
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

        <div className="pt-4 border-t border-hm-text/10 space-y-2">
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
            className="font-sans text-[10px] uppercase tracking-[0.22em] bg-hm-text text-bg hover:bg-hm-text/90 px-4 py-2 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav hover:text-hm-text border border-hm-text/15 hover:border-hm-text/40 px-4 py-2"
          >
            {regenerating ? 'Queuing…' : 'Regenerate embedding'}
          </button>
          {row.source_url ? (
            <a
              href={row.source_url}
              target="_blank"
              rel="noreferrer"
              className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav hover:text-hm-text ml-auto"
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
      <span className="text-hm-nav">{label}</span>
      <span className="text-hm-text truncate max-w-[60%]">{value}</span>
    </div>
  )
}
