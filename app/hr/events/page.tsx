import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const EVENT_TYPE_LABELS: Record<string, string> = {
  open_day: 'Open Day',
  insight_scheme: 'Insight Scheme',
  assessment_centre: 'Assessment Centre',
  vacation_scheme: 'Vacation Scheme',
  interview: 'Interview',
  other: 'Other',
}

export default async function HREventsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: firmMember } = await supabase.from('firm_members').select('firm_id').eq('user_id', user.id).single()
  if (!firmMember) return <div className="p-8 text-slate-500">No firm found.</div>

  const { data: events } = await supabase
    .from('events')
    .select('*')
    .eq('firm_id', firmMember.firm_id)
    .order('created_at', { ascending: false })

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Events</h1>
        <Link href="/hr/events/new"><Button className="bg-blue-700 hover:bg-blue-800 text-white">New event</Button></Link>
      </div>

      {!events?.length ? (
        <Card className="border-slate-100">
          <CardContent className="py-16 text-center text-slate-400">
            <p className="text-lg font-medium">No events yet</p>
            <p className="text-sm mt-1">Create your first event to start inviting candidates.</p>
            <Link href="/hr/events/new" className="mt-4 inline-block">
              <Button className="bg-blue-700 hover:bg-blue-800 text-white mt-4">Create event</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-100">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Type</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Dates</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Cap</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {events.map(e => (
                  <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{e.name}</td>
                    <td className="px-4 py-3 text-slate-600">{EVENT_TYPE_LABELS[e.event_type] ?? e.event_type}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {e.start_date ? new Date(e.start_date).toLocaleDateString('en-GB') : '—'}
                      {e.end_date && e.end_date !== e.start_date ? ` – ${new Date(e.end_date).toLocaleDateString('en-GB')}` : ''}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {e.reimbursement_cap ? `${e.currency} ${Number(e.reimbursement_cap).toFixed(2)}` : 'No cap'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={e.is_open ? "text-green-700 border-green-200 bg-green-50" : "text-slate-500 border-slate-200"}>
                        {e.is_open ? 'Open' : 'Closed'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/hr/events/${e.id}`} className="text-blue-700 hover:underline text-xs font-medium">Manage →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
