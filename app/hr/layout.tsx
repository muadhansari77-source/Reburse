import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { LogoutButton } from "@/components/logout-button"

const NAV = [
  { href: '/hr', label: 'Dashboard' },
  { href: '/hr/events', label: 'Events' },
  { href: '/hr/claims', label: 'Claims' },
  { href: '/hr/export', label: 'Export & Pay' },
  { href: '/hr/team', label: 'Team' },
]

export default async function HRLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role, full_name, email').eq('id', user.id).single()
  if (profile?.role !== 'hr') redirect('/dashboard')

  const { data: firmMember } = await supabase
    .from('firm_members')
    .select('firm_id, is_admin, firms(name)')
    .eq('user_id', user.id)
    .single()

  const firmName = (firmMember?.firms as unknown as { name: string } | null)?.name ?? 'Your firm'

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-white border-r border-slate-100 fixed top-0 left-0 bottom-0 z-10">
        <div className="px-5 py-5 border-b border-slate-100">
          <Link href="/hr" className="text-blue-700 font-semibold text-base">TravelClaim</Link>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{firmName}</p>
        </div>
        <nav className="flex-1 py-4 space-y-0.5 px-2">
          {NAV.map(n => (
            <Link key={n.href} href={n.href}
              className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-100 space-y-1">
          <p className="text-xs font-medium text-slate-700 truncate">{profile?.full_name || profile?.email}</p>
          <LogoutButton className="w-full justify-start text-xs text-slate-500 px-0 h-auto hover:text-slate-900" />
        </div>
      </aside>

      {/* Mobile top nav */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
        <Link href="/hr" className="text-blue-700 font-semibold">TravelClaim</Link>
        <div className="flex items-center gap-2">
          {NAV.map(n => (
            <Link key={n.href} href={n.href} className="text-xs text-slate-600 hover:text-slate-900">{n.label}</Link>
          ))}
          <LogoutButton className="text-xs px-1" />
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 md:ml-56 pt-0 md:pt-0">
        <div className="md:hidden h-14" />
        {children}
      </main>
    </div>
  )
}
