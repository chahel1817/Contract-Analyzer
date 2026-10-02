'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { fetchDocumentById } from '@/lib/api';
import {
  ChevronLeft,
  MessageSquare,
  FileText,
  Layers,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Loader2,
  ExternalLink,
  BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// Dynamically import PdfViewer with SSR disabled
const PdfViewer = dynamic(() => import('@/components/PdfViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center min-h-[550px] bg-slate-900/60 border border-slate-800 rounded-2xl">
      <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
      <p className="text-xs text-slate-400">Initializing PDF Viewer engine...</p>
    </div>
  ),
});

export default function DocumentViewerPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [document, setDocument] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Decorative Blur */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-[128px]" />
      </div>

      {/* Top Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link
              href="/dashboard"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>

            <div className="overflow-hidden">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-slate-100 truncate max-w-xs sm:max-w-md">
                  {document?.title || document?.fileName || 'Contract Viewer'}
                </h1>
                {document?.status === 'READY' && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3" /> Ready
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 truncate">{document?.fileName}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Link href={`/chat?docId=${id}`}>
              <Button
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-8 px-3.5 rounded-lg flex items-center gap-1.5 shadow-lg shadow-indigo-600/20"
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
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            <p className="text-sm text-slate-400">Loading contract and preview...</p>
          </div>
        ) : error || !document ? (
          <div className="py-24 text-center max-w-md mx-auto p-8 bg-slate-900/60 border border-slate-800 rounded-2xl">
            <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-200">Document Error</h3>
            <p className="text-xs text-slate-400 mt-1.5">{error || 'Document not found.'}</p>
            <Link href="/dashboard" className="inline-block mt-4">
              <Button size="sm" variant="outline" className="text-xs">
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
                  initialPage={1}
                  fileName={document.fileName}
                />
              ) : (
                /* DOCX / Plaintext Viewer */
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-xl">
                  <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
                    <div className="flex items-center space-x-2 text-slate-300 text-xs">
                      <BookOpen className="w-4 h-4 text-indigo-400" />
                      <span className="font-medium">DOCX Text View</span>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      Word Document
                    </span>
                  </div>

                  <div className="prose prose-invert max-w-none text-slate-300 text-sm whitespace-pre-wrap leading-relaxed max-h-[700px] overflow-y-auto pr-2">
                    {document.extractedText || 'No text extracted from this document.'}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Column (1 col) */}
            <div className="space-y-4">
              {/* Document Overview Card */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-xl">
                <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                  Contract Details
                </h3>

                <dl className="space-y-3 text-xs">
                  <div>
                    <dt className="text-slate-500">File Type</dt>
                    <dd className="font-medium text-slate-200 mt-0.5 uppercase">
                      {isPdf ? 'PDF Document' : 'DOCX Document'}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-slate-500">File Size</dt>
                    <dd className="font-medium text-slate-200 mt-0.5">{formatFileSize(document.fileSize)}</dd>
                  </div>

                  <div>
                    <dt className="text-slate-500">Page Count</dt>
                    <dd className="font-medium text-slate-200 mt-0.5">{document.pageCount || '1'} page(s)</dd>
                  </div>

                  <div>
                    <dt className="text-slate-500">Indexed Chunks</dt>
                    <dd className="font-medium text-slate-200 mt-0.5 flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-indigo-400" />
                      {document.chunks?.length || 0} chunks indexed
                    </dd>
                  </div>

                  <div>
                    <dt className="text-slate-500">Status</dt>
                    <dd className="font-medium text-slate-200 mt-0.5">
                      {document.status === 'READY' ? (
                        <span className="text-emerald-400">Ready for Q&A</span>
                      ) : document.status === 'FAILED' ? (
                        <span className="text-rose-400">Processing Failed</span>
                      ) : (
                        <span className="text-blue-400">Processing...</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Chunks Preview */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-xl">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                    Segments & Pages
                  </h3>
                  <span className="text-[10px] text-slate-500">
                    {document.chunks?.length || 0} total
                  </span>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {document.chunks && document.chunks.length > 0 ? (
                    document.chunks.map((chunk: any) => (
                      <div
                        key={chunk.id}
                        className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs"
                      >
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                          <span className="font-medium text-indigo-300">Chunk #{chunk.chunkIndex + 1}</span>
                          <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] text-slate-400">
                            Page {chunk.pageStart || chunk.pageNumber || 1}
                          </span>
                        </div>
                        <p className="text-slate-400 text-[11px] line-clamp-2">
                          {chunk.text || chunk.content}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500 text-center py-4">No chunks indexed yet.</p>
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
