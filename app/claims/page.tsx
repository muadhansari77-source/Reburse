import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { ClaimStatusBadge } from "@/components/claim-status-badge"
import { ClaimStatus } from "@/types/database"

export default async function ClaimsListPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: claims } = await supabase
    .from('claims')
    .select('id, status, amount_claimed, currency, travel_date, updated_at, events(name, firms(name))')
    .eq('candidate_id', user.id)
    .order('updated_at', { ascending: false })

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">My claims</h1>

      {!claims?.length ? (
        <Card className="border-slate-100">
          <CardContent className="py-16 text-center text-slate-400">
            <p className="text-lg font-medium">No claims yet</p>
            <p className="text-sm mt-1">Go to your dashboard to start a claim for an event.</p>
            <Link href="/dashboard" className="mt-4 inline-block text-blue-700 hover:underline text-sm">Go to dashboard →</Link>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-100">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Firm / Event</th>
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
                        <span className="text-xs text-slate-400 block">{event?.firms?.name}</span>
                        <span className="font-medium text-slate-800">{event?.name}</span>
                      </td>
                      <td className="px-4 py-3">
                        {c.amount_claimed ? `${c.currency} ${Number(c.amount_claimed).toFixed(2)}` : '—'}
                      </td>
                      <td className="px-4 py-3"><ClaimStatusBadge status={c.status as ClaimStatus} /></td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {new Date(c.updated_at as string).toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/claims/${c.id}`} className="text-blue-700 hover:underline text-xs font-medium">View →</Link>
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
