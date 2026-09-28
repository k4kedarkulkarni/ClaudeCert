import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { fetchConfig } from '../firestore'

// Point pdfjs worker at the bundled worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

export default function InstructorGuidePage() {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [numPages, setNumPages] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [pdfError, setPdfError] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(600)

  // Re-fetch every time this component mounts (i.e. every time the tab is switched to)
  useEffect(() => {
    setLoading(true)
    setPdfUrl(null)
    setNumPages(0)
    setPdfError('')
    fetchConfig()
      .then((cfg) => {
        if (cfg?.instructorPdfUrl) setPdfUrl(cfg.instructorPdfUrl)
      })
      .catch(() => setPdfError('Failed to load config from Firebase.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth))
    ro.observe(el)
    setContainerWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
        Loading guide…
      </div>
    )
  }

  if (pdfError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-red-500 text-sm gap-2">
        <p>{pdfError}</p>
      </div>
    )
  }

  if (!pdfUrl) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400 text-sm gap-2">
        <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p>No instructor guide uploaded yet.</p>
        <p className="text-xs text-gray-300">Ask the admin to upload a PDF in Settings.</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full">
      <Document
        file={pdfUrl}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        onLoadError={(err) => setPdfError(`Could not render PDF: ${err.message}`)}
        loading={<p className="text-sm text-gray-400 py-8 text-center">Rendering PDF…</p>}
        error={
          <div className="text-sm text-red-500 py-8 text-center space-y-1">
            <p>Failed to load PDF.</p>
            <p className="text-xs text-gray-400">Check that the Storage rules allow public read and that CORS is not blocking the request.</p>
          </div>
        }
      >
        {Array.from({ length: numPages }, (_, i) => (
          <Page
            key={i + 1}
            pageNumber={i + 1}
            width={containerWidth}
            className="mb-4 shadow-sm"
          />
        ))}
      </Document>
    </div>
  )
}
