import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Get receipt and check access
    const { data: receipt } = await supabase.from('receipts').select('storage_path, claim_id, claims(candidate_id, firm_id)').eq('id', id).single()
    if (!receipt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const claim = (receipt.claims as unknown) as { candidate_id: string; firm_id: string } | null
    const isCandidateOwner = claim?.candidate_id === user.id

    // Check HR access
    let isHrAccess = false
    if (!isCandidateOwner && claim?.firm_id) {
      const { data: fm } = await supabase.from('firm_members').select('id').eq('user_id', user.id).eq('firm_id', claim.firm_id).single()
      isHrAccess = !!fm
    }

    if (!isCandidateOwner && !isHrAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const serviceClient = createServiceClient()
    const { data: signedData, error } = await serviceClient.storage
      .from('receipts')
      .createSignedUrl(receipt.storage_path, 3600) // 60 min

    if (error) throw error
    return NextResponse.json({ url: signedData.signedUrl })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
