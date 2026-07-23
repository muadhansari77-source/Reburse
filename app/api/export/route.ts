import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const ExportSchema = z.object({ claim_ids: z.array(z.string().uuid()) })

function formatDate(d: string | null): string {
  if (!d) return ''
  return d.slice(0, 10)
}

function formatAmount(a: number | null): string {
  if (a == null) return ''
  return Number(a).toFixed(2)
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { claim_ids } = ExportSchema.parse(body)

    const { data: firmMember } = await supabase.from('firm_members').select('firm_id').eq('user_id', user.id).single()
    if (!firmMember) return NextResponse.json({ error: 'No firm' }, { status: 403 })

    // Fetch claims with all details
    const { data: claims } = await supabase
      .from('claims')
      .select(`
        id, status, amount_claimed, currency, description, travel_date,
        submitted_at, reviewed_at, paid_at, payment_reference,
        candidate:profiles!claims_candidate_id_fkey(full_name, email),
        event:events(name, event_type, firms(name))
      `)
      .in('id', claim_ids)
      .eq('firm_id', firmMember.firm_id)
      .in('status', ['approved', 'payment_pending'])

    if (!claims?.length) return NextResponse.json({ error: 'No exportable claims found' }, { status: 400 })

    // Transition to payment_pending
    await supabase.rpc('export_claims', { p_claim_ids: claim_ids })

    // Build CSV
    const BOM = '﻿'
    const headers = [
      'candidate_name', 'candidate_email', 'firm_name', 'event_name', 'event_type',
      'claim_id', 'description', 'amount', 'currency', 'travel_date',
      'submitted_date', 'approval_date', 'payment_status', 'payment_reference',
    ]

    function csvRow(row: string[]): string {
      return row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
    }

    const rows = claims.map((c: Record<string, unknown>) => {
      const candidate = c.candidate as { full_name?: string; email?: string } | null
      const event = c.event as { name?: string; event_type?: string; firms?: { name?: string } | null } | null
      return csvRow([
        candidate?.full_name ?? '',
        candidate?.email ?? '',
        event?.firms?.name ?? '',
        event?.name ?? '',
        event?.event_type ?? '',
        c.id as string,
        c.description as string ?? '',
        formatAmount(c.amount_claimed as number | null),
        c.currency as string,
        formatDate(c.travel_date as string | null),
        formatDate(c.submitted_at as string | null),
        formatDate(c.reviewed_at as string | null),
        'payment_pending',
        c.payment_reference as string ?? '',
      ])
    })

    const today = new Date().toISOString().slice(0, 10)
    const firmName = (claims[0] as Record<string, unknown>).event &&
      ((claims[0] as Record<string, unknown>).event as Record<string, unknown>).firms
        ? ((((claims[0] as Record<string, unknown>).event as Record<string, unknown>).firms as Record<string, unknown>).name as string ?? 'firm').replace(/\s+/g, '_')
        : 'firm'
    const filename = `reimbursements_${firmName}_${today}.csv`

    const csv = BOM + [csvRow(headers), ...rows].join('\n')

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Export failed' }, { status: 500 })
  }
}
