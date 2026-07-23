import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const ReviewSchema = z.object({
  action: z.enum(['start_review', 'approve', 'reject', 'request_changes']),
  note: z.string().optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { action, note } = ReviewSchema.parse(body)

    const { error } = await supabase.rpc('review_claim', {
      p_claim_id: id,
      p_action: action,
      p_note: note ?? null,
    })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Review failed' }, { status: 400 })
  }
}
