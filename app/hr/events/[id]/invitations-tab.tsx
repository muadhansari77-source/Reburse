'use client'
import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "sonner"

interface Invitation {
  id: string
  email: string
  token: string
  status: string
  expires_at: string
  accepted_at: string | null
}

export function EventInvitationsTab({ eventId, firmId }: { eventId: string; firmId: string }) {
  const [emailsText, setEmailsText] = useState('')
  const [loading, setLoading] = useState(false)
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const supabase = createClient()

  const loadInvitations = useCallback(async () => {
    const { data } = await supabase
      .from('invitations')
      .select('id, email, token, status, expires_at, accepted_at')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
    setInvitations(data ?? [])
  }, [supabase, eventId])

  useEffect(() => { loadInvitations() }, [loadInvitations])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    const emails = emailsText.split('\n').map(e => e.trim().toLowerCase()).filter(Boolean)
    if (!emails.length) { toast.error('Enter at least one email'); return }
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const rows = emails.map(email => ({ event_id: eventId, email, invited_by: user.id }))
      const { error } = await supabase.from('invitations').upsert(rows, { onConflict: 'event_id,email', ignoreDuplicates: true })
      if (error) throw error
      toast.success(`Invitations created for ${emails.length} email${emails.length > 1 ? 's' : ''}`)
      setEmailsText('')
      loadInvitations()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create invitations')
    } finally {
      setLoading(false)
    }
  }

  async function revokeInvitation(id: string) {
    const { error } = await supabase.from('invitations').update({ status: 'revoked' }).eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Invitation revoked')
    loadInvitations()
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/invite/${token}`
    navigator.clipboard.writeText(url)
    toast.success('Link copied!')
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin

  return (
    <div className="space-y-6">
      <form onSubmit={handleInvite} className="space-y-3">
        <Textarea
          placeholder="Enter candidate email addresses, one per line&#10;alice@email.com&#10;bob@email.com"
          value={emailsText}
          onChange={e => setEmailsText(e.target.value)}
          rows={4}
          className="font-mono text-sm"
        />
        <Button type="submit" className="bg-blue-700 hover:bg-blue-800 text-white" disabled={loading}>
          {loading ? 'Sending…' : 'Create invitation links'}
        </Button>
      </form>

      {invitations.length === 0 ? (
        <Card className="border-slate-100">
          <CardContent className="py-10 text-center text-slate-400">No invitations yet.</CardContent>
        </Card>
      ) : (
        <Card className="border-slate-100">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Email</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Expires</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Link</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invitations.map(inv => (
                  <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{inv.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={
                        inv.status === 'accepted' ? 'text-green-700 border-green-200 bg-green-50' :
                        inv.status === 'revoked' ? 'text-slate-400 border-slate-200' :
                        inv.status === 'expired' ? 'text-red-600 border-red-200' :
                        'text-blue-700 border-blue-200 bg-blue-50'
                      }>
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {new Date(inv.expires_at).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-4 py-3">
                      {inv.status === 'pending' && (
                        <button onClick={() => copyLink(inv.token)} className="text-xs text-blue-700 hover:underline font-medium">
                          Copy link
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {inv.status === 'pending' && (
                        <button onClick={() => revokeInvitation(inv.id)} className="text-xs text-red-600 hover:underline">Revoke</button>
                      )}
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
