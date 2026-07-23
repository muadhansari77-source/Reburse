import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const CreateClaimSchema = z.object({
  event_id: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { event_id } = CreateClaimSchema.parse(body)

    // Verify candidate is a participant
    const { data: participant } = await supabase
      .from('event_participants')
      .select('id, events(id, firm_id, is_open, currency)')
      .eq('event_id', event_id)
      .eq('candidate_id', user.id)
      .single()

    if (!participant) return NextResponse.json({ error: 'You are not invited to this event' }, { status: 403 })
    const event = (participant.events as unknown) as { id: string; firm_id: string; is_open: boolean; currency: string } | null
    if (!event?.is_open) return NextResponse.json({ error: 'This event is no longer accepting claims' }, { status: 400 })

    // Check for existing draft claim (warn but allow)
    const { data: existing } = await supabase
      .from('claims')
      .select('id, status')
      .eq('event_id', event_id)
      .eq('candidate_id', user.id)
      .not('status', 'eq', 'rejected')
      .maybeSingle()

    const { data: claim, error } = await supabase.from('claims').insert({
      firm_id: event.firm_id,
      event_id,
      candidate_id: user.id,
      currency: event.currency,
      status: 'draft',
    }).select().single()

    if (error) throw error
    return NextResponse.json({ claim, hasExisting: !!existing })
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
