import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

const ExtractionSchema = z.object({
  is_travel_receipt: z.boolean(),
  merchant: z.string().nullable(),
  provider: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  date: z.string().nullable(),
  journey: z.string().nullable(),
  reference: z.string().nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
})

export type ExtractionResult = z.infer<typeof ExtractionSchema>

const SYSTEM_PROMPT = `You extract structured data from travel receipts and booking confirmations (train, coach, rideshare, flights). Respond with ONLY a JSON object, no markdown fences, no commentary, matching exactly this schema:

{
  "is_travel_receipt": boolean,
  "merchant": string | null,
  "provider": string | null,
  "amount": number | null,
  "currency": string | null,
  "date": string | null,
  "journey": string | null,
  "reference": string | null,
  "confidence": "high" | "medium" | "low"
}

Rules: use the TOTAL paid including fees; if multiple tickets, sum them; if a field is not present or unreadable use null; never invent values; if the image is not a travel document set is_travel_receipt=false and all fields null with confidence "high".`

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
}

async function callClaude(client: Anthropic, contentBlock: Anthropic.MessageParam['content']): Promise<ExtractionResult> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: contentBlock }],
  })

  console.log('[extraction] tokens:', response.usage)

  const text = response.content.find(b => b.type === 'text')?.text ?? ''
  const cleaned = stripFences(text)
  return ExtractionSchema.parse(JSON.parse(cleaned))
}

export async function extractFromImage(imageBase64: string, mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'): Promise<ExtractionResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const content: Anthropic.ImageBlockParam[] = [{
    type: 'image',
    source: { type: 'base64', media_type: mediaType, data: imageBase64 },
  }]

  try {
    return await callClaude(client, content)
  } catch {
    // retry once
    return await callClaude(client, content)
  }
}

export async function extractFromPdf(pdfBase64: string): Promise<ExtractionResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const content = [{
    type: 'document' as const,
    source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: pdfBase64 },
  }]

  try {
    return await callClaude(client, content as Anthropic.MessageParam['content'])
  } catch {
    return await callClaude(client, content as Anthropic.MessageParam['content'])
  }
}
