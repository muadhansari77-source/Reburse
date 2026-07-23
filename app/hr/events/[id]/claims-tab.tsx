import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { ClaimStatusBadge } from "@/components/claim-status-badge"
import { ClaimStatus } from "@/types/database"

function currency(amount: number | null, curr = 'GBP') {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: curr }).format(amount)
}

export async function EventClaimsTab({ eventId }: { eventId: string }) {
  const supabase = await createClient()
  const { data: claims } = await supabase
    .from('claims')
    .select('id, status, amount_claimed, currency, submitted_at, profiles!claims_candidate_id_fkey(full_name, email)')
    .eq('event_id', eventId)
    .order('submitted_at', { ascending: false })

  if (!claims?.length) {
    return (
      <Card className="border-slate-100">
        <CardContent className="py-12 text-center text-slate-400">
          <p>No claims for this event yet.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-slate-100">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-4 py-3 text-slate-500 font-medium">Candidate</th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium">Amount</th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium">Submitted</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {claims.map((c: Record<string, unknown>) => {
              const profile = c.profiles as { full_name?: string; email?: string } | null
              return (
                <tr key={c.id as string} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{profile?.full_name || profile?.email || '—'}</td>
                  <td className="px-4 py-3">{currency(c.amount_claimed as number | null, c.currency as string)}</td>
                  <td className="px-4 py-3"><ClaimStatusBadge status={c.status as ClaimStatus} /></td>
                  <td className="px-4 py-3 text-slate-500">
                    {c.submitted_at ? new Date(c.submitted_at as string).toLocaleDateString('en-GB') : '—'}
                  </td>
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
  )
}
