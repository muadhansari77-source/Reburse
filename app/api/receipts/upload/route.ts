import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { extractFromImage, extractFromPdf } from '@/lib/extraction'
import sharp from 'sharp'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Rate limit: 20 uploads per user per hour.
    // Uses the receipts table directly — no external cache needed.
    // RLS scopes the count to this user automatically.
    const UPLOAD_LIMIT = 20
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: recentUploads } = await supabase
      .from('receipts')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', oneHourAgo)

    if ((recentUploads ?? 0) >= UPLOAD_LIMIT) {
      return NextResponse.json(
        { error: `Upload limit reached. You may upload up to ${UPLOAD_LIMIT} receipts per hour. Please try again later.` },
        { status: 429, headers: { 'Retry-After': '3600' } }
      )
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const claimId = formData.get('claim_id') as string | null

    if (!file || !claimId) return NextResponse.json({ error: 'Missing file or claim_id' }, { status: 400 })
    if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 400 })

    // Verify claim ownership and status
    const { data: claim } = await supabase
      .from('claims')
      .select('id, status, candidate_id')
      .eq('id', claimId)
      .eq('candidate_id', user.id)
      .single()

    if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
    if (!['draft', 'changes_requested'].includes(claim.status)) {
      return NextResponse.json({ error: 'Claim is not editable' }, { status: 400 })
    }

    // Check receipt count
    const { count } = await supabase.from('receipts').select('id', { count: 'exact' }).eq('claim_id', claimId)
    if ((count ?? 0) >= 5) return NextResponse.json({ error: 'Maximum 5 receipts per claim' }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Generate receipt ID for storage path
    const receiptId = crypto.randomUUID()
    const isPdf = file.type === 'application/pdf'
    const ext = isPdf ? 'pdf' : 'jpg'
    const storagePath = `${claimId}/${receiptId}.${ext}`

    // Process image through sharp (resize, convert HEIC)
    let uploadBuffer = buffer
    let uploadMime: string = file.type
    if (!isPdf) {
      uploadBuffer = await sharp(buffer)
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer()
      uploadMime = 'image/jpeg'
    }

    // Insert receipt row with processing status
    const { data: receiptRow, error: insertError } = await supabase.from('receipts').insert({
      id: receiptId,
      claim_id: claimId,
      storage_path: storagePath,
      file_name: file.name,
      mime_type: uploadMime,
      file_size_bytes: uploadBuffer.length,
      ocr_status: 'processing',
    }).select().single()

    if (insertError) throw insertError

    // Upload to storage using service client
    const serviceClient = createServiceClient()
    const { error: storageError } = await serviceClient.storage
      .from('receipts')
      .upload(storagePath, uploadBuffer, { contentType: uploadMime, upsert: false })

    if (storageError) {
      await supabase.from('receipts').delete().eq('id', receiptId)
      throw storageError
    }

    // Run AI extraction
    let extractionResult = null
    let ocrStatus: 'succeeded' | 'failed' = 'succeeded'
    let extractionError: string | null = null

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000)
      try {
        if (isPdf) {
          extractionResult = await extractFromPdf(uploadBuffer.toString('base64'))
        } else {
          extractionResult = await extractFromImage(uploadBuffer.toString('base64'), 'image/jpeg')
        }
      } finally {
        clearTimeout(timeout)
      }
    } catch (err: unknown) {
      ocrStatus = 'failed'
      extractionError = err instanceof Error ? err.message : 'Extraction failed'
      console.error('[upload] extraction failed:', extractionError)
    }

    // Update receipt with extraction results
    const updateData: Record<string, unknown> = {
      ocr_status: ocrStatus,
      raw_extraction: extractionResult,
      extraction_error: extractionError,
    }

    if (extractionResult) {
      updateData.extracted_merchant = extractionResult.merchant
      updateData.extracted_amount = extractionResult.amount
      updateData.extracted_currency = extractionResult.currency
      updateData.extracted_date = extractionResult.date
      updateData.extracted_provider = extractionResult.provider
      updateData.extracted_journey = extractionResult.journey
      updateData.extracted_reference = extractionResult.reference
      updateData.extraction_confidence = extractionResult.confidence
    }

    const { data: updatedReceipt } = await supabase
      .from('receipts')
      .update(updateData)
      .eq('id', receiptId)
      .select()
      .single()

    return NextResponse.json({ receipt: updatedReceipt })
  } catch (err: unknown) {
    console.error('[upload] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 500 })
  }
}
