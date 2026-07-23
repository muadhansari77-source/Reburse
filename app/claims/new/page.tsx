import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ClaimWizard } from "./wizard"

export default async function NewClaimPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const { event: eventId } = await searchParams
  if (!eventId) redirect('/dashboard')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verify participation
  const { data: participant } = await supabase
    .from('event_participants')
    .select('id, events(id, name, reimbursement_cap, currency, is_open, firms(name))')
    .eq('event_id', eventId)
    .eq('candidate_id', user.id)
    .single()

  if (!participant) redirect('/dashboard')

  const event = (participant.events as unknown) as {
    id: string; name: string; reimbursement_cap: number | null;
    currency: string; is_open: boolean; firms: { name: string } | null
  } | null

  if (!event?.is_open) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <p className="text-slate-600">This event is no longer accepting new claims.</p>
      </div>
    )
  }

  // Check for existing non-rejected claim
  const { data: existing } = await supabase
    .from('claims')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('candidate_id', user.id)
    .not('status', 'eq', 'rejected')
    .maybeSingle()

  return (
    <ClaimWizard
      eventId={eventId}
      eventName={event.name}
      firmName={event.firms?.name ?? ''}
      reimbursementCap={event.reimbursement_cap}
      currency={event.currency}
      existingClaimId={existing?.id ?? null}
      existingClaimStatus={existing?.status ?? null}
    />
  )
}
