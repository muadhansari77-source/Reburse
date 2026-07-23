import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EventClaimsTab } from "./claims-tab"
import { EventInvitationsTab } from "./invitations-tab"
import { EventSettingsTab } from "./settings-tab"
import Link from "next/link"

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: event } = await supabase
    .from('events')
    .select('*, firms(name)')
    .eq('id', id)
    .single()

  if (!event) notFound()

  // Verify HR is in the firm
  const { data: fm } = await supabase.from('firm_members').select('firm_id').eq('user_id', user.id).single()
  if (!fm || fm.firm_id !== event.firm_id) redirect('/hr/events')

  const EVENT_TYPE_LABELS: Record<string, string> = {
    open_day: 'Open Day', insight_scheme: 'Insight Scheme', assessment_centre: 'Assessment Centre',
    vacation_scheme: 'Vacation Scheme', interview: 'Interview', other: 'Other',
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/hr/events" className="text-slate-400 hover:text-slate-600">Events</Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-600">{event.name}</span>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{event.name}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {EVENT_TYPE_LABELS[event.event_type]} ·{' '}
            {event.start_date ? new Date(event.start_date).toLocaleDateString('en-GB') : 'No date'}
            {event.end_date && event.end_date !== event.start_date ? ` – ${new Date(event.end_date).toLocaleDateString('en-GB')}` : ''}
            {event.location ? ` · ${event.location}` : ''}
          </p>
        </div>
        <div className="text-sm text-slate-500">
          {event.reimbursement_cap
            ? `Cap: ${event.currency} ${Number(event.reimbursement_cap).toFixed(2)}`
            : 'No reimbursement cap'}
        </div>
      </div>

      <Tabs defaultValue="claims">
        <TabsList>
          <TabsTrigger value="claims">Claims</TabsTrigger>
          <TabsTrigger value="invitations">Invitations</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="claims" className="mt-4">
          <EventClaimsTab eventId={id} />
        </TabsContent>
        <TabsContent value="invitations" className="mt-4">
          <EventInvitationsTab eventId={id} firmId={event.firm_id} />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <EventSettingsTab event={event} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
