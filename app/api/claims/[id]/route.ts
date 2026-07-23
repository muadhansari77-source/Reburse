import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const PatchClaimSchema = z.object({
  amount_claimed: z.number().positive().nullable().optional(),
  travel_date: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  currency: z.string().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const updates = PatchClaimSchema.parse(body)

    // Verify ownership and status
    const { data: claim } = await supabase
      .from('claims')
      .select('id, status, candidate_id')
      .eq('id', id)
      .eq('candidate_id', user.id)
      .single()

    if (!claim) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!['draft', 'changes_requested'].includes(claim.status)) {
      return NextResponse.json({ error: 'Claim is not editable' }, { status: 400 })
    }

    const { data: updated, error } = await supabase
      .from('claims')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ claim: updated })
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
