'use client'
import { useState, useEffect } from "react"
import { Receipt } from "@/types/database"
import { Skeleton } from "@/components/ui/skeleton"

interface Props { receipts: Receipt[] }

export function ReceiptGallery({ receipts }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    async function loadUrls() {
      const results: Record<string, string> = {}
      for (const r of receipts) {
        try {
          const res = await fetch(`/api/receipts/${r.id}/signed-url`)
          if (res.ok) { const { url } = await res.json(); results[r.id] = url }
        } catch {}
      }
      setUrls(results)
    }
    loadUrls()
  }, [receipts])

  return (
    <div className="space-y-3">
      {receipts.map(r => (
        <div key={r.id} className="border border-slate-100 rounded-lg overflow-hidden bg-white">
          <div className="p-3 border-b border-slate-50">
            <p className="text-xs font-medium text-slate-700">{r.file_name}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-slate-500">
              {r.extracted_merchant && <span>🏪 {r.extracted_merchant}</span>}
              {r.extracted_amount && <span>💰 {r.extracted_currency} {Number(r.extracted_amount).toFixed(2)}</span>}
              {r.extracted_journey && <span>🚂 {r.extracted_journey}</span>}
              {r.extracted_reference && <span>📋 {r.extracted_reference}</span>}
            </div>
          </div>
          {urls[r.id] ? (
            r.mime_type === 'application/pdf' ? (
              <iframe src={urls[r.id]} className="w-full h-64" title={r.file_name} />
            ) : (
              <img src={urls[r.id]} alt={r.file_name} className="w-full max-h-64 object-contain bg-slate-50 p-2" />
            )
          ) : (
            <Skeleton className="h-32 rounded-none" />
          )}
        </div>
      ))}
    </div>
  )
}
