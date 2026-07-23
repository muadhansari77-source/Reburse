import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { TeamPageClient } from "./team-client"

export default async function TeamPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: fm } = await supabase
    .from('firm_members')
    .select('firm_id, is_admin')
    .eq('user_id', user.id)
    .single()
  if (!fm) redirect('/hr')

  const { data: members } = await supabase
    .from('firm_members')
    .select('id, is_admin, user_id, profiles(full_name, email, created_at)')
    .eq('firm_id', fm.firm_id)
    .order('created_at')

  const { data: hrInvites } = await supabase
    .from('hr_invitations')
    .select('id, email, status, expires_at, token, created_at')
    .eq('firm_id', fm.firm_id)
    .order('created_at', { ascending: false })

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Team</h1>

      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Members</h2>
        <Card className="border-slate-100">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Email</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Role</th>
                </tr>
              </thead>
              <tbody>
                {members?.map(m => {
                  const profile = m.profiles as { full_name?: string; email?: string } | null
                  return (
                    <tr key={m.id} className="border-b border-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{profile?.full_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{profile?.email}</td>
                      <td className="px-4 py-3 text-slate-500">{m.is_admin ? 'Admin' : 'Member'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {fm.is_admin && (
        <TeamPageClient firmId={fm.firm_id} hrInvites={hrInvites ?? []} />
      )}
    </div>
  )
}
