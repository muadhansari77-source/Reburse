import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ClaimStatusBadge } from "@/components/claim-status-badge"
import { ClaimStatus } from "@/types/database"

function formatDate(d: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Events the candidate is participating in
  const { data: participants } = await supabase
    .from('event_participants')
    .select('id, event_id, events(id, name, event_type, start_date, end_date, reimbursement_cap, currency, is_open, firms(name))')
    .eq('candidate_id', user.id)
    .order('created_at', { ascending: false })

  // Their claims
  const { data: claims } = await supabase
    .from('claims')
    .select('id, event_id, status, amount_claimed, currency, updated_at, events(name, firms(name))')
    .eq('candidate_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(5)

  const claimsByEvent = new Map<string, { id: string; status: ClaimStatus }>()
  for (const c of claims ?? []) {
    claimsByEvent.set(c.event_id, { id: c.id, status: c.status as ClaimStatus })
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Your events</h1>
        <p className="text-sm text-slate-500 mt-0.5">Events you&apos;ve been invited to</p>
      </div>

      {!participants?.length ? (
        <Card className="border-slate-100">
          <CardContent className="py-16 text-center text-slate-400">
            <p className="text-lg font-medium">No events yet</p>
            <p className="text-sm mt-1">Check your email for an invitation link from a firm.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {participants.map(p => {
            const event = (p.events as unknown) as { id: string; name: string; event_type: string; start_date: string | null; end_date: string | null; reimbursement_cap: number | null; currency: string; is_open: boolean; firms: { name: string } | null } | null
            if (!event) return null
            const claim = claimsByEvent.get(event.id)
            return (
              <Card key={p.id} className="border-slate-100 hover:border-blue-100 transition-colors">
                <CardContent className="py-5 px-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-0.5">
                      <p className="text-xs text-blue-700 font-medium">{event.firms?.name}</p>
                      <h2 className="font-semibold text-slate-900">{event.name}</h2>
                      {event.start_date && (
                        <p className="text-sm text-slate-500">
                          {formatDate(event.start_date)}
                          {event.end_date && event.end_date !== event.start_date ? ` – ${formatDate(event.end_date)}` : ''}
                        </p>
                      )}
                      {event.reimbursement_cap && (
                        <p className="text-xs text-slate-400">Cap: {event.currency} {Number(event.reimbursement_cap).toFixed(2)}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {claim ? (
                        <>
                          <ClaimStatusBadge status={claim.status} />
                          <Link href={`/claims/${claim.id}`}>
                            <Button variant="outline" size="sm">View claim</Button>
                          </Link>
                        </>
                      ) : event.is_open ? (
                        <Link href={`/claims/new?event=${event.id}`}>
                          <Button size="sm" className="bg-blue-700 hover:bg-blue-800 text-white">Start a claim</Button>
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">Event closed</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {!!claims?.length && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-800">Recent claims</h2>
            <Link href="/claims" className="text-sm text-blue-700 hover:underline">View all →</Link>
          </div>
          <Card className="border-slate-100">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Event</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Amount</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Updated</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {claims.map((c: Record<string, unknown>) => {
                    const event = c.events as { name?: string; firms?: { name?: string } | null } | null
                    return (
                      <tr key={c.id as string} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-400">{event?.firms?.name}</span>
                          <p className="font-medium text-slate-800">{event?.name}</p>
                        </td>
                        <td className="px-4 py-3">
                          {c.amount_claimed ? `${c.currency} ${Number(c.amount_claimed).toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-3"><ClaimStatusBadge status={c.status as ClaimStatus} /></td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(c.updated_at as string)}</td>
                        <td className="px-4 py-3">
                          <Link href={`/claims/${c.id}`} className="text-blue-700 hover:underline text-xs">View →</Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
