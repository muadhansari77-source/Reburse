import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { AcceptInviteButton } from "./accept-button"

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()

  // Get invitation details (unauthenticated safe via RPC)
  type InvPublic = {
    invitation_id: string; invitation_status: string; invited_email: string; expires_at: string;
    event_id: string; event_name: string; event_type: string; start_date: string | null;
    end_date: string | null; location: string | null; firm_id: string; firm_name: string;
  }
  const { data: invRaw, error } = await supabase.rpc('get_invitation_public', { p_token: token }).single()
  const inv = invRaw as InvPublic | null

  if (error || !inv) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-sm w-full border-red-100">
          <CardContent className="py-10 text-center space-y-3">
            <div className="text-3xl">❌</div>
            <h1 className="font-semibold text-slate-800">Invitation not found</h1>
            <p className="text-sm text-slate-500">This link may be invalid or expired.</p>
            <Link href="/"><Button variant="outline" size="sm">Go home</Button></Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (inv.invitation_status === 'revoked') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-sm w-full border-red-100">
          <CardContent className="py-10 text-center space-y-3">
            <div className="text-3xl">🚫</div>
            <h1 className="font-semibold text-slate-800">Invitation revoked</h1>
            <p className="text-sm text-slate-500">This invitation has been revoked by the firm. Please contact HR.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (inv.invitation_status === 'expired' || new Date(inv.expires_at) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-sm w-full border-amber-100">
          <CardContent className="py-10 text-center space-y-3">
            <div className="text-3xl">⏰</div>
            <h1 className="font-semibold text-slate-800">Invitation expired</h1>
            <p className="text-sm text-slate-500">This invitation has expired. Please ask HR to re-send it.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (inv.invitation_status === 'accepted') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-sm w-full border-green-100">
          <CardContent className="py-10 text-center space-y-3">
            <div className="text-3xl">✅</div>
            <h1 className="font-semibold text-slate-800">Already accepted</h1>
            <p className="text-sm text-slate-500">You&apos;ve already accepted this invitation.</p>
            <Link href="/dashboard"><Button className="bg-blue-700 hover:bg-blue-800 text-white">Go to dashboard</Button></Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Check if user is logged in
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md w-full space-y-5">
        <div className="text-center">
          <Link href="/" className="text-blue-700 font-semibold text-xl">TravelClaim</Link>
        </div>

        <Card className="border-slate-100">
          <CardContent className="pt-6 pb-6 space-y-4">
            <div className="space-y-1">
              <p className="text-xs text-blue-700 font-medium uppercase tracking-wide">You&apos;re invited</p>
              <h1 className="text-xl font-bold text-slate-900">{inv.firm_name}</h1>
              <h2 className="text-lg text-slate-700">{inv.event_name}</h2>
            </div>

            <div className="text-sm text-slate-600 space-y-1">
              {inv.start_date && (
                <p>📅 {new Date(inv.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  {inv.end_date && inv.end_date !== inv.start_date
                    ? ` – ${new Date(inv.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
                    : ''}
                </p>
              )}
              {inv.location && <p>📍 {inv.location}</p>}
              <p className="text-slate-400 text-xs mt-2">Sent to {inv.invited_email}</p>
            </div>

            {user ? (
              <AcceptInviteButton token={token} />
            ) : (
              <div className="space-y-3 pt-2">
                <p className="text-sm text-slate-600">Create an account or log in to accept this invitation and submit your travel reimbursement.</p>
                <div className="flex flex-col gap-2">
                  <Link href={`/signup?token=${token}`}>
                    <Button className="w-full bg-blue-700 hover:bg-blue-800 text-white">Create account</Button>
                  </Link>
                  <Link href={`/login?redirect_to=/invite/${token}`}>
                    <Button variant="outline" className="w-full">Log in</Button>
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
