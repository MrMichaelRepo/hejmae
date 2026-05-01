// Activity-log writer. Best-effort: failures are logged but don't bubble up.
import { supabaseAdmin } from '@/lib/supabase/server'
import type { ActorType } from '@/lib/supabase/types'

export interface LogEvent {
  designerId: string
  projectId: string
  actorType: ActorType
  actorId?: string | null
  eventType: string
  description: string
  metadata?: Record<string, unknown>
}

export async function logActivity(evt: LogEvent): Promise<void> {
  try {
    await supabaseAdmin().from('activity_logs').insert({
      designer_id: evt.designerId,
      project_id: evt.projectId,
      actor_type: evt.actorType,
      actor_id: evt.actorId ?? null,
      event_type: evt.eventType,
      description: evt.description,
      metadata: evt.metadata ?? {},
    })
  } catch (err) {
    console.error('[activity] failed to write log', err)
  }
}
