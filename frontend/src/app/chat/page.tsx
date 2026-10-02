'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { fetchDocuments, DocumentItem } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  MessageSquare,
  FileText,
  ChevronRight,
  Loader2,
  AlertCircle,
  Sparkles,
  ChevronLeft,
} from 'lucide-react';

function ChatLandingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const docId = searchParams.get('docId');

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (docId) {
      router.replace(`/documents/${docId}/chat`);
      return;
    }

    async function loadDocs() {
      try {
        const res = await fetchDocuments();
        if (res.success && res.data) {
          setDocuments(res.data.filter((d) => d.status === 'READY'));
        }
      } catch (err) {
        console.error('Failed to load documents:', err);
      } finally {
        setLoading(false);
      }
    }

    loadDocs();
  }, [docId, router]);

  if (docId) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mr-2" />
        Redirecting to contract chat...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 sm:p-12">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center space-x-3">
          <Link
            href="/dashboard"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              Select Contract to Chat
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Choose a processed contract to start an AI Q&A session with verified citations
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            <p className="text-xs text-slate-400">Loading contracts...</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-3">
            <FileText className="w-10 h-10 text-slate-600 mx-auto" />
            <h3 className="text-sm font-semibold text-slate-300">No Ready Contracts</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Please upload a PDF or DOCX contract on the dashboard first to chat with it.
            </p>
            <Link href="/dashboard" className="inline-block pt-2">
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-xs">
                Go to Dashboard
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {documents.map((doc) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}/chat`}
                className="group p-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-900 transition-all flex items-center justify-between shadow-sm"
              >
                <div className="flex items-center space-x-3 overflow-hidden">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div className="overflow-hidden">
                    <h3 className="text-sm font-semibold text-slate-200 group-hover:text-indigo-300 transition-colors truncate">
                      {doc.title || doc.fileName}
                    </h3>
                    <p className="text-[11px] text-slate-400 truncate">
                      {doc.fileName} • {doc.pageCount || 1} pages
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 text-indigo-400 text-xs font-medium pl-3">
                  <span className="hidden sm:inline">Start Chat</span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatLandingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mr-2" />
          Loading chat...
        </div>
      }
    >
      <ChatLandingContent />
    </Suspense>
  );
}
