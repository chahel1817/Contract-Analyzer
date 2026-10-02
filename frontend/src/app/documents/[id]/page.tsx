'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { fetchDocumentById } from '@/lib/api';
import { HighlightTarget } from '@/lib/citation-highlight';
import {
  ChevronLeft,
  MessageSquare,
  FileText,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  BookOpen,
  Highlighter,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// Dynamically import PdfViewer with SSR disabled
const PdfViewer = dynamic(() => import('@/components/PdfViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center min-h-[550px] bg-white border border-stone-200 rounded-2xl shadow-sm">
      <Loader2 className="w-8 h-8 text-amber-500 animate-spin mb-3" />
      <p className="text-xs text-stone-500">Initializing PDF Viewer engine...</p>
    </div>
  ),
});

function DocumentViewerContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params?.id as string;

  const [document, setDocument] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [highlightTarget, setHighlightTarget] = useState<HighlightTarget | null>(null);

  // Read URL search params for citation highlighting (Requirement 17 & 18)
  useEffect(() => {
    const quote = searchParams.get('quote');
    const startOffset = searchParams.get('startOffset');
    const endOffset = searchParams.get('endOffset');
    const page = searchParams.get('page');

    if (quote) {
      setHighlightTarget({
        quote,
        startOffset: startOffset ? parseInt(startOffset, 10) : undefined,
        endOffset: endOffset ? parseInt(endOffset, 10) : undefined,
        pageStart: page ? parseInt(page, 10) : 1,
      });
    }
  }, [searchParams]);

  useEffect(() => {
    if (!id) return;

    async function loadDoc() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetchDocumentById(id);
        if (res.success && res.data) {
          setDocument(res.data);
        } else {
          setError(res.error || 'Failed to load document details.');
        }
      } catch (err: any) {
        setError(err.message || 'Error fetching document');
      } finally {
        setIsLoading(false);
      }
    }

    loadDoc();
  }, [id]);

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return '–';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const isPdf = document?.fileName?.toLowerCase().endsWith('.pdf');
  const fileUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/documents/${id}/file`;

  // Helper for highlighting quotes in DOCX view
  const renderDocxWithHighlight = (text: string, quote?: string) => {
    if (!quote || !text) return text;
    const lowerText = text.toLowerCase();
    const lowerQuote = quote.toLowerCase().trim();
    const idx = lowerText.indexOf(lowerQuote);
    if (idx === -1) return text;

    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + quote.length);
    const after = text.slice(idx + quote.length);

    return (
      <>
        {before}
        <mark className="contract-citation-highlight rounded px-1 font-semibold">{match}</mark>
        {after}
      </>
    );
  };

  return (
    <div className="min-h-screen bg-[#fafaf9] text-stone-900 selection:bg-amber-100 selection:text-amber-900">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-stone-200/80 bg-white/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link
              href="/dashboard"
              className="p-1.5 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 border border-stone-200 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>

            <div className="overflow-hidden">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-stone-900 truncate max-w-xs sm:max-w-md">
                  {document?.title || document?.fileName || 'Contract Viewer'}
                </h1>
                {document?.status === 'READY' && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3" /> Ready
                  </span>
                )}
              </div>
              <p className="text-[11px] text-stone-500 truncate">{document?.fileName}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Link href={`/documents/${id}/chat`}>
              <Button
                size="sm"
                className="bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs h-8 px-3.5 rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Ask Contract AI
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isLoading ? (
          <div className="py-32 text-center flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
            <p className="text-sm text-stone-500">Loading contract and preview...</p>
          </div>
        ) : error || !document ? (
          <div className="py-24 text-center max-w-md mx-auto p-8 bg-white border border-stone-200 rounded-2xl shadow-sm">
            <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-stone-900">Document Error</h3>
            <p className="text-xs text-stone-500 mt-1.5">{error || 'Document not found.'}</p>
            <Link href="/dashboard" className="inline-block mt-4">
              <Button size="sm" variant="outline" className="text-xs rounded-xl border-stone-200 text-stone-700 cursor-pointer">
                Back to Dashboard
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
            {/* Viewer Column (3 cols) */}
            <div className="lg:col-span-3 min-h-[700px]">
              {isPdf ? (
                <PdfViewer
                  url={fileUrl}
                  initialPage={highlightTarget?.pageStart || 1}
                  fileName={document.fileName}
                  highlightTarget={highlightTarget}
                  onClearHighlight={() => setHighlightTarget(null)}
                />
              ) : (
                /* DOCX / Plaintext Viewer */
                <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center justify-between pb-4 mb-4 border-b border-stone-100">
                    <div className="flex items-center space-x-2 text-stone-700 text-xs">
                      <BookOpen className="w-4 h-4 text-amber-600" />
                      <span className="font-semibold">DOCX Text View</span>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                      Word Document
                    </span>
                  </div>

                  {highlightTarget?.quote && (
                    <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs text-amber-900">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Highlighter className="w-3.5 h-3.5 text-amber-600" />
                        Highlighted quote: &ldquo;{highlightTarget.quote}&rdquo;
                      </span>
                      <button
                        onClick={() => setHighlightTarget(null)}
                        className="p-1 rounded hover:bg-amber-100 text-amber-700 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  <div className="prose max-w-none text-stone-800 text-sm whitespace-pre-wrap leading-relaxed max-h-[700px] overflow-y-auto pr-2">
                    {renderDocxWithHighlight(
                      document.extractedText || 'No text extracted from this document.',
                      highlightTarget?.quote
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Column (1 col) */}
            <div className="space-y-4">
              {/* Document Overview Card */}
              <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
                <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-amber-600" />
                  Contract Details
                </h3>

                <dl className="space-y-3 text-xs">
                  <div>
                    <dt className="text-stone-500 font-medium">File Type</dt>
                    <dd className="font-semibold text-stone-900 mt-0.5 uppercase">
                      {isPdf ? 'PDF Document' : 'DOCX Document'}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-stone-500 font-medium">File Size</dt>
                    <dd className="font-semibold text-stone-900 mt-0.5">{formatFileSize(document.fileSize)}</dd>
                  </div>

                  <div>
                    <dt className="text-stone-500 font-medium">Page Count</dt>
                    <dd className="font-semibold text-stone-900 mt-0.5">{document.pageCount || '1'} page(s)</dd>
                  </div>

                  <div>
                    <dt className="text-stone-500 font-medium">Indexed Chunks</dt>
                    <dd className="font-semibold text-stone-900 mt-0.5 flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-amber-600" />
                      {document.chunks?.length || 0} chunks indexed
                    </dd>
                  </div>

                  <div>
                    <dt className="text-stone-500 font-medium">Status</dt>
                    <dd className="font-semibold text-stone-900 mt-0.5">
                      {document.status === 'READY' ? (
                        <span className="text-emerald-600">Ready for Q&A</span>
                      ) : document.status === 'FAILED' ? (
                        <span className="text-rose-600">Processing Failed</span>
                      ) : (
                        <span className="text-blue-600">Processing...</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Chunks Preview */}
              <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-amber-600" />
                    Segments & Pages
                  </h3>
                  <span className="text-[10px] text-stone-500 font-medium">
                    {document.chunks?.length || 0} total
                  </span>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {document.chunks && document.chunks.length > 0 ? (
                    document.chunks.map((chunk: any) => (
                      <div
                        key={chunk.id}
                        className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 text-xs"
                      >
                        <div className="flex items-center justify-between text-[11px] text-stone-500 mb-1">
                          <span className="font-semibold text-amber-800">Chunk #{chunk.chunkIndex + 1}</span>
                          <span className="px-1.5 py-0.5 rounded bg-white border border-stone-200 text-[10px] text-stone-600 font-medium">
                            Page {chunk.pageStart || chunk.pageNumber || 1}
                          </span>
                        </div>
                        <p className="text-stone-600 text-[11px] line-clamp-2">
                          {chunk.text || chunk.content}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-stone-400 text-center py-4">No chunks indexed yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function DocumentViewerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center text-stone-500">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500 mr-2" />
          Loading document viewer...
        </div>
      }
    >
      <DocumentViewerContent />
    </Suspense>
  );
}
