'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, ApiError } from '@/lib/api'
import { PageHeader } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import Button from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'

type Role = 'owner' | 'admin' | 'member'

type Permission =
  | 'finances:view'
  | 'finances:record_payments'
  | 'finances:manage_invoices'
  | 'po:manage'
  | 'team:manage'

const PERMISSION_LABELS: Record<Permission, string> = {
  'finances:view': 'View finances',
  'finances:record_payments': 'Record payments',
  'finances:manage_invoices': 'Manage invoices',
  'po:manage': 'Manage purchase orders',
  'team:manage': 'Manage team',
}

const ALL_PERMISSIONS: Permission[] = [
  'finances:view',
  'finances:record_payments',
  'finances:manage_invoices',
  'po:manage',
  'team:manage',
]

interface Member {
  id: string
  role: Role
  permissions: Permission[]
  joined_at: string
  user: { id: string; name: string | null; email: string }
}

interface Invite {
  id: string
  email: string
  role: Role
  invited_at: string
}

interface TeamData {
  studio_id: string
  my_role: Role
  members: Member[]
  invites: Invite[]
}

export default function TeamSettingsPage() {
  const [data, setData] = useState<TeamData | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    try {
      const res = await api.get<TeamData>('/api/settings/team')
      setData((res.data as TeamData) ?? null)
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setData(null)
      } else {
        toast.error((e as Error).message)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  if (loading) return <PageSpinner />
  if (!data) {
    return (
      <div className="max-w-3xl">
        <PageHeader eyebrow="Settings" title="Team" />
        <div className="border border-hm-text/10 p-6 font-garamond text-[0.95rem] text-hm-nav">
          You don&apos;t have permission to manage this studio&apos;s team.
        </div>
      </div>
    )
  }

  const isAdmin = data.my_role === 'owner' || data.my_role === 'admin'

  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow="Settings"
        title="Team"
        subtitle="Invite collaborators and manage their access."
      />

      <div className="mb-6">
        <Link
          href="/dashboard/settings"
          className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav hover:text-hm-text"
        >
          ← Back to settings
        </Link>
      </div>

      {isAdmin ? <InviteForm onCreated={reload} /> : null}

      <Section title="Members">
        <div className="divide-y divide-hm-text/10">
          {data.members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              canEdit={isAdmin && m.role !== 'owner'}
              onChanged={reload}
            />
          ))}
        </div>
      </Section>

      {data.invites.length > 0 ? (
        <Section title="Pending invites">
          <div className="divide-y divide-hm-text/10">
            {data.invites.map((inv) => (
              <InviteRow
                key={inv.id}
                invite={inv}
                canRevoke={isAdmin}
                onChanged={reload}
              />
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  )
}

function InviteForm({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [perms, setPerms] = useState<Set<Permission>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  const togglePerm = (p: Permission) => {
    setPerms((s) => {
      const next = new Set(s)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  const submit = async () => {
    if (!email) return
    setSubmitting(true)
    try {
      await api.post('/api/settings/team/invites', {
        email,
        role,
        permissions: Array.from(perms),
      })
      toast.success('Invite sent')
      setEmail('')
      setPerms(new Set())
      setRole('member')
      onCreated()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Section title="Invite a teammate">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@studio.com"
          />
        </Field>
        <Field label="Role">
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value as 'admin' | 'member')}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
      </div>
      <Field
        label="Extra permissions"
        hint="Members can edit projects, rooms, items, and proposals by default. Toggle on the gates this person should also be able to use. Owners and admins always have team management."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {ALL_PERMISSIONS.filter((p) => p !== 'team:manage').map((p) => (
            <label
              key={p}
              className="flex items-center gap-2 font-garamond text-[0.95rem] text-hm-text cursor-pointer"
            >
              <input
                type="checkbox"
                checked={perms.has(p)}
                onChange={() => togglePerm(p)}
              />
              {PERMISSION_LABELS[p]}
            </label>
          ))}
        </div>
      </Field>
      <div className="flex justify-end">
        <Button variant="primary" onClick={submit} loading={submitting}>
          Send invite
        </Button>
      </div>
    </Section>
  )
}

function MemberRow({
  member,
  canEdit,
  onChanged,
}: {
  member: Member
  canEdit: boolean
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [role, setRole] = useState<Role>(member.role)
  const [perms, setPerms] = useState<Set<Permission>>(new Set(member.permissions))

  const togglePerm = (p: Permission) => {
    setPerms((s) => {
      const next = new Set(s)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  const save = async () => {
    setBusy(true)
    try {
      await api.patch(`/api/settings/team/members/${member.id}`, {
        role,
        permissions: Array.from(perms),
      })
      toast.success('Member updated')
      setEditing(false)
      onChanged()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!confirm(`Remove ${member.user.email} from the studio?`)) return
    setBusy(true)
    try {
      await api.del(`/api/settings/team/members/${member.id}`)
      toast.success('Member removed')
      onChanged()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="font-garamond text-[1rem] text-hm-text truncate">
            {member.user.name || member.user.email}
          </div>
          <div className="font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav mt-1">
            {member.role}
            {member.user.name ? ` · ${member.user.email}` : ''}
          </div>
        </div>
        {canEdit ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? 'Cancel' : 'Edit'}
            </Button>
            <Button size="sm" variant="danger" onClick={remove} loading={busy}>
              Remove
            </Button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-4 pl-2 border-l border-hm-text/10 pl-4 ml-1">
          <Field label="Role">
            <Select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          <Field label="Permissions">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {ALL_PERMISSIONS.filter((p) => p !== 'team:manage').map((p) => (
                <label
                  key={p}
                  className="flex items-center gap-2 font-garamond text-[0.95rem] text-hm-text cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={perms.has(p)}
                    onChange={() => togglePerm(p)}
                  />
                  {PERMISSION_LABELS[p]}
                </label>
              ))}
            </div>
          </Field>
          <div className="flex justify-end">
            <Button variant="primary" size="sm" onClick={save} loading={busy}>
              Save
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function InviteRow({
  invite,
  canRevoke,
  onChanged,
}: {
  invite: Invite
  canRevoke: boolean
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const revoke = async () => {
    if (!confirm(`Revoke invite for ${invite.email}?`)) return
    setBusy(true)
    try {
      await api.del(`/api/settings/team/invites/${invite.id}`)
      toast.success('Invite revoked')
      onChanged()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="py-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="font-garamond text-[1rem] text-hm-text truncate">
          {invite.email}
        </div>
        <div className="font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav mt-1">
          {invite.role} · invited {new Date(invite.invited_at).toLocaleDateString()}
        </div>
      </div>
      {canRevoke ? (
        <Button size="sm" variant="danger" onClick={revoke} loading={busy}>
          Revoke
        </Button>
      ) : null}
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-10">
      <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-4">
        {title}
      </div>
      <div className="border border-hm-text/10 p-6">{children}</div>
    </section>
  )
}
