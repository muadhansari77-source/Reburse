'use client'
import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface HRInvite { id: string; email: string; status: string; expires_at: string; token: string }

export function TeamPageClient({ firmId, hrInvites }: { firmId: string; hrInvites: HRInvite[] }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('invite_hr_colleague', { p_firm_id: firmId, p_email: email.trim().toLowerCase() })
      if (error) throw error
      const link = `${window.location.origin}/invite/hr/${data}`
      await navigator.clipboard.writeText(link)
      toast.success('Invite link copied to clipboard!')
      setEmail('')
      router.refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create invitation')
    } finally {
      setLoading(false)
    }
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/invite/hr/${token}`
    navigator.clipboard.writeText(url)
    toast.success('Link copied!')
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-slate-700">Invite a colleague</h2>
      <form onSubmit={handleInvite} className="flex gap-3">
        <Input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@firm.com" className="max-w-xs" />
        <Button type="submit" className="bg-blue-700 hover:bg-blue-800 text-white" disabled={loading}>
          {loading ? 'Sending…' : 'Invite'}
        </Button>
      </form>

      {hrInvites.length > 0 && (
        <Card className="border-slate-100">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Email</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Expires</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {hrInvites.map(inv => (
                  <tr key={inv.id} className="border-b border-slate-50">
                    <td className="px-4 py-3 font-medium">{inv.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={inv.status === 'accepted' ? 'text-green-700 border-green-200' : 'text-blue-700 border-blue-200'}>
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{new Date(inv.expires_at).toLocaleDateString('en-GB')}</td>
                    <td className="px-4 py-3">
                      {inv.status === 'pending' && (
                        <button onClick={() => copyLink(inv.token)} className="text-xs text-blue-700 hover:underline">Copy link</button>
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
