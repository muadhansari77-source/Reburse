import Link from "next/link"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export default async function LandingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role === 'hr') redirect('/hr')
    else redirect('/dashboard')
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
        <span className="font-semibold text-blue-700 text-lg tracking-tight">TravelClaim</span>
        <Link href="/login">
          <Button variant="outline" size="sm">Log in</Button>
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-8 py-20">
        <div className="max-w-2xl space-y-4">
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 leading-tight">
            Travel reimbursement,{" "}
            <span className="text-blue-700">done in minutes</span>
          </h1>
          <p className="text-lg text-slate-500 max-w-xl mx-auto">
            Candidates upload a receipt, AI extracts the details, HR approves with one click.
            No more email chains. No more spreadsheets.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <Link href="/signup">
            <Button size="lg" className="bg-blue-700 hover:bg-blue-800 text-white w-full sm:w-auto">
              I&apos;m a candidate
            </Button>
          </Link>
          <Link href="/firms/register">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              I represent a firm
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-8 max-w-3xl w-full text-left">
          {[
            { title: "Upload & auto-extract", body: "Photo, PDF or booking email — Claude reads it and fills in the form." },
            { title: "One-click approval", body: "HR sees the receipt beside the data, approves or queries in seconds." },
            { title: "Finance-ready CSV", body: "Export approved claims straight to your finance team's workflow." },
          ].map(f => (
            <div key={f.title} className="border border-slate-100 rounded-xl p-5 bg-slate-50">
              <h3 className="font-semibold text-slate-800 mb-1">{f.title}</h3>
              <p className="text-sm text-slate-500">{f.body}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-slate-100 text-center py-6 text-xs text-slate-400">
        © {new Date().getFullYear()} TravelClaim MVP
      </footer>
    </div>
  )
}
