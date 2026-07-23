'use client'
import { useState, useEffect } from "react"
import { Receipt } from "@/types/database"
import { Skeleton } from "@/components/ui/skeleton"

export function HRReceiptViewer({ receipts }: { receipts: Receipt[] }) {
  const [selected, setSelected] = useState(0)
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    async function load() {
      const results: Record<string, string> = {}
      for (const r of receipts) {
        try {
          const res = await fetch(`/api/receipts/${r.id}/signed-url`)
          if (res.ok) { const { url } = await res.json(); results[r.id] = url }
        } catch {}
      }
      setUrls(results)
    }
    load()
  }, [receipts])

  const current = receipts[selected]
  const url = current ? urls[current.id] : undefined

  return (
    <div className="space-y-2">
      {/* Switcher */}
      {receipts.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {receipts.map((r, i) => (
            <button key={r.id} onClick={() => setSelected(i)}
              className={`text-xs px-2 py-1 rounded border font-medium transition-colors ${selected === i ? 'bg-blue-700 text-white border-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              Receipt {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* Viewer */}
      <div className="border border-slate-100 rounded-lg overflow-hidden bg-white min-h-64">
        {!current ? null : !url ? (
          <Skeleton className="h-64 rounded-none" />
        ) : current.mime_type === 'application/pdf' ? (
          <iframe src={url} className="w-full h-96" title={current.file_name} />
        ) : (
          <img src={url} alt={current.file_name} className="w-full max-h-96 object-contain bg-slate-50 p-2 cursor-zoom-in"
            onClick={() => window.open(url, '_blank')} />
        )}
      </div>
      {current && (
        <p className="text-xs text-slate-400 text-center">{current.file_name} · {(current.file_size_bytes / 1024).toFixed(0)} KB</p>
      )}
    </div>
  )
}
