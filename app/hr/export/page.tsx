import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ExportPageClient } from "./export-client"

export default async function ExportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: fm } = await supabase.from('firm_members').select('firm_id').eq('user_id', user.id).single()
  if (!fm) redirect('/hr')

  const { data: claims } = await supabase
    .from('claims')
    .select('id, status, amount_claimed, currency, travel_date, exported_at, profiles!claims_candidate_id_fkey(full_name, email), events(name)')
    .eq('firm_id', fm.firm_id)
    .in('status', ['approved', 'payment_pending'])
    .order('submitted_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedClaims = (claims ?? []) as any[]

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Export & pay</h1>
      <p className="text-sm text-slate-500">Export approved claims to CSV for your finance team, then mark them as paid.</p>
      <ExportPageClient claims={typedClaims} />
    </div>
  )
}
