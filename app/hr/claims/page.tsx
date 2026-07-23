import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { ClaimStatusBadge } from "@/components/claim-status-badge"
import { ClaimStatus } from "@/types/database"

export default async function HRClaimsPage({ searchParams }: { searchParams: Promise<{ status?: string; event?: string }> }) {
  const { status: statusFilter, event: eventFilter } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: fm } = await supabase.from('firm_members').select('firm_id').eq('user_id', user.id).single()
  if (!fm) return <div className="p-8 text-slate-500">No firm.</div>

  let query = supabase
    .from('claims')
    .select('id, status, amount_claimed, currency, submitted_at, updated_at, events(id, name), profiles!claims_candidate_id_fkey(full_name, email)')
    .eq('firm_id', fm.firm_id)
    .order('updated_at', { ascending: false })

  if (statusFilter) query = query.eq('status', statusFilter)
  if (eventFilter) query = query.eq('event_id', eventFilter)

  const { data: claims } = await query

  const { data: events } = await supabase.from('events').select('id, name').eq('firm_id', fm.firm_id).order('created_at', { ascending: false })

  const STATUS_OPTIONS: ClaimStatus[] = ['submitted', 'under_review', 'changes_requested', 'approved', 'rejected', 'payment_pending', 'paid']

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">All claims</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Link href="/hr/claims" className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${!statusFilter && !eventFilter ? 'bg-blue-700 text-white border-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
          All
        </Link>
        {STATUS_OPTIONS.map(s => (
          <Link key={s} href={`/hr/claims?status=${s}`}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${statusFilter === s ? 'bg-blue-700 text-white border-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {s.replace('_', ' ')}
          </Link>
        ))}
      </div>

      {!claims?.length ? (
        <Card className="border-slate-100">
          <CardContent className="py-12 text-center text-slate-400">No claims found.</CardContent>
        </Card>
      ) : (
        <Card className="border-slate-100">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Candidate</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Event</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Amount</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {claims.map((c: Record<string, unknown>) => {
                  const profile = c.profiles as { full_name?: string; email?: string } | null
                  const event = c.events as { name?: string } | null
                  return (
                    <tr key={c.id as string} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{profile?.full_name || '—'}</p>
                        <p className="text-xs text-slate-400">{profile?.email}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{event?.name}</td>
                      <td className="px-4 py-3">{c.amount_claimed ? `${c.currency} ${Number(c.amount_claimed).toFixed(2)}` : '—'}</td>
                      <td className="px-4 py-3"><ClaimStatusBadge status={c.status as ClaimStatus} /></td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{new Date(c.updated_at as string).toLocaleDateString('en-GB')}</td>
                      <td className="px-4 py-3">
                        <Link href={`/hr/claims/${c.id}`} className="text-blue-700 hover:underline text-xs font-medium">Review →</Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
